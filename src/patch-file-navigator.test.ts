import { expect, test } from "bun:test";

import { createContinuousDiffViewInteraction } from "./continuous-diff-view-interaction";
import { patchFileNavigatorModelFor } from "./patch-file-navigator";

const nestedPatch = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1 @@
-old
+new
diff --git a/docs/guide.md b/docs/guide.md
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1 +1 @@
-before
+after
diff --git a/old-name.txt b/new-name.txt
similarity index 88%
rename from old-name.txt
rename to new-name.txt
--- a/old-name.txt
+++ b/new-name.txt
@@ -1 +1 @@
-old name
+new name
`;

const repeatedFilePatch = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old again
+new again
`;

test("builds a Patch File Navigator model from Continuous Diff View files", () => {
	const interaction = createContinuousDiffViewInteraction(nestedPatch);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(navigator.paths).toEqual([
		"src/app.ts",
		"docs/guide.md",
		"new-name.txt",
	]);
	expect(navigator.fileKeyForPath("src/app.ts")).toBe(
		interaction.files[0]?.key
	);
	expect(navigator.fileKeyForPath("docs/guide.md")).toBe(
		interaction.files[1]?.key
	);
	expect(navigator.fileKeyForPath("new-name.txt")).toBe(
		interaction.files[2]?.key
	);
	expect(navigator.fileKeyForPath("old-name.txt")).toBeUndefined();
});

test("deduplicates tree paths while preserving the first matching review file key", () => {
	const interaction = createContinuousDiffViewInteraction(repeatedFilePatch);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(navigator.paths).toEqual(["a.txt"]);
	expect(navigator.fileKeyForPath("a.txt")).toBe(interaction.files[0]?.key);
});
