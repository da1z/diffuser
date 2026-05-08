import type { CommitMetadata, ReviewSession } from "./workflow";

export interface CommitMetadataPayload {
	readonly authorEmail: string;
	readonly authoredAt: string;
	readonly authorName: string;
	readonly oid: string;
	readonly shortOid: string;
	readonly subject: string;
}

export type DiffFileSnapshotPayload =
	| {
			readonly newFile: {
				readonly contents: string;
				readonly name: string;
			};
			readonly oldFile: {
				readonly contents: string;
				readonly name: string;
			};
			readonly status: "available";
	  }
	| {
			readonly reason: string;
			readonly status: "unavailable";
	  };

export interface SessionEndpointPayload {
	readonly context: {
		readonly args: readonly string[];
		readonly capturedAt: string;
		readonly command: string;
		readonly commit?: CommitMetadataPayload;
		readonly repository: {
			readonly root: string;
			readonly workingDirectory: string;
		};
	};
	readonly diffFileSnapshots: readonly DiffFileSnapshotPayload[];
	readonly id: string;
	readonly kind: "diff" | "show";
	readonly mode: "read-only";
	readonly patch: string;
}

const invalidSessionEndpointPayloadMessage =
	"Session Endpoint payload is invalid.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

const isCommitMetadataPayload = (
	value: unknown
): value is CommitMetadataPayload => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.oid === "string" &&
		typeof value.shortOid === "string" &&
		typeof value.authorName === "string" &&
		typeof value.authorEmail === "string" &&
		typeof value.authoredAt === "string" &&
		typeof value.subject === "string"
	);
};

const isDiffFilePayload = (
	value: unknown
): value is { readonly contents: string; readonly name: string } =>
	isRecord(value) &&
	typeof value.name === "string" &&
	typeof value.contents === "string";

const isDiffFileSnapshotPayload = (
	value: unknown
): value is DiffFileSnapshotPayload => {
	if (!isRecord(value)) {
		return false;
	}

	if (value.status === "unavailable") {
		return typeof value.reason === "string";
	}

	return (
		value.status === "available" &&
		isDiffFilePayload(value.oldFile) &&
		isDiffFilePayload(value.newFile)
	);
};

const isSessionEndpointPayload = (
	value: unknown
): value is SessionEndpointPayload => {
	if (!isRecord(value)) {
		return false;
	}

	const context = value.context;
	if (!isRecord(context)) {
		return false;
	}

	const repository = context.repository;
	if (!isRecord(repository)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		value.mode === "read-only" &&
		(value.kind === "diff" || value.kind === "show") &&
		typeof value.patch === "string" &&
		Array.isArray(value.diffFileSnapshots) &&
		value.diffFileSnapshots.every(isDiffFileSnapshotPayload) &&
		typeof context.command === "string" &&
		isStringArray(context.args) &&
		typeof context.capturedAt === "string" &&
		(context.commit === undefined || isCommitMetadataPayload(context.commit)) &&
		typeof repository.root === "string" &&
		typeof repository.workingDirectory === "string"
	);
};

export const sessionEndpointPayloadFromReviewSession = (
	session: ReviewSession
): SessionEndpointPayload => ({
	id: session.id,
	mode: session.mode,
	kind: session.kind,
	patch: session.patch,
	diffFileSnapshots: session.diffFileSnapshots,
	context: {
		command: session.context.command,
		args: session.context.args,
		capturedAt: session.context.capturedAt,
		...(session.context.commit === undefined
			? {}
			: { commit: session.context.commit }),
		repository: {
			root: session.context.repository.root,
			workingDirectory: session.context.repository.workingDirectory,
		},
	},
});

const commitMetadataFromPayload = (
	payload: CommitMetadataPayload
): CommitMetadata => ({
	oid: payload.oid,
	shortOid: payload.shortOid,
	authorName: payload.authorName,
	authorEmail: payload.authorEmail,
	authoredAt: payload.authoredAt,
	subject: payload.subject,
});

export const reviewSessionFromSessionEndpointPayload = (
	payload: unknown
): ReviewSession => {
	if (!isSessionEndpointPayload(payload)) {
		throw new Error(invalidSessionEndpointPayloadMessage);
	}

	return {
		id: payload.id,
		mode: payload.mode,
		kind: payload.kind,
		patch: payload.patch,
		diffFileSnapshots: payload.diffFileSnapshots,
		context: {
			command: payload.context.command,
			args: payload.context.args,
			capturedAt: payload.context.capturedAt,
			...(payload.context.commit === undefined
				? {}
				: { commit: commitMetadataFromPayload(payload.context.commit) }),
			repository: {
				root: payload.context.repository.root,
				workingDirectory: payload.context.repository.workingDirectory,
			},
		},
	};
};
