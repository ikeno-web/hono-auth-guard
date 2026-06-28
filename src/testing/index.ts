/**
 * Testing helpers module.
 *
 * Utilities for creating mock auth contexts and test JWT tokens
 * without needing real cryptographic operations.
 *
 * @module
 *
 * @example
 * ```ts
 * import { createMockAuth, createTestToken } from 'hono-auth-guard/testing'
 *
 * const auth = createMockAuth({ type: 'jwt', subject: 'user-123' })
 * const token = await createTestToken({ sub: 'user-456' }, 'secret')
 * ```
 */

export { createMockAuth, createMockContext, createTestToken } from "./helpers.js";
export type { MockAuthOptions } from "./types.js";
