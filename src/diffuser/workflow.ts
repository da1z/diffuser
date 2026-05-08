import { $ } from "bun";
import { Data, Effect } from "effect";

export type DiffuserCommand =
	| {
			readonly kind: "help";
			readonly openBrowser: boolean;
	  }
	| {
			readonly kind: "diff";
			readonly openBrowser: boolean;
			readonly gitArgs: readonly string[];
	  }
	| {
			readonly kind: "show";
			readonly openBrowser: boolean;
			readonly gitArgs: readonly string[];
	  };

export interface GitResult {
	readonly stderr: string;
	readonly stdout: string;
}

export interface CommitMetadata {
	readonly authorEmail: string;
	readonly authoredAt: string;
	readonly authorName: string;
	readonly oid: string;
	readonly shortOid: string;
	readonly subject: string;
}

export interface CommitReviewGitResult {
	readonly metadata: CommitMetadata;
	readonly patch: string;
}

export interface GitAdapter {
	readonly diff: (input: {
		readonly args: readonly string[];
		readonly cwd: string;
	}) => Effect.Effect<GitResult, GitError>;
	readonly repositoryRoot: (input: {
		readonly cwd: string;
	}) => Effect.Effect<string, GitError>;
	readonly showCommit: (input: {
		readonly commitish: string;
		readonly cwd: string;
		readonly pathspec: readonly string[];
	}) => Effect.Effect<CommitReviewGitResult, GitError>;
}

export interface ReviewSession {
	readonly context: {
		readonly args: readonly string[];
		readonly capturedAt: string;
		readonly command: string;
		readonly commit?: CommitMetadata;
		readonly repository: {
			readonly root: string;
			readonly workingDirectory: string;
		};
	};
	readonly id: string;
	readonly kind: "diff" | "show";
	readonly mode: "read-only";
	readonly patch: string;
}

export class ParseError extends Data.TaggedError("ParseError")<{
	readonly message: string;
}> {}

export class GitError extends Data.TaggedError("GitError")<{
	readonly message: string;
	readonly stderr?: string;
}> {}

export class EmptyPatchError extends Data.TaggedError("EmptyPatchError")<{
	readonly message: string;
}> {}

export interface DiffWorkflowInput {
	readonly argv: readonly string[];
	readonly cwd: string;
	readonly git: GitAdapter;
	readonly now: () => Date;
}

export const diffuserHelp = `Usage:
  diffuser [--no-open] diff [git diff args]
  diffuser [--no-open] show [commit-ish] [-- pathspec...]

Creates an immutable, read-only Review Session from Git changes.

Options:
  --no-open  Print the local Review Session URL without opening a browser.
`;

export const parseDiffuserCommand = (
	argv: readonly string[]
): DiffuserCommand => {
	let openBrowser = true;
	let index = 0;

	if (argv[index] === "--no-open") {
		openBrowser = false;
		index += 1;
	}

	const subcommand = argv[index];

	switch (subcommand) {
		case "diff":
			return {
				kind: "diff",
				openBrowser,
				gitArgs: argv.slice(index + 1),
			};
		case "show":
			return {
				kind: "show",
				openBrowser,
				gitArgs: argv.slice(index + 1),
			};
		default:
			return { kind: "help", openBrowser };
	}
};

const formatDiffCommand = (args: readonly string[]) =>
	["diffuser", "diff", ...args].join(" ");

const formatShowCommand = (
	commitish: string,
	pathspec: readonly string[]
): string =>
	[
		"diffuser",
		"show",
		commitish,
		...(pathspec.length > 0 ? ["--"] : []),
		...pathspec,
	].join(" ");

const runGit = (
	cwd: string,
	args: readonly string[]
): Effect.Effect<GitResult, GitError> =>
	Effect.tryPromise({
		try: async () => {
			const output = await $`git ${args}`.cwd(cwd).nothrow().quiet();
			const stdout = output.stdout.toString();
			const stderr = output.stderr.toString();

			if (output.exitCode !== 0) {
				throw new GitError({
					message: `git ${args.join(" ")} failed`,
					stderr,
				});
			}

			return { stdout, stderr };
		},
		catch: (error) =>
			error instanceof GitError
				? error
				: new GitError({
						message:
							error instanceof Error ? error.message : "Git command failed",
					}),
	});

export const bunGitAdapter: GitAdapter = {
	diff: ({ args, cwd }) => runGit(cwd, ["diff", ...args]),
	showCommit: ({ commitish, pathspec, cwd }) =>
		Effect.gen(function* () {
			const metadataResult = yield* runGit(cwd, [
				"show",
				"--no-patch",
				"--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
				commitish,
			]);
			const patchResult = yield* runGit(cwd, [
				"show",
				"--format=",
				"--patch",
				commitish,
				...(pathspec.length > 0 ? ["--", ...pathspec] : []),
			]);
			const [oid, shortOid, authorName, authorEmail, authoredAt, subject] =
				metadataResult.stdout.trimEnd().split("\0");

			if (
				oid === undefined ||
				shortOid === undefined ||
				authorName === undefined ||
				authorEmail === undefined ||
				authoredAt === undefined ||
				subject === undefined
			) {
				return yield* new GitError({
					message: "git show produced incomplete commit metadata",
				});
			}

			return {
				metadata: {
					oid,
					shortOid,
					authorName,
					authorEmail,
					authoredAt,
					subject,
				},
				patch: patchResult.stdout,
			};
		}),
	repositoryRoot: ({ cwd }) =>
		Effect.map(runGit(cwd, ["rev-parse", "--show-toplevel"]), ({ stdout }) =>
			stdout.trim()
		),
};

const createDiffSessionFromCommand = ({
	command,
	cwd,
	now,
	git,
}: {
	readonly command: Extract<DiffuserCommand, { readonly kind: "diff" }>;
	readonly cwd: string;
	readonly git: GitAdapter;
	readonly now: () => Date;
}): Effect.Effect<ReviewSession, GitError | EmptyPatchError> =>
	Effect.gen(function* () {
		const result = yield* git.diff({ args: command.gitArgs, cwd });
		const patch = result.stdout;

		if (patch.trim().length === 0) {
			return yield* new EmptyPatchError({
				message: "Git produced an empty Patch.",
			});
		}

		const repositoryRoot = yield* git.repositoryRoot({ cwd });
		const capturedAt = now().toISOString();

		return {
			id: `diff-${capturedAt}`,
			mode: "read-only",
			kind: "diff",
			patch,
			context: {
				command: formatDiffCommand(command.gitArgs),
				args: command.gitArgs,
				capturedAt,
				repository: {
					root: repositoryRoot,
					workingDirectory: cwd,
				},
			},
		};
	});

const parseShowArguments = (
	args: readonly string[]
): { readonly commitish: string; readonly pathspec: readonly string[] } => {
	const delimiterIndex = args.indexOf("--");
	const commitishArgs =
		delimiterIndex === -1 ? args : args.slice(0, delimiterIndex);
	const pathspec = delimiterIndex === -1 ? [] : args.slice(delimiterIndex + 1);
	const commitish = commitishArgs[0] ?? "HEAD";

	if (commitishArgs.length > 1) {
		throw new ParseError({
			message: "diffuser show accepts one commit-ish before -- pathspecs.",
		});
	}

	if (commitish.startsWith("-")) {
		throw new ParseError({
			message: "diffuser show does not accept arbitrary git show options.",
		});
	}

	return { commitish, pathspec };
};

const createShowSessionFromCommand = ({
	command,
	cwd,
	now,
	git,
}: {
	readonly command: Extract<DiffuserCommand, { readonly kind: "show" }>;
	readonly cwd: string;
	readonly git: GitAdapter;
	readonly now: () => Date;
}): Effect.Effect<ReviewSession, ParseError | GitError | EmptyPatchError> =>
	Effect.gen(function* () {
		const { commitish, pathspec } = yield* Effect.try({
			try: () => parseShowArguments(command.gitArgs),
			catch: (error) =>
				error instanceof ParseError
					? error
					: new ParseError({ message: "Invalid diffuser show arguments." }),
		});
		const result = yield* git.showCommit({ commitish, pathspec, cwd });
		const patch = result.patch;

		if (patch.trim().length === 0) {
			return yield* new EmptyPatchError({
				message: "Git produced an empty Patch.",
			});
		}

		const repositoryRoot = yield* git.repositoryRoot({ cwd });
		const capturedAt = now().toISOString();
		const args = [
			commitish,
			...(pathspec.length > 0 ? ["--"] : []),
			...pathspec,
		];

		return {
			id: `show-${capturedAt}`,
			mode: "read-only",
			kind: "show",
			patch,
			context: {
				command: formatShowCommand(commitish, pathspec),
				args,
				capturedAt,
				commit: result.metadata,
				repository: {
					root: repositoryRoot,
					workingDirectory: cwd,
				},
			},
		};
	});

export const createReviewSession = ({
	argv,
	cwd,
	now,
	git,
}: DiffWorkflowInput): Effect.Effect<
	ReviewSession,
	ParseError | GitError | EmptyPatchError
> =>
	Effect.gen(function* () {
		const command = parseDiffuserCommand(argv);

		switch (command.kind) {
			case "diff":
				return yield* createDiffSessionFromCommand({ command, cwd, now, git });
			case "show":
				return yield* createShowSessionFromCommand({ command, cwd, now, git });
			default:
				return yield* new ParseError({
					message: "Expected diffuser diff or show arguments.",
				});
		}
	});

export const createDiffReviewSession = ({
	argv,
	cwd,
	now,
	git,
}: DiffWorkflowInput): Effect.Effect<
	ReviewSession,
	ParseError | GitError | EmptyPatchError
> =>
	Effect.gen(function* () {
		const command = parseDiffuserCommand(argv);

		if (command.kind !== "diff") {
			return yield* new ParseError({
				message: "Expected diffuser diff arguments.",
			});
		}

		return yield* createDiffSessionFromCommand({ command, cwd, now, git });
	});
