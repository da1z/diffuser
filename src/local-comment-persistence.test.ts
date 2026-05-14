import { expect, test } from "bun:test";

import {
	clearPersistedDraftReviewComments,
	loadPersistedDraftReviewComments,
	savePersistedDraftReviewComments,
} from "./local-comment-persistence";
import type { SubmittedDraftReviewComment } from "./review-comments";

const repositoryContext = {
	root: "/workspace/project",
	workingDirectory: "/workspace/project/packages/app",
} as const;

const patch = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1 @@
-old
+new
`;

const comment = {
	anchor: {
		endLine: 1,
		fileKey: "0\0src/app.ts",
		fileOrder: 0,
		path: "src/app.ts",
		position: 1,
		side: "new",
		startLine: 1,
	},
	body: "Please simplify this branch.",
	id: "draft-review-comment-1",
	order: 1,
} as const satisfies SubmittedDraftReviewComment;

const memoryStorage = () => {
	const items = new Map<string, string>();

	return {
		getItem: (key: string) => items.get(key) ?? null,
		keys: () => [...items.keys()],
		removeItem: (key: string) => {
			items.delete(key);
		},
		setItem: (key: string, value: string) => {
			items.set(key, value);
		},
		value: (key: string) => items.get(key),
	};
};

test("persists submitted Draft Review Comments with hashed Repository Context and Patch identifiers", () => {
	const storage = memoryStorage();

	const saved = savePersistedDraftReviewComments(
		{
			patch,
			repositoryContext,
			storage,
		},
		[comment]
	);

	expect(saved.ok).toBe(true);
	expect(storage.keys()).toHaveLength(1);
	const [storageKey] = storage.keys();
	if (storageKey === undefined) {
		throw new Error("Expected persisted Draft Review Comment storage key.");
	}
	expect(storageKey).toStartWith("diffuser:draft-review-comments:v1:");
	expect(storageKey).not.toContain(repositoryContext.root);
	expect(storageKey).not.toContain(repositoryContext.workingDirectory);
	expect(storageKey).not.toContain("src/app.ts");
	expect(storageKey).not.toContain("old");
	expect(storageKey).not.toContain("new");
	expect(JSON.parse(storage.value(storageKey) ?? "{}")).toMatchObject({
		version: 1,
		comments: [comment],
	});
	expect(
		loadPersistedDraftReviewComments({
			patch,
			repositoryContext,
			storage,
		})
	).toEqual([comment]);
	expect(
		loadPersistedDraftReviewComments({
			patch: `${patch}\n`,
			repositoryContext,
			storage,
		})
	).toEqual([]);
	expect(
		loadPersistedDraftReviewComments({
			patch,
			repositoryContext: {
				...repositoryContext,
				workingDirectory: "/workspace/project/packages/other",
			},
			storage,
		})
	).toEqual([]);

	clearPersistedDraftReviewComments({
		patch,
		repositoryContext,
		storage,
	});

	expect(storage.value(storageKey)).toBeUndefined();
});

test("ignores unreadable records and reports failed persistence writes", () => {
	const failingStorage = {
		getItem: () => {
			throw new Error("Storage unavailable.");
		},
		removeItem: () => undefined,
		setItem: () => {
			throw new Error("Storage quota exceeded.");
		},
	};
	const scope = {
		patch,
		repositoryContext,
		storage: failingStorage,
	};

	expect(loadPersistedDraftReviewComments(scope)).toEqual([]);
	expect(savePersistedDraftReviewComments(scope, [comment])).toMatchObject({
		ok: false,
	});
});
