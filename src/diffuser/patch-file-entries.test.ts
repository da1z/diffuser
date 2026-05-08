import { expect, test } from "bun:test";

import { alignPatchFileEntries } from "./patch-file-entries";

test("aligns parsed Patch files, raw entries, and snapshots by Patch order", () => {
	const patch = `From abc123 Mon Sep 17 00:00:00 2001
diff --git a/first.txt b/first.txt
index 1111111..2222222 100644
--- a/first.txt
+++ b/first.txt
@@ -1 +1 @@
-first old
+first new
diff --git a/second.txt b/second.txt
index 3333333..4444444 100644
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-second old
+second new
`;
	const snapshots = [
		{ label: "first snapshot" },
		{ label: "second snapshot" },
	] as const;

	const alignedEntries = alignPatchFileEntries({ patch, snapshots });

	expect(
		alignedEntries.map(({ fileDiff, patchFileEntry, snapshot }) => ({
			name: fileDiff.name,
			patchFileEntry,
			snapshot: snapshot?.label,
		}))
	).toEqual([
		{
			name: "first.txt",
			patchFileEntry: `diff --git a/first.txt b/first.txt
index 1111111..2222222 100644
--- a/first.txt
+++ b/first.txt
@@ -1 +1 @@
-first old
+first new
`,
			snapshot: "first snapshot",
		},
		{
			name: "second.txt",
			patchFileEntry: `diff --git a/second.txt b/second.txt
index 3333333..4444444 100644
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-second old
+second new
`,
			snapshot: "second snapshot",
		},
	]);
});
