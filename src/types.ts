/**
 * Authentication information set on the Hono context after a guard succeeds.
 *
 * @typeParam T - Custom claims type. Defaults to `Record<string, unknown>`.
 *
 * @example
 * ```ts
 * const auth = c.get('auth') // AuthInfo
 * console.log(auth.subject)  // e.g. "user-123"
 * ```
 */
export interface AuthInfo<T = Record<string, unknown>> {
	/** Authentication method that produced this info. */
	type: "jwt" | "api-key" | "oauth";
	/** Subject identifier (JWT `sub` claim / API key identifier). */
	subject: string;
	/** Method-specific claims or metadata. */
	claims: T;
}

/**
 * RFC 7807 Problem Details for HTTP APIs.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetail {
	/** A URI reference that identifies the problem type. */
	type: string;
	/** A short, human-readable summary. */
	title: string;
	/** The HTTP status code. */
	status: number;
	/** A human-readable explanation specific to this occurrence. */
	detail?: string | undefined;
	/** A URI reference that identifies the specific occurrence. */
	instance?: string | undefined;
}

/**
 * Custom claim validation function.
 *
 * Return `true` to allow the request, `false` to reject with 403 Forbidden.
 *
 * @typeParam T - Claims type to validate against.
 */
export type ClaimValidator<T = Record<string, unknown>> = (claims: T) => boolean | Promise<boolean>;

/**
 * Supported JWT signing algorithms.
 */
export type Algorithm = "HS256" | "RS256";

/**
 * Base URL prefix for error type URIs.
 */
export const ERROR_TYPE_BASE = "https://hono-auth-guard.dev/errors";

// Augment Hono's ContextVariableMap so `c.get('auth')` is typed.
declare module "hono" {
	interface ContextVariableMap {
		auth: AuthInfo;
	}
}
