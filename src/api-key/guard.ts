import type { MiddlewareHandler } from "hono";
import { invalidApiKey, missingApiKey } from "../errors.js";
import type { AuthInfo } from "../types.js";
import type { ApiKeyGuardOptions } from "./types.js";

/**
 * Create an API key authentication guard middleware.
 *
 * @param options - Guard configuration.
 * @returns Hono middleware handler.
 *
 * @example
 * ```ts
 * app.use('/webhook/*', apiKeyGuard({
 *   headerName: 'X-API-Key',
 *   validate: async (key) => {
 *     const record = await env.API_KEYS_KV.get(key)
 *     return record ? JSON.parse(record).clientId : false
 *   },
 * }))
 * ```
 */
export function apiKeyGuard(options: ApiKeyGuardOptions): MiddlewareHandler {
	const headerName = options.headerName ?? "X-API-Key";

	return async (c, next) => {
		const instance = c.req.path;

		// --- Extract key ---
		const apiKey = c.req.header(headerName);
		if (!apiKey) {
			const err = missingApiKey(instance);
			await options.onFailure?.(err);
			throw err;
		}

		let subject: string;

		if (options.validate) {
			// --- Dynamic validation ---
			const result = await options.validate(apiKey);
			if (result === false) {
				const err = invalidApiKey(instance);
				await options.onFailure?.(err);
				throw err;
			}
			subject = result;
		} else if (options.keys) {
			// --- Static key list (timing-safe comparison) ---
			const found = await timingSafeFind(options.keys, apiKey);
			if (!found) {
				const err = invalidApiKey(instance);
				await options.onFailure?.(err);
				throw err;
			}
			subject = `api-key-user`;
		} else {
			// No keys and no validate — misconfiguration, reject all
			const err = invalidApiKey(instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Set auth info ---
		const authInfo: AuthInfo = {
			type: "api-key",
			subject,
			claims: {},
		};
		c.set("auth", authInfo);

		await options.onSuccess?.(subject);
		await next();
	};
}

/**
 * Timing-safe comparison to prevent timing attacks on API key matching.
 * Uses HMAC to produce fixed-length digests, eliminating length-based leaks.
 */
async function timingSafeFind(keys: string[], candidate: string): Promise<boolean> {
	let found = false;
	for (const key of keys) {
		if (await timingSafeEqual(key, candidate)) {
			found = true;
		}
	}
	return found;
}

/**
 * HMAC-based constant-time string comparison.
 * Both values are hashed to fixed-length digests, preventing length and content timing leaks.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.generateKey(
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const [macA, macB] = await Promise.all([
		crypto.subtle.sign("HMAC", key, encoder.encode(a)),
		crypto.subtle.sign("HMAC", key, encoder.encode(b)),
	]);
	const bytesA = new Uint8Array(macA);
	const bytesB = new Uint8Array(macB);
	let result = 0;
	for (let i = 0; i < bytesA.length; i++) {
		result |= bytesA[i]! ^ bytesB[i]!;
	}
	return result === 0;
}
