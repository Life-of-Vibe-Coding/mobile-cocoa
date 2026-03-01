# Architecture & Design Patterns

This document captures six design patterns used across the codebase that are worth preserving and replicating. Each section explains **what** the pattern is, **why** it was chosen, and **where** to find it in the source.

---

## 1. Config System — Required-vs-Optional Helpers & Layered Fallbacks

**File:** [`server/config/index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/config/index.js)

### What it does

The config module uses a small set of typed coercion helpers to enforce a clear contract between optional and required values:

| Helper | Behavior |
|---|---|
| `asRequiredString(value, label)` | Throws at startup if the value is blank |
| `asRequiredNumber(value, label)` | Throws at startup if the value is not an integer |
| `asRequiredStringList(value, label)` | Throws at startup if not an array |
| `asStringSafe(value, fallback)` | Returns `fallback` on blank/missing — never throws |
| `parseIntOrDefault(value, fallback)` | Silent fallback for optional numeric env vars |

```js
// Required — fails fast at startup with a clear error message
const DEFAULT_SESSIONS_DIR = asRequiredString(
  DEFAULT_SESSION_CONFIG?.agentDir,
  "server.sessions.agentDir"
);

// Optional — falls back silently to the configured default
export const SIDEBAR_REFRESH_INTERVAL_MS =
  parseIntOrDefault(process.env.SIDEBAR_REFRESH_INTERVAL_MS, DEFAULT_SIDEBAR_REFRESH_INTERVAL_MS);
```

### Three-layer fallback chain

Values resolve through a strict priority order:

```
Environment variable (highest priority)
    ↓
config/server.json  (SERVER_OVERRIDES — user local overrides)
    ↓
config/defaults.json (SERVER_DEFAULTS — shipped safe defaults)
```

Example showing all three layers for `port`:
```js
const DEFAULT_PORT_FROM_CONFIG = asRequiredNumber(
  SERVER_OVERRIDES.port ?? SERVER_DEFAULTS.port,
  "server.port",
);

// Then environment can override at export time:
export const TUNNEL_PROXY_PORT =
  parseIntOrDefault(process.env.PROXY_PORT, DEFAULT_PROXY_PORT);
```

### Why this works

- **Required helpers fail at process start**, not on the first request that exercises a code path. Misconfiguration is caught before any traffic is served.
- **`defaults.json` provides complete defaults**, so the server starts out-of-the-box with no user config.
- **`server.json` overrides are additive** — users only touch values they care about without needing to manage `.env` files.
- **`asObject()`** defensively guards every config object access so a null/undefined layer cannot cascade into a TypeError later.

---

## 2. SSE Retry Logic — Exponential Backoff, Abort Guards & Stale-Retry Cleanup

**Files:**
- [`apps/mobile/src/services/chat/sseConnection.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/sseConnection.ts)
- [`apps/mobile/src/services/chat/useChatStreamingLifecycle.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatStreamingLifecycle.ts)

### Exponential backoff

```ts
// sseConnection.ts
export const SSE_MAX_RETRIES = 5;
export const SSE_RETRY_BASE_MS = 1000;

/** Compute exponential backoff delay, capped at 30 seconds. */
export function computeRetryDelay(retryCount: number): number {
  return Math.min(SSE_RETRY_BASE_MS * Math.pow(2, retryCount), 30_000);
}
```

Backoff schedule: 1s → 2s → 4s → 8s → 16s → give up. The 30s cap prevents the delay from growing unmanageably on a prolonged network failure.

### Abort guard

Every retry timeout is gated on `isAborted`, a local closure variable that React's effect cleanup sets to `true`. This closes a race where a queued retry fires after the effect has already been torn down (e.g., on session switch or unmount):

```ts
let isAborted = false;

const scheduleRetry = () => {
  if (isAborted) return;   // 🛡️ prevents stale retry from running
  // ...
  retryTimeoutRef.current = setTimeout(() => {
    retryTimeoutRef.current = null;
    if (isAborted) return; // 🛡️ check again inside the timeout callback
    // reconnect...
  }, delay);
};

// Cleanup:
return () => {
  isAborted = true;
  clearRetryTimeout();
  // ...
};
```

### Stale-retry cleanup on session switch

When the user switches to a different session, the outgoing SSE closes and `clearRetryTimeout()` cancels any pending retry timer. The new connection gets its own bounded `retryCountRef` starting at zero:

```ts
// Handle session switch: close existing SSE if it's for a different session
if (activeSseRef.current && activeSseRef.current.id !== targetSessionId) {
  closeActiveSse("session-switch");
}
```

`closeActiveSse` nulls `activeSseRef.current` before calling `source.close()`, which prevents any in-flight queued SSE events from the old session from corrupting display state after the switch.

### Expected server-close vs. true error

The `errorHandler` distinguishes a legitimate server-initiated close (HTTP 200, XHR state 4, "connection abort" message) from a genuine network error:

```ts
const isExpectedServerClose =
  e?.xhrStatus === 200 && e?.xhrState === 4 &&
  e?.message?.toLowerCase().includes("connection abort");

if (isExpectedServerClose) {
  handleStreamEnd({}, 0);  // clean shutdown
  return;
}
scheduleRetry();  // network error — retry with backoff
```

---

## 3. Slim Replay — Stripping Heavy Snapshot Events for Mobile Memory

**File:** [`server/routes/sessionHelpers.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessionHelpers.js)

### The problem

When a mobile client reconnects to an existing session, the server replays the entire JSONL history as SSE events over a single HTTP response. `XHRHttpRequest.responseText` accumulates all received bytes and never frees them until the connection closes. For long sessions this can grow into megabytes.

### The solution

`slimReplayLine()` filters the replay stream in two passes using fast regex checks **before** any JSON.parse:

```js
const SLIM_REPLAY_THRESHOLD_BYTES = 2048;

export function slimReplayLine(line) {
  // Pass 1: snapshot/lifecycle events — always strip to a tiny stub
  if (/\"type\"\s*:\s*\"(message_end|turn_end|message_start)\"/.test(line)) {
    const typeMatch = line.match(/\"type\"\s*:\s*\"([^\"]+)\"/);
    return JSON.stringify({ type: typeMatch?.[1] ?? "unknown" });
  }

  // Pass 2: large assistant message events — strip content only above threshold
  if (/\"type\"\s*:\s*\"message\"/.test(line) && line.length > SLIM_REPLAY_THRESHOLD_BYTES) {
    const parsed = JSON.parse(line);
    if (parsed.message?.role === "assistant") {
      return JSON.stringify({
        type: "message",
        id: parsed.id,
        parentId: parsed.parentId,
        timestamp: parsed.timestamp,
        message: { role: "assistant", content: "[stripped]" },
      });
    }
  }
  return line; // small messages pass through unchanged
}
```

`replayHistoryToResponse()` also skips `agent_start` / `agent_end` lifecycle events entirely. The client already has the actual message content from its in-memory cache or the REST `/messages` endpoint — it only needs the replay to restore ordering and state markers.

### Key design decisions

- **Regex before parse:** avoids the cost of `JSON.parse` on every line; only parses when the cheaper check triggers.
- **Size threshold:** small assistant messages (under 2 KB) pass through unchanged, preserving fidelity for normal interactions. Only pathologically large responses are stripped.
- **Identity fields preserved:** `id`, `parentId`, `timestamp` survive stripping so the client can still correlate stripped events to its locally cached messages.

---

## 4. LRU Session Cache — `evictOldestSessions` Prevents Unbounded Memory Growth

**File:** [`apps/mobile/src/services/chat/sessionCacheHelpers.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/sessionCacheHelpers.ts)

### The problem

The mobile client keeps session state, messages, and input drafts in three `Map` objects. Without eviction, browsing 50+ sessions over a long app session would hold all their message arrays in memory simultaneously.

### LRU implementation

```ts
export const MAX_CACHED_SESSIONS = 15;
const sessionAccessOrder: string[] = [];  // front = oldest, end = most-recent

/** Mark a session as recently used. */
export const touchSession = (sid: string): void => {
  const idx = sessionAccessOrder.indexOf(sid);
  if (idx >= 0) sessionAccessOrder.splice(idx, 1);
  sessionAccessOrder.push(sid);        // move to end (most-recent)
};

/** Evict oldest sessions from all three cache maps. */
export const evictOldestSessions = (
  sessionStates, sessionMessages, sessionDrafts, activeSessionId?
) => {
  let safetyCounter = 0;
  while (sessionAccessOrder.length > MAX_CACHED_SESSIONS && safetyCounter < sessionAccessOrder.length + 5) {
    safetyCounter++;
    const oldest = sessionAccessOrder[0];
    if (!oldest) break;

    // Never evict the currently active session, even if it's the oldest
    if (oldest === activeSessionId) {
      sessionAccessOrder.splice(0, 1);
      sessionAccessOrder.push(oldest);  // re-queue to end
      continue;
    }

    sessionAccessOrder.splice(0, 1);
    sessionStates.delete(oldest);
    sessionMessages.delete(oldest);
    sessionDrafts.delete(oldest);
  }
};
```

### Integration with `loadSession`

`evictOldestSessions` is called inside `seedSessionFromMessages` every time the user opens a session:

```ts
touchSession(sid);
evictOldestSessions(
  sessionStatesRef.current,
  sessionMessagesRef.current,
  sessionDraftRef.current,
  sid,  // active session — never evicted
);
```

### Session ID rekeying (temp-* → real UUID)

When the server assigns a real UUID to what was a temporary session ID, `moveSessionCacheData` atomically migrates all three maps and updates the LRU order:

```ts
export const moveSessionCacheData = (currentSid, nextSid, ...) => {
  // Atomically remap all three caches
  sessionStates.set(nextSid, sessionStates.get(currentSid));
  sessionStates.delete(currentSid);
  // ...same for messages and drafts

  // Update LRU order for the rekey
  const idx = sessionAccessOrder.indexOf(currentSid);
  if (idx >= 0) {
    sessionAccessOrder[idx] = nextSid;  // in-place replace, preserving access order
  }
};
```

This ensures that a rekeyed session does not fall out of the LRU list simply because the old ID was removed and the new ID was never touched.

---

## 5. Security — `WORKSPACE_ALLOWED_ROOT` Consistently Applied Before Every File Operation

**Files:**
- [`server/config/index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/config/index.js) — definition
- [`server/routes/sessions.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessions.js) — enforcement at route layer
- [`server/utils/pathHelpers.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/pathHelpers.js) — enforcement at utility layer

### The constant

```js
// server/config/index.js
export const WORKSPACE_ALLOWED_ROOT = path.resolve(os.homedir());
```

`WORKSPACE_ALLOWED_ROOT` is the user's home directory. Any workspace path or file operation that resolves outside this root is rejected.

### Enforcement pattern

Every route or function that accepts an externally-supplied path checks membership against `WORKSPACE_ALLOWED_ROOT` **before** touching the filesystem:

```js
// sessions.js — destroy-workspace route
const targetPath = path.resolve(rawPath.trim());
if (!targetPath.startsWith(WORKSPACE_ALLOWED_ROOT)) {
  return res.status(400).json({ error: "Path must be under allowed root" });
}

// server/config/index.js — runtime workspace setter
export function setWorkspaceCwd(newPath) {
  const resolved = path.resolve(newPath);
  if (!resolved.startsWith(WORKSPACE_ALLOWED_ROOT)) {
    return { ok: false, error: `Path must be under ${WORKSPACE_ALLOWED_ROOT}` };
  }
  // ... proceed to validate existence
}
```

The utility layer adds a second defence-in-depth layer with traversal stripping:

```js
// pathHelpers.js
const TRAVERSAL_STRIP = /^(\.\.(\\/|\\|$))+/;

export function resolveWithinRoot(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);  // strips ../
  const fullPath = path.resolve(path.join(rootDir, normalized));
  if (fullPath !== rootNorm && !fullPath.startsWith(rootNorm + path.sep)) {
    return { ok: false, error: "Path outside root" };
  }
  return { ok: true, fullPath };
}
```

### Why two layers matter

- `WORKSPACE_ALLOWED_ROOT` guards **workspace-level** operations: changing the active workspace, deleting session folders.
- `resolveWithinRoot` guards **file-level** operations: reading/writing individual files relative to the workspace.
- A path can pass the `WORKSPACE_ALLOWED_ROOT` check (it's inside `~/`) but still fail `resolveWithinRoot` if it contains a traversal sequence that would escape the workspace subdirectory.

---

## 6. `useSessionManagementStore` — Equality Checks Before Every Setter

**File:** [`apps/mobile/src/state/sessionManagementStore.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/state/sessionManagementStore.ts)

### The pattern

Every Zustand setter returns the **same state reference** when the new value equals the existing one:

```ts
setSessionId: (sessionId) =>
  set((state) => (state.sessionId === sessionId ? state : { sessionId })),

setProvider: (provider) =>
  set((state) => (state.provider === provider ? state : { provider })),

setModel: (model) =>
  set((state) => (state.model === model ? state : { model })),
```

For the array setter, a field-by-field comparator avoids re-renders when the server returns the same session list:

```ts
const areSessionStatusesEqual = (a: SessionStatus[], b: SessionStatus[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].cwd !== b[i].cwd ||
      a[i].model !== b[i].model ||
      a[i].lastAccess !== b[i].lastAccess ||
      a[i].status !== b[i].status ||
      a[i].title !== b[i].title
    ) return false;
  }
  return true;
};

setSessionStatuses: (sessions) =>
  set((state) => {
    const normalized = sessions.map(normalizeSession);
    return areSessionStatusesEqual(state.sessionStatuses, normalized)
      ? state               // same reference → no subscriber notification
      : { sessionStatuses: normalized };
  }),
```

### Why this matters

`sessionStatuses` is polled from the server every 3 seconds. Without equality checks, each poll would produce a new array reference, causing every Zustand subscriber to re-render — even components deep in the chat UI that only care about `sessionId`. The equality check makes the 3-second poll effectively free when nothing has changed.

The same principle applies to `sessionId`, `provider`, and `model`: the `SseSessionController` calls their setters inside `useEffect` whenever the chat hook updates. Without identity guards, those calls would ripple through all consumers of the store on every render cycle.

### Status normalization

A `normalizeSession` helper runs unconditionally before any equality comparison, ensuring the `status` field is always either `"running"` or `"idling"` regardless of what the API returns:

```ts
const normalizeSessionStatus = (status: unknown): SessionStatus["status"] =>
  status === "running" ? "running" : "idling";
```

This prevents unknown status strings from producing spurious inequality on the next poll.

---

## Summary Table

| Pattern | File(s) | Problem Solved |
|---|---|---|
| Required-vs-optional config helpers + `defaults.json` fallback | `server/config/index.js` | Fail-fast on misconfiguration; zero-config startup |
| SSE exponential backoff + abort guard + stale-retry cleanup | `sseConnection.ts`, `useChatStreamingLifecycle.ts` | Resilient reconnection without zombie connections |
| Slim replay event stripping | `server/routes/sessionHelpers.js` | Bounded `xhr.responseText` memory on mobile |
| LRU session cache eviction | `sessionCacheHelpers.ts` | Bounded in-memory session footprint on mobile |
| `WORKSPACE_ALLOWED_ROOT` prefix check + `resolveWithinRoot` | `server/config/index.js`, `sessions.js`, `pathHelpers.js` | Directory traversal / sandbox escape prevention |
| Zustand setter equality checks | `state/sessionManagementStore.ts` | Suppress unnecessary re-renders from polling |
