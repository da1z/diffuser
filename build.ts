#!/usr/bin/env bun
import { build } from "bun";
import tailwind from "bun-plugin-tailwind";

const result = await build({
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	entrypoints: ["./src/index.html"],
	env: "BUN_PUBLIC_*",
	minify: true,
	outdir: "./dist",
	plugins: [tailwind],
	sourcemap: "linked",
	target: "browser",
});

if (!result.success) {
	for (const log of result.logs) {
		console.error(log);
	}

	process.exit(1);
}
