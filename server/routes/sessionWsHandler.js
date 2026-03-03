/**
 * WebSocket stream handler for sessions.
 *
 * Provides the same streaming functionality as the SSE handler but over
 * WebSocket, which Cloudflare tunnels proxy natively without buffering.
 *
 * Message format (server -> client):
 *   { "event": "message", "data": "<raw line>" }
 *   { "event": "end",     "data": "{\"exitCode\":0}" }
 */
import fs from "fs";
import { URL } from "url";
import { WebSocketServer } from "ws";
import { SSE_PROCESS_START_POLL_MS, SSE_PROCESS_START_WAIT_MS } from "../config/constants.js";
import { resolveSession, subscribeWsToSession } from "../sessionRegistry.js";
import { isValidSessionId, resolveSessionFilePath, replayHistoryToWs } from "./sessionHelpers.js";
import { isTempSessionId } from "./sessionSseHandler.js";

const WS_PING_INTERVAL_MS = 30_000;
const WS_PATH_RE = /^\/ws\/sessions\/([^/]+)\/stream$/;

/**
 * Attach a WebSocketServer to an HTTP server for session streaming.
 */
export function attachSessionWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const match = url.pathname.match(WS_PATH_RE);
    if (!match) return; // not our path — let other upgrade handlers (proxy, etc.) handle it

    const sessionId = match[1];
    if (!isValidSessionId(sessionId)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, sessionId, url);
    });
  });

  wss.on("connection", (ws, req, sessionId, url) => {
    const activeOnly = url.searchParams.get("activeOnly") === "1";
    const skipReplay = url.searchParams.get("skipReplay") === "1";

    const session = resolveSession(sessionId);

    if (!session) {
      if (!skipReplay && !isTempSessionId(sessionId)) {
        const filePath = resolveSessionFilePath(sessionId);
        replayHistoryToWs(filePath, ws);
      }
      wsSend(ws, "end", { exitCode: 0 });
      ws.close();
      return;
    }

    if (!skipReplay && !isTempSessionId(sessionId)) {
      const filePath = session.existingSessionPath && fs.existsSync(session.existingSessionPath)
        ? session.existingSessionPath
        : resolveSessionFilePath(sessionId);
      replayHistoryToWs(filePath, ws);
    }

    const processRunning = session.processManager.processRunning?.() || false;

    if (activeOnly && !processRunning) {
      handleWsPolling({ session, sessionId, ws });
      return;
    }

    subscribeWsToSession(sessionId, ws);

    if (session.sseAdapter?.replayBufferedEventsWs) {
      session.sseAdapter.replayBufferedEventsWs(ws);
    }

    const pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
      else clearInterval(pingTimer);
    }, WS_PING_INTERVAL_MS);

    ws.on("close", () => {
      clearInterval(pingTimer);
      session.wsSubscribers.delete(ws);
    });

    ws.on("error", () => {
      clearInterval(pingTimer);
      session.wsSubscribers.delete(ws);
    });
  });

  return wss;
}

/**
 * Poll for process start, then subscribe the WebSocket when it begins.
 */
function handleWsPolling({ session, sessionId, ws }) {
  const start = Date.now();
  let pollingDone = false;

  session.wsSubscribers.add(ws);

  if (session.sseAdapter?.replayBufferedEventsWs) {
    session.sseAdapter.replayBufferedEventsWs(ws);
  }

  const unsubscribe = () => session.wsSubscribers.delete(ws);

  ws.on("close", unsubscribe);
  ws.on("error", unsubscribe);

  const check = () => {
    if (pollingDone || ws.readyState !== ws.OPEN) {
      if (ws.readyState !== ws.OPEN) unsubscribe();
      return;
    }
    if (session.processManager.processRunning?.()) {
      pollingDone = true;
      return;
    }
    if (Date.now() - start >= SSE_PROCESS_START_WAIT_MS) {
      pollingDone = true;
      unsubscribe();
      wsSend(ws, "end", { exitCode: 0 });
      ws.close();
      return;
    }
    setTimeout(check, SSE_PROCESS_START_POLL_MS);
  };

  setTimeout(check, SSE_PROCESS_START_POLL_MS);
}

/**
 * Send a JSON-framed message over WebSocket.
 */
export function wsSend(ws, event, data) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    const dataStr = typeof data === "string" ? data : JSON.stringify(data);
    ws.send(JSON.stringify({ event, data: dataStr }));
  } catch { /* swallow send errors */ }
}
