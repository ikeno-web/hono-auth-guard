import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/**/*.test.ts", "src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.spec.ts",
				"src/testing/**",
				"src/**/index.ts",
				"src/**/types.ts",
				"src/types.ts",
				"src/oauth/**",
			],
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
	},
});
