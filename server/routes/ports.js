/**
 * Port forwarding routes — manage the exposed-port whitelist for the Cloudflare tunnel proxy.
 */
import { getExposedPorts, addPort, removePort } from "../portRegistry.js";

export function registerPortRoutes(app) {
  app.get("/api/ports", (_req, res) => {
    res.json({ exposedPorts: getExposedPorts() });
  });

  app.post("/api/ports", (req, res) => {
    const { port, label } = req.body ?? {};
    const parsed = typeof port === "string" ? parseInt(port, 10) : port;
    if (!Number.isInteger(parsed)) {
      return res.status(400).json({ error: "port is required and must be an integer" });
    }
    const result = addPort(parsed, label);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, exposedPorts: getExposedPorts() });
  });

  app.delete("/api/ports/:port", (req, res) => {
    const result = removePort(req.params.port);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, exposedPorts: getExposedPorts() });
  });

  app.post("/api/ports/apply", (_req, res) => {
    // The proxy watches config/ports.json via fs.watch and hot-reloads automatically.
    // This endpoint confirms the save and returns the current state.
    res.json({ ok: true, applied: true, exposedPorts: getExposedPorts() });
  });
}
