# Code Review: `streamFlusher.ts`

The `createStreamFlusher` utility implements a smart streaming buffer strategy. Overall, the logic is sound and correctly handles the throttle mechanism by maintaining a shared `timerRef`. However, we have identified several potential edge case failures and performance issues that should be addressed.

## 1. Unhandled Exceptions in `setTimeout` (Critical)
**Issue:** 
The `flush()` function calls `onFlush(chunk)` synchronously. When `flush()` is called by the debounce timer (`setTimeout`), any error thrown by `onFlush` will bubble up to the global event loop. In React Native and Node.js environments, errors inside `setTimeout` are treated as Unhandled Exceptions, which can crash the entire application process.

**Code Reference:**
```typescript
  const flush = (): void => {
    if (!pending) return;
    const chunk = pending;
    pending = "";
    onFlush(chunk); // <-- If this throws, the app may crash from inside setTimeout!
    // ...
```

**Recommendation:**
Wrap the execution of `onFlush(chunk)` in a `try/catch` block inside `flush()`. Even if `onFlush` fails, the `pending` buffer is already cleared, which avoids infinite failure loops.
```typescript
    try {
      onFlush(chunk);
    } catch (error) {
      console.error("[streamFlusher] error during flush:", error);
    }
```

## 2. Unchecked assumption on `getSessionDraft()` return value (Potential Crash)
**Issue:**
Inside `queue()`, the function calls `const draft = getSessionDraft();` and then immediately accesses `draft.length`. If `getSessionDraft` ever returns `null` or `undefined` under edge cases (e.g., if the session ID becomes invalid or was just cleared from the cache), this will throw a `TypeError: Cannot read properties of undefined (reading 'length')`.

**Code Reference:**
```typescript
    const draft = getSessionDraft();
    const delay =
      draft.length + pending.length > STREAM_FLUSH_DRAFT_THRESHOLD
```

**Recommendation:**
Add a safe fallback for the draft string to guarantee length access:
```typescript
    const draft = getSessionDraft() ?? "";
```

## 3. Punctuation Spam / Ellipses causing Render Thrashing (Performance Edge Case)
**Issue:**
The `queue()` function cancels the timer and flushes *immediately* if it detects a punctuation or newline marker (`STREAM_BOUNDARY_MARKER.test(chunk)`). 
If the LLM streams characters like an ellipsis (`...`), multiple commas (`,,,`), or structural formatting spaces/returns one character at a time, each incoming chunk will trigger an immediate flush. This bypasses the throttle completely and could lead to performance degrades / excessive re-renders during those specific tokens.

**Code Reference:**
```typescript
    if (STREAM_BOUNDARY_MARKER.test(chunk)) {
      cancel();
      flush();
      return;
    }
```

**Recommendation:**
If this proves to be a performance issue for specific LLMs (like formatting blocks), you could enforce a minimum `requestAnimationFrame` distance between flushes, or use a slightly smarter sliding window check instead of unconditionally matching single characters against the regex.

## 4. Inconsistent empty string handling
**Issue:**
If `queue("")` is called, `STREAM_BOUNDARY_MARKER.test("")` is `false`. It will bypass the immediate flush, check if a timer exists, and if not, compute the delay and set a timer. When the timer fires, `flush()` correctly ignores it if `pending === ""`. However, scheduling a `setTimeout` for an empty string is wasteful.

**Recommendation:**
Add a quick bailout at the top of `queue`:
```typescript
  const queue = (chunk: string): void => {
    if (!chunk) return;
    pending += chunk;
```
