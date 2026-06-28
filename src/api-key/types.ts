import type { AuthError } from "../errors.js";

/**
 * Options for {@link apiKeyGuard}.
 */
export interface ApiKeyGuardOptions {
	/**
	 * Header name to read the API key from.
	 *
	 * @default 'X-API-Key'
	 */
	headerName?: string;

	/**
	 * Static list of valid API keys. Mutually exclusive with `validate`.
	 */
	keys?: string[];

	/**
	 * Dynamic validation function. Mutually exclusive with `keys`.
	 *
	 * Return a subject identifier string on success, or `false` to reject.
	 * Use this to validate against KV, D1, or other external stores.
	 */
	validate?: (key: string) => string | false | Promise<string | false>;

	/** Callback invoked on successful authentication. */
	onSuccess?: (subject: string) => void | Promise<void>;

	/** Callback invoked on authentication failure. */
	onFailure?: (error: AuthError) => void | Promise<void>;
}
