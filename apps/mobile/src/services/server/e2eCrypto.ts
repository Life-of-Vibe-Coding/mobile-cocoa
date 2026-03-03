/**
 * Application-layer end-to-end encryption for the mobile client.
 *
 * Mirrors server/utils/e2eCrypto.js — uses AES-256-GCM with a PSK
 * derived via HKDF from a passphrase configured at app startup.
 *
 * React Native doesn't ship Node.js `crypto`, so we use the Web Crypto API
 * (available in Hermes/JSC via `globalThis.crypto`) with base64 encoding
 * via a small helper (no native dependency needed).
 *
 * Wire format (same as server):
 *   base64( IV[12] || ciphertext || authTag[16] )
 */

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits
const HKDF_SALT = new TextEncoder().encode("mobile-cocoa-e2e-salt-v1");
const HKDF_INFO = new TextEncoder().encode("mobile-cocoa-e2e-aes256gcm");

// ── State ──────────────────────────────────────────────────────────────
let _cryptoKey: CryptoKey | null = null;
let _enabled = false;

// ── Base64 helpers (no atob/btoa on some RN runtimes) ──────────────────
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8ToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    result += BASE64_CHARS[(a >> 2) & 0x3f];
    result += BASE64_CHARS[((a << 4) | (b >> 4)) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[((b << 2) | (c >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? BASE64_CHARS[c & 0x3f] : "=";
  }
  return result;
}

function base64ToUint8(base64: string): Uint8Array {
  const cleaned = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const rawLen = (cleaned.length * 3) / 4;
  const padLen = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array(rawLen - padLen);

  let offset = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = BASE64_CHARS.indexOf(cleaned[i]);
    const b = BASE64_CHARS.indexOf(cleaned[i + 1]);
    const c = BASE64_CHARS.indexOf(cleaned[i + 2]);
    const d = BASE64_CHARS.indexOf(cleaned[i + 3]);
    if (offset < bytes.length) bytes[offset++] = (a << 2) | (b >> 4);
    if (offset < bytes.length) bytes[offset++] = ((b << 4) & 0xf0) | (c >> 2);
    if (offset < bytes.length) bytes[offset++] = ((c << 6) & 0xc0) | d;
  }
  return bytes;
}

// ── Initialization ─────────────────────────────────────────────────────

/**
 * Initialize E2E encryption with a passphrase.
 * Must be called once at app startup (e.g. from the server config screen).
 * The passphrase must match the one in the server's config/e2e.json.
 */
export async function initE2eCrypto(passphrase: string): Promise<void> {
  if (!passphrase?.trim()) {
    _enabled = false;
    _cryptoKey = null;
    return;
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "HKDF",
    false,
    ["deriveKey"],
  );

  _cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: HKDF_INFO,
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH * 8 },
    false,
    ["encrypt", "decrypt"],
  );

  _enabled = true;
  console.log("[e2e] Mobile encryption initialized (AES-256-GCM).");
}

/**
 * Disable E2E encryption (passthrough mode).
 */
export function disableE2eCrypto(): void {
  _enabled = false;
  _cryptoKey = null;
}

/**
 * Check if E2E encryption is active.
 */
export function isE2eEnabled(): boolean {
  return _enabled && _cryptoKey !== null;
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────

/**
 * Encrypt plaintext → base64 wire format.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!_cryptoKey) throw new Error("E2E not initialized");

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  // Web Crypto returns ciphertext + authTag concatenated
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    _cryptoKey,
    encoded,
  );

  // Wire format: IV || (ciphertext + authTag) → base64
  const payload = new Uint8Array(IV_LENGTH + ciphertextWithTag.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertextWithTag), IV_LENGTH);

  return uint8ToBase64(payload);
}

/**
 * Decrypt base64 wire format → plaintext.
 */
export async function decrypt(base64Ciphertext: string): Promise<string> {
  if (!_cryptoKey) throw new Error("E2E not initialized");

  const payload = base64ToUint8(base64Ciphertext);
  if (payload.length < IV_LENGTH + 16) {
    throw new Error("E2E payload too short");
  }

  const iv = payload.slice(0, IV_LENGTH);
  const ciphertextWithTag = payload.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    _cryptoKey,
    ciphertextWithTag,
  );

  return new TextDecoder().decode(decrypted);
}

// ── JSON helpers (matching server API) ─────────────────────────────────

/**
 * Encrypt a JSON body for sending to the server.
 * Returns { encrypted: "<base64>" } wrapper, or the original body if E2E is off.
 */
export async function encryptJson<T>(body: T): Promise<T | { encrypted: string }> {
  if (!isE2eEnabled()) return body;
  const plaintext = JSON.stringify(body);
  const ciphertext = await encrypt(plaintext);
  return { encrypted: ciphertext };
}

/**
 * Decrypt a { encrypted: "<base64>" } response body from the server.
 * Returns the parsed object, or the body as-is if not encrypted.
 */
export async function decryptJson<T = unknown>(body: unknown): Promise<T> {
  if (
    body &&
    typeof body === "object" &&
    "encrypted" in body &&
    typeof (body as { encrypted: string }).encrypted === "string"
  ) {
    const plaintext = await decrypt((body as { encrypted: string }).encrypted);
    return JSON.parse(plaintext) as T;
  }
  return body as T;
}

/**
 * Decrypt a WebSocket frame if it's encrypted.
 * Server sends either plain JSON or { encrypted: "<base64>" } JSON.
 */
export async function decryptWsFrame(rawData: string): Promise<string> {
  try {
    const parsed = JSON.parse(rawData);
    if (parsed && typeof parsed.encrypted === "string") {
      return await decrypt(parsed.encrypted);
    }
  } catch {
    // Not JSON or not encrypted — return as-is
  }
  return rawData;
}
