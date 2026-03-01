# Server Config Module

> **Path:** [`server/config/index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/config/index.js)

## Function

Centralizes all server configuration: environment variables, workspace resolution, external config loading (models, Pi, skills), and overlay/tunnel settings.

## Workflow

1. On import, resolves workspace directory from CLI args or env vars
2. Loads external JSON configs (`config/models.json`, `config/pi.json`, `config/skills.json`) from disk on demand
3. Exports constants and getter/setter functions consumed by other server modules

## Key Functions

| Function | Description |
|----------|-------------|
| `loadModelsConfig()` | Reads `config/models.json` — provider model lists, aliases. Falls back to built-in defaults |
| `loadPiConfig()` | Reads `config/pi.json` — Pi CLI path, provider mapping, routing rules, system prompts |
| `loadSkillsConfig()` | Reads `config/skills.json` — skill library dir, categories, enabled file path |
| `resolveWorkspaceCwd()` | Resolves workspace from `--workspace` flag → positional arg → `WORKSPACE` env → `WORKSPACE_CWD` env → default |
| `getWorkspaceCwd()` | Returns current workspace directory (mutable at runtime) |
| `setWorkspaceCwd(path)` | Changes workspace at runtime. Must be under `WORKSPACE_ALLOWED_ROOT` |
| `getOverlayNetwork()` | Returns `"tunnel"` or `"none"` based on `OVERLAY_NETWORK` env |

## How to Use

```js
import {
  PORT, getWorkspaceCwd, setWorkspaceCwd,
  loadModelsConfig, loadPiConfig, loadSkillsConfig,
} from "./server/config/index.js";

// Get current workspace
const cwd = getWorkspaceCwd();

// Load model config (re-reads from disk each call)
const models = loadModelsConfig();
console.log(models.providers.gemini.defaultModel);

// Change workspace at runtime
const result = setWorkspaceCwd("/Users/yifanxu/projects/my-app");
if (!result.ok) console.error(result.error);
```

## How to Test

Verify both API behavior and config-sensitive tests:

```bash
# Start server and check config endpoint
npm start
curl http://localhost:3456/api/config
curl http://localhost:3456/api/models
curl http://localhost:3456/api/workspace-path

# Config/path safety smoke test
npm run smoke:server
```

## API (Exported Constants)

| Export | Type | Description |
|--------|------|-------------|
| `PORT` | `number` | Server port (default `3456`) |
| `WORKSPACE_ALLOWED_ROOT` | `string` | Root path for allowed workspace switching |
| `SIDEBAR_REFRESH_INTERVAL_MS` | `number` | File tree refresh interval (default `3000`) |
| `DEFAULT_PROVIDER` | `string` | Default AI provider (from config, currently `codex`) |
| `DEFAULT_PERMISSION_MODE` | `string` | Claude permission mode (`bypassPermissions`) |
| `ENABLE_DOCKER_MANAGER` | `boolean` | Docker management flag |
| `PI_CLI_PATH` | `string` | Path to Pi CLI binary |
| `SESSIONS_ROOT` | `string` | Root directory for session files |
| `TUNNEL_PROXY_PORT` | `number` | Dev proxy port (default `9443`) |
| `DEFAULT_SERVER_URL` | `string` | Default mobile server URL (`http://localhost:3456`) |
| `projectRoot` | `string` | Absolute path to project root |
