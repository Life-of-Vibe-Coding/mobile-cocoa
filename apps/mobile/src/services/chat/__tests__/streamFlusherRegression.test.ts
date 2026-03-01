import { createStreamFlusher } from "../streamFlusher";

describe("StreamFlusher (Super Power Verification)", () => {
  let timerRef: { current: ReturnType<typeof setTimeout> | null };
  let flushed: string[];

  beforeEach(() => {
    timerRef = { current: null };
    flushed = [];
  });

  afterEach(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  });

  it("always flushes assistant text even when debug callback throws", () => {
    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      () => "",
      timerRef,
      () => {
        throw new Error("debug callback failed");
      },
    );

    flusher.queue("hello world\n");
    expect(flushed).toEqual(["hello world\n"]);
    expect(timerRef.current).toBeNull();
  });

  it("safely catches errors thrown by onFlush without crashing", () => {
    const flusher = createStreamFlusher(
      (chunk) => {
        flushed.push(chunk);
        throw new Error("onFlush failed drastically");
      },
      () => "",
      timerRef
    );

    // Using console.error override to prevent test output noise
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    
    // Boundary character forces immediate flush
    flusher.queue("bad flush."); 
    
    // We expect the throw to be caught internally, buffer flushed
    expect(flushed).toEqual(["bad flush."]);
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it("ignores empty string chunks entirely", () => {
    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      () => "",
      timerRef
    );

    flusher.queue("");
    expect(flushed.length).toBe(0);
    expect(timerRef.current).toBeNull();
  });

  it("cancels dormant timeouts when manually called", () => {
    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      () => "",
      timerRef
    );

    // Queue string without boundary character triggers setTimeout
    flusher.queue("waiting");
    expect(timerRef.current).not.toBeNull();
    
    // Cancel manual clearing
    flusher.cancel();
    expect(timerRef.current).toBeNull();
    
    // Flush should still correctly push what was in pending buffer
    flusher.flush();
    expect(flushed).toEqual(["waiting"]);
  });

  it("handles getSessionDraft returning undefined gracefully", () => {
    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      // @ts-expect-error Intentionally forcing invalid typing for runtime edge case test
      () => undefined,
      timerRef
    );

    // No boundary char triggers interval calculation requiring getSessionDraft
    flusher.queue("a");
    expect(timerRef.current).not.toBeNull();
    
    // Clear interval before jest teardown
    flusher.cancel();
  });

  it("successfully triggers timeout flush after delay", () => {
    jest.useFakeTimers();
    
    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      () => "",
      timerRef
    );

    // No boundary char triggers setTimeout
    flusher.queue("a");
    expect(flushed).toEqual([]); // Shouldn't flush yet
    expect(timerRef.current).not.toBeNull();
    
    // Fast-forward time to fire the setTimeout
    jest.runAllTimers();
    
    // Now it should have flushed
    expect(flushed).toEqual(["a"]);
    expect(timerRef.current).toBeNull();
    
    jest.useRealTimers();
  });
});

