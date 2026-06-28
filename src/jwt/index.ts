/**
 * JWT Guard module.
 *
 * Provides `jwtGuard` — a Hono middleware that validates JWT tokens
 * using HS256 or RS256 via the Web Crypto API.
 *
 * @module
 *
 * @example
 * ```ts
 * import { jwtGuard } from 'hono-auth-guard/jwt'
 *
 * app.use('/api/*', jwtGuard({ secret: env.JWT_SECRET }))
 * ```
 */

export { jwtGuard } from "./guard.js";
export type { JwtGuardOptions, JwtPayload } from "./types.js";
