import type { AuthError } from "../errors.js";
import type { ClaimValidator } from "../types.js";

/**
 * Supported OAuth providers.
 */
export type OAuthProvider = "google" | "github";

/**
 * Options for {@link oauthGuard}.
 *
 * @typeParam TClaims - Custom claims type for type-safe validation.
 */
export interface OAuthGuardOptions<TClaims = Record<string, unknown>> {
	/** OAuth provider to validate against. */
	provider: OAuthProvider;

	/** Provider-specific client ID for token audience verification. */
	clientId?: string;

	/** Required scopes — rejects if the token does not include all of them. */
	requiredScopes?: string[];

	/** Custom claim validator. Return `false` to reject with 403. */
	validateClaims?: ClaimValidator<TClaims>;

	/**
	 * JWKS cache TTL in seconds.
	 *
	 * @default 3600
	 */
	jwksCacheTtl?: number;

	/** Callback invoked on successful authentication. */
	onSuccess?: (claims: TClaims) => void | Promise<void>;

	/** Callback invoked on authentication failure. */
	onFailure?: (error: AuthError) => void | Promise<void>;
}
