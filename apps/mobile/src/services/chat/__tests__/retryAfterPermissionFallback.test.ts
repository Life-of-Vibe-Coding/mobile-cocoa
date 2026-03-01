import { renderHook, act } from "@testing-library/react-native";
import type { Message, PermissionDenial } from "@/core/types";
import { useChatActions } from "../useChatActions";

jest.mock("@/state/sessionManagementStore", () => {
  const storeFn: any = jest.fn();
  storeFn.getState = () => ({
    sessionStatuses: [],
    upsertSessionStatus: jest.fn(),
  });
  return { useSessionManagementStore: storeFn };
});

describe("retryAfterPermission fallback", () => {
  const sessionId = "session-retry-fallback";

  function createHookParams() {
    const sessionState = { sessionState: "idle" as const };
    const setSessionStateForSession = jest.fn();
    const setConnectionIntent = jest.fn();
    const setWaitingForUserInput = jest.fn();
    const setPermissionDenials = jest.fn();
    const setPendingAskQuestion = jest.fn();
    const setLastSessionTerminated = jest.fn();
    const setSessionId = jest.fn();
    const setLiveSessionMessages = jest.fn();

    return {
      params: {
        serverUrl: "http://127.0.0.1:3456",
        provider: "codex" as const,
        model: "gpt-5",
        sessionId,
        pendingAskQuestion: null,
        permissionDenials: [] as PermissionDenial[],
        lastRunOptionsRef: { current: { permissionMode: null, allowedTools: [], useContinue: false } },
        liveMessagesRef: { current: [] as Message[] },
        pendingMessagesForNewSessionRef: { current: [] as Message[] },
        outputBufferRef: { current: "" },
        displayedSessionIdRef: { current: sessionId as string | null },
        skipReplayForSessionRef: { current: null as string | null },
        addMessage: jest.fn(),
        sessionCache: {
          deduplicateMessageIds: jest.fn((messages: Message[]) => messages),
          getOrCreateSessionState: jest.fn(() => sessionState),
          getOrCreateSessionMessages: jest.fn(() => [] as Message[]),
          setSessionMessages: jest.fn(),
          setSessionDraft: jest.fn(),
          setSessionStateForSession,
          setConnectionIntent,
          clearConnectionIntent: jest.fn(),
          closeActiveSse: jest.fn(),
          touchSession: jest.fn(),
          evictOldestSessions: jest.fn(),
        },
        setSessionId,
        setLiveSessionMessages,
        setPermissionDenials,
        setPendingAskQuestion,
        setLastSessionTerminated,
        setWaitingForUserInput,
      },
      spies: {
        setSessionStateForSession,
        setConnectionIntent,
        setWaitingForUserInput,
        setPermissionDenials,
      },
    };
  }

  it("resets runtime state to idle when retry endpoint returns ok=false", async () => {
    const originalFetch = global.fetch;
    const { params, spies } = createHookParams();

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: "retry failed" }),
    })) as any;

    try {
      const { result } = renderHook(() => useChatActions(params as any));

      await act(async () => {
        await result.current.retryAfterPermission();
      });

      expect(spies.setSessionStateForSession).toHaveBeenCalledWith(sessionId, "running");
      expect(spies.setSessionStateForSession).toHaveBeenCalledWith(sessionId, "idle");
      expect(spies.setWaitingForUserInput).toHaveBeenCalledWith(false);
      expect(spies.setConnectionIntent).toHaveBeenCalledWith(sessionId, false);
      expect(spies.setPermissionDenials).toHaveBeenCalledWith(null);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
