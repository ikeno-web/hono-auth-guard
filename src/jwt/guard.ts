import type { MiddlewareHandler } from "hono";
import {
	algorithmMismatch,
	audienceMismatch,
	claimValidationFailed,
	internalAuthError,
	invalidToken,
	issuerMismatch,
	missingToken,
	tokenExpired,
} from "../errors.js";
import type { AuthInfo } from "../types.js";
import type { JwtGuardOptions, JwtPayload } from "./types.js";

/**
 * Create a JWT verification guard middleware.
 *
 * @typeParam TClaims - Custom claims type for type-safe validation.
 * @param options - Guard configuration.
 * @returns Hono middleware handler.
 *
 * @example
 * ```ts
 * app.use('/api/*', jwtGuard({ secret: env.JWT_SECRET }))
 *
 * app.get('/api/me', (c) => {
 *   const auth = c.get('auth')
 *   return c.json({ userId: auth.subject })
 * })
 * ```
 */
export function jwtGuard<TClaims = Record<string, unknown>>(
	options: JwtGuardOptions<TClaims>,
): MiddlewareHandler {
	const algorithms = options.algorithms ?? ["HS256"];
	const headerPrefix = options.headerPrefix ?? "Bearer";
	const clockTolerance = options.clockTolerance ?? 0;
	let cachedHmacKey: CryptoKey | null = null;
	const getOrCacheHmacKey = async (secret: string): Promise<CryptoKey> => {
		if (!cachedHmacKey) {
			cachedHmacKey = await crypto.subtle.importKey(
				"raw",
				new TextEncoder().encode(secret),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["verify"],
			);
		}
		return cachedHmacKey;
	};

	return async (c, next) => {
		const instance = c.req.path;

		// --- Extract token ---
		let token: string | undefined;
		if (options.headerName) {
			token = c.req.header(options.headerName) ?? undefined;
		} else {
			const authHeader = c.req.header("Authorization");
			if (authHeader) {
				const prefix = `${headerPrefix} `;
				if (authHeader.startsWith(prefix)) {
					token = authHeader.slice(prefix.length);
				} else {
					const err = invalidToken("Invalid Authorization header format.", instance);
					await options.onFailure?.(err);
					throw err;
				}
			}
		}

		if (!token) {
			const err = missingToken(instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Parse JWT ---
		const parts = token.split(".");
		if (parts.length !== 3) {
			const err = invalidToken("Token must have three parts.", instance);
			await options.onFailure?.(err);
			throw err;
		}

		const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

		let header: { alg?: string; typ?: string };
		try {
			header = JSON.parse(base64UrlDecode(headerB64));
		} catch {
			const err = invalidToken("Invalid token header.", instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Security: reject alg:none ---
		if (!header.alg || header.alg.toLowerCase() === "none") {
			const err = algorithmMismatch(instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Algorithm check ---
		if (!algorithms.includes(header.alg as "HS256" | "RS256")) {
			const err = algorithmMismatch(instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Verify signature ---
		const signingInput = `${headerB64}.${payloadB64}`;
		const signatureBytes = base64UrlDecodeToBuffer(signatureB64);

		try {
			const valid = await verifySignature(
				header.alg as "HS256" | "RS256",
				options.secret,
				signingInput,
				signatureBytes,
				getOrCacheHmacKey,
			);
			if (!valid) {
				const err = invalidToken("Signature verification failed.", instance);
				await options.onFailure?.(err);
				throw err;
			}
		} catch (e) {
			if (e instanceof Error && e.name === "AuthError") {
				throw e;
			}
			const err = internalAuthError("Signature verification error.", instance);
			await options.onFailure?.(err);
			throw err;
		}

		// --- Parse payload ---
		let payload: JwtPayload;
		try {
			payload = JSON.parse(base64UrlDecode(payloadB64));
		} catch {
			const err = invalidToken("Invalid token payload.", instance);
			await options.onFailure?.(err);
			throw err;
		}

		const now = Math.floor(Date.now() / 1000);

		// --- exp check ---
		if (payload.exp !== undefined) {
			if (now > payload.exp + clockTolerance) {
				const expDate = new Date(payload.exp * 1000).toISOString();
				const err = tokenExpired(expDate, instance);
				await options.onFailure?.(err);
				throw err;
			}
		}

		// --- nbf check ---
		if (payload.nbf !== undefined) {
			if (now < payload.nbf - clockTolerance) {
				const err = invalidToken("Token is not yet valid.", instance);
				await options.onFailure?.(err);
				throw err;
			}
		}

		// --- iss check ---
		if (options.issuer !== undefined) {
			const allowed = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
			if (!payload.iss || !allowed.includes(payload.iss)) {
				const err = issuerMismatch(instance);
				await options.onFailure?.(err);
				throw err;
			}
		}

		// --- aud check ---
		if (options.audience !== undefined) {
			const allowed = Array.isArray(options.audience) ? options.audience : [options.audience];
			const tokenAud = Array.isArray(payload.aud)
				? payload.aud
				: payload.aud
					? [payload.aud]
					: [];
			const hasMatch = tokenAud.some((a) => allowed.includes(a));
			if (!hasMatch) {
				const err = audienceMismatch(instance);
				await options.onFailure?.(err);
				throw err;
			}
		}

		// --- Custom claims validation ---
		if (options.validateClaims) {
			const valid = await options.validateClaims(payload as unknown as TClaims);
			if (!valid) {
				const err = claimValidationFailed(instance);
				await options.onFailure?.(err);
				throw err;
			}
		}

		// --- Set auth info ---
		const authInfo: AuthInfo = {
			type: "jwt",
			subject: (payload.sub as string) ?? "",
			claims: payload as Record<string, unknown>,
		};
		c.set("auth", authInfo);

		await options.onSuccess?.(payload as unknown as TClaims);
		await next();
	};
}

// ─── Internal helpers ───────────────────────────────────────────

async function verifySignature(
	alg: "HS256" | "RS256",
	secret: string | CryptoKey,
	signingInput: string,
	signature: Uint8Array,
	getOrCacheHmacKey: (secret: string) => Promise<CryptoKey>,
): Promise<boolean> {
	const encoder = new TextEncoder();
	const data = encoder.encode(signingInput);

	if (alg === "HS256") {
		const key =
			typeof secret === "string"
				? await getOrCacheHmacKey(secret)
				: secret;

		return crypto.subtle.verify("HMAC", key, signature, data);
	}

	// RS256
	if (typeof secret === "string") {
		throw new Error("RS256 requires a CryptoKey, not a string secret.");
	}
	return crypto.subtle.verify(
		{ name: "RSASSA-PKCS1-v1_5" },
		secret,
		signature,
		data,
	);
}

function base64UrlDecode(str: string): string {
	const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	// Decode UTF-8 from binary string
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

function base64UrlDecodeToBuffer(str: string): Uint8Array {
	const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
