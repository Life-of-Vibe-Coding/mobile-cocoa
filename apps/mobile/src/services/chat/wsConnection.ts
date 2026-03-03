/**
 * WebSocket-backed streaming client implementing EventSourceLike.
 *
 * Used in Cloudflare mode where SSE suffers from HTTP/2 buffering issues.
 * Cloudflare tunnels natively proxy WebSocket with zero configuration,
 * eliminating all SSE workarounds (POST hack, XHR EventSource, keepalive, etc.).
 *
 * Server sends JSON frames: { event: "message"|"end", data: "<string>" }
 * This client parses them and dispatches to the same handlers used by SSE.
 */
import type { EventSourceLike } from "./hooksTypes";

type Listener = (...args: unknown[]) => void;

export type WsStreamOptions = {
  url: string;
  activeOnly?: boolean;
  skipReplay?: boolean;
};

/**
 * Convert an HTTP(S) base URL to a WebSocket URL for session streaming.
 */
export function resolveWsStreamUrl(
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { url: string; applySkipReplay: boolean } {
  const wsBase = serverUrl
    .replace(/^https:\/\//i, "wss://")
    .replace(/^http:\/\//i, "ws://");

  const applySkipReplay = skipReplayForSession === sessionId;
  const params = new URLSearchParams({ activeOnly: "1" });
  if (applySkipReplay) params.set("skipReplay", "1");

  return {
    url: `${wsBase}/ws/sessions/${sessionId}/stream?${params.toString()}`,
    applySkipReplay,
  };
}

/**
 * Create a WebSocket streaming client that conforms to EventSourceLike.
 *
 * Maps WebSocket lifecycle events to the same open/error/message/end/done
 * events that the SSE EventSource emits, so the upstream lifecycle hook
 * doesn't need to know which transport is in use.
 */
export function createWsClient(options: WsStreamOptions): EventSourceLike {
  const { url } = options;
  const listeners: Record<string, Listener[]> = {
    open: [],
    error: [],
    message: [],
    end: [],
    done: [],
  };

  let ws: WebSocket | null = null;
  let closed = false;

  function addEventListener(event: string, handler: (...args: unknown[]) => void) {
    const list = listeners[event];
    if (list && !list.includes(handler)) list.push(handler);
  }

  function removeEventListener(event: string, handler: (...args: unknown[]) => void) {
    const list = listeners[event];
    if (list) {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  }

  function emit(event: string, ...args: unknown[]) {
    const list = listeners[event];
    if (list) {
      for (const h of list) {
        try {
          h(...args);
        } catch { /* swallow handler errors */ }
      }
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      ws?.close();
    } catch { /* already closed */ }
    ws = null;
  }

  try {
    ws = new WebSocket(url);
  } catch (err) {
    setTimeout(() => emit("error", err), 0);
    return { addEventListener, removeEventListener, close };
  }

  ws.onopen = () => {
    if (closed) return;
    emit("open", {});
  };

  ws.onmessage = (event: MessageEvent) => {
    if (closed) return;
    try {
      const frame = JSON.parse(event.data) as { event: string; data: string };
      const msgEvent = { data: frame.data, type: frame.event };

      if (frame.event === "end") {
        emit("end", msgEvent);
      } else {
        emit("message", msgEvent);
      }
    } catch {
      emit("message", { data: event.data, type: "message" });
    }
  };

  ws.onerror = (event: Event) => {
    if (closed) return;
    emit("error", event);
  };

  ws.onclose = (event: CloseEvent) => {
    if (closed) return;
    if (event.code === 1000 || event.code === 1005) {
      emit("done", { data: "{}" });
    } else {
      emit("error", {
        message: event.reason || `WebSocket closed (code ${event.code})`,
        code: event.code,
      });
    }
  };

  return { addEventListener, removeEventListener, close };
}
