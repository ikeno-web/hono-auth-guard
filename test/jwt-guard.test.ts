import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/errors.js";
import { jwtGuard } from "../src/jwt/guard.js";
import { createTestToken } from "../src/testing/helpers.js";

const SECRET = "test-secret-key-for-testing";

function createApp(options: Parameters<typeof jwtGuard>[0]) {
	const app = new Hono();
	app.use("/*", jwtGuard(options));
	app.get("/*", (c) => {
		const auth = c.get("auth");
		return c.json({ subject: auth.subject, claims: auth.claims });
	});
	app.onError((err, c) => {
		if (err instanceof AuthError) {
			return err.toResponse();
		}
		return c.text("Internal Server Error", 500);
	});
	return app;
}

describe("jwtGuard", () => {
	describe("valid tokens", () => {
		it("accepts a valid HS256 token", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken({ sub: "user-123" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("user-123");
		});

		it("accepts a valid token with custom claims", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken(
				{ sub: "user-456", role: "admin", org: "acme" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.claims.role).toBe("admin");
			expect(body.claims.org).toBe("acme");
		});

		it("accepts a token with exp in the future", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken({ sub: "user-789" }, SECRET, {
				expiresIn: 3600,
			});
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("missing / malformed tokens", () => {
		it("rejects when no Authorization header", async () => {
			const app = createApp({ secret: SECRET });
			const res = await app.request("/test");
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("missing-token");
		});

		it("rejects when Authorization header has wrong prefix", async () => {
			const app = createApp({ secret: SECRET });
			const res = await app.request("/test", {
				headers: { Authorization: "Basic abc123" },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("invalid-token");
		});

		it("rejects a token with fewer than 3 parts", async () => {
			const app = createApp({ secret: SECRET });
			const res = await app.request("/test", {
				headers: { Authorization: "Bearer header.payload" },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("invalid-token");
		});

		it("rejects a token with invalid base64 header", async () => {
			const app = createApp({ secret: SECRET });
			const res = await app.request("/test", {
				headers: { Authorization: "Bearer !!!.payload.sig" },
			});
			expect(res.status).toBe(401);
		});
	});

	describe("alg:none rejection", () => {
		it("rejects alg:none tokens", async () => {
			const app = createApp({ secret: SECRET });
			// Manually craft an alg:none token
			const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const payload = btoa(JSON.stringify({ sub: "attacker" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const token = `${header}.${payload}.`;

			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("algorithm-mismatch");
		});

		it("rejects alg:NONE (case-insensitive)", async () => {
			const app = createApp({ secret: SECRET });
			const header = btoa(JSON.stringify({ alg: "NONE", typ: "JWT" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const payload = btoa(JSON.stringify({ sub: "attacker" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const token = `${header}.${payload}.fake`;

			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("algorithm-mismatch");
		});
	});

	describe("algorithm mismatch", () => {
		it("rejects when token alg does not match allowed algorithms", async () => {
			const app = createApp({ secret: SECRET, algorithms: ["RS256"] });
			// Create an HS256 token but the guard only allows RS256
			const token = await createTestToken({ sub: "user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("algorithm-mismatch");
		});
	});

	describe("expired tokens", () => {
		it("rejects an expired token", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken({ sub: "user" }, SECRET, {
				expiresIn: -100,
			});
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("token-expired");
		});

		it("accepts an expired token within clockTolerance", async () => {
			const app = createApp({ secret: SECRET, clockTolerance: 200 });
			const token = await createTestToken({ sub: "user" }, SECRET, {
				expiresIn: -50,
			});
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("nbf (not before) check", () => {
		it("rejects a token that is not yet valid", async () => {
			const app = createApp({ secret: SECRET });
			const futureNbf = Math.floor(Date.now() / 1000) + 3600;
			const token = await createTestToken(
				{ sub: "user", nbf: futureNbf },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.detail).toContain("not yet valid");
		});
	});

	describe("issuer validation", () => {
		it("rejects when issuer does not match", async () => {
			const app = createApp({ secret: SECRET, issuer: "https://auth.example.com" });
			const token = await createTestToken(
				{ sub: "user", iss: "https://evil.com" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("issuer-mismatch");
		});

		it("accepts when issuer matches", async () => {
			const app = createApp({ secret: SECRET, issuer: "https://auth.example.com" });
			const token = await createTestToken(
				{ sub: "user", iss: "https://auth.example.com" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});

		it("accepts when issuer matches one of multiple", async () => {
			const app = createApp({
				secret: SECRET,
				issuer: ["https://auth1.com", "https://auth2.com"],
			});
			const token = await createTestToken(
				{ sub: "user", iss: "https://auth2.com" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("audience validation", () => {
		it("rejects when audience does not match", async () => {
			const app = createApp({ secret: SECRET, audience: "my-api" });
			const token = await createTestToken(
				{ sub: "user", aud: "other-api" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("audience-mismatch");
		});

		it("accepts when audience matches", async () => {
			const app = createApp({ secret: SECRET, audience: "my-api" });
			const token = await createTestToken(
				{ sub: "user", aud: "my-api" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});

		it("accepts when one of token's audiences matches", async () => {
			const app = createApp({ secret: SECRET, audience: "api-2" });
			const token = await createTestToken(
				{ sub: "user", aud: ["api-1", "api-2"] },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("custom claims validation", () => {
		it("rejects when validateClaims returns false", async () => {
			const app = createApp({
				secret: SECRET,
				validateClaims: (claims: Record<string, unknown>) =>
					claims.role === "admin",
			});
			const token = await createTestToken(
				{ sub: "user", role: "viewer" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.type).toContain("claim-validation-failed");
		});

		it("accepts when validateClaims returns true", async () => {
			const app = createApp({
				secret: SECRET,
				validateClaims: (claims: Record<string, unknown>) =>
					claims.role === "admin",
			});
			const token = await createTestToken(
				{ sub: "user", role: "admin" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});

		it("supports async validateClaims", async () => {
			const app = createApp({
				secret: SECRET,
				validateClaims: async (claims: Record<string, unknown>) => {
					await new Promise((r) => setTimeout(r, 1));
					return claims.role === "admin";
				},
			});
			const token = await createTestToken(
				{ sub: "user", role: "admin" },
				SECRET,
			);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("invalid signature", () => {
		it("rejects a token signed with a different secret", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken({ sub: "user" }, "wrong-secret");
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("invalid-token");
		});
	});

	describe("custom header", () => {
		it("reads token from a custom header", async () => {
			const app = createApp({ secret: SECRET, headerName: "X-JWT-Token" });
			const token = await createTestToken({ sub: "user-custom" }, SECRET);
			const res = await app.request("/test", {
				headers: { "X-JWT-Token": token },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("user-custom");
		});
	});

	describe("RS256 verification", () => {
		it("verifies an RS256 token", async () => {
			// Generate RSA key pair for testing
			const keyPair = await crypto.subtle.generateKey(
				{
					name: "RSASSA-PKCS1-v1_5",
					modulusLength: 2048,
					publicExponent: new Uint8Array([1, 0, 1]),
					hash: "SHA-256",
				},
				true,
				["sign", "verify"],
			);

			// Create an RS256 token manually
			const header = { alg: "RS256", typ: "JWT" };
			const payload = {
				sub: "rs256-user",
				iat: Math.floor(Date.now() / 1000),
			};
			const headerB64 = b64url(JSON.stringify(header));
			const payloadB64 = b64url(JSON.stringify(payload));
			const signingInput = `${headerB64}.${payloadB64}`;

			const signature = await crypto.subtle.sign(
				"RSASSA-PKCS1-v1_5",
				keyPair.privateKey,
				new TextEncoder().encode(signingInput),
			);
			const sigB64 = b64urlBuf(signature);
			const token = `${signingInput}.${sigB64}`;

			const app = createApp({
				secret: keyPair.publicKey,
				algorithms: ["RS256"],
			});
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("rs256-user");
		});
	});

	describe("invalid payload", () => {
		it("rejects a token with invalid JSON payload", async () => {
			const app = createApp({ secret: SECRET });
			// Create a token with valid header and signature but garbage payload
			const headerB64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
			const payloadB64 = b64url("not-valid-json{{{");
			const signingInput = `${headerB64}.${payloadB64}`;

			// Sign with correct secret
			const encoder = new TextEncoder();
			const key = await crypto.subtle.importKey(
				"raw",
				encoder.encode(SECRET),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["sign"],
			);
			const sig = await crypto.subtle.sign(
				"HMAC",
				key,
				encoder.encode(signingInput),
			);
			const sigB64 = b64urlBuf(sig);
			const token = `${signingInput}.${sigB64}`;

			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.detail).toContain("Invalid token payload");
		});
	});

	describe("audience edge cases", () => {
		it("rejects when audience is expected but token has no aud claim", async () => {
			const app = createApp({ secret: SECRET, audience: "my-api" });
			const token = await createTestToken({ sub: "user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("audience-mismatch");
		});
	});

	describe("HS256 with CryptoKey", () => {
		it("verifies when secret is a CryptoKey", async () => {
			const encoder = new TextEncoder();
			const cryptoKey = await crypto.subtle.importKey(
				"raw",
				encoder.encode(SECRET),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["verify"],
			);
			const app = createApp({ secret: cryptoKey });
			const token = await createTestToken({ sub: "crypto-user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("crypto-user");
		});
	});

	describe("internal crypto errors", () => {
		it("returns 500 when verification throws a non-auth error", async () => {
			// Use an RSA key for HS256 — will cause a crypto operation mismatch
			const rsaKey = await crypto.subtle.generateKey(
				{
					name: "RSASSA-PKCS1-v1_5",
					modulusLength: 2048,
					publicExponent: new Uint8Array([1, 0, 1]),
					hash: "SHA-256",
				},
				true,
				["sign", "verify"],
			);
			const app = createApp({
				secret: rsaKey.publicKey,
				algorithms: ["HS256"],
			});
			const token = await createTestToken({ sub: "user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body.type).toContain("internal-error");
		});
	});

	describe("RS256 with string secret error", () => {
		it("returns 500 when RS256 is given a string secret", async () => {
			// Manually craft an RS256 header token but pass a string secret
			const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
			const payload = b64url(JSON.stringify({ sub: "user", iat: Math.floor(Date.now() / 1000) }));
			const token = `${header}.${payload}.fakesig`;

			const app = createApp({
				secret: "string-secret-for-rs256",
				algorithms: ["RS256"],
			});
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			// Should get an internal error since RS256 requires CryptoKey
			expect(res.status).toBe(500);
		});
	});

	describe("edge cases", () => {
		it("token without sub has empty subject", async () => {
			const app = createApp({ secret: SECRET });
			const token = await createTestToken({ role: "admin" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("");
		});

		it("custom headerPrefix works", async () => {
			const app = createApp({ secret: SECRET, headerPrefix: "Token" });
			const token = await createTestToken({ sub: "user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Token ${token}` },
			});
			expect(res.status).toBe(200);
		});

		it("rejects when issuer required but token has no iss", async () => {
			const app = createApp({ secret: SECRET, issuer: "https://auth.example.com" });
			const token = await createTestToken({ sub: "user" }, SECRET);
			const res = await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("issuer-mismatch");
		});
	});

	describe("callbacks", () => {
		it("calls onSuccess on valid token", async () => {
			const onSuccess = vi.fn();
			const app = createApp({ secret: SECRET, onSuccess });
			const token = await createTestToken({ sub: "user" }, SECRET);
			await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(onSuccess).toHaveBeenCalledOnce();
		});

		it("calls onFailure on invalid token", async () => {
			const onFailure = vi.fn();
			const app = createApp({ secret: SECRET, onFailure });
			await app.request("/test");
			expect(onFailure).toHaveBeenCalledOnce();
			expect(onFailure.mock.calls[0]![0]).toBeInstanceOf(AuthError);
		});

		it("calls onFailure on nbf rejection", async () => {
			const onFailure = vi.fn();
			const futureNbf = Math.floor(Date.now() / 1000) + 3600;
			const app = createApp({ secret: SECRET, onFailure });
			const token = await createTestToken(
				{ sub: "user", nbf: futureNbf },
				SECRET,
			);
			await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});

		it("calls onFailure on issuer mismatch", async () => {
			const onFailure = vi.fn();
			const app = createApp({
				secret: SECRET,
				issuer: "https://good.com",
				onFailure,
			});
			const token = await createTestToken(
				{ sub: "user", iss: "https://evil.com" },
				SECRET,
			);
			await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});

		it("calls onFailure on audience mismatch", async () => {
			const onFailure = vi.fn();
			const app = createApp({
				secret: SECRET,
				audience: "my-api",
				onFailure,
			});
			const token = await createTestToken(
				{ sub: "user", aud: "other-api" },
				SECRET,
			);
			await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});

		it("calls onFailure on claim validation failure", async () => {
			const onFailure = vi.fn();
			const app = createApp({
				secret: SECRET,
				validateClaims: () => false,
				onFailure,
			});
			const token = await createTestToken({ sub: "user" }, SECRET);
			await app.request("/test", {
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});
	});
});

// ─── Helpers ────────────────────────────────────────────────────

function b64url(str: string): string {
	const encoder = new TextEncoder();
	return b64urlBuf(encoder.encode(str).buffer);
}

function b64urlBuf(buffer: ArrayBuffer | ArrayBufferLike): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
