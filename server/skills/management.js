import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  SKILLS_CONFIG_PATH,
  loadSkillsConfig,
  projectRoot,
} from "../config/index.js";
import {
  discoverSkills,
  getEnabledIds,
  setEnabledIds,
  syncEnabledSkillsToWorkspace,
} from "./index.js";

const SKILLS_LOCK_FILE = path.join(projectRoot, "skills-lock.json");
const SKILL_LIBRARY_DEFAULT = "server/skills/library";
const SKILL_FILE_DEFAULT_NAME = "SKILL.md";
const SKILL_ID_PATTERN = /^(?!-)(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const DEFAULT_CATALOG_REPO = "openai/skills";
const DEFAULT_CATALOG_PATH = "skills/.curated";
const DEFAULT_CATALOG_REF = "main";
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 25;
const SKILLS_LOCK_VERSION = 2;
const PYTHON_COMMANDS = ["python3", "python"];
const SCRIPT_MAX_BUFFER = 1_048_576; // 1 MB
const SCRIPT_TIMEOUT_MS = 60_000;
const ALLOWED_GITHUB_HOSTS = new Set(["github.com"]);
const SKILL_ID_REPLACEMENT = "-";

/**
 * @typedef {{ id: string; name: string; description: string; category?: string }} ExistingSkill
 */

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   description: string;
 *   source: string;
 *   sourceUrl?: string;
 *   repoUrl?: string;
 *   maintainer?: string;
 *   category?: string;
 *   version?: string;
 *   installedAt?: string;
 *   path?: string;
 *   isRemote?: boolean;
 *   sourceRef?: string;
 * }} SearchSkillResult
 */

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   path: string;
 *   source: string;
 *   sourceType: string;
 *   sourceUrl?: string;
 *   repoUrl?: string;
 *   sourceRef?: string;
 *   version?: string;
 *   installedAt: string;
 *   createdAt: string;
 *   category?: string;
 * }} SkillLockEntry
 */

/**
 * @typedef {{
 *   status: "installed" | "already-installed";
 *   id: string;
 *   path: string;
 *   source: string;
 *   sourceUrl: string;
 *   sourceRef?: string;
 *   installedAt: string;
 *   version?: string;
 *   enabled: boolean;
 *   enabledIds: string[];
 *   message: string;
 *   category?: string;
 * }} InstallResult
 */

const LOCK_DEFAULT = {
  lockVersion: SKILLS_LOCK_VERSION,
  version: 1,
  entries: [],
};

class SkillManagementError extends Error {
  constructor(message, status = 500, code = "skill_management_error", details = {}) {
    super(message);
    this.name = "SkillManagementError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isSkillManagementError(value) {
  return value instanceof SkillManagementError;
}

function getScriptOutputLimit() {
  const fromEnv = Number.parseInt(process.env.SKILL_SCRIPT_MAX_BUFFER_BYTES || "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 16_384) {
    return fromEnv;
  }
  return SCRIPT_MAX_BUFFER;
}

function getScriptTimeoutMs() {
  const fromEnv = Number.parseInt(process.env.SKILL_SCRIPT_TIMEOUT_MS || "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 1000) {
    return fromEnv;
  }
  return SCRIPT_TIMEOUT_MS;
}

function getSkillsLibraryDir() {
  const cfg = loadSkillsConfig();
  return path.join(projectRoot, cfg.skillsLibraryDir || SKILL_LIBRARY_DEFAULT);
}

function getSkillFileName() {
  const cfg = loadSkillsConfig();
  return cfg.skillFileName || SKILL_FILE_DEFAULT_NAME;
}

function getCodexHome() {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

function getScriptPath(kind, scriptFileName) {
  const base = getCodexHome();
  const map = {
    installer: path.join(base, "skills", ".system", "skill-installer", "scripts", scriptFileName),
    creator: path.join(base, "skills", ".system", "skill-creator", "scripts", scriptFileName),
  };
  const scriptPath = map[kind];
  if (!scriptPath) {
    throw new SkillManagementError(`Unknown script kind: ${kind}`, 500, "invalid_script_kind");
  }
  if (!fs.existsSync(scriptPath)) {
    throw new SkillManagementError(`Missing script: ${scriptPath}`, 500, "missing_script");
  }
  return scriptPath;
}

function getOptionalScriptPath(kind, scriptFileName) {
  try {
    return getScriptPath(kind, scriptFileName);
  } catch {
    return null;
  }
}

function isPathInsideDirectory(candidatePath, directoryPath) {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedDirectory = path.resolve(directoryPath);
  return (
    resolvedCandidate === resolvedDirectory ||
    resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`)
  );
}

function normalizeLegacySkillId(rawValue) {
  if (typeof rawValue !== "string") return null;
  const normalized = rawValue
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]/g, SKILL_ID_REPLACEMENT)
    .replace(/-{2,}/g, SKILL_ID_REPLACEMENT)
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return SKILL_ID_PATTERN.test(normalized) ? normalized : null;
}

function safeJsonParse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    throw new SkillManagementError("Failed to parse script output", 500, "invalid_script_output");
  }
}

function runPythonScript(scriptPath, args, options = {}) {
  const commandOpts = {
    encoding: "utf8",
    timeout: options.timeoutMs ?? getScriptTimeoutMs(),
    maxBuffer: options.maxBuffer ?? getScriptOutputLimit(),
  };

  let lastErr = null;
  for (const cmd of PYTHON_COMMANDS) {
    try {
      return execFileSync(cmd, [scriptPath, ...args], commandOpts);
    } catch (err) {
      if (err?.code === "ENOENT") {
        lastErr = err;
        continue;
      }
      const stdout = String(err?.stdout ?? "").trim();
      const stderr = String(err?.stderr ?? "").trim();
      const detail = [stdout, stderr].filter(Boolean).join(" ").trim() || err.message || "Python execution failed";
      throw new SkillManagementError(detail, 500, "script_failed", { command: cmd, scriptPath });
    }
  }

  const message = lastErr?.message || "No Python runtime found";
  throw new SkillManagementError(message, 500, "python_missing", { command: PYTHON_COMMANDS.join(",") });
}

function getAllowedGithubHosts() {
  const configured = (process.env.SKILL_ALLOWED_GITHUB_HOSTS || "").trim().toLowerCase();
  if (!configured) {
    return ALLOWED_GITHUB_HOSTS;
  }

  const hostList = configured
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return hostList.length > 0 ? new Set(hostList) : ALLOWED_GITHUB_HOSTS;
}

function ensureSafeRelativePath(inputPath) {
  if (typeof inputPath !== "string") {
    throw new SkillManagementError("path is required", 400, "missing_skill_path");
  }

  const normalized = inputPath
    .replace(/\\\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== ".")
    .join("/");

  if (!normalized || normalized.startsWith("/")) {
    throw new SkillManagementError("Invalid skill path", 400, "invalid_skill_path");
  }

  if (normalized.includes("..")) {
    throw new SkillManagementError("Invalid skill path", 400, "invalid_skill_path");
  }

  return normalized;
}

function normalizeSkillId(raw) {
  if (typeof raw !== "string") {
    throw new SkillManagementError("Skill id is required", 400, "missing_skill_id");
  }

  const normalized = raw
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  if (!SKILL_ID_PATTERN.test(normalized)) {
    throw new SkillManagementError(
      "Skill id must be lowercase slug (letters, digits, and single dashes)",
      400,
      "invalid_skill_id"
    );
  }

  return normalized;
}

function normalizeCatalogId(rawValue) {
  if (typeof rawValue === "string") {
    return normalizeLegacySkillId(rawValue);
  }
  if (rawValue && typeof rawValue === "object") {
    const candidate = typeof rawValue.id === "string"
      ? rawValue.id
      : typeof rawValue.name === "string"
        ? rawValue.name
        : typeof rawValue.slug === "string"
          ? rawValue.slug
          : null;
    if (candidate) {
      return normalizeLegacySkillId(candidate);
    }
  }
  return null;
}

function normalizeCategoryValue(category) {
  if (typeof category !== "string") return "";
  return category.trim();
}

function getAllowedCategories() {
  const cfg = loadSkillsConfig();
  const values = new Set([
    cfg.defaultCategory || "Development",
    "Development",
    "UI/UX",
    "DevOps",
    "Debug",
    "Prompt",
  ]);
  const mapped = Object.values(cfg.categories || {});
  for (const next of mapped) {
    if (typeof next === "string" && next.trim()) {
      values.add(next.trim());
    }
  }
  return Array.from(values);
}

function assertCategory(category) {
  const normalized = normalizeCategoryValue(category);
  const allowed = getAllowedCategories();
  if (!normalized) {
    throw new SkillManagementError("Category is required", 422, "invalid_category");
  }
  if (!allowed.includes(normalized)) {
    throw new SkillManagementError(
      `Invalid category '${normalized}'. Use one of: ${allowed.join(", ")}`,
      422,
      "invalid_category"
    );
  }
  return normalized;
}

function normalizeSource(source) {
  const candidate = typeof source === "string" ? source.toLowerCase().trim() : "find-skills";
  if (!candidate) return "find-skills";
  if (!["find-skills", "github"].includes(candidate)) {
    throw new SkillManagementError("Unknown install source", 400, "invalid_source");
  }
  return candidate;
}

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function readConfigJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return parsed;
  } catch (err) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  } catch (err) {
    throw new SkillManagementError(`Failed to write ${filePath}`, 500, "lock_write_failed");
  }
}

function parseLegacyLock(raw) {
  const entries = [];
  if (!raw || typeof raw !== "object") {
    return entries;
  }

  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      if (!item || typeof item !== "object") continue;
      const id = normalizeCatalogId(item.id) || normalizeCatalogId(item.name);
      if (!id) continue;
      entries.push({
        id,
        name: item.name || id,
        path: item.path || path.join(getSkillsLibraryDir(), id),
        source: item.source || item.sourceType || "local",
        sourceType: item.sourceType || item.source || "local",
        sourceUrl: item.sourceUrl,
        repoUrl: item.repoUrl,
        sourceRef: item.sourceRef || item.ref || item.computedHash,
        version: item.version || item.ref || item.computedHash,
        installedAt: item.installedAt || item.createdAt || new Date().toISOString(),
        createdAt: item.createdAt || item.installedAt || new Date().toISOString(),
        category: item.category || undefined,
      });
    }
    return entries;
  }

  if (!raw.skills || typeof raw.skills !== "object") {
    return entries;
  }

  for (const [id, entry] of Object.entries(raw.skills)) {
    if (!id || !entry || typeof entry !== "object") continue;
    const normalized = normalizeCatalogId(id);
    if (!normalized) continue;
    entries.push({
      id: normalized,
      name: normalized,
      path: path.join(getSkillsLibraryDir(), normalized),
      source: entry.sourceType || entry.source || "github",
      sourceType: entry.sourceType || entry.source || "github",
      sourceUrl: `https://github.com/${entry.source || "github"}/${normalized}`,
      sourceRef: entry.computedHash,
      version: entry.computedHash,
      installedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      category: undefined,
    });
  }

  return entries;
}

function loadLockFile() {
  const raw = readConfigJson(SKILLS_LOCK_FILE, null);
  const entries = raw ? parseLegacyLock(raw) : [];

  const normalized = {
    ...LOCK_DEFAULT,
    ...(raw && typeof raw === "object" ? { ...raw } : {}),
    lockVersion: SKILLS_LOCK_VERSION,
    entries,
  };

  if (!Array.isArray(normalized.entries)) {
    normalized.entries = [];
  }

  return normalized;
}

function persistLockFile(lockData) {
  const normalized = {
    ...LOCK_DEFAULT,
    lockVersion: SKILLS_LOCK_VERSION,
    ...lockData,
    entries: lockData.entries,
  };
  writeJsonFile(SKILLS_LOCK_FILE, normalized);
  return normalized;
}

function upsertLockEntry({
  id,
  name,
  source,
  sourceType,
  sourceUrl,
  repoUrl,
  sourceRef,
  version,
  category,
}) {
  const lock = loadLockFile();
  const now = new Date().toISOString();
  const installedDir = path.join(getSkillsLibraryDir(), id);

  const nextEntries = [...lock.entries].filter((entry) => entry && entry.id !== id);
  nextEntries.push({
    id,
    name,
    path: installedDir,
    source: source || sourceType || "local",
    sourceType: sourceType || source || "local",
    sourceUrl,
    repoUrl,
    sourceRef,
    version,
    installedAt: now,
    createdAt: now,
    category,
  });
  return persistLockFile({ ...lock, entries: nextEntries });
}

function lockEntriesById() {
  const lock = loadLockFile();
  const map = new Map();
  for (const entry of lock.entries || []) {
    if (!entry?.id) continue;
    map.set(entry.id, {
      source: entry.source,
      sourceType: entry.sourceType,
      sourceUrl: entry.sourceUrl,
      repoUrl: entry.repoUrl,
      sourceRef: entry.sourceRef,
      version: entry.version,
      installedAt: entry.installedAt,
      path: entry.path,
      category: entry.category,
    });
  }
  return map;
}

function parseSearchLimit(limit) {
  if (limit === undefined || limit === null) return DEFAULT_LIST_LIMIT;
  const parsed = Number.parseInt(String(limit), 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIST_LIMIT;
  return Math.min(MAX_LIST_LIMIT, parsed);
}

function extractGithubUrlParts(repoUrl) {
  if (typeof repoUrl !== "string") {
    throw new SkillManagementError("repoUrl is required for github install", 400, "missing_repo_url");
  }

  let url;
  try {
    url = new URL(repoUrl);
  } catch (err) {
    throw new SkillManagementError("Invalid repository URL", 400, "invalid_repo_url");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SkillManagementError("Only http/https repository URLs are supported", 400, "invalid_repo_url");
  }

  const hosts = getAllowedGithubHosts();
  if (!hosts.has(url.hostname.toLowerCase())) {
    throw new SkillManagementError("Only github.com URLs are supported", 400, "unsupported_host");
  }

  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 2) {
    throw new SkillManagementError("Invalid github URL. Expected owner/repo", 400, "invalid_repo_url");
  }

  const [owner, repository] = segs;
  let ref = DEFAULT_CATALOG_REF;
  let subpath = "";

  if (segs.length > 2) {
    if (segs[2] === "tree" || segs[2] === "blob") {
      if (!segs[3]) {
        throw new SkillManagementError(
          "GitHub URL is missing ref path segment, expected /tree/<ref>/<path>",
          400,
          "invalid_repo_url"
        );
      }
      ref = segs[3];
      subpath = segs.slice(4).join("/");
    } else {
      subpath = segs.slice(2).join("/");
    }
  }

  const safeSubpath = subpath ? ensureSafeRelativePath(subpath) : "";

  return {
    repo: `${owner}/${repository}`,
    ref,
    path: safeSubpath,
    full: `${owner}/${repository}`,
    url: `https://github.com/${owner}/${repository}`,
  };
}

function resolveCatalogInstallPath(skillId) {
  return path.join(DEFAULT_CATALOG_PATH, skillId);
}

function parseInstallOutput(output, fallbackSkillId) {
  const pattern = /Installed\s+([^\s]+)\s+to\s+([^\n\r]+)/i;
  const lines = String(output).split(/[\r\n]+/);
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[2]) {
      const name = match[1] ? match[1].trim() : fallbackSkillId;
      if (name !== fallbackSkillId) {
        return path.join(path.dirname(match[2].trim()), name);
      }
      return match[2].trim();
    }
  }
  return path.join(getSkillsLibraryDir(), fallbackSkillId);
}

function getInstalledSkillMetadataById(skillId) {
  const map = getInstalledSkillMap();
  return map.get(skillId) || null;
}

function syncEnabledState(skillId, autoEnable) {
  if (!toBoolean(autoEnable, true)) {
    return {
      enabled: false,
      enabledIds: getEnabledIds(),
    };
  }

  const enabled = new Set(getEnabledIds());
  enabled.add(skillId);
  const enabledIds = Array.from(enabled);
  const saveResult = setEnabledIds(enabledIds);
  if (!saveResult.ok) {
    throw new SkillManagementError(saveResult.error || "Failed to persist enabled skills", 500, "enable_save_failed");
  }

  try {
    syncEnabledSkillsToWorkspace();
  } catch (err) {
    throw new SkillManagementError(
      "Failed to sync enabled skills",
      500,
      "enable_sync_failed",
      { cause: err?.message }
    );
  }

  return {
    enabled: true,
    enabledIds,
  };
}

function updateSkillCategoriesConfig(skillId, category) {
  const cfg = readConfigJson(SKILLS_CONFIG_PATH, null);
  if (!cfg || typeof cfg !== "object") return;
  if (!cfg.categories || typeof cfg.categories !== "object") {
    cfg.categories = {};
  }
  if (cfg.categories[skillId] !== category) {
    cfg.categories = {
      ...cfg.categories,
      [skillId]: category,
    };
    writeJsonFile(SKILLS_CONFIG_PATH, cfg);
  }
}

function getInstalledSkillMap() {
  const discovered = discoverSkills(getSkillsLibraryDir()).skills || [];
  const entries = lockEntriesById();
  const catalog = new Map();
  for (const skill of discovered) {
    const existing = entries.get(skill.id) || {};
    catalog.set(skill.id, {
      ...skill,
      ...(existing.source ? { source: existing.source, sourceType: existing.sourceType } : { source: "local", sourceType: "local" }),
      sourceUrl: existing.sourceUrl,
      repoUrl: existing.repoUrl,
      installedAt: existing.installedAt,
      path: existing.path || path.join(getSkillsLibraryDir(), skill.id),
      version: existing.version,
    });
  }
  return catalog;
}

function writeSkillFrontmatter(skillDir, nextName, nextDescription, additionalFrontmatter = {}) {
  const skillFile = path.join(skillDir, getSkillFileName());
  if (!fs.existsSync(skillFile)) {
    throw new SkillManagementError("SKILL.md missing after creation", 500, "skill_file_missing");
  }

  const raw = fs.readFileSync(skillFile, "utf8");
  if (!raw.startsWith("---\n")) return;
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return;

  const block = match[1].split("\n").filter(Boolean);
  const entries = new Map();
  for (const line of block) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    entries.set(key, value);
  }
  entries.set("name", JSON.stringify(nextName));
  entries.set("description", JSON.stringify(nextDescription));
  for (const [key, value] of Object.entries(additionalFrontmatter)) {
    if (typeof value !== "string" || !value.trim()) continue;
    entries.set(key, JSON.stringify(value.trim()));
  }

  const ordered = ["name", "description"];
  const seen = new Set();
  const outputLines = [];
  for (const key of ordered) {
    seen.add(key);
    const value = entries.get(key);
    if (!value) continue;
    outputLines.push(`${key}: ${value}`);
  }
  for (const [key, value] of entries) {
    if (seen.has(key)) continue;
    outputLines.push(`${key}: ${value}`);
  }

  const rebuilt = `---\n${outputLines.join("\n")}\n---\n${raw.substring(match[0].length)}`;
  fs.writeFileSync(skillFile, rebuilt, "utf8");
}

function removePath(targetPath) {
  if (!targetPath || !targetPath.startsWith(path.join(getSkillsLibraryDir(), path.sep))) {
    return;
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only
  }
}

function validateCreatePayload(payload) {
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!name) {
    throw new SkillManagementError("name is required", 400, "missing_name");
  }

  const id = normalizeSkillId(payload?.id);
  const category = assertCategory(payload?.category);
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";

  return {
    name,
    id,
    category,
    description,
    sourceUrl: typeof payload?.repoUrl === "string" && payload.repoUrl.trim() ? payload.repoUrl.trim() : undefined,
    author: typeof payload?.author === "string" ? payload.author.trim() : undefined,
    tags: Array.isArray(payload?.tags) ? payload.tags : [],
    autoEnable: toBoolean(payload?.autoEnable, true),
  };
}

export function getSkillSources() {
  const listScript = getOptionalScriptPath("installer", "list-skills.py");
  const hasFindSkills = Boolean(listScript);
  return [
    {
      source: "find-skills",
      label: "find-skills catalog",
      enabled: hasFindSkills,
      status: hasFindSkills ? "ok" : "disabled",
      health: hasFindSkills ? "ready" : "script-missing",
    },
    {
      source: "github",
      label: "github",
      enabled: true,
      status: "ok",
      health: "ready",
      note: "Direct GitHub URL install",
    },
  ];
}

export function enrichSkillsWithMetadata(skills) {
  const installedMap = lockEntriesById();
  return (Array.isArray(skills) ? skills : []).map((skill) => {
    const meta = installedMap.get(skill.id) || {};
    return {
      ...skill,
      source: meta.source,
      sourceUrl: meta.sourceUrl,
      repoUrl: meta.repoUrl,
      installedAt: meta.installedAt,
      path: meta.path,
      version: meta.version,
      isRemote: meta.sourceType ? meta.sourceType !== "local" : Boolean(meta.source && meta.source !== "local"),
      sourceRef: meta.sourceRef,
      category: skill.category,
    };
  });
}

export function searchSkillsCatalog(params = {}) {
  const source = normalizeSource(params.source);
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const q = typeof params.q === "string" ? params.q.trim() : query;
  const limit = parseSearchLimit(params.limit);

  if (source !== "find-skills") {
    throw new SkillManagementError("Unsupported search source", 400, "unsupported_search_source");
  }

  const listScript = getOptionalScriptPath("installer", "list-skills.py");
  if (!listScript) {
    throw new SkillManagementError("find-skills catalog search is unavailable", 500, "find_skills_unavailable");
  }
  const raw = runPythonScript(listScript, ["--repo", DEFAULT_CATALOG_REPO, "--path", DEFAULT_CATALOG_PATH, "--ref", DEFAULT_CATALOG_REF, "--format", "json"]);
  const payload = safeJsonParse(String(raw));
  if (!Array.isArray(payload)) {
    throw new SkillManagementError("Unexpected catalog output", 500, "invalid_catalog_output");
  }

  const discoveredMap = getInstalledSkillMap();
  const normalizedQuery = (q || query).toLowerCase();
  const out = payload
    .map((item) => {
      const itemName = typeof item?.name === "string" ? item.name.trim() : "";
      const id = normalizeCatalogId(item);
      if (!id) return null;
      const installed = discoveredMap.get(id);
      const description =
        typeof item?.description === "string" && item.description.trim()
          ? item.description
          : installed?.description || "";
      return {
        id,
        name: itemName || installed?.name || id,
        description: description || installed?.description || "",
        category: installed?.category,
        source: "find-skills",
        sourceUrl: `https://github.com/${DEFAULT_CATALOG_REPO}/tree/${DEFAULT_CATALOG_REF}/${DEFAULT_CATALOG_PATH}/${id}`,
        repoUrl: `https://github.com/${DEFAULT_CATALOG_REPO}/${DEFAULT_CATALOG_PATH}/${id}`,
        maintainer: typeof item?.maintainer === "string" ? item.maintainer : DEFAULT_CATALOG_REPO.split("/")[0],
        version: item?.version || "main",
        sourceRef: DEFAULT_CATALOG_REF,
        isRemote: true,
        installedAt: installed?.installedAt,
      };
    })
    .filter(Boolean)
    .filter((item) => {
      if (!normalizedQuery) return true;
      const haystack = `${item.id} ${item.name} ${item.description} ${item.maintainer || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, limit);

  return out;
}

export function installSkill(payload = {}) {
  const source = normalizeSource(payload.source);
  const autoEnable = toBoolean(payload.autoEnable, true);
  const skillsDir = getSkillsLibraryDir();

  if (source === "find-skills") {
    const skillId = normalizeSkillId(payload.skillId);
    const catalogScript = getScriptPath("installer", "install-skill-from-github.py");

    const skillPath = path.join(skillsDir, skillId);
    if (fs.existsSync(skillPath)) {
      throw new SkillManagementError(`Skill already exists: ${skillId}`, 409, "skill_exists");
    }

    const relPath = resolveCatalogInstallPath(skillId);
    const output = runPythonScript(catalogScript, ["--repo", DEFAULT_CATALOG_REPO, "--path", relPath, "--ref", DEFAULT_CATALOG_REF, "--dest", skillsDir, "--name", skillId]);
    const installedPath = parseInstallOutput(String(output), skillId);
    const resolvedPath = path.resolve(installedPath);
    if (!fs.existsSync(resolvedPath) || !isPathInsideDirectory(resolvedPath, skillsDir)) {
      throw new SkillManagementError("Installed path is invalid", 500, "invalid_install_path");
    }

    const lockData = upsertLockEntry({
      id: skillId,
      name: skillId,
      source: "find-skills",
      sourceType: "find-skills",
      sourceUrl: `https://github.com/${DEFAULT_CATALOG_REPO}/tree/${DEFAULT_CATALOG_REF}/${DEFAULT_CATALOG_PATH}/${skillId}`,
      repoUrl: `https://github.com/${DEFAULT_CATALOG_REPO}`,
      sourceRef: DEFAULT_CATALOG_REF,
      version: "latest",
      category: loadSkillsConfig().categories?.[skillId],
    });
    const syncState = syncEnabledState(skillId, autoEnable);
    return {
      id: skillId,
      status: "installed",
      path: resolvedPath,
      source: "find-skills",
      sourceRef: DEFAULT_CATALOG_REF,
      version: lockData?.entries?.find((entry) => entry.id === skillId)?.version,
      enabled: syncState.enabled,
      enabledIds: syncState.enabledIds,
      message: `Installed ${skillId}`,
      name: skillId,
      installedAt: new Date().toISOString(),
      pathCatalog: path.join(skillsDir, skillId),
      metadata: { path: resolvedPath },
    };
  }

  const repoUrl = typeof payload.repoUrl === "string" ? payload.repoUrl.trim() : "";
  if (!repoUrl) {
    throw new SkillManagementError("repoUrl is required for github installs", 400, "missing_repo_url");
  }

  const parsed = extractGithubUrlParts(repoUrl);
  const inputPath =
    typeof payload.path === "string" && payload.path.trim()
      ? payload.path.trim().replace(/^\/+/, "")
      : parsed.path.replace(/^\/+/, "");

  if (!inputPath) {
    throw new SkillManagementError("path is required for direct github install", 400, "missing_skill_path");
  }
  const safeInputPath = ensureSafeRelativePath(inputPath);

  if (path.isAbsolute(safeInputPath)) {
    throw new SkillManagementError("Invalid skill path", 400, "invalid_skill_path");
  }

  const installer = getScriptPath("installer", "install-skill-from-github.py");
  const skillId = normalizeSkillId(path.basename(safeInputPath));
  const targetPath = path.join(skillsDir, skillId);
  if (fs.existsSync(targetPath)) {
    throw new SkillManagementError(`Skill already exists: ${skillId}`, 409, "skill_exists");
  }

  const output = runPythonScript(installer, ["--url", repoUrl, "--path", safeInputPath, "--ref", parsed.ref, "--dest", skillsDir, "--name", skillId]);
  const installedPath = parseInstallOutput(String(output), skillId);
  const resolvedPath = path.resolve(installedPath);
  if (!fs.existsSync(resolvedPath) || !isPathInsideDirectory(resolvedPath, skillsDir)) {
    throw new SkillManagementError("Installation script did not create skill", 500, "missing_installed_path");
  }

  const lockData = upsertLockEntry({
    id: skillId,
    name: skillId,
    source: "github",
    sourceType: "github",
    sourceUrl: `https://github.com/${parsed.repo}/blob/${parsed.ref}/${inputPath}`,
    repoUrl: `https://github.com/${parsed.repo}`,
    sourceRef: parsed.ref,
    version: parsed.ref,
    category: loadSkillsConfig().categories?.[skillId],
  });

  const syncState = syncEnabledState(skillId, autoEnable);
  return {
    id: skillId,
    status: "installed",
    path: resolvedPath,
    source: "github",
    sourceRef: parsed.ref,
    version: lockData?.entries?.find((entry) => entry.id === skillId)?.version,
    enabled: syncState.enabled,
    enabledIds: syncState.enabledIds,
    message: `Installed ${skillId}`,
    name: skillId,
    installedAt: new Date().toISOString(),
    metadata: { path: resolvedPath },
  };
}

export function getSkillMetadata(skillId) {
  const normalized = normalizeSkillId(skillId);
  return getInstalledSkillMetadataById(normalized);
}

export function createSkill(payload = {}) {
  const { name, id, category, description, sourceUrl, author, autoEnable } = validateCreatePayload(payload);

  const libraryDir = getSkillsLibraryDir();
  const targetDir = path.join(libraryDir, id);
  if (fs.existsSync(targetDir)) {
    throw new SkillManagementError(`Skill already exists: ${id}`, 409, "skill_exists");
  }

  const creator = getScriptPath("creator", "init_skill.py");
  const validator = getScriptPath("creator", "quick_validate.py");

  try {
    runPythonScript(creator, [id, "--path", libraryDir, "--resources", ""]);
    if (!fs.existsSync(targetDir)) {
      throw new SkillManagementError("Creation script did not create skill directory", 500, "create_failed");
    }

    const finalDescription = description || `Skill generated by ${name}.`;
    const sanitizedDescription = finalDescription.slice(0, 1024);
    writeSkillFrontmatter(targetDir, name, sanitizedDescription, {
      author,
      homepage: sourceUrl,
    });

    runPythonScript(validator, [targetDir]);

    const finalName = name || id;
    upsertLockEntry({
      id,
      name: finalName,
      source: "skill-creator",
      sourceType: "local",
      sourceUrl,
      repoUrl: undefined,
      sourceRef: "local",
      version: "local",
      category,
    });

    try {
      updateSkillCategoriesConfig(id, category);
    } catch {
      // category sync is non-fatal for skill creation
    }

    const syncState = syncEnabledState(id, autoEnable);

    return {
      id,
      status: "installed",
      path: targetDir,
      source: "skill-creator",
      sourceRef: "local",
      version: "local",
      enabled: syncState.enabled,
      enabledIds: syncState.enabledIds,
      message: `Created ${id}`,
      name: finalName,
      installedAt: new Date().toISOString(),
    };
  } catch (err) {
    removePath(targetDir);
    if (err instanceof SkillManagementError) {
      throw err;
    }
    throw new SkillManagementError(err?.message || "Failed to create skill", 500, "create_failed", { cause: err?.message });
  }
}

export function refreshEnabledSkillsFolder() {
  return syncEnabledSkillsToWorkspace();
}
