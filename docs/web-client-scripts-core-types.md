# Web Client Module

> **Path:** [`public/app.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/public/app.js)

## Function

Browser-based chat UI served at the root URL (`/`). Provides a simple HTML/JS interface for interacting with AI coding assistants via the server's REST+SSE API.

## Workflow

1. Server serves `public/app.js` via the catch-all route
2. Client connects to `/api/sessions/:id/stream` via EventSource for real-time output
3. User submits prompts via the UI → `POST /api/sessions/:id/prompt`
4. AI responses stream back and are rendered in the chat area

## How to Use

```bash
# Start the server
npm start

# Open in browser
open http://localhost:3456
```

## How to Test

Open `http://localhost:3456` and interact with the chat interface manually.

---

# Health Check Module

> **Path:** [`public/health-check.html`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/public/health-check.html) + [`public/health-check.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/public/health-check.js)

## Function

Health check dashboard showing server status, system metrics, and diagnostic info. Served at `/health` and `/health-check`.

## How to Use

```bash
open http://localhost:3456/health
```

---

# Docker Dashboard Module

> **Path:** [`public/docker.html`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/public/docker.html) + [`public/docker.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/public/docker.js)

## Function

Docker management dashboard UI for containers, images, and volumes. Only accessible when `ENABLE_DOCKER_MANAGER` is set.

## How to Use

```bash
ENABLE_DOCKER_MANAGER=1 npm start
open http://localhost:3456/docker
```

---

# Scripts Module

> **Path:** [`scripts/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/)

## Function

Development and testing scripts for the server.

## Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| [`smoke-pi-rpc-sse-session-switch.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/smoke-pi-rpc-sse-session-switch.mjs) | Smoke test: creates sessions, submits prompts, verifies SSE streaming, tests session switching | `RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs` |
| [`smoke-session-folder.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/smoke-session-folder.mjs) | Smoke test: verifies session folder structure and JSONL persistence | `node scripts/smoke-session-folder.mjs` |
| [`load-test-codex-multi-session.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/load-test-codex-multi-session.mjs) | Load test: creates and drives multiple concurrent sessions | `node scripts/load-test-codex-multi-session.mjs` |
| [`start-cloudflare-tunnel.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/start-cloudflare-tunnel.mjs) | Starts a Cloudflare Tunnel pointing to the proxy | `node scripts/start-cloudflare-tunnel.mjs` |
| [`start-dev-cloudflare.mjs`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/scripts/start-dev-cloudflare.mjs) | Starts proxy + dev server + Cloudflare Tunnel in parallel | `npm run dev:cloudflare` |

## How to Test

```bash
# Primary smoke test
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs

# Session persistence test
node scripts/smoke-session-folder.mjs

# Load test (requires server running)
npm start &
node scripts/load-test-codex-multi-session.mjs
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
