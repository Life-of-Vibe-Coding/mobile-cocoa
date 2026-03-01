# Workspace Preview Module

> **Path:** [`server/routes/workspace.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/workspace.js)

## Function

Serves workspace files for non-API routes and exposes workspace browsing endpoints (`/api/workspace-*`). This replaced the older dedicated `public/app.js` chat page flow.

## Workflow

1. `setupRoutes()` installs `createServeWorkspaceFileMiddleware()` as catch-all for non-API `GET` routes
2. Middleware resolves request path relative to active workspace (`getWorkspaceCwd()`)
3. Requests outside workspace or under blocked folders (`.git`, `.pi`) are rejected/fall through
4. Valid files are served with MIME type from `getMimeForFile()`

## How to Use

```bash
# Start the server
npm start

# Open a workspace file directly (example)
open "http://localhost:3456/README.md"
```

## How to Test

```bash
# Run server smoke tests (covers workspace/path guards)
npm run smoke:server

# Manual API checks
curl "http://localhost:3456/api/workspace-tree"
curl "http://localhost:3456/api/workspace-file?path=package.json"
```

---

# Health Check Module

> **Path:** [`server/public/health-check.html`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/public/health-check.html) + [`server/public/health-check.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/public/health-check.js)

## Function

Health check dashboard showing server status, system metrics, and diagnostic info. Served at `/health` and `/health-check`.

## How to Use

```bash
open http://localhost:3456/health
```

---

# Docker Dashboard Module

> **Path:** [`server/public/docker.html`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/public/docker.html) + [`server/public/docker.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/public/docker.js)

## Function

Docker management dashboard UI for containers, images, and volumes. Only accessible when `ENABLE_DOCKER_MANAGER` is set.

## How to Use

```bash
ENABLE_DOCKER_MANAGER=1 npm start
open http://localhost:3456/docker
```

---

# Server Scripts & Tests Module

> **Path:** [`server/scripts/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/scripts/) + [`server/tests/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/tests/)

## Function

Operational scripts for tunnel/dev orchestration and Node test suites for smoke + regression coverage.

## Scripts and Tests

| File | Description | Usage |
|------|-------------|-------|
| [`start-cloudflare-tunnel.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/scripts/start-cloudflare-tunnel.mjs) | Starts a Cloudflare Tunnel for local server/proxy | `npm run cloudflare:tunnel` |
| [`start-dev-cloudflare.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/scripts/start-dev-cloudflare.mjs) | Starts server + proxy + tunnel workflow | `npm run dev:cloudflare` |
| [`edge-case-smoke.test.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/tests/edge-case-smoke.test.mjs) | Smoke tests for path guards and config edge cases | `npm run smoke:server` |
| [`regression-fixes.test.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/tests/regression-fixes.test.mjs) | Regression tests for session lifecycle, process protection, and git edge cases | `node --test ./server/tests/regression-fixes.test.mjs` |

## How to Test

```bash
# Primary smoke suite
npm run smoke:server

# Extended regression suite
node --test ./server/tests/regression-fixes.test.mjs
```

---

# Core Types Module

> **Path:** [`apps/mobile/src/core/types.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/core/types.ts)

## Function

Central domain type definitions for the mobile app. All components and hooks depend on these abstractions for dependency injection and testability.

## Key Types

| Type | Description |
|------|-------------|
| `Message` | Chat message: `{ id, role, content, codeReferences? }` |
| `CodeReference` | File reference: `{ path, startLine, endLine }` |
| `PermissionDenial` | Tool permission denial with tool name and input |
| `PendingRender` | Extracted render command: `{ command, url }` |
| `LastRunOptions` | Retry options: `{ permissionMode, allowedTools, useContinue }` |
| `PendingAskUserQuestion` | AskUserQuestion modal data with questions and options |
| `IChatState` | Chat UI state: messages, sessionRunning, waitingForUserInput |
| `IPermissionState` | Permission banner state |
| `IConnectionState` | Connection indicator: `{ connected }` |
| `IServerConfig` | Server config interface: `getBaseUrl()`, `resolvePreviewUrl()` |
| `IWorkspaceFileService` | File service interface: `fetchFile(path)` |
| `IStreamConnectionFactory` | Transport factory for testing |

## How to Use

```ts
import type { Message, IServerConfig, IWorkspaceFileService } from "@/core/types";

const msg: Message = {
  id: "msg-1",
  role: "assistant",
  content: "Hello!",
};
```
