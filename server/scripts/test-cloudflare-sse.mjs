#!/usr/bin/env node
/**
 * test-cloudflare-sse.mjs
 *
 * Self-contained script that:
 *   1. Starts a Cloudflare quick tunnel pointing at the local proxy
 *   2. Waits for the tunnel URL to be ready
 *   3. Creates a new session via POST /api/sessions/new
 *   4. Sends a prompt via POST /api/sessions
 *   5. Streams the SSE response via POST /api/sessions/:id/stream (Cloudflare-safe POST)
 *
 * Usage:
 *   node server/scripts/test-cloudflare-sse.mjs "Your prompt here"
 *   node server/scripts/test-cloudflare-sse.mjs                    # default prompt
 *
 * Prerequisites:
 *   - cloudflared installed (brew install cloudflared)
 *   - Dev server running (npm run dev)
 *   - Proxy running (node server/utils/proxy.js) OR use npm run dev:cloudflare
 *
 * Options:
 *   --url <URL>           Skip tunnel startup and use an existing Cloudflare URL
 *   --local               Skip tunnel, hit localhost:3456 directly (for comparison)
 *   --timeout <seconds>   SSE read timeout (default: 120)
 */
import { spawn } from "child_process";
import { TUNNEL_PROXY_PORT, PROXY_LOOPBACK_HOST, PORT } from "../config/index.js";

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let prompt = "Say hello in one sentence.";
let existingUrl = null;
let useLocal = false;
let timeoutSec = 120;
let provider = null;
let model = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
        existingUrl = args[++i];
    } else if (args[i] === "--local") {
        useLocal = true;
    } else if (args[i] === "--timeout" && args[i + 1]) {
        timeoutSec = parseInt(args[++i], 10);
    } else if (args[i] === "--provider" && args[i + 1]) {
        provider = args[++i];
    } else if (args[i] === "--model" && args[i + 1]) {
        model = args[++i];
    } else if (!args[i].startsWith("--")) {
        prompt = args[i];
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const log = (tag, ...msg) => console.log(`[${tag}]`, ...msg);
const err = (tag, ...msg) => console.error(`[${tag}]`, ...msg);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Step 1: Start Cloudflare tunnel (unless --url or --local) ───────────────
async function startTunnel() {
    if (useLocal) {
        const url = `http://localhost:${PORT}`;
        log("tunnel", `Skipping tunnel — using local: ${url}`);
        return url;
    }
    if (existingUrl) {
        log("tunnel", `Using existing URL: ${existingUrl}`);
        return existingUrl;
    }

    const target = `http://${PROXY_LOOPBACK_HOST}:${TUNNEL_PROXY_PORT}`;
    log("tunnel", `Starting cloudflared tunnel → ${target}`);

    return new Promise((resolve, reject) => {
        const child = spawn("cloudflared", ["tunnel", "--url", target], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        const urlRegex = /https:\/\/[^\s"'<>]+\.(trycloudflare\.com|cfargotunnel\.com)[^\s"'<>]*/i;
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                child.kill("SIGTERM");
                reject(new Error("Timed out waiting for Cloudflare tunnel URL (30s)"));
            }
        }, 30_000);

        function checkLine(line) {
            if (resolved) return;
            const match = line.match(urlRegex);
            if (match) {
                resolved = true;
                clearTimeout(timer);
                const url = match[0].replace(/[)\],'"\s]+$/, "").trim();
                log("tunnel", `Tunnel ready: ${url}`);

                // Keep tunnel alive; kill on process exit
                process.on("exit", () => child.kill("SIGTERM"));
                process.on("SIGINT", () => { child.kill("SIGTERM"); process.exit(0); });
                process.on("SIGTERM", () => { child.kill("SIGTERM"); process.exit(0); });

                resolve(url);
            }
        }

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => checkLine(chunk));
        child.stderr.on("data", (chunk) => checkLine(chunk));

        child.on("error", (e) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                reject(new Error(`cloudflared failed: ${e.message}. Install with: brew install cloudflared`));
            }
        });
        child.on("exit", (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                reject(new Error(`cloudflared exited with code ${code} before printing a URL`));
            }
        });
    });
}

// ── Step 2: Create a new session ────────────────────────────────────────────
async function createSession(baseUrl) {
    log("session", "Creating new session...");
    const res = await fetch(`${baseUrl}/api/sessions/new`, { method: "POST" });
    if (!res.ok) throw new Error(`POST /api/sessions/new failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.ok || !data.sessionId) throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
    log("session", `Session created: ${data.sessionId}`);
    return data.sessionId;
}

// ── Step 3: Send the prompt ─────────────────────────────────────────────────
async function sendPrompt(baseUrl, sessionId, userPrompt) {
    log("prompt", `Sending prompt: "${userPrompt}"${provider ? ` (provider=${provider}, model=${model})` : ""}`);
    const body = { sessionId, prompt: userPrompt };
    if (provider) body.provider = provider;
    if (model) body.model = model;
    const res = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST /api/sessions failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Prompt submit failed: ${JSON.stringify(data)}`);
    log("prompt", `Prompt accepted, sessionId=${data.sessionId}`);
    return data.sessionId; // may differ from input if server migrated it
}

// ── Step 4: Stream SSE response ─────────────────────────────────────────────
async function streamSse(baseUrl, sessionId) {
    log("sse", `Connecting SSE stream: POST /api/sessions/${sessionId}/stream`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
        // Use POST for Cloudflare (GET buffers SSE on Cloudflare tunnels)
        const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activeOnly: "1", skipReplay: "1" }),
            signal: controller.signal,
        });

        if (!res.ok) throw new Error(`SSE connect failed: ${res.status} ${await res.text()}`);
        log("sse", `Connected! Status ${res.status}. Streaming events...\n`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE frames from buffer
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep incomplete line in buffer

            let currentEvent = null;
            for (const line of lines) {
                // Skip SSE comments (keepalive heartbeats)
                if (line.startsWith(":")) continue;
                if (line.startsWith("event: ")) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith("data: ")) {
                    const rawData = line.slice(6);
                    eventCount++;

                    if (currentEvent === "end") {
                        console.log(`\n[sse] ── Stream ended (${eventCount} events) ──`);
                        try {
                            const parsed = JSON.parse(rawData);
                            console.log(`[sse] Exit code: ${parsed.exitCode ?? "unknown"}`);
                        } catch { /* raw end event */ }
                        clearTimeout(timer);
                        return;
                    }

                    // Try to parse and pretty-print
                    try {
                        const parsed = JSON.parse(rawData);
                        const type = parsed.type || currentEvent || "data";

                        if (type === "assistant" || type === "text") {
                            // Stream assistant text inline
                            process.stdout.write(parsed.content || parsed.text || "");
                        } else {
                            // Other event types — print compact JSON
                            console.log(`[sse:${type}]`, JSON.stringify(parsed).slice(0, 200));
                        }
                    } catch {
                        // Not JSON — print raw
                        if (rawData.trim()) {
                            console.log(`[sse:raw] ${rawData.slice(0, 200)}`);
                        }
                    }

                    currentEvent = null;
                } else if (line.trim() === "") {
                    currentEvent = null;
                }
            }
        }

        console.log(`\n[sse] Stream closed after ${eventCount} events.`);
    } catch (e) {
        if (e.name === "AbortError") {
            err("sse", `Timed out after ${timeoutSec}s`);
        } else {
            throw e;
        }
    } finally {
        clearTimeout(timer);
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║   Cloudflare Tunnel → SSE Streaming Test    ║");
    console.log("╚══════════════════════════════════════════════╝\n");

    try {
        const baseUrl = await startTunnel();

        // Brief pause so tunnel is fully warmed up
        if (!useLocal && !existingUrl) {
            log("main", "Waiting 2s for tunnel warmup...");
            await sleep(2000);
        }

        const sessionId = await createSession(baseUrl);
        const activeId = await sendPrompt(baseUrl, sessionId, prompt);

        // Small delay to let process spawn before subscribing
        await sleep(500);

        await streamSse(baseUrl, activeId);

        log("main", "✅ Done!");
        process.exit(0);
    } catch (e) {
        err("main", "❌ Error:", e.message);
        process.exit(1);
    }
}

main();
