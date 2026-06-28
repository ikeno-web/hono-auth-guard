import { ERROR_TYPE_BASE, type ProblemDetail } from "./types.js";

/**
 * Authentication / authorization error thrown by guards.
 *
 * Carries an RFC 7807 {@link ProblemDetail} and can be converted
 * directly to a `Response` with {@link AuthError.toResponse}.
 *
 * @example
 * ```ts
 * app.onError((err, c) => {
 *   if (err instanceof AuthError) {
 *     return err.toResponse()
 *   }
 *   return c.text('Internal Server Error', 500)
 * })
 * ```
 */
export class AuthError extends Error {
	readonly status: number;
	readonly problemDetail: ProblemDetail;

	constructor(status: number, problemDetail: ProblemDetail) {
		super(problemDetail.title);
		this.name = "AuthError";
		this.status = status;
		this.problemDetail = problemDetail;
	}

	/** Convert to an RFC 7807 JSON response with `application/problem+json` content type. */
	toResponse(): Response {
		return new Response(JSON.stringify(this.problemDetail), {
			status: this.status,
			headers: { "Content-Type": "application/problem+json" },
		});
	}
}

// ─── Error Factories ─────────────────────────────────────────────

/** Missing Authorization / API-Key header. */
export function missingToken(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/missing-token`,
		title: "Missing Authentication",
		status: 401,
		detail: "No authentication credentials were provided.",
		instance,
	});
}

/** JWT signature verification failed or token is malformed. */
export function invalidToken(detail?: string, instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/invalid-token`,
		title: "Invalid Token",
		status: 401,
		detail: detail ?? "The provided token is invalid.",
		instance,
	});
}

/** JWT `exp` claim has passed. */
export function tokenExpired(expiredAt?: string, instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/token-expired`,
		title: "Token Expired",
		status: 401,
		detail: expiredAt
			? `The provided JWT has expired at ${expiredAt}`
			: "The provided JWT has expired.",
		instance,
	});
}

/** JWT `alg` header does not match allowed algorithms. */
export function algorithmMismatch(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/algorithm-mismatch`,
		title: "Algorithm Mismatch",
		status: 401,
		detail: "The token algorithm does not match the allowed algorithms.",
		instance,
	});
}

/** JWT `iss` claim does not match expected issuer. */
export function issuerMismatch(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/issuer-mismatch`,
		title: "Issuer Mismatch",
		status: 401,
		detail: "The token issuer does not match the expected issuer.",
		instance,
	});
}

/** JWT `aud` claim does not match expected audience. */
export function audienceMismatch(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/audience-mismatch`,
		title: "Audience Mismatch",
		status: 401,
		detail: "The token audience does not match the expected audience.",
		instance,
	});
}

/** API key validation failed. */
export function invalidApiKey(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/invalid-api-key`,
		title: "Invalid API Key",
		status: 401,
		detail: "The provided API key is not valid.",
		instance,
	});
}

/** API key header is missing. */
export function missingApiKey(instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/missing-api-key`,
		title: "Missing API Key",
		status: 401,
		detail: "No API key was provided.",
		instance,
	});
}

/** Custom claim validation returned false. */
export function claimValidationFailed(instance?: string): AuthError {
	return new AuthError(403, {
		type: `${ERROR_TYPE_BASE}/claim-validation-failed`,
		title: "Forbidden",
		status: 403,
		detail: "The token claims did not pass validation.",
		instance,
	});
}

/** OAuth token verification failed. */
export function oauthVerificationFailed(detail?: string, instance?: string): AuthError {
	return new AuthError(401, {
		type: `${ERROR_TYPE_BASE}/oauth-verification-failed`,
		title: "OAuth Verification Failed",
		status: 401,
		detail: detail ?? "OAuth token verification failed.",
		instance,
	});
}

/** Internal error during authentication (e.g. JWKS fetch failure). */
export function internalAuthError(detail?: string, instance?: string): AuthError {
	return new AuthError(500, {
		type: `${ERROR_TYPE_BASE}/internal-error`,
		title: "Internal Authentication Error",
		status: 500,
		detail: detail ?? "An internal error occurred during authentication.",
		instance,
	});
}
