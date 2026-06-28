import type { MiddlewareHandler } from "hono";
import { missingToken } from "./errors.js";

/**
 * AND composition — all guards must succeed.
 *
 * Guards execute in order. The first failure short-circuits
 * and its error is propagated.
 *
 * @param guards - Middleware handlers to compose.
 * @returns A single middleware that runs all guards sequentially.
 *
 * @example
 * ```ts
 * app.use('/admin/*', compose(
 *   jwtGuard({ secret: env.JWT_SECRET }),
 *   jwtGuard({
 *     secret: env.JWT_SECRET,
 *     validateClaims: (claims) => claims.role === 'admin',
 *   })
 * ))
 * ```
 */
export function compose(...guards: MiddlewareHandler[]): MiddlewareHandler {
	if (guards.length === 0) {
		throw new Error("compose requires at least one guard");
	}
	return async (c, next) => {
		for (const guard of guards) {
			let called = false;
			await guard(c, async () => {
				called = true;
			});
			if (!called) {
				// Guard did not call next — it rejected
				return;
			}
		}
		await next();
	};
}

/**
 * OR composition — at least one guard must succeed.
 *
 * Guards execute in order. If one succeeds, the rest are skipped.
 * If all fail, the error from the first guard is returned.
 *
 * @param guards - Middleware handlers to try.
 * @returns A single middleware that succeeds if any guard passes.
 *
 * @example
 * ```ts
 * app.use('/api/*', either(
 *   jwtGuard({ secret: env.JWT_SECRET }),
 *   apiKeyGuard({ keys: ['key-1', 'key-2'] })
 * ))
 * ```
 */
export function either(...guards: MiddlewareHandler[]): MiddlewareHandler {
	if (guards.length === 0) {
		throw new Error("either requires at least one guard");
	}
	return async (c, next) => {
		let firstError: unknown;

		for (const guard of guards) {
			try {
				let succeeded = false;
				await guard(c, async () => {
					succeeded = true;
				});
				if (succeeded) {
					await next();
					return;
				}
			} catch (err) {
				if (firstError === undefined) {
					firstError = err;
				}
			}
		}

		// All guards failed
		if (firstError !== undefined) {
			throw firstError;
		}
		throw missingToken(c.req.path);
	};
}
