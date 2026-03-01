/**
 * Resolve the default model for a provider.
 * Reads from the server-fetched config cache (config/models.json via /api/models).
 */
import { getModelsConfigSync } from "@/services/server/modelsApi";

export const resolveDefaultModel = (provider: string): string => {
  const cfg = getModelsConfigSync();
  return cfg.providers[provider]?.defaultModel ?? "";
};

export const resolveStreamUrl = (
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { url: string; applySkipReplay: boolean } => {
  let streamUrl = `${serverUrl}/api/sessions/${sessionId}/stream?activeOnly=1`;
  return {
    url: skipReplayForSession === sessionId ? `${streamUrl}&skipReplay=1` : streamUrl,
    applySkipReplay: skipReplayForSession === sessionId,
  };
};
