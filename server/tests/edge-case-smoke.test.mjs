import assert from "node:assert/strict";
import { createServer } from "node:http";
import { rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import express from "express";

import { resolveWithinRoot, normalizeRelativePath } from "../utils/pathHelpers.js";
import { registerWorkspaceRoutes } from "../routes/workspace.js";
import { getPiProviderForModel } from "../process/piRpcSession.js";
import { loadPiConfig } from "../config/index.js";

test("path helper rejects traversal and permits safe relative paths", () => {
  const root = mkdtempSync(path.join(tmpdir(), "vibe-smoke-root-"));
  const safeFile = path.join(root, "safe.txt");
  const unsafeCandidate = path.join(root, "unsafe.txt");

  writeFileSync(safeFile, "ok");
  writeFileSync(unsafeCandidate, "x");

  const ok = resolveWithinRoot(root, "safe.txt");
  assert.equal(ok.ok, true);
  assert.equal(ok.fullPath, safeFile);

  const escape = resolveWithinRoot(root, "../safe.txt");
  assert.equal(escape.ok, false);
  assert.match(escape.error ?? "", /Path traversal/i);

  assert.throws(() => normalizeRelativePath("a/../b"), /Path traversal/i);

  rmSync(root, { recursive: true, force: true });
});

test("workspace-file endpoint blocks traversal input", async () => {
  const testRoot = mkdtempSync(path.join(homedir(), "vibe-smoke-ws-"));
  const testFile = path.join(testRoot, "workspace-file.txt");
  writeFileSync(testFile, "hello");

  const app = express();
  registerWorkspaceRoutes(app);
  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, resolve));

  try {
    const { port } = httpServer.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const blocked = await fetch(`${baseUrl}/api/workspace-file?path=${encodeURIComponent("../" + path.basename(testFile))}&root=${encodeURIComponent(testRoot)}`);
    assert.equal(blocked.status, 403);

    const allowed = await fetch(`${baseUrl}/api/workspace-file?path=${encodeURIComponent("workspace-file.txt")}&root=${encodeURIComponent(testRoot)}`);
    assert.equal(allowed.status, 200);

    const allowedPayload = await allowed.json();
    assert.equal(allowedPayload.path, "workspace-file.txt");
    assert.equal(allowedPayload.content, "hello");
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test("invalid pi regex in modelRouting does not crash routing", async () => {
  const original = loadPiConfig();
  const backup = JSON.parse(JSON.stringify(original));
  const piConfigPath = path.resolve(process.cwd(), "config/pi.json");

  try {
    const badConfig = {
      ...backup,
      providerRouting: {
        ...backup.providerRouting,
        rules: [
          {
            modelPattern: "([", // invalid regex
            provider: "should-not-hit",
          },
          ...(backup.providerRouting?.rules ?? []),
        ],
      },
    };

    writeFileSync(piConfigPath, JSON.stringify(badConfig, null, 2));
    const provider = getPiProviderForModel("codex", "gpt-5");
    assert.equal(provider, "openai");
  } finally {
    writeFileSync(piConfigPath, JSON.stringify(backup, null, 2));
  }
});
