/**
 * API Key Guard module.
 *
 * Provides `apiKeyGuard` — a Hono middleware that validates API keys
 * from request headers.
 *
 * @module
 *
 * @example
 * ```ts
 * import { apiKeyGuard } from 'hono-auth-guard/api-key'
 *
 * app.use('/webhook/*', apiKeyGuard({ keys: ['key-1', 'key-2'] }))
 * ```
 */

export { apiKeyGuard } from "./guard.js";
export type { ApiKeyGuardOptions } from "./types.js";
