import type { MiddlewareHandler } from "hono";
import type { OAuthGuardOptions } from "./types.js";

/**
 * Create an OAuth token verification guard middleware.
 *
 * @typeParam TClaims - Custom claims type for type-safe validation.
 * @param options - Guard configuration.
 * @returns Hono middleware handler.
 *
 * @example
 * ```ts
 * app.use('/api/*', oauthGuard({
 *   provider: 'google',
 *   clientId: env.GOOGLE_CLIENT_ID,
 *   requiredScopes: ['openid', 'email'],
 * }))
 * ```
 */
export function oauthGuard<TClaims = Record<string, unknown>>(
	_options: OAuthGuardOptions<TClaims>,
): MiddlewareHandler {
	throw new Error(
		"oauthGuard is not yet implemented. It is planned for v1.x.",
	);
}
