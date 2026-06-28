import { describe, expect, it } from "vitest";
import {
	createMockAuth,
	createMockContext,
	createTestToken,
} from "../src/testing/helpers.js";

describe("createMockAuth", () => {
	it("creates default auth info", () => {
		const auth = createMockAuth();
		expect(auth.type).toBe("jwt");
		expect(auth.subject).toBe("test-subject");
		expect(auth.claims).toEqual({});
	});

	it("creates auth with custom options", () => {
		const auth = createMockAuth({
			type: "api-key",
			subject: "client-abc",
			claims: { tier: "premium" },
		});
		expect(auth.type).toBe("api-key");
		expect(auth.subject).toBe("client-abc");
		expect(auth.claims).toEqual({ tier: "premium" });
	});

	it("supports oauth type", () => {
		const auth = createMockAuth({ type: "oauth", subject: "google-user" });
		expect(auth.type).toBe("oauth");
	});
});

describe("createMockContext", () => {
	it("creates a context with auth set", async () => {
		const ctx = await createMockContext({
			type: "jwt",
			subject: "user-123",
			claims: { role: "admin" },
		});
		const auth = ctx.get("auth");
		expect(auth.subject).toBe("user-123");
		expect(auth.type).toBe("jwt");
	});

	it("creates a context with defaults", async () => {
		const ctx = await createMockContext();
		const auth = ctx.get("auth");
		expect(auth.subject).toBe("test-subject");
		expect(auth.type).toBe("jwt");
	});
});

describe("createTestToken", () => {
	it("generates a valid JWT string with 3 parts", async () => {
		const token = await createTestToken({ sub: "user-1" }, "secret");
		const parts = token.split(".");
		expect(parts.length).toBe(3);
	});

	it("encodes the correct header", async () => {
		const token = await createTestToken({ sub: "user-1" }, "secret");
		const headerStr = base64UrlDecode(token.split(".")[0]!);
		const header = JSON.parse(headerStr);
		expect(header.alg).toBe("HS256");
		expect(header.typ).toBe("JWT");
	});

	it("encodes the payload with sub", async () => {
		const token = await createTestToken(
			{ sub: "user-1", role: "admin" },
			"secret",
		);
		const payloadStr = base64UrlDecode(token.split(".")[1]!);
		const payload = JSON.parse(payloadStr);
		expect(payload.sub).toBe("user-1");
		expect(payload.role).toBe("admin");
		expect(typeof payload.iat).toBe("number");
	});

	it("sets exp when expiresIn is provided", async () => {
		const token = await createTestToken({ sub: "user-1" }, "secret", {
			expiresIn: 3600,
		});
		const payloadStr = base64UrlDecode(token.split(".")[1]!);
		const payload = JSON.parse(payloadStr);
		expect(payload.exp).toBeDefined();
		expect(payload.exp).toBeGreaterThan(payload.iat);
		expect(payload.exp - payload.iat).toBe(3600);
	});

	it("does not set exp when expiresIn is omitted", async () => {
		const token = await createTestToken({ sub: "user-1" }, "secret");
		const payloadStr = base64UrlDecode(token.split(".")[1]!);
		const payload = JSON.parse(payloadStr);
		expect(payload.exp).toBeUndefined();
	});

	it("produces tokens verifiable by jwtGuard", async () => {
		// This is an integration check — import jwtGuard and verify
		const { jwtGuard } = await import("../src/jwt/guard.js");
		const { Hono } = await import("hono");
		const { AuthError } = await import("../src/errors.js");

		const secret = "integration-test-secret";
		const app = new Hono();
		app.use("/*", jwtGuard({ secret }));
		app.get("/*", (c) => {
			const auth = c.get("auth");
			return c.json({ subject: auth.subject });
		});
		app.onError((err, c) => {
			if (err instanceof AuthError) return err.toResponse();
			return c.text("Error", 500);
		});

		const token = await createTestToken(
			{ sub: "integration-user" },
			secret,
			{ expiresIn: 300 },
		);
		const res = await app.request("/test", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.subject).toBe("integration-user");
	});
});

function base64UrlDecode(str: string): string {
	const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	return atob(padded);
}
