/**
 * Port registry — manages the whitelist of exposed ports for the Cloudflare tunnel proxy.
 *
 * Persists to config/ports.json. The proxy watches this file to hot-reload
 * the allowed port set without a full process restart.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const PORTS_CONFIG_PATH = path.join(projectRoot, "config", "ports.json");

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function isValidPort(port) {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

function readConfig() {
  try {
    const raw = fs.readFileSync(PORTS_CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw);
    if (!cfg || !Array.isArray(cfg.exposedPorts)) {
      return { exposedPorts: [] };
    }
    return cfg;
  } catch {
    return { exposedPorts: [] };
  }
}

function writeConfig(cfg) {
  const dir = path.dirname(PORTS_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PORTS_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function getExposedPorts() {
  return readConfig().exposedPorts;
}

export function addPort(port, label) {
  if (!isValidPort(port)) {
    return { ok: false, error: `Invalid port: ${port} (must be ${MIN_PORT}-${MAX_PORT})` };
  }
  const cfg = readConfig();
  const exists = cfg.exposedPorts.some((e) => e.port === port);
  if (exists) {
    return { ok: false, error: `Port ${port} is already exposed` };
  }
  cfg.exposedPorts.push({ port, label: label || `Port ${port}` });
  writeConfig(cfg);
  return { ok: true };
}

export function removePort(port) {
  const parsed = typeof port === "string" ? parseInt(port, 10) : port;
  const cfg = readConfig();
  const entry = cfg.exposedPorts.find((e) => e.port === parsed);
  if (!entry) {
    return { ok: false, error: `Port ${parsed} is not in the exposed list` };
  }
  if (entry.builtin) {
    return { ok: false, error: `Cannot remove built-in port ${parsed}` };
  }
  cfg.exposedPorts = cfg.exposedPorts.filter((e) => e.port !== parsed);
  writeConfig(cfg);
  return { ok: true };
}

export function isPortExposed(port) {
  const cfg = readConfig();
  return cfg.exposedPorts.some((e) => e.port === port);
}

export function getPortsConfigPath() {
  return PORTS_CONFIG_PATH;
}
