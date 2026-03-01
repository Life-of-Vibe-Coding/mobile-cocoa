const createdUrls: string[] = [];

jest.mock("react-native-sse", () => {
  const MockEventSource = function (this: any, url: string) {
    this.url = url;
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
    this.close = jest.fn();
    createdUrls.push(url);
  };
  return {
    __esModule: true,
    default: MockEventSource,
  };
});

import { createRetryScheduler } from "../sseLifecycleManager";
import type { SseEventHandlers } from "../sseConnection";

describe("createRetryScheduler", () => {
  beforeEach(() => {
    createdUrls.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reconnects with skipReplay enabled to avoid duplicate replay after retry", () => {
    const state = {
      hasStreamEndedRef: { current: false },
      hasFinalizedRef: { current: false },
      retryCountRef: { current: 0 },
      retryTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
      isAborted: false,
      messageCountAtSseOpen: 0,
    };

    const currentSource = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    };

    const ctx = {
      serverUrl: "http://127.0.0.1:3456",
      connectionSessionIdRef: { current: "session-retry-1" },
      displayedSessionIdRef: { current: "session-retry-1" },
      outputBufferRef: { current: "" },
      sawAgentEndRef: { current: false },
      activeSseRef: { current: { id: "session-retry-1", source: currentSource } },
      activeSseHandlersRef: { current: null as SseEventHandlers | null },
      currentSseRef: { current: currentSource },
      flusher: { queue: jest.fn(), cancel: jest.fn(), flush: jest.fn() },
      msgHandlers: { finalizeAssistantMessageForSession: jest.fn() },
      dispatchProviderEvent: jest.fn(),
      getOrCreateSessionMessages: jest.fn(() => []),
      getSessionDraft: jest.fn(() => ""),
      setSessionStateForSession: jest.fn(),
      setWaitingForUserInput: jest.fn(),
      setConnected: jest.fn(),
      setLastSessionTerminated: jest.fn(),
      closeActiveSse: jest.fn(),
      refreshCurrentSessionFromDisk: jest.fn(async () => {}),
    };

    const handlers: SseEventHandlers = {
      open: jest.fn(),
      error: jest.fn(),
      message: jest.fn(),
      end: jest.fn(),
      done: jest.fn(),
    };

    const scheduleRetry = createRetryScheduler(state, ctx as any, handlers);
    scheduleRetry();
    jest.advanceTimersByTime(1000);

    expect(createdUrls.length).toBe(1);
    expect(createdUrls[0]).toContain("/api/sessions/session-retry-1/stream?activeOnly=1&skipReplay=1");
  });
});
