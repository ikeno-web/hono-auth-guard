/**
 * Options for creating mock authentication info.
 *
 * @typeParam TClaims - Custom claims type.
 */
export interface MockAuthOptions<TClaims = Record<string, unknown>> {
	/** Authentication method. @default 'jwt' */
	type?: "jwt" | "api-key" | "oauth";
	/** Subject identifier. @default 'test-subject' */
	subject?: string;
	/** Custom claims. @default {} */
	claims?: TClaims;
}
