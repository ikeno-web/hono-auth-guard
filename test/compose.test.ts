import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { apiKeyGuard } from "../src/api-key/guard.js";
import { compose, either } from "../src/compose.js";
import { AuthError } from "../src/errors.js";
import { jwtGuard } from "../src/jwt/guard.js";
import { createTestToken } from "../src/testing/helpers.js";

const SECRET = "compose-test-secret";

function createAppWithError(middleware: ReturnType<typeof compose>) {
	const app = new Hono();
	app.use("/*", middleware);
	app.get("/*", (c) => {
		const auth = c.get("auth");
		return c.json({ subject: auth.subject, type: auth.type });
	});
	app.onError((err, c) => {
		if (err instanceof AuthError) {
			return err.toResponse();
		}
		return c.text("Internal Server Error", 500);
	});
	return app;
}

describe("compose (AND)", () => {
	it("passes when all guards succeed", async () => {
		const app = createAppWithError(
			compose(
				jwtGuard({ secret: SECRET }),
				jwtGuard({
					secret: SECRET,
					validateClaims: (claims: Record<string, unknown>) =>
						claims.role === "admin",
				}),
			),
		);
		const token = await createTestToken(
			{ sub: "user-1", role: "admin" },
			SECRET,
		);
		const res = await app.request("/test", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
	});

	it("fails when the first guard fails", async () => {
		const app = createAppWithError(
			compose(
				jwtGuard({ secret: SECRET }),
				jwtGuard({
					secret: SECRET,
					validateClaims: (claims: Record<string, unknown>) =>
						claims.role === "admin",
				}),
			),
		);
		// No Authorization header -> first guard fails
		const res = await app.request("/test");
		expect(res.status).toBe(401);
	});

	it("fails when the second guard fails", async () => {
		const app = createAppWithError(
			compose(
				jwtGuard({ secret: SECRET }),
				jwtGuard({
					secret: SECRET,
					validateClaims: (claims: Record<string, unknown>) =>
						claims.role === "admin",
				}),
			),
		);
		const token = await createTestToken(
			{ sub: "user-1", role: "viewer" },
			SECRET,
		);
		const res = await app.request("/test", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(403);
	});

	it("works with a single guard", async () => {
		const app = createAppWithError(compose(jwtGuard({ secret: SECRET })));
		const token = await createTestToken({ sub: "user" }, SECRET);
		const res = await app.request("/test", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
	});

	it("stops when a guard does not call next", async () => {
		// A guard that doesn't call next and doesn't throw
		let secondGuardCalled = false;
		const blockingGuard: Parameters<typeof compose>[0] = async (_c, _next) => {
			// Intentionally not calling next
		};
		const trackingGuard: Parameters<typeof compose>[0] = async (_c, next) => {
			secondGuardCalled = true;
			await next();
		};
		const app = new Hono();
		app.use("/*", compose(blockingGuard, trackingGuard));
		app.get("/*", (c) => c.text("ok"));
		await app.request("/test");
		expect(secondGuardCalled).toBe(false);
	});
});

describe("either (OR)", () => {
	it("passes when the first guard succeeds", async () => {
		const app = createAppWithError(
			either(
				jwtGuard({ secret: SECRET }),
				apiKeyGuard({ keys: ["key-1"] }),
			),
		);
		const token = await createTestToken({ sub: "jwt-user" }, SECRET);
		const res = await app.request("/test", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.type).toBe("jwt");
	});

	it("passes when the second guard succeeds", async () => {
		const app = createAppWithError(
			either(
				jwtGuard({ secret: SECRET }),
				apiKeyGuard({ keys: ["key-1"] }),
			),
		);
		const res = await app.request("/test", {
			headers: { "X-API-Key": "key-1" },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.type).toBe("api-key");
	});

	it("fails when all guards fail, returns first error", async () => {
		const app = createAppWithError(
			either(
				jwtGuard({ secret: SECRET }),
				apiKeyGuard({ keys: ["key-1"] }),
			),
		);
		// No JWT, no API key
		const res = await app.request("/test");
		expect(res.status).toBe(401);
		const body = await res.json();
		// First guard's error (missing-token from JWT) should be returned
		expect(body.type).toContain("missing-token");
	});

	it("works with a single guard", async () => {
		const app = createAppWithError(
			either(apiKeyGuard({ keys: ["only-key"] })),
		);
		const res = await app.request("/test", {
			headers: { "X-API-Key": "only-key" },
		});
		expect(res.status).toBe(200);
	});
});
