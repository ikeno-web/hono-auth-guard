/**
 * OAuth Guard module (Should: v1.x).
 *
 * Provides `oauthGuard` — a Hono middleware that validates OAuth tokens
 * from providers like Google and GitHub.
 *
 * @module
 *
 * @example
 * ```ts
 * import { oauthGuard } from 'hono-auth-guard/oauth'
 *
 * app.use('/api/*', oauthGuard({ provider: 'google', clientId: env.GOOGLE_CLIENT_ID }))
 * ```
 */

export { oauthGuard } from "./guard.js";
export type { OAuthGuardOptions, OAuthProvider } from "./types.js";
