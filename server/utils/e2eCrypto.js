/**
 * Application-layer end-to-end encryption for Cloudflare tunnel.
 *
 * Uses AES-256-GCM with a pre-shared key (PSK).
 * - Each message gets a random 12-byte IV (prepended to ciphertext).
 * - The auth tag (16 bytes) is appended after the ciphertext.
 * - Wire format: base64( IV || ciphertext || authTag )
 *
 * The PSK is derived via HKDF from a passphrase stored in config/e2e.json.
 * If config/e2e.json doesn't exist, encryption is disabled (passthrough).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const E2E_CONFIG_PATH = path.join(projectRoot, "config", "e2e.json");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HKDF_SALT = Buffer.from("mobile-cocoa-e2e-salt-v1", "utf8");
const HKDF_INFO = Buffer.from("mobile-cocoa-e2e-aes256gcm", "utf8");

let _derivedKey = null;
let _enabled = null;

/**
 * Load the E2E config and derive the AES key from the passphrase.
 * Returns null if E2E is not configured (passthrough mode).
 */
function getDerivedKey() {
    if (_enabled === false) return null;
    if (_derivedKey) return _derivedKey;

    try {
        if (!fs.existsSync(E2E_CONFIG_PATH)) {
            _enabled = false;
            return null;
        }

        const cfg = JSON.parse(fs.readFileSync(E2E_CONFIG_PATH, "utf8"));
        const passphrase = cfg?.passphrase;
        if (typeof passphrase !== "string" || !passphrase.trim()) {
            console.warn("[e2e] config/e2e.json exists but passphrase is empty — encryption disabled.");
            _enabled = false;
            return null;
        }

        // Derive a 256-bit key using HKDF-SHA256
        _derivedKey = crypto.hkdfSync("sha256", passphrase, HKDF_SALT, HKDF_INFO, 32);
        _enabled = true;
        console.log("[e2e] Application-layer encryption enabled (AES-256-GCM).");
        return _derivedKey;
    } catch (err) {
        console.warn("[e2e] Failed to load config/e2e.json:", err?.message);
        _enabled = false;
        return null;
    }
}

/**
 * Check if E2E encryption is configured and active.
 */
export function isE2eEnabled() {
    getDerivedKey();
    return _enabled === true;
}

/**
 * Encrypt a plaintext string → base64 ciphertext.
 * Returns null if encryption is disabled.
 */
export function encrypt(plaintext) {
    const key = getDerivedKey();
    if (!key) return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Wire format: IV || ciphertext || authTag → base64
    const payload = Buffer.concat([iv, encrypted, authTag]);
    return payload.toString("base64");
}

/**
 * Decrypt a base64 ciphertext → plaintext string.
 * Throws on tampered/invalid data.
 */
export function decrypt(base64Ciphertext) {
    const key = getDerivedKey();
    if (!key) throw new Error("E2E decryption called but no key configured");

    const payload = Buffer.from(base64Ciphertext, "base64");
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error("E2E payload too short");
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
}

/**
 * Encrypt a JSON-serialisable object for wire transport.
 * Returns { encrypted: "<base64>" } wrapper, or the original object if E2E is disabled.
 */
export function encryptJson(obj) {
    if (!isE2eEnabled()) return obj;
    const plaintext = JSON.stringify(obj);
    return { encrypted: encrypt(plaintext) };
}

/**
 * Decrypt an incoming { encrypted: "<base64>" } wrapper back to a parsed object.
 * If the body is not encrypted (no `encrypted` key), returns it as-is (passthrough).
 */
export function decryptJson(body) {
    if (!body || typeof body !== "object") return body;
    if (typeof body.encrypted !== "string") return body; // passthrough
    const plaintext = decrypt(body.encrypted);
    return JSON.parse(plaintext);
}

/**
 * Force re-read of config (useful after generating a new key).
 */
export function resetE2eConfig() {
    _derivedKey = null;
    _enabled = null;
}
