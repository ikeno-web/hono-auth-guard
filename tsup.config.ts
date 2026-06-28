import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		jwt: "src/jwt/index.ts",
		"api-key": "src/api-key/index.ts",
		oauth: "src/oauth/index.ts",
		testing: "src/testing/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	splitting: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	outExtension({ format }) {
		return {
			js: format === "esm" ? ".mjs" : ".js",
		};
	},
	external: ["hono"],
});
