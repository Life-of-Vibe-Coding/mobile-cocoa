/**
 * Process management for AI provider via Pi RPC (pi-mono).
 * Supports Claude, Gemini, and Codex through the unified Pi coding agent.
 */
import {
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_SSE_HOST,
  getWorkspaceCwd,
  loadModelsConfig,
  projectRoot,
  VALID_PROVIDERS,
} from "../config/index.js";

import { createPiRpcSession } from "./piRpcSession.js";

const globalSpawnChildren = new Set();
const SSE_END_EVENTS = new Set(["exit"]);

function normalizeTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SHUTDOWN_GRACE_MS = 5_000;

export function shutdown(signal, httpServer) {
  console.log(`[server] Shutting down (${signal ?? "unknown"})...`);
  for (const child of globalSpawnChildren) {
    try {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (_) { }
      }
      child.kill();
    } catch (_) { }
  }
  globalSpawnChildren.clear();
  if (httpServer) {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
  } else {
    process.exit(0);
  }
}

function resolveProvider(fromPayload) {
  const provider = normalizeTrimmedString(fromPayload);
  if (VALID_PROVIDERS.includes(provider)) {
    return provider;
  }
  return DEFAULT_PROVIDER;
}

function shouldResetSessionMetadata(sessionManagement, provider, model) {
  return sessionManagement && (sessionManagement.provider !== provider || sessionManagement.model !== model);
}

function applySessionManagementConfig(sessionManagement, provider, model, hasCompletedFirstRunRef) {
  if (!sessionManagement) return;
  const resetMetadata = shouldResetSessionMetadata(sessionManagement, provider, model);
  if (resetMetadata) {
    sessionManagement.sessionId = null;
    sessionManagement.sessionLogTimestamp = null;
    hasCompletedFirstRunRef.value = false;
  }
  if (!sessionManagement.sessionLogTimestamp) {
    sessionManagement.sessionLogTimestamp = formatSessionLogTimestamp();
  }
  sessionManagement.provider = provider;
  sessionManagement.model = model;
}

/**
 * Return the default model for a given provider by reading config/models.json.
 * Falls back to hardcoded safe values when the provider is missing from config.
 */
function getDefaultModelForProvider(provider) {
  try {
    const modelsConfig = loadModelsConfig();
    return modelsConfig.providers?.[provider]?.defaultModel ?? getBuiltinDefaultModel(provider);
  } catch (_) {
    return getBuiltinDefaultModel(provider);
  }
}

function getBuiltinDefaultModel(provider) {
  return DEFAULT_PROVIDER_MODELS?.[provider] || provider;
}

function emitError(socket, message) {
  socket.emit("output", `\r\n\x1b[31m[Error] ${message}\x1b[0m\r\n`);
}

/** Format current time as yyyy-MM-dd_HH-mm-ss (24-hour) for log directory names. */
export function formatSessionLogTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Creates an AI process manager for a socket connection.
 * Uses Pi RPC for all providers (claude, gemini, codex).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef, sessionManagement, onPiSessionId, existingSessionPath, sessionId }) {
  const piRpcSession = createPiRpcSession({
    socket,
    hasCompletedFirstRunRef,
    sessionManagement,
    globalSpawnChildren,
    getWorkspaceCwd,
    projectRoot,
    onPiSessionId,
    existingSessionPath,
    sessionId,
  });

  function processRunning() {
    return piRpcSession.isTurnRunning();
  }

  function handleSubmitPrompt(payload) {
    const prompt = normalizeTrimmedString(payload?.prompt);

    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }

    const provider = resolveProvider(payload?.provider);
    const requestedModel = normalizeTrimmedString(payload?.model);

    const defaultModel = getDefaultModelForProvider(provider);
    const model =
      requestedModel ? requestedModel : defaultModel;

    applySessionManagementConfig(sessionManagement, provider, model, hasCompletedFirstRunRef);

    piRpcSession.startTurn({ prompt, clientProvider: provider, model }).catch((err) => {
      emitError(socket, err?.message || "Failed to start Pi RPC.");
      socket.emit("exit", { exitCode: 1 });
    });
  }

  function handleInput(data) {
    return piRpcSession.handleInput(data);
  }

  function handleTerminate(payload) {
    const resetSession = !!payload?.resetSession;
    if (resetSession && sessionManagement) {
      hasCompletedFirstRunRef.value = false;
      sessionManagement.sessionId = null;
      sessionManagement.sessionLogTimestamp = null;
    }
    piRpcSession.close();
    socket.emit("exit", { exitCode: 0 });
  }

  function cleanup() {
    piRpcSession.close();
  }

  return {
    processRunning,
    handleSubmitPrompt,
    handleInput,
    handleTerminate,
    cleanup,
  };
}

/** Max events to buffer per session for late subscribers */
const EVENT_BUFFER_MAX_SIZE = 200;
/** Max age of buffered events in ms (clear older events) */
const EVENT_BUFFER_MAX_AGE_MS = 30_000;

/**
 * Creates a socket-like adapter that broadcasts to session.subscribers (SSE responses).
 * Used by the REST+SSE session flow instead of Socket.IO.
 *
 * Includes event buffering: when no subscribers exist, events are buffered so late
 * subscribers can catch up. This fixes the race condition where the mobile SSE
 * connection arrives after the process has already emitted events.
 */
function createSseSocketAdapter(sessionId, session, host = DEFAULT_SSE_HOST) {
  // Event buffer for late subscribers
  const eventBuffer = [];

  const adapter = {
    id: sessionId,
    handshake: {
      headers: { host },
      address: "",
    },
    conn: { remoteAddress: "" },

    /**
     * Replay buffered events to a new SSE subscriber.
     */
    replayBufferedEvents(response) {
      if (eventBuffer.length === 0) return;
      for (const { payload, endPayload } of eventBuffer) {
        try {
          if (response.writableEnded) break;
          if (endPayload) {
            response.write(endPayload);
            response.end();
            break;
          } else {
            response.write(payload);
          }
        } catch (err) {
          break;
        }
      }
    },

    /**
     * Replay buffered events to a new WebSocket subscriber.
     */
    replayBufferedEventsWs(ws) {
      if (eventBuffer.length === 0) return;
      for (const { rawLine, isEnd, rawData } of eventBuffer) {
        try {
          if (ws.readyState !== 1 /* OPEN */) break;
          if (isEnd) {
            ws.send(JSON.stringify({ event: "end", data: rawData }));
            ws.close();
            break;
          } else {
            ws.send(JSON.stringify({ event: "message", data: rawLine }));
          }
        } catch (err) {
          break;
        }
      }
    },

    /**
     * Clear the event buffer (called after stream ends or on cleanup).
     */
    clearBuffer() {
      eventBuffer.length = 0;
    },

    emit(event, data) {
      const line = typeof data === "string" ? data : JSON.stringify(data);
      const sseData = line.replace(/\r?\n/g, "\ndata: ");
      const payload = `data: ${sseData}\n\n`;
      const isEnd = SSE_END_EVENTS.has(event);
      const endPayload = isEnd
        ? `event: end\ndata: ${JSON.stringify(data ?? {})}\n\n`
        : null;
      const rawData = isEnd ? JSON.stringify(data ?? {}) : null;

      // Always buffer events (for late subscribers, both SSE and WS)
      const now = Date.now();
      eventBuffer.push({ payload, endPayload, rawLine: line, isEnd, rawData, ts: now });

      // Prune old events from buffer
      while (eventBuffer.length > EVENT_BUFFER_MAX_SIZE) {
        eventBuffer.shift();
      }
      while (eventBuffer.length > 0 && now - eventBuffer[0].ts > EVENT_BUFFER_MAX_AGE_MS) {
        eventBuffer.shift();
      }

      // Broadcast to SSE subscribers
      const subscribers = session.subscribers;
      if (subscribers && subscribers.size > 0) {
        for (const response of subscribers) {
          try {
            if (response.writableEnded) continue;
            if (endPayload) {
              response.write(endPayload);
              response.end();
            } else {
              response.write(payload);
            }
          } catch (err) {
            // swallow write errors
          }
        }
      }

      // Broadcast to WebSocket subscribers
      const wsSubscribers = session.wsSubscribers;
      if (wsSubscribers && wsSubscribers.size > 0) {
        const wsPayload = isEnd
          ? JSON.stringify({ event: "end", data: rawData })
          : JSON.stringify({ event: "message", data: line });
        for (const ws of wsSubscribers) {
          try {
            if (ws.readyState !== 1 /* OPEN */) continue;
            ws.send(wsPayload);
            if (isEnd) ws.close();
          } catch (err) {
            // swallow send errors
          }
        }
      }
    },
    setHost(hostValue) {
      adapter.handshake.headers.host = hostValue || DEFAULT_SSE_HOST;
    },
  };

  // Attach adapter to session for access by stream handler
  session.sseAdapter = adapter;

  return adapter;
}

/**
 * Creates a process manager for the REST+SSE session flow.
 * Uses one Pi RPC process per session; output is broadcast to all SSE subscribers.
 */
export function createSessionProcessManager(sessionId, session, { onPiSessionId, existingSessionPath, sessionLogTimestamp } = {}) {
  const hasCompletedFirstRunRef = { value: false };
  const sessionManagement = {
    provider: session.provider,
    model: session.model,
    sessionId: null,
    sessionLogTimestamp: sessionLogTimestamp ?? session.sessionLogTimestamp,
  };
  const socket = createSseSocketAdapter(sessionId, session);
  const processManager = createProcessManager(socket, {
    hasCompletedFirstRunRef,
    sessionManagement,
    onPiSessionId,
    existingSessionPath,
    sessionId,
  });
  const originalHandleSubmitPrompt = processManager.handleSubmitPrompt;
  processManager.handleSubmitPrompt = (payload, host) => {
    if (host) socket.setHost(host);
    originalHandleSubmitPrompt(payload);
  };
  return processManager;
}
