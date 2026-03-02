---
name: render-preview
description: "Use this skill whenever the user wants to preview, render, open, or view a webpage, website, HTML file, or frontend/backend project in the browser. Triggers on: 'render this', 'preview the page', 'open in browser', 'serve this', 'show me what it looks like', 'run the app', 'view in browser', or any request to visually preview a web project. Detects project type automatically and finds a free port dynamically — never hard-codes port numbers. Checks for already-running dev servers before starting new ones."
---

# Render / Preview Skill

Serves any web project in the browser with zero hard-coded values and minimal latency.

## Core Rules

1. **Check running terminals first** — if a dev server is already running for this project, reuse its port; do not start a duplicate.
2. **Never hard-code port numbers** — always detect or discover dynamically.
3. **Never kill existing processes** — if a port is occupied, increment until a free one is found.
4. **Open the browser last** — only after confirming the server is listening.
5. **Static HTML files need no server** — open directly with the OS.

---

## Step 0 — Check for an Already-Running Server

Before starting anything, scan the user's active terminals for an existing dev server output (e.g. `Local: http://localhost:XXXX`, `ready on port XXXX`, `listening on :XXXX`). If found:

- Record the port number.
- Skip Steps 1–2 entirely.
- Jump directly to Step 3 (open in browser).

---

## Step 1 — Detect Project Type

Inspect the active file and project root `package.json` (if present):

| Project Type | Detection Signal |
|---|---|
| **Single HTML file** | Active/requested file ends with `.html` |
| **Static site** | No `package.json` in project root |
| **Vite** | `package.json` scripts or devDependencies contain `"vite"` |
| **Next.js** | `dependencies` or `devDependencies` contain `"next"` |
| **Create React App** | Scripts contain `"react-scripts"` |
| **Plain Node/Express** | Has `"start"` or `"dev"` script, none of the above match |

---

## Step 2 — Find a Free Port

Run this once to get the first available port starting at 3000:

```bash
node -e "
const net = require('net');
function tryPort(p) {
  const s = net.createServer();
  s.once('error', () => tryPort(p + 1));
  s.once('listening', () => { console.log(p); s.close(); });
  s.listen(p);
}
tryPort(3000);
"
```

Save the output as `FREE_PORT`. Use it in every command below — never substitute a fixed number.

---

## Step 3 — Start the Server (or Open the File)

Choose the matching command. All server commands use `nohup … & disown` so the Bash tool does not block.

### A — Single HTML file (no server needed)
```bash
open "<absolute-path-to-file>.html"
```
Done. Skip Steps 4–5.

### B — Static site (no package.json)
```bash
nohup bash -c "npx -y serve . --listen $FREE_PORT" >> serve.log 2>&1 & disown
```

### C — Vite
```bash
nohup bash -c "npm run dev -- --host 0.0.0.0 --port $FREE_PORT" >> vite.log 2>&1 & disown
```

### D — Next.js
```bash
nohup bash -c "npm run dev -- -H 0.0.0.0 -p $FREE_PORT" >> next.log 2>&1 & disown
```

### E — Create React App
```bash
nohup bash -c "HOST=0.0.0.0 PORT=$FREE_PORT npm start" >> cra.log 2>&1 & disown
```

### F — Plain Node / Express
```bash
nohup bash -c "PORT=$FREE_PORT npm run dev" >> server.log 2>&1 & disown
# fallback: PORT=$FREE_PORT npm start
```

> ⚠️ If the server source hard-codes `127.0.0.1` or `localhost` in `app.listen(...)`, warn the user that remote access will fail and suggest changing it to `'0.0.0.0'`.

---

## Step 4 — Wait and Verify

```bash
sleep 3
# Tail the relevant log for up to 8 seconds to confirm startup
timeout 8 tail -f <service>.log
```

Look for success indicators: `Local: http://`, `ready on port`, `Uvicorn running`, `listening on`, `compiled successfully`.

If the log shows an error, stop and report it — do not attempt to open the browser.

---

## Step 5 — Open in Browser

```bash
open "http://localhost:$FREE_PORT"
```

Use `localhost`. If the server binds to `0.0.0.0` and the user needs a remote URL (e.g., tunnel or LAN), substitute the appropriate host reported from the log.

---

## Output Format

Always report back in this format:

```
✓ Project type : Vite
✓ Port         : 5174  (5173 was occupied, incremented)
✓ URL          : http://localhost:5174
✓ Browser      : opened

To stop: Ctrl+C in the terminal running the dev server.
```

If reusing an already-running server:

```
✓ Dev server already running on port 3456
✓ URL          : http://localhost:3456
✓ Browser      : opened
```
