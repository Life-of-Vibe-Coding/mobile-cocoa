#!/usr/bin/env node
/**
 * Generate (or regenerate) the E2E encryption passphrase.
 *
 * Usage:
 *   node server/scripts/generate-e2e-key.mjs
 *   node server/scripts/generate-e2e-key.mjs --print-only
 *
 * Creates config/e2e.json with a random 64-character passphrase.
 * The same passphrase must be configured on the mobile app at connect time.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const configPath = path.join(projectRoot, "config", "e2e.json");
const printOnly = process.argv.includes("--print-only");

const passphrase = crypto.randomBytes(48).toString("base64url");

if (printOnly) {
    console.log(passphrase);
    process.exit(0);
}

const config = { passphrase };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log("✅ E2E encryption key generated.");
console.log(`   Config file: ${configPath}`);
console.log(`   Passphrase:  ${passphrase}`);
console.log("");
console.log("📱 Enter this passphrase in the mobile app's E2E settings to enable encryption.");
console.log("🔒 Restart the server for changes to take effect.");
