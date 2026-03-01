/**
 * Session Store - Persist provider/model preference only.
 *
 * Sessions come from the server (central .pi/agent/sessions on disk). We only persist
 * the last used provider and model for UX.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_USED_PROVIDER_MODEL_KEY = "@vibe_last_used_provider_model";

export interface LastUsedProviderModel {
  provider: string;
  model: string;
}

/**
 * Load the last used provider and model (for new sessions).
 */
export async function loadLastUsedProviderModel(): Promise<string | LastUsedProviderModel | null> {
  try {
    const storedValue = await AsyncStorage.getItem(LAST_USED_PROVIDER_MODEL_KEY);
    if (!storedValue) return null;
    const parsed = JSON.parse(storedValue) as { provider?: string; model?: string } | string;
    if (typeof parsed === "string" && parsed.trim().length > 0) {
      return parsed.trim();
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.provider === "string" &&
      typeof parsed.model === "string"
    ) {
      return { provider: parsed.provider, model: parsed.model };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the last used provider and model.
 */
export async function setLastUsedProviderModel(provider: string, model: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_USED_PROVIDER_MODEL_KEY,
      JSON.stringify({ provider, model })
    );
  } catch {
    // Ignore persistence errors
  }
}
