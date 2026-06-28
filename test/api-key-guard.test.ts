import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { apiKeyGuard } from "../src/api-key/guard.js";
import { AuthError } from "../src/errors.js";

function createApp(options: Parameters<typeof apiKeyGuard>[0]) {
	const app = new Hono();
	app.use("/*", apiKeyGuard(options));
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

describe("apiKeyGuard", () => {
	describe("static keys", () => {
		it("accepts a valid API key", async () => {
			const app = createApp({ keys: ["key-1", "key-2", "key-3"] });
			const res = await app.request("/test", {
				headers: { "X-API-Key": "key-2" },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.type).toBe("api-key");
			expect(body.subject).toBe("api-key-user");
		});

		it("rejects an invalid API key", async () => {
			const app = createApp({ keys: ["key-1", "key-2"] });
			const res = await app.request("/test", {
				headers: { "X-API-Key": "invalid-key" },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("invalid-api-key");
		});

		it("rejects when no API key header is present", async () => {
			const app = createApp({ keys: ["key-1"] });
			const res = await app.request("/test");
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("missing-api-key");
		});
	});

	describe("custom header", () => {
		it("reads from a custom header name", async () => {
			const app = createApp({
				keys: ["secret-key"],
				headerName: "X-Custom-Auth",
			});
			const res = await app.request("/test", {
				headers: { "X-Custom-Auth": "secret-key" },
			});
			expect(res.status).toBe(200);
		});

		it("rejects when custom header is missing", async () => {
			const app = createApp({
				keys: ["secret-key"],
				headerName: "X-Custom-Auth",
			});
			const res = await app.request("/test", {
				headers: { "X-API-Key": "secret-key" },
			});
			expect(res.status).toBe(401);
		});
	});

	describe("dynamic validation", () => {
		it("accepts when validate returns a subject string", async () => {
			const app = createApp({
				validate: async (key) => {
					if (key === "dynamic-key") return "client-abc";
					return false;
				},
			});
			const res = await app.request("/test", {
				headers: { "X-API-Key": "dynamic-key" },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("client-abc");
		});

		it("rejects when validate returns false", async () => {
			const app = createApp({
				validate: async (_key) => false,
			});
			const res = await app.request("/test", {
				headers: { "X-API-Key": "bad-key" },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.type).toContain("invalid-api-key");
		});

		it("supports sync validate function", async () => {
			const app = createApp({
				validate: (key) => (key === "sync-key" ? "sync-client" : false),
			});
			const res = await app.request("/test", {
				headers: { "X-API-Key": "sync-key" },
			});
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.subject).toBe("sync-client");
		});
	});

	describe("misconfiguration", () => {
		it("rejects all requests when neither keys nor validate is provided", async () => {
			const app = createApp({});
			const res = await app.request("/test", {
				headers: { "X-API-Key": "any-key" },
			});
			expect(res.status).toBe(401);
		});
	});

	describe("callbacks", () => {
		it("calls onSuccess on valid key", async () => {
			const onSuccess = vi.fn();
			const app = createApp({ keys: ["key-1"], onSuccess });
			await app.request("/test", {
				headers: { "X-API-Key": "key-1" },
			});
			expect(onSuccess).toHaveBeenCalledOnce();
			expect(onSuccess).toHaveBeenCalledWith("api-key-user");
		});

		it("calls onFailure on missing key", async () => {
			const onFailure = vi.fn();
			const app = createApp({ keys: ["key-1"], onFailure });
			await app.request("/test");
			expect(onFailure).toHaveBeenCalledOnce();
			expect(onFailure.mock.calls[0]![0]).toBeInstanceOf(AuthError);
		});

		it("calls onFailure on invalid key", async () => {
			const onFailure = vi.fn();
			const app = createApp({ keys: ["key-1"], onFailure });
			await app.request("/test", {
				headers: { "X-API-Key": "wrong-key" },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});

		it("calls onFailure when validate returns false", async () => {
			const onFailure = vi.fn();
			const app = createApp({
				validate: () => false,
				onFailure,
			});
			await app.request("/test", {
				headers: { "X-API-Key": "any" },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});

		it("calls onFailure when misconfigured", async () => {
			const onFailure = vi.fn();
			const app = createApp({ onFailure });
			await app.request("/test", {
				headers: { "X-API-Key": "any" },
			});
			expect(onFailure).toHaveBeenCalledOnce();
		});
	});
});
