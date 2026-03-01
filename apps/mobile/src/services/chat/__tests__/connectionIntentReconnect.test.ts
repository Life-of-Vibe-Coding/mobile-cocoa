import { renderHook, waitFor } from "@testing-library/react-native";
import { useChatStreamingLifecycle } from "../useChatStreamingLifecycle";

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

describe("useChatStreamingLifecycle reconnect on intent", () => {
  beforeEach(() => {
    createdUrls.length = 0;
  });

  it("opens SSE when connection intent flips to true for same session", async () => {
    const sessionId = "session-reconnect-1";
    const intentState = { current: undefined as boolean | undefined };

    const sessionCache = {
      syncSessionToReact: jest.fn(),
      deduplicateMessageIds: jest.fn((messages: any[]) => messages),
      getMaxMessageId: jest.fn(() => 0),
      closeActiveSse: jest.fn(),
      setSessionStateForSession: jest.fn(),
      getConnectionIntent: jest.fn(() => intentState.current),
      getOrCreateSessionState: jest.fn(() => ({ sessionState: "idle" })),
      getOrCreateSessionMessages: jest.fn(() => []),
      getSessionDraft: jest.fn(() => ""),
      setSessionDraft: jest.fn(),
      setSessionMessages: jest.fn(),
      displayedSessionIdRef: { current: sessionId as string | null },
      activeSseRef: { current: null as any },
      activeSseHandlersRef: { current: null as any },
      suppressActiveSessionSwitchRef: { current: false },
      selectedSessionRuntimeRef: { current: { id: sessionId, running: false } },
      sawAgentEndRef: { current: false },
      streamFlushTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
      recordToolUseRef: { current: jest.fn() },
      getAndClearToolUseRef: { current: jest.fn(() => null) },
      addPermissionDenialRef: { current: jest.fn() },
      deduplicateDenialsRef: { current: jest.fn((denials: any[]) => denials) },
    };

    const params = {
      serverUrl: "http://127.0.0.1:3456",
      sessionId,
      storeSessionId: sessionId,
      sessionStatuses: [{ id: sessionId, status: "idling" as const }],
      sessionCache,
      skipReplayForSessionRef: { current: null as string | null },
      nextIdRef: { current: 0 },
      liveMessagesRef: { current: [] as any[] },
      outputBufferRef: { current: "" },
      setConnected: jest.fn(),
      setSessionId: jest.fn(),
      setLiveSessionMessages: jest.fn(),
      setSessionState: jest.fn(),
      setWaitingForUserInput: jest.fn(),
      setPendingAskQuestion: jest.fn(),
      setPermissionDenials: jest.fn(),
      setLastSessionTerminated: jest.fn(),
      setStoreSessionId: jest.fn(),
      lastRunOptionsRef: {
        current: { permissionMode: null, allowedTools: [], useContinue: false },
      },
    };

    const { rerender } = renderHook(() => useChatStreamingLifecycle(params as any));

    expect(createdUrls).toHaveLength(0);

    intentState.current = true;
    rerender({});

    await waitFor(() => {
      expect(createdUrls).toHaveLength(1);
      expect(createdUrls[0]).toContain(`/api/sessions/${sessionId}/stream?activeOnly=1`);
    });
  });
});
