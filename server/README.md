# Server Module Structure

This directory contains the refactored server code, organized into modular components for better maintainability. Uses Pi (pi-mono) as the unified AI coding agent for Claude, Gemini, and Codex.

## Directory Structure

```
server/
├── config/         # Configuration and environment variables
│   └── index.js    # PORT, getWorkspaceCwd(), DEFAULT_PROVIDER, etc.
├── utils/          # Utility functions
│   ├── index.js    # stripAnsi, buildWorkspaceTree, path re-exports
│   ├── pathHelpers.js  # normalizeRelativePath, resolveWithinRoot, getMimeForFile
│   ├── git.js      # Git operations (commits, status, add, commit, push)
│   └── processes.js    # Process discovery and management
├── process/        # AI provider management (Pi RPC)
│   ├── index.js    # createProcessManager, shutdown, createSessionProcessManager
│   └── piRpcSession.js   # Pi RPC session (unified for claude/gemini/codex)
├── routes/         # Express routes
│   ├── index.js    # Route orchestration (setupRoutes)
│   ├── config.js   # Config and workspace path endpoints
│   ├── sessions.js # Session CRUD, SSE streaming, message replay
│   ├── skills.js   # Skills discovery and management
│   ├── workspace.js    # File tree, content, preview
│   ├── git.js      # Git operations endpoints
│   ├── processes.js    # Process discovery endpoints
│   ├── docker.js   # Docker API (when ENABLE_DOCKER_MANAGER is set)
│   ├── health-page.js  # Health check page
│   └── session-management-store.js  # Session snapshot store
├── skills/         # Pi agent skills discovery and loading
│   └── index.js    # discoverSkills, getEnabledIds, syncEnabledSkillsFolder
├── docker/         # Docker client wrapper (dockerode)
│   └── index.js    # Container, image, and volume management
├── sessionRegistry.js  # Global session registry (in-memory)
├── proxy.js        # Local reverse proxy for tunnel mode
├── skills-enabled.json # Enabled skill IDs
└── skills-library/     # Skill definitions (SKILL.md files)
```

## Main Entry Point

The main `server.js` file in the project root imports from these modules:

```javascript
import { ENABLE_DOCKER_MANAGER, PORT } from "./server/config/index.js";
import { shutdown } from "./server/process/index.js";
import { setupRoutes } from "./server/routes/index.js";
import { getActiveOverlay, getPreviewHost } from "./server/utils/index.js";
```

## Adding New Features

1. **New API routes**: Create a new route module in `server/routes/`, register it in `server/routes/index.js`
2. **New AI provider via Pi**: Edit `config/pi.json` (provider mapping, routing rules, default models)
3. **New/changed models**: Edit `config/models.json`
4. **Skills configuration**: Edit `config/skills.json` (library path, categories, enabled-file path)
5. **New utilities**: Add to appropriate module or create new module in `server/utils/`
6. **New configuration**: Add to `server/config/index.js`
