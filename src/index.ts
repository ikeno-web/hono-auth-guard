/**
 * hono-auth-guard — Lightweight auth middleware for Cloudflare Workers + Hono.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { jwtGuard, apiKeyGuard, either } from 'hono-auth-guard'
 *
 * const app = new Hono()
 *
 * app.use('/api/*', either(
 *   jwtGuard({ secret: env.JWT_SECRET }),
 *   apiKeyGuard({ keys: ['my-key'] })
 * ))
 * ```
 */

// Guards
export { jwtGuard } from "./jwt/index.js";
export { apiKeyGuard } from "./api-key/index.js";

// Composition
export { compose, either } from "./compose.js";

// Errors
export { AuthError } from "./errors.js";

// Types
export type { AuthInfo, ProblemDetail, ClaimValidator, Algorithm } from "./types.js";
export type { JwtGuardOptions, JwtPayload } from "./jwt/types.js";
export type { ApiKeyGuardOptions } from "./api-key/types.js";
