import { Hono } from "hono";
import type { Context } from "hono";
import type { AuthInfo } from "../types.js";
import type { MockAuthOptions } from "./types.js";

/**
 * Create a mock {@link AuthInfo} object for testing.
 *
 * @typeParam TClaims - Custom claims type.
 * @param options - Mock options.
 * @returns A populated `AuthInfo` object.
 */
export function createMockAuth<TClaims = Record<string, unknown>>(
	options?: MockAuthOptions<TClaims>,
): AuthInfo<TClaims> {
	return {
		type: options?.type ?? "jwt",
		subject: options?.subject ?? "test-subject",
		claims: options?.claims ?? ({} as TClaims),
	};
}

/**
 * Create a mock Hono {@link Context} with authentication info pre-set.
 *
 * Uses a real Hono app internally so the returned context behaves
 * identically to production.
 *
 * @typeParam TClaims - Custom claims type.
 * @param options - Mock auth options.
 * @returns A promise that resolves to a Hono `Context` with `c.get('auth')` returning the mock auth.
 */
export async function createMockContext<TClaims = Record<string, unknown>>(
	options?: MockAuthOptions<TClaims>,
): Promise<Context> {
	const authInfo = createMockAuth(options);

	let capturedCtx: Context | undefined;
	const testApp = new Hono();
	testApp.use("*", async (c, next) => {
		c.set("auth", authInfo as AuthInfo);
		capturedCtx = c;
		await next();
	});
	testApp.get("*", (c) => c.text("ok"));

	const req = new Request("http://localhost/test");
	await testApp.fetch(req);

	if (!capturedCtx) {
		throw new Error("Failed to create mock context");
	}
	return capturedCtx;
}

/**
 * Generate a test JWT token string (HS256).
 *
 * Uses Web Crypto API for HMAC-SHA256 signing.
 * Intended for test environments only.
 *
 * @param payload - JWT payload claims.
 * @param secret - HMAC secret string.
 * @param options - Additional options.
 * @returns Signed JWT string.
 */
export async function createTestToken(
	payload: Record<string, unknown>,
	secret: string,
	options?: { expiresIn?: number },
): Promise<string> {
	const header = { alg: "HS256", typ: "JWT" };

	const now = Math.floor(Date.now() / 1000);
	const fullPayload = {
		iat: now,
		...payload,
		...(options?.expiresIn != null ? { exp: now + options.expiresIn } : {}),
	};

	const encoder = new TextEncoder();
	const headerB64 = base64UrlEncode(JSON.stringify(header));
	const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
	const signingInput = `${headerB64}.${payloadB64}`;

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));

	const signatureB64 = base64UrlEncodeBuffer(signature);
	return `${signingInput}.${signatureB64}`;
}

function base64UrlEncode(str: string): string {
	const encoder = new TextEncoder();
	return base64UrlEncodeBuffer(encoder.encode(str).buffer);
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer | ArrayBufferLike): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
