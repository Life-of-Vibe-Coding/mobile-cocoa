/**
 * Express middleware for transparent application-layer E2E encryption.
 *
 * When E2E is enabled (config/e2e.json has a passphrase):
 *
 *   Request flow:
 *     Client sends: { "encrypted": "<base64>" }
 *     Middleware decrypts → sets req.body = parsed plaintext object
 *     Route handler sees normal JSON body (unaware of encryption)
 *
 *   Response flow:
 *     Route handler calls res.json(data) as usual
 *     Middleware intercepts → encrypts → sends { "encrypted": "<base64>" }
 *
 * When E2E is disabled, the middleware is a no-op passthrough.
 *
 * Usage:
 *   import { e2eRequestDecrypt, e2eResponseEncrypt } from "./e2eMiddleware.js";
 *   app.use(e2eRequestDecrypt);   // before routes
 *   app.use(e2eResponseEncrypt);  // before routes (wraps res.json)
 */
import { isE2eEnabled, decryptJson, encryptJson } from "../utils/e2eCrypto.js";

/**
 * Middleware: decrypt incoming encrypted request bodies.
 * Only applies to POST/PUT/PATCH with JSON bodies containing `encrypted` field.
 */
export function e2eRequestDecrypt(req, res, next) {
    if (!isE2eEnabled()) return next();

    // Only process JSON bodies with the encrypted wrapper
    if (
        req.body &&
        typeof req.body === "object" &&
        typeof req.body.encrypted === "string"
    ) {
        try {
            req.body = decryptJson(req.body);
            // Mark that this request was E2E-encrypted (so response middleware can encrypt the reply)
            req._e2eEncrypted = true;
        } catch (err) {
            console.error("[e2e] Request decryption failed:", err?.message);
            return res.status(400).json({ error: "E2E decryption failed", detail: err?.message });
        }
    }
    next();
}

/**
 * Middleware: encrypt outgoing JSON responses when the request was E2E-encrypted.
 * Wraps res.json() so route handlers don't need to know about encryption.
 */
export function e2eResponseEncrypt(req, res, next) {
    if (!isE2eEnabled()) return next();

    const originalJson = res.json.bind(res);

    res.json = function (data) {
        // Only encrypt if the inbound request was encrypted (symmetric trust)
        if (req._e2eEncrypted) {
            try {
                const encrypted = encryptJson(data);
                return originalJson(encrypted);
            } catch (err) {
                console.error("[e2e] Response encryption failed:", err?.message);
                return originalJson({ error: "E2E encryption failed" });
            }
        }
        return originalJson(data);
    };

    next();
}

/**
 * Combined middleware (convenience). Apply both request decrypt + response encrypt.
 * Usage: app.use(e2eMiddleware);
 */
export function e2eMiddleware(req, res, next) {
    e2eRequestDecrypt(req, res, (err) => {
        if (err) return next(err);
        e2eResponseEncrypt(req, res, next);
    });
}
