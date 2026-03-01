import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import express from "express";

import { PORT, TUNNEL_PROXY_PORT, getWorkspaceCwd } from "../config/index.js";
import { formatSessionLogTimestamp } from "../process/index.js";
import { registerProcessesRoutes } from "../routes/processes.js";
import { createNewSessionFile, getSessionDir } from "../routes/sessionHelpers.js";
import { registerSessionsRoutes } from "../routes/sessions.js";
import { createSession, migrateSessionId, removeSession } from "../sessionRegistry.js";
import { getGitStatus, gitAdd } from "../utils/git.js";
import { isProtectedPid, killProcess, listProcessesOnPorts } from "../utils/processes.js";

async function withApp(registerRoutes, run) {
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("rekeyed session id can read messages and delete original session directory", async () => {
  const oldSessionId = randomUUID();
  const newSessionId = randomUUID();
  const cwd = getWorkspaceCwd();
  const filePath = createNewSessionFile(oldSessionId, cwd);
  const sessionDir = path.dirname(filePath);

  appendFileSync(
    filePath,
    `${JSON.stringify({
      type: "message",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello rekey" }],
      },
    })}\n`,
    "utf8",
  );

  try {
    createSession(oldSessionId, "codex", "gpt-5", {
      existingSessionPath: filePath,
      sessionLogTimestamp: formatSessionLogTimestamp(),
    });
    migrateSessionId(oldSessionId, newSessionId);

    await withApp(registerSessionsRoutes, async (baseUrl) => {
      const messagesRes = await fetch(`${baseUrl}/api/sessions/${newSessionId}/messages`);
      assert.equal(messagesRes.status, 200);
      const payload = await messagesRes.json();
      assert.ok(Array.isArray(payload.messages));
      assert.equal(payload.messages.length, 1);
      assert.equal(payload.messages[0].role, "user");
      assert.equal(payload.messages[0].content, "hello rekey");

      const deleteRes = await fetch(`${baseUrl}/api/sessions/${newSessionId}`, { method: "DELETE" });
      assert.equal(deleteRes.status, 200);
      assert.equal(existsSync(sessionDir), false);
    });
  } finally {
    removeSession(newSessionId);
    removeSession(oldSessionId);
    rmSync(getSessionDir(oldSessionId), { recursive: true, force: true });
    rmSync(getSessionDir(newSessionId), { recursive: true, force: true });
  }
});

test("input endpoint returns 409 when there is no pending interactive request", async () => {
  const sessionId = randomUUID();
  const cwd = getWorkspaceCwd();
  const filePath = createNewSessionFile(sessionId, cwd);

  try {
    createSession(sessionId, "codex", "gpt-5", {
      existingSessionPath: filePath,
      sessionLogTimestamp: formatSessionLogTimestamp(),
    });

    await withApp(registerSessionsRoutes, async (baseUrl) => {
      const inputRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "late input" }),
      });
      assert.equal(inputRes.status, 409);
      const payload = await inputRes.json();
      assert.equal(payload.ok, false);
      assert.match(payload.error ?? "", /pending input request/i);
    });
  } finally {
    removeSession(sessionId);
    rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test("destroy-workspace resolves symlinked cwd to canonical path", async () => {
  const realWorkspace = mkdtempSync(path.join(homedir(), "vibe-destroy-real-"));
  const symlinkWorkspace = `${realWorkspace}-link`;
  const sessionId = randomUUID();
  let filePath = null;

  try {
    symlinkSync(realWorkspace, symlinkWorkspace, "dir");
    filePath = createNewSessionFile(sessionId, symlinkWorkspace);

    await withApp(registerSessionsRoutes, async (baseUrl) => {
      const destroyRes = await fetch(`${baseUrl}/api/sessions/destroy-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: realWorkspace }),
      });
      assert.equal(destroyRes.status, 200);
      const payload = await destroyRes.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.deletedCount, 1);
      assert.equal(existsSync(path.dirname(filePath)), false);
    });
  } finally {
    rmSync(getSessionDir(sessionId), { recursive: true, force: true });
    rmSync(symlinkWorkspace, { force: true });
    rmSync(realWorkspace, { recursive: true, force: true });
  }
});

test("gitAdd stages dash-prefixed file names via explicit end-of-options separator", () => {
  const repoDir = mkdtempSync(path.join(tmpdir(), "vibe-git-add-"));
  const dashFile = "-notes.txt";
  try {
    const initResult = spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });
    assert.equal(initResult.status, 0);
    writeFileSync(path.join(repoDir, dashFile), "hello\n", "utf8");

    const result = gitAdd(repoDir, [dashFile]);
    assert.equal(result.success, true);

    const status = getGitStatus(repoDir);
    assert.ok(status.staged.some((entry) => entry.file === dashFile));
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

const COMMON_DEV_PORTS = new Set([3000, 3456, 4000, 5000, 5173, 8000, 8080, 3001, 4001]);
const protectedPortCandidates = [Number(PORT), Number(TUNNEL_PROXY_PORT)].filter(
  (value) => Number.isInteger(value) && value > 0,
);
const nonCommonProtectedPort = protectedPortCandidates.find((port) => !COMMON_DEV_PORTS.has(port)) ?? null;

test(
  "protected PID map includes non-common protected ports and blocks kill",
  { skip: nonCommonProtectedPort == null },
  () => {
    const mockPid = 42424;
    const mockBinDir = mkdtempSync(path.join(tmpdir(), "vibe-mock-bin-"));
    const lsofPath = path.join(mockBinDir, "lsof");
    const psPath = path.join(mockBinDir, "ps");
    const previousPath = process.env.PATH ?? "";

    try {
      writeFileSync(
        lsofPath,
        `#!/bin/sh
if [ "$1" = "-ti" ]; then
  if [ "$2" = ":${nonCommonProtectedPort}" ]; then
    echo "${mockPid}"
  fi
  exit 0
fi
exit 0
`,
        "utf8",
      );
      writeFileSync(
        psPath,
        `#!/bin/sh
echo "node protected-mock-process"
exit 0
`,
        "utf8",
      );
      chmodSync(lsofPath, 0o755);
      chmodSync(psPath, 0o755);
      process.env.PATH = `${mockBinDir}:${previousPath}`;

      const processes = listProcessesOnPorts(getWorkspaceCwd());
      const protectedProcess = processes.find(
        (entry) => entry.port === nonCommonProtectedPort && entry.pid === mockPid,
      );
      assert.ok(protectedProcess);
      assert.equal(protectedProcess.protected, true);
      assert.equal(isProtectedPid(mockPid), true);

      const killResult = killProcess(String(mockPid));
      assert.equal(killResult.ok, false);
      assert.match(killResult.error ?? "", /protected system process/i);
    } finally {
      process.env.PATH = previousPath;
      rmSync(mockBinDir, { recursive: true, force: true });
    }
  },
);

test("kill endpoint denies protected pid after refreshing protected process snapshot", async () => {
  const protectedPort = nonCommonProtectedPort ?? protectedPortCandidates[0];
  assert.ok(Number.isInteger(protectedPort) && protectedPort > 0);

  const mockPid = 43434;
  const mockBinDir = mkdtempSync(path.join(tmpdir(), "vibe-mock-proc-route-"));
  const lsofPath = path.join(mockBinDir, "lsof");
  const psPath = path.join(mockBinDir, "ps");
  const previousPath = process.env.PATH ?? "";

  try {
    writeFileSync(
      lsofPath,
      `#!/bin/sh
if [ "$1" = "-ti" ]; then
  if [ "$2" = ":${protectedPort}" ]; then
    echo "${mockPid}"
  fi
  exit 0
fi
exit 0
`,
      "utf8",
    );
    writeFileSync(
      psPath,
      `#!/bin/sh
echo "node protected-mock-process"
exit 0
`,
      "utf8",
    );
    chmodSync(lsofPath, 0o755);
    chmodSync(psPath, 0o755);
    process.env.PATH = `${mockBinDir}:${previousPath}`;

    await withApp(registerProcessesRoutes, async (baseUrl) => {
      const killRes = await fetch(`${baseUrl}/api/processes/${mockPid}/kill`, { method: "POST" });
      assert.equal(killRes.status, 403);
      const payload = await killRes.json();
      assert.match(payload.error ?? "", /protected system process/i);
    });
  } finally {
    process.env.PATH = previousPath;
    rmSync(mockBinDir, { recursive: true, force: true });
  }
});
