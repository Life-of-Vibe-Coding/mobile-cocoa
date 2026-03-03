/**
 * E2E-aware fetch wrapper.
 *
 * Drop-in replacement for `fetch()` used by chat actions and other API calls.
 * When E2E encryption is active, the request body is encrypted and the
 * response body is decrypted transparently — the calling code sees
 * plain JSON in both directions.
 *
 * Usage:
 *   import { e2eFetch } from "@/services/server/e2eFetch";
 *   const res = await e2eFetch(url, { method: "POST", body: JSON.stringify(payload) });
 *   const data = await res.json(); // already decrypted
 */
import { isE2eEnabled, encrypt, decryptJson } from "./e2eCrypto";

/**
 * Encrypt the body of a fetch request if E2E is enabled.
 */
async function encryptRequestInit(
  init?: RequestInit,
): Promise<RequestInit | undefined> {
  if (!init || !isE2eEnabled()) return init;

  // Only encrypt JSON bodies
  const contentType =
    init.headers instanceof Headers
      ? init.headers.get("content-type")
      : typeof init.headers === "object" && init.headers !== null
        ? (init.headers as Record<string, string>)["Content-Type"] ??
          (init.headers as Record<string, string>)["content-type"]
        : undefined;

  if (
    typeof init.body === "string" &&
    contentType?.includes("application/json")
  ) {
    const ciphertext = await encrypt(init.body);
    return {
      ...init,
      body: JSON.stringify({ encrypted: ciphertext }),
    };
  }

  return init;
}

/**
 * Wraps the native Response to transparently decrypt JSON bodies.
 */
function wrapResponse(original: Response): Response {
  if (!isE2eEnabled()) return original;

  // Create a proxy that intercepts .json()
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (prop === "json") {
        return async () => {
          const raw = await target.json();
          return decryptJson(raw);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * E2E-aware fetch. Encrypts request body and decrypts response body when
 * E2E encryption is active. Otherwise, behaves exactly like native fetch.
 */
export async function e2eFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const encryptedInit = await encryptRequestInit(init);
  const response = await fetch(input, encryptedInit);
  return wrapResponse(response);
}
