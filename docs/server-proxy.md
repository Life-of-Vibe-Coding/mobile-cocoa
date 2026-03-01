# Proxy Module

> **Path:** [`server/utils/proxy.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/proxy.js)

## Function

Local reverse proxy (port multiplexer) for Cloudflare Tunnel. Routes HTTP and WebSocket traffic to different localhost ports based on `X-Target-Port` header or `_targetPort` query param. Enables the mobile app to reach both the dev server and preview ports (e.g., Vite) via a single tunnel URL.

## Workflow

1. Proxy listens on port 9443 (configurable via `PROXY_PORT`)
2. Incoming request examined for routing:
   - `X-Target-Port` header → forwards to `localhost:<that port>`
   - `_targetPort` query param → forwards to `localhost:<that port>` (param stripped from URL)
   - Neither → forwards to `localhost:3456` (default target)
3. Supports HTTP requests (pipe req/res) and WebSocket upgrades (pipe socket)
4. Adds `X-Tunnel-Proxy: 1` header to proxied requests

## Key Functions

| Function | Description |
|----------|-------------|
| `isValidPort(port)` | Validates port is 1024–65535 |
| HTTP handler | Routes requests based on `X-Target-Port` / `_targetPort` |
| Upgrade handler | Routes WebSocket upgrades through the proxy |

## How to Use

```bash
# Start the proxy standalone
node server/utils/proxy.js

# Start proxy + server + tunnel together
npm run dev:cloudflare
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `9443` | Port the proxy listens on |
| `PROXY_DEFAULT_TARGET_PORT` | `3456` | Default backend when no target port header |
| `PROXY_BIND` | `0.0.0.0` | Bind address |

### Example Routing

```bash
# Route to main server (default)
curl http://tunnel-url/api/config

# Route to Vite dev server on port 5173
curl -H "X-Target-Port: 5173" http://tunnel-url/

# Route via query param
curl "http://tunnel-url/?_targetPort=5173"
```

## How to Test

```bash
# Start proxy
node server/utils/proxy.js

# In another terminal, test routing
curl http://localhost:9443/api/config  # → localhost:3456
curl -H "X-Target-Port: 8080" http://localhost:9443/  # → localhost:8080
```

## API

This is a standalone Node.js script, not imported by other modules. It runs as a separate process alongside the main server.
