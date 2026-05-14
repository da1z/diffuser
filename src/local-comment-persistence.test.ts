import { expect, test } from "bun:test";

import {
	clearPersistedDraftReviewComments,
	draftReviewCommentPersistenceStorageKey,
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

test("ignores malformed persisted records without deleting them", () => {
	const storage = memoryStorage();
	const scope = {
		patch,
		repositoryContext,
		storage,
	};
	const key = draftReviewCommentPersistenceStorageKey(scope);
	const corrupted = "not-json";
	storage.setItem(key, corrupted);

	expect(loadPersistedDraftReviewComments(scope)).toEqual([]);
	const saveResult = savePersistedDraftReviewComments(scope, [comment]);
	expect(saveResult.ok).toBe(false);
	expect(storage.value(key)).toBe(corrupted);
});

test("ignores unsupported schema versions without overwriting stored bytes", () => {
	const storage = memoryStorage();
	const scope = {
		patch,
		repositoryContext,
		storage,
	};
	const key = draftReviewCommentPersistenceStorageKey(scope);
	const futureRecord = JSON.stringify({
		comments: [],
		version: 99,
	});
	storage.setItem(key, futureRecord);

	expect(loadPersistedDraftReviewComments(scope)).toEqual([]);
	expect(savePersistedDraftReviewComments(scope, [comment]).ok).toBe(false);
	expect(storage.value(key)).toBe(futureRecord);
});

test("does not remove ignored records when clearing persisted comments", () => {
	const storage = memoryStorage();
	const scope = {
		patch,
		repositoryContext,
		storage,
	};
	const key = draftReviewCommentPersistenceStorageKey(scope);
	const futureRecord = JSON.stringify({ comments: [], version: 2 });
	storage.setItem(key, futureRecord);

	expect(clearPersistedDraftReviewComments(scope).ok).toBe(true);
	expect(storage.value(key)).toBe(futureRecord);
});

test("returns an empty list when stored comments fail structural validation", () => {
	const storage = memoryStorage();
	const scope = {
		patch,
		repositoryContext,
		storage,
	};
	storage.setItem(
		draftReviewCommentPersistenceStorageKey(scope),
		JSON.stringify({
			comments: [{ id: "x", body: "y" }],
			version: 1,
		})
	);

	expect(loadPersistedDraftReviewComments(scope)).toEqual([]);
});
