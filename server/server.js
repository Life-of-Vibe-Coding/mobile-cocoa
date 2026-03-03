/**
 * Main server entry point.
 * Refactored into modular architecture for better maintainability.
 */
import express from "express";
import { createServer } from "http";

import {
  DEFAULT_SERVER_HOST,
  ENABLE_DOCKER_MANAGER,
  PORT,
  SERVER_LISTEN_HOST,
  getWorkspaceCwd,
} from "./config/index.js";
import { shutdown } from "./process/index.js";
import { setupRoutes } from "./routes/index.js";
import { attachSessionWebSocket } from "./routes/sessionWsHandler.js";
import { getActiveOverlay, getPreviewHost } from "./utils/index.js";

const app = express();
app.use(express.json());
const httpServer = createServer(app);

// Setup Express routes
await setupRoutes(app);

// Attach WebSocket server for session streaming (used by Cloudflare tunnel clients)
attachSessionWebSocket(httpServer);

// Graceful shutdown: drain connections before exit
process.on("SIGINT", () => shutdown("SIGINT", httpServer));
process.on("SIGTERM", () => shutdown("SIGTERM", httpServer));
process.on("SIGHUP", () => shutdown("SIGHUP", httpServer));

// Crash handlers: log and exit rather than silently dying
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  shutdown("uncaughtException", httpServer);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

httpServer.listen(PORT, SERVER_LISTEN_HOST, () => {
  const overlay = getActiveOverlay();
  const previewHost = getPreviewHost();
  const hostForLog = process.env.HOST || DEFAULT_SERVER_HOST;
  const addressInfo = httpServer.address();
  const boundPort = (addressInfo && typeof addressInfo === "object" && "port" in addressInfo)
    ? addressInfo.port
    : PORT;
  const baseUrl = `http://${hostForLog}:${boundPort}`;

  console.log(`Terminal server at ${baseUrl}`);
  console.log(`Health check page: ${baseUrl}/health`);
  console.log(`Health check alias: ${baseUrl}/health-check`);
  console.log(`[Docker] ENABLE_DOCKER_MANAGER: ${ENABLE_DOCKER_MANAGER}`);
  console.log(`Overlay network: ${overlay}`);
  if (overlay === "tunnel") {
    console.log(`Tunnel preview host: ${previewHost}`);
    console.log(`Tunnel mode: traffic via dev proxy (e.g. Cloudflare Tunnel)`);
  } else {
    console.log(`Preview host: ${previewHost}`);
    console.log(`Listening on ${SERVER_LISTEN_HOST}`);
  }
  console.log(`Working directory: ${getWorkspaceCwd()}`);
});
