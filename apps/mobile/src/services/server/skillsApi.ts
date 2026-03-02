/**
 * Skills API client for discovery, install, create, and configuration.
 */
export type SearchSkillResult = {
  id: string;
  name: string;
  description: string;
  category?: string;
  source: string;
  sourceUrl?: string;
  repoUrl?: string;
  maintainer?: string;
  version?: string;
  sourceRef?: string;
  isRemote?: boolean;
  installedAt?: string;
  path?: string;
};

export type SkillInstallRequest = {
  source: "find-skills" | "github";
  skillId?: string;
  repoUrl?: string;
  autoEnable?: boolean;
};

export type SkillCreateRequest = {
  name: string;
  id: string;
  category: string;
  description?: string;
  author?: string;
  repoUrl?: string;
  autoEnable?: boolean;
};

export type SkillInstallResult = {
  id: string;
  status: "installed" | "already-installed";
  path: string;
  enabled: boolean;
  source: string;
  installedAt: string;
  message: string;
  name: string;
  version?: string;
  sourceRef?: string;
  enabledIds?: string[];
};

export type SkillMetadata = SearchSkillResult & {
  path?: string;
  isRemote?: boolean;
  sourceRef?: string;
};

export type SkillsResponse = {
  skills: SkillMetadata[];
};

export type SkillsEnabledResponse = {
  enabledIds: string[];
};

export type SkillSource = {
  source: string;
  label: string;
  enabled: boolean;
  status: string;
  health: string;
  note?: string;
};

export type SkillSourcesResponse = {
  sources: SkillSource[];
};

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

export async function getSkills(serverBaseUrl: string): Promise<SkillsResponse> {
  const data = await requestJson<SkillsResponse>(`${serverBaseUrl}/api/skills`);
  return {
    skills: Array.isArray(data.skills) ? data.skills : [],
  };
}

export async function getSkill(serverBaseUrl: string, skillId: string): Promise<SkillMetadata> {
  const data = await requestJson<SkillMetadata>(`${serverBaseUrl}/api/skills/${encodeURIComponent(skillId)}`);
  return data;
}

export async function getSkillsEnabled(serverBaseUrl: string): Promise<SkillsEnabledResponse> {
  const data = await requestJson<SkillsEnabledResponse>(`${serverBaseUrl}/api/skills-enabled`);
  return { enabledIds: Array.isArray(data.enabledIds) ? data.enabledIds : [] };
}

export async function setSkillsEnabled(serverBaseUrl: string, enabledIds: string[]): Promise<SkillsEnabledResponse> {
  const data = await requestJson<SkillsEnabledResponse>(`${serverBaseUrl}/api/skills-enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledIds }),
  });
  return { enabledIds: Array.isArray(data.enabledIds) ? data.enabledIds : [] };
}

export async function searchSkills(
  serverBaseUrl: string,
  params: {
    q: string;
    source?: "find-skills" | "github";
    limit?: number;
  },
): Promise<{ skills: SearchSkillResult[] }> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source) query.set("source", params.source);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));

  const data = await requestJson<SkillsResponse>(`${serverBaseUrl}/api/skills/search?${query.toString()}`);
  return { skills: Array.isArray(data.skills) ? data.skills : [] };
}

export async function installSkill(
  serverBaseUrl: string,
  payload: SkillInstallRequest,
): Promise<SkillInstallResult> {
  return requestJson<SkillInstallResult>(`${serverBaseUrl}/api/skills/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createSkill(
  serverBaseUrl: string,
  payload: SkillCreateRequest,
): Promise<SkillInstallResult> {
  return requestJson<SkillInstallResult>(`${serverBaseUrl}/api/skills/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getSkillSources(serverBaseUrl: string): Promise<SkillSourcesResponse> {
  return requestJson<SkillSourcesResponse>(`${serverBaseUrl}/api/skills/sources`);
}
