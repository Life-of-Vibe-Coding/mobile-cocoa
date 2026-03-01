/**
 * Dynamic model configuration loader.
 *
 * Fetches models from the server's /api/models endpoint so that editing
 * config/models.json is all that is needed — no code changes required.
 */
import { getDefaultServerConfig } from "./config";

export type ModelOption = { value: string; label: string };

export type ProviderModelsConfig = {
  label?: string;
  piProvider?: string;
  defaultModel: string;
  models: ModelOption[];
};

export type ModelsConfig = {
  providers: Record<string, ProviderModelsConfig>;
  modelAliases?: Record<string, string>;
};

/** In-memory cache so we don't re-fetch on every render. */
let _cache: ModelsConfig | null = null;

/** Hard-coded fallback in case the server is unreachable. */
const FALLBACK_CONFIG: ModelsConfig = {
  providers: {
    claude: {
      defaultModel: "sonnet4.5",
      models: [{ value: "sonnet4.5", label: "Sonnet 4.5" }],
    },
    gemini: {
      defaultModel: "gemini-3.1-pro-preview",
      models: [
        { value: "gemini-3.1-pro-preview", label: "3.1 Pro Preview" },
      ],
    },
    codex: {
      defaultModel: "gpt-5.1-codex-mini",
      models: [
        { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
      ],
    },
  },
};

/**
 * Fetch the model configuration from the server.
 * Returns the cached value on subsequent calls.
 * Call `invalidateModelsCache()` to force a re-fetch.
 */
export async function fetchModelsConfig(): Promise<ModelsConfig> {
  if (_cache) return _cache;
  try {
    const base = getDefaultServerConfig().getBaseUrl();
    const res = await fetch(`${base}/api/models`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ModelsConfig = await res.json();
    if (!data?.providers || typeof data.providers !== "object") {
      throw new Error("Invalid models config response");
    }
    _cache = data;
    return data;
  } catch (err) {
    console.warn("[modelsApi] Could not fetch /api/models, using fallback:", (err as Error)?.message);
    return FALLBACK_CONFIG;
  }
}

/** Force next `fetchModelsConfig()` call to re-fetch from the server. */
export function invalidateModelsCache(): void {
  _cache = null;
}

/** Synchronous getter — returns cache or fallback. Never null. */
export function getModelsConfigSync(): ModelsConfig {
  return _cache ?? FALLBACK_CONFIG;
}
