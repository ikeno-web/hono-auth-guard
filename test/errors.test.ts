import { describe, expect, it } from "vitest";
import {
	AuthError,
	algorithmMismatch,
	audienceMismatch,
	claimValidationFailed,
	internalAuthError,
	invalidApiKey,
	invalidToken,
	issuerMismatch,
	missingApiKey,
	missingToken,
	oauthVerificationFailed,
	tokenExpired,
} from "../src/errors.js";
import { ERROR_TYPE_BASE } from "../src/types.js";

describe("AuthError", () => {
	it("has correct properties", () => {
		const err = new AuthError(401, {
			type: `${ERROR_TYPE_BASE}/test`,
			title: "Test Error",
			status: 401,
			detail: "Test detail",
		});
		expect(err.status).toBe(401);
		expect(err.name).toBe("AuthError");
		expect(err.message).toBe("Test Error");
		expect(err.problemDetail.type).toContain("test");
	});

	it("is instanceof Error", () => {
		const err = new AuthError(401, {
			type: `${ERROR_TYPE_BASE}/test`,
			title: "Test",
			status: 401,
		});
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(AuthError);
	});

	describe("toResponse()", () => {
		it("produces valid RFC 7807 JSON response", async () => {
			const err = new AuthError(401, {
				type: `${ERROR_TYPE_BASE}/token-expired`,
				title: "Token Expired",
				status: 401,
				detail: "The token has expired.",
				instance: "/api/test",
			});
			const response = err.toResponse();
			expect(response.status).toBe(401);
			expect(response.headers.get("Content-Type")).toBe(
				"application/problem+json",
			);

			const body = await response.json();
			expect(body.type).toBe(`${ERROR_TYPE_BASE}/token-expired`);
			expect(body.title).toBe("Token Expired");
			expect(body.status).toBe(401);
			expect(body.detail).toBe("The token has expired.");
			expect(body.instance).toBe("/api/test");
		});

		it("works without optional fields", async () => {
			const err = new AuthError(403, {
				type: `${ERROR_TYPE_BASE}/forbidden`,
				title: "Forbidden",
				status: 403,
			});
			const response = err.toResponse();
			const body = await response.json();
			expect(body.type).toContain("forbidden");
			expect(body.detail).toBeUndefined();
			expect(body.instance).toBeUndefined();
		});
	});
});

describe("error factories", () => {
	it("missingToken", () => {
		const err = missingToken("/api/test");
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("missing-token");
		expect(err.problemDetail.instance).toBe("/api/test");
	});

	it("invalidToken", () => {
		const err = invalidToken("Bad format", "/api/test");
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("invalid-token");
		expect(err.problemDetail.detail).toBe("Bad format");
	});

	it("invalidToken with default detail", () => {
		const err = invalidToken();
		expect(err.problemDetail.detail).toBe("The provided token is invalid.");
	});

	it("tokenExpired with date", () => {
		const err = tokenExpired("2026-01-01T00:00:00Z");
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("token-expired");
		expect(err.problemDetail.detail).toContain("2026-01-01");
	});

	it("tokenExpired without date", () => {
		const err = tokenExpired();
		expect(err.status).toBe(401);
		expect(err.problemDetail.detail).toBe("The provided JWT has expired.");
	});

	it("algorithmMismatch", () => {
		const err = algorithmMismatch();
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("algorithm-mismatch");
	});

	it("issuerMismatch", () => {
		const err = issuerMismatch();
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("issuer-mismatch");
	});

	it("audienceMismatch", () => {
		const err = audienceMismatch();
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("audience-mismatch");
	});

	it("invalidApiKey", () => {
		const err = invalidApiKey();
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("invalid-api-key");
	});

	it("missingApiKey", () => {
		const err = missingApiKey();
		expect(err.status).toBe(401);
		expect(err.problemDetail.type).toContain("missing-api-key");
	});

	it("claimValidationFailed", () => {
		const err = claimValidationFailed();
		expect(err.status).toBe(403);
		expect(err.problemDetail.type).toContain("claim-validation-failed");
	});

	it("oauthVerificationFailed with detail", () => {
		const err = oauthVerificationFailed("Token revoked");
		expect(err.status).toBe(401);
		expect(err.problemDetail.detail).toBe("Token revoked");
	});

	it("oauthVerificationFailed without detail", () => {
		const err = oauthVerificationFailed();
		expect(err.status).toBe(401);
		expect(err.problemDetail.detail).toBe("OAuth token verification failed.");
	});

	it("internalAuthError with detail", () => {
		const err = internalAuthError("JWKS fetch failed");
		expect(err.status).toBe(500);
		expect(err.problemDetail.detail).toBe("JWKS fetch failed");
	});

	it("internalAuthError without detail", () => {
		const err = internalAuthError();
		expect(err.status).toBe(500);
		expect(err.problemDetail.detail).toBe(
			"An internal error occurred during authentication.",
		);
	});
});
