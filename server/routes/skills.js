/**
 * Skills discovery and management routes.
 */
import path from "path";
import { projectRoot, loadSkillsConfig } from "../config/index.js";
import {
  discoverSkills, getEnabledIds, getSkillChildren, getSkillContent, setEnabledIds, syncEnabledSkillsToWorkspace,
} from "../skills/index.js";
import {
  createSkill,
  enrichSkillsWithMetadata,
  getSkillSources,
  installSkill,
  isSkillManagementError,
  searchSkillsCatalog,
} from "../skills/management.js";

/** Resolve skills directory from config/skills.json. */
function getSkillsDir() {
  const skillsConfig = loadSkillsConfig();
  return path.join(projectRoot, skillsConfig.skillsLibraryDir);
}

function normalizeNumericLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return undefined;
}

function normalizeSearchSource(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "find-skills";
}

function traceId() {
  return Math.random().toString(36).slice(2, 10);
}

function handleSkillError(res, error) {
  const id = traceId();
  if (isSkillManagementError(error)) {
    const status = error.status ?? 500;
    return res.status(status).json({
      error: error.message,
      code: error.code,
      details: error.details,
      traceId: id,
    });
  }

  const status = Number.isInteger(error?.status) ? error.status : 500;
  console.error(`[skills] trace=${id} ${error?.message || error}`);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? "Failed to process skill request" : error?.message || "Skill request failed",
    traceId: id,
  });
}

function withMetadata(skill) {
  return enrichSkillsWithMetadata([skill])[0] ?? skill;
}

export function registerSkillsRoutes(app) {
  app.get("/api/skills", (_, res) => {
    try {
      const data = discoverSkills(getSkillsDir());
      const skills = enrichSkillsWithMetadata(data.skills || []);
      res.json({ ...data, skills });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to list skills" });
    }
  });

  app.get("/api/skills/search", (req, res) => {
    try {
      const query = typeof req.query?.q === "string" ? req.query.q : "";
      const source = normalizeSearchSource(req.query?.source);
      const limit = normalizeNumericLimit(req.query?.limit);
      const skills = searchSkillsCatalog({
        query,
        source,
        ...(typeof limit === "number" ? { limit } : {}),
      });
      res.json({ skills });
    } catch (error) {
      handleSkillError(res, error);
    }
  });

  app.get("/api/skills/sources", (_, res) => {
    try {
      res.json({ sources: getSkillSources() });
    } catch (error) {
      handleSkillError(res, error);
    }
  });

  app.get("/api/skills/:id/children", (req, res) => {
    const id = req.params?.id;
    const relPath = typeof req.query?.path === "string" ? req.query.path : "";
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid skill id" });
    }
    try {
      const data = getSkillChildren(id, relPath, getSkillsDir());
      if (!data) {
        return res.status(404).json({ error: "Path not found" });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load children" });
    }
  });

  app.get("/api/skills/:id", (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid skill id" });
    }
    try {
      const data = getSkillContent(id, getSkillsDir());
      if (!data) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(withMetadata(data));
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load skill" });
    }
  });

  app.get("/api/skills-enabled", (_, res) => {
    try {
      const enabledIds = getEnabledIds();
      res.json({ enabledIds });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to get enabled skills" });
    }
  });

  app.post("/api/skills-enabled", (req, res) => {
    try {
      const enabledIds = Array.isArray(req.body?.enabledIds) ? req.body.enabledIds : [];
      const result = setEnabledIds(enabledIds);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      syncEnabledSkillsToWorkspace();
      res.json({ enabledIds: getEnabledIds() });
    } catch (error) {
      handleSkillError(res, error);
    }
  });

  app.post("/api/skills/install", (req, res) => {
    try {
      const result = installSkill(req.body || {});
      res.json(result);
    } catch (error) {
      handleSkillError(res, error);
    }
  });

  app.post("/api/skills/create", (req, res) => {
    try {
      const result = createSkill(req.body || {});
      res.json(result);
    } catch (error) {
      handleSkillError(res, error);
    }
  });
}
