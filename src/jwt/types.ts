import type { AuthError } from "../errors.js";
import type { Algorithm, ClaimValidator } from "../types.js";

/**
 * Options for {@link jwtGuard}.
 *
 * @typeParam TClaims - Custom claims type for type-safe validation.
 */
export interface JwtGuardOptions<TClaims = Record<string, unknown>> {
	/** Secret (HS256) or public key (RS256) used for verification. */
	secret: string | CryptoKey;

	/**
	 * Allowed algorithms. Explicitly setting this prevents algorithm
	 * substitution attacks.
	 *
	 * @default ['HS256']
	 */
	algorithms?: Algorithm[];

	/**
	 * Authorization header prefix.
	 *
	 * @default 'Bearer'
	 */
	headerPrefix?: string;

	/** Custom header name. When set, used instead of `Authorization`. */
	headerName?: string;

	/** Expected `iss` claim value(s). Rejects if mismatched. */
	issuer?: string | string[];

	/** Expected `aud` claim value(s). Rejects if mismatched. */
	audience?: string | string[];

	/**
	 * Clock skew tolerance in seconds for `exp` / `nbf` checks.
	 *
	 * @default 0
	 */
	clockTolerance?: number;

	/**
	 * Custom claim validator. Return `false` to reject with 403.
	 */
	validateClaims?: ClaimValidator<TClaims>;

	/** Callback invoked on successful authentication. */
	onSuccess?: (claims: TClaims) => void | Promise<void>;

	/** Callback invoked on authentication failure. */
	onFailure?: (error: AuthError) => void | Promise<void>;
}

/**
 * Standard JWT payload claims.
 */
export interface JwtPayload {
	/** Issuer */
	iss?: string;
	/** Subject */
	sub?: string;
	/** Audience */
	aud?: string | string[];
	/** Expiration time (seconds since epoch) */
	exp?: number;
	/** Not before (seconds since epoch) */
	nbf?: number;
	/** Issued at (seconds since epoch) */
	iat?: number;
	/** JWT ID */
	jti?: string;
	/** Custom claims */
	[key: string]: unknown;
}
