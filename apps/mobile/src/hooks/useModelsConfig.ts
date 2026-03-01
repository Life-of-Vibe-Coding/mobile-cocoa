/**
 * React hook that loads models from the server (/api/models) at mount time.
 *
 * Usage:
 *   const { loading, config, modelsForProvider, defaultModelForProvider } = useModelsConfig();
 */
import { useCallback, useEffect, useState } from "react";

import type { ModelsConfig, ModelOption } from "@/services/server/modelsApi";
import { fetchModelsConfig, getModelsConfigSync, invalidateModelsCache } from "@/services/server/modelsApi";

export function useModelsConfig() {
  const [config, setConfig] = useState<ModelsConfig>(getModelsConfigSync);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchModelsConfig().then((cfg) => {
      if (!cancelled) {
        setConfig(cfg);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelsForProvider = useCallback(
    (provider: string): ModelOption[] => {
      return config.providers[provider]?.models ?? [];
    },
    [config],
  );

  const defaultModelForProvider = useCallback(
    (provider: string): string => {
      return config.providers[provider]?.defaultModel ?? "";
    },
    [config],
  );

  /** Force a re-fetch from the server. */
  const refresh = useCallback(async () => {
    invalidateModelsCache();
    setLoading(true);
    const cfg = await fetchModelsConfig();
    setConfig(cfg);
    setLoading(false);
  }, []);

  return { loading, config, modelsForProvider, defaultModelForProvider, refresh };
}
