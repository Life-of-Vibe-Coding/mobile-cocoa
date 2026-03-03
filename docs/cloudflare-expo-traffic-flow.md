# Cloudflare + Expo Tunnel — Traffic Flow

> How the mobile app connects to both the JS bundle and the backend API
> without directly exposing any local ports.

## Architecture Overview

```
┌──────────────────────┐
│      Mobile App      │
│   (Expo Go / Dev)    │
└──────────┬───────────┘
           │
           │
     ┌─────┴──────┐
     │             │
     ▼             ▼
┌─────────┐  ┌──────────┐
│ JS      │  │ API      │
│ Bundle  │  │ Calls    │
└────┬────┘  └────┬─────┘
     │            │
     ▼            ▼
┌─────────────┐  ┌──────────────────┐
│ ngrok       │  │ Cloudflare       │
│ tunnel      │  │ tunnel           │
│ (Expo's     │  │ (your tunnel)    │
│  built-in)  │  │                  │
└──────┬──────┘  └────────┬─────────┘
       │                  │
       ▼                  ▼
┌─────────────┐  ┌──────────────────┐
│ Metro       │  │ Reverse Proxy    │
│ Bundler     │  │ (port 9443)      │
│ (port 8081) │  │                  │
│ localhost   │  │ Routes via       │
│ only        │  │ X-Target-Port /  │
└─────────────┘  │ _targetPort      │
                 └────────┬─────────┘
                          │
                 ┌────────┴─────────┐
                 │                  │
                 ▼                  ▼
          ┌─────────────┐  ┌──────────────┐
          │ Express     │  │ Preview      │
          │ Server      │  │ Servers      │
          │ (port 3456) │  │ (3000-3002)  │
          │ API +       │  │ Vite, etc.   │
          │ Sessions    │  │              │
          └─────────────┘  └──────────────┘
```

## Startup Sequence

### Terminal 1 — Backend + Cloudflare Tunnel

```bash
npm run dev:cloudflare
```

This starts three processes:

1. **Reverse proxy** on port `9443` — multiplexes requests to local ports
2. **Express dev server** on port `3456` — the main API backend
3. **Cloudflare tunnel** — exposes `localhost:9443` as `https://xxx.trycloudflare.com`

Wait for the banner that prints the tunnel URL.

### Terminal 2 — Expo + ngrok Tunnel

```bash
EXPO_PUBLIC_SERVER_URL=https://xxx.trycloudflare.com npm run dev:mobile:cloudflare
```

Replace `xxx` with the actual Cloudflare tunnel URL from Terminal 1.

This starts:

1. **Expo Metro bundler** on port `8081` (localhost only)
2. **ngrok tunnel** (via `--tunnel` flag) — exposes Metro's port as a public URL
3. **QR code** is generated using the ngrok URL (reachable from any network)

## Security Model

| Component        | Exposed?   | How                          | Auth              |
| ---------------- | ---------- | ---------------------------- | ----------------- |
| Metro bundler    | No (local) | Only via Expo's ngrok tunnel | ngrok session key  |
| Express API      | No (local) | Only via Cloudflare tunnel   | Tunnel URL secret  |
| Reverse proxy    | No (local) | Only via Cloudflare tunnel   | Port whitelist     |
| Preview servers  | No (local) | Only via proxy + tunnel      | Port whitelist     |

**Key security properties:**

- **No raw ports are publicly exposed** — all traffic goes through tunnels
- **Port whitelist** — the proxy only forwards to ports listed in `config/ports.json`
- **Separate tunnels** — compromising one tunnel URL doesn't expose the other
- **Ephemeral URLs** — both Cloudflare quick tunnels and ngrok URLs rotate on restart
- **E2E encryption** — app-layer encryption (via `e2eCrypto`) ensures Cloudflare only sees ciphertext

## Configuration Files

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `config/ports.json`               | Port whitelist for the reverse proxy       |
| `config/defaults.json`            | Default ports, hosts, and proxy settings   |
| `config/server.json` (optional)   | User-specific server overrides             |
| `apps/mobile/app.json`            | Expo app configuration                     |

## Environment Variables

| Variable                          | Used By    | Purpose                                    |
| --------------------------------- | ---------- | ------------------------------------------ |
| `EXPO_PUBLIC_SERVER_URL`          | Mobile app | Cloudflare tunnel URL for API calls        |
| `EXPO_PUBLIC_CONNECTION_MODE`     | Mobile app | Set to `cloudflare` for tunnel routing     |
| `OVERLAY_NETWORK`                | Server     | Set to `tunnel` for tunnel-aware behavior  |
| `CLOUDFLARE_TUNNEL_TARGET`       | Tunnel     | Override default tunnel target URL         |
| `EXPO_PUBLIC_SERVER_HOST`        | Mobile app | Explicit server host override              |
| `EXPO_PUBLIC_PREVIEW_HOST`       | Mobile app | Explicit preview host override             |
