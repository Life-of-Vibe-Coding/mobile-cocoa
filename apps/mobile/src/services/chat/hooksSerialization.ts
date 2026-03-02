export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (_, nested) => {
      if (typeof nested === "object" && nested !== null) {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      return nested;
    });
  } catch (_) {
    const safe = toSafePlainValue(value, new WeakMap(), 0);
    return JSON.stringify(safe);
  }
}

function toSafePlainValue(value: unknown, seen: WeakMap<object, string>, depth: number): unknown {
  if (depth > 8) {
    return "[MaxDepth]";
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return value.message;
  if (typeof value === "symbol") return value.toString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.set(value, "[Circular]");
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    return { __type: "Map", values: Array.from(value.values()).map((v) => toSafePlainValue(v, seen, depth + 1)) };
  }
  if (value instanceof Set) {
    return { __type: "Set", values: Array.from(value.values()).map((v) => toSafePlainValue(v, seen, depth + 1)) };
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const item = (value as Record<string, unknown>)[key];
    out[key] = toSafePlainValue(item, seen, depth + 1);
  }
  return out;
}

export function normalizeSubmitPayload(payload: {
  prompt: unknown;
  permissionMode?: unknown;
  allowedTools?: unknown;
  provider?: unknown;
  model?: unknown;

  sessionId?: unknown;
  replaceRunning?: unknown;
}) {
  return {
    prompt:
      typeof payload.prompt === "string"
        ? payload.prompt
        : typeof payload.prompt?.toString === "function"
          ? String(payload.prompt)
          : "",
    permissionMode:
      payload.permissionMode === undefined ? undefined : String(payload.permissionMode),
    allowedTools: Array.isArray(payload.allowedTools)
      ? payload.allowedTools
          .map((item) => (typeof item === "string" ? item : String(item)))
          .filter(Boolean)
      : undefined,
    provider: typeof payload.provider === "string" ? payload.provider : "gemini",
    model: typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : undefined,
    sessionId:
      typeof payload.sessionId === "string" && payload.sessionId.trim()
        ? payload.sessionId.trim()
        : undefined,
    replaceRunning: Boolean(payload.replaceRunning),
  };
}
