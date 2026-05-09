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

const repeatedFilePatchWithSuffixCollision = `${repeatedFilePatch}diff --git a/a.txt (2) b/a.txt (2)
--- a/a.txt (2)
+++ b/a.txt (2)
@@ -1 +1 @@
-old suffix
+new suffix
`;

const changeTypePatch = `diff --git a/created.txt b/created.txt
new file mode 100644
--- /dev/null
+++ b/created.txt
@@ -0,0 +1 @@
+created
diff --git a/removed.txt b/removed.txt
deleted file mode 100644
--- a/removed.txt
+++ /dev/null
@@ -1 +0,0 @@
-removed
diff --git a/old-name.txt b/new-name.txt
similarity index 100%
rename from old-name.txt
rename to new-name.txt
`;

test("builds a Patch File Navigator model from Continuous Diff View files", () => {
	const interaction = createContinuousDiffViewInteraction(nestedPatch);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(navigator.treePaths).toEqual([
		"src/app.ts",
		"docs/guide.md",
		"new-name.txt",
	]);
	expect(navigator.fileKeyForTreePath("src/app.ts")).toBe(
		interaction.files[0]?.key
	);
	expect(navigator.fileKeyForTreePath("docs/guide.md")).toBe(
		interaction.files[1]?.key
	);
	expect(navigator.fileKeyForTreePath("new-name.txt")).toBe(
		interaction.files[2]?.key
	);
	expect(navigator.fileKeyForTreePath("old-name.txt")).toBeUndefined();
});

test("derives Patch File Navigator rename context and change types from Patch metadata", () => {
	const interaction = createContinuousDiffViewInteraction(changeTypePatch);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(
		navigator.entries.map((entry) => ({
			changeType: entry.changeType,
			displayPath: entry.displayPath,
			previousPath: entry.previousPath,
			treePath: entry.treePath,
		}))
	).toEqual([
		{
			changeType: "new",
			displayPath: "created.txt",
			previousPath: undefined,
			treePath: "created.txt",
		},
		{
			changeType: "deleted",
			displayPath: "removed.txt",
			previousPath: undefined,
			treePath: "removed.txt",
		},
		{
			changeType: "rename-pure",
			displayPath: "new-name.txt",
			previousPath: "old-name.txt",
			treePath: "new-name.txt",
		},
	]);
});

test("keeps duplicate display paths as distinct review file targets", () => {
	const interaction = createContinuousDiffViewInteraction(repeatedFilePatch);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(navigator.entries.map((entry) => entry.displayPath)).toEqual([
		"a.txt",
		"a.txt",
	]);
	expect(navigator.entries.map((entry) => entry.treePath)).toEqual([
		"a.txt",
		"a.txt (2)",
	]);
	expect(navigator.fileKeyForTreePath("a.txt")).toBe(interaction.files[0]?.key);
	expect(navigator.fileKeyForTreePath("a.txt (2)")).toBe(
		interaction.files[1]?.key
	);
});

test("avoids synthesized duplicate tree paths that collide with real display paths", () => {
	const interaction = createContinuousDiffViewInteraction(
		repeatedFilePatchWithSuffixCollision
	);
	const navigator = patchFileNavigatorModelFor(interaction.files);

	expect(navigator.entries.map((entry) => entry.displayPath)).toEqual([
		"a.txt",
		"a.txt",
		"a.txt (2)",
	]);
	expect(navigator.entries.map((entry) => entry.treePath)).toEqual([
		"a.txt",
		"a.txt (3)",
		"a.txt (2)",
	]);
	expect(navigator.fileKeyForTreePath("a.txt (3)")).toBe(
		interaction.files[1]?.key
	);
	expect(navigator.fileKeyForTreePath("a.txt (2)")).toBe(
		interaction.files[2]?.key
	);
});
