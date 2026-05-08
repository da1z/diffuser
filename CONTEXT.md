# Diff Review

Diffuser turns Git changes into browser-based review experiences while preserving Git's familiar review concepts.

## Language

**Review Session**:
An immutable, read-only browser review of Git changes captured at launch time.
_Avoid_: Live diff, watcher, realtime review

**Git-shaped Arguments**:
Command arguments that keep Git's existing revision, option, and pathspec syntax.
_Avoid_: Diffuser range syntax, custom path filters

**Commit Review**:
A **Review Session** for the patch and metadata of a single commit-ish object.
_Avoid_: Blob view, arbitrary object browser

**Local Review UI**:
A localhost browser interface opened for a **Review Session**.
_Avoid_: Static terminal output, hosted review

**Review Header**:
The visible summary of the command and repository context for a **Review Session**.
_Avoid_: Hidden session metadata

**One-shot Server**:
A localhost-only server whose lifetime is tied to one Diffuser CLI invocation.
_Avoid_: Daemon, shared background service

**Session Endpoint**:
A read-only local route that returns the captured **Review Session**.
_Avoid_: Embedded patch payload, persisted session store

**Workflow Runtime**:
The Effect-based orchestration for CLI parsing, Git execution, errors, and server lifetime.
_Avoid_: Ad hoc async scripting

**Diffuser Command**:
The installed `diffuser` CLI entrypoint that creates browser-based review sessions.
_Avoid_: Dev-only script

**Source-based Distribution**:
A v1 packaging approach where the installed command runs the Bun TypeScript source directly.
_Avoid_: Bundled artifact, publish-ready package

**Workflow Tests**:
Tests for CLI parsing, Git result handling, and **Review Session** construction.
_Avoid_: Browser automation tests

**Patch**:
The unified diff content captured for review.
_Avoid_: Raw terminal output

**Review Context**:
Metadata that identifies what Git change was captured for review.
_Avoid_: UI state, renderer state

**Repository Context**:
The Git repository root and original working directory that shaped the captured review.
_Avoid_: App install path, server asset path

**Continuous Diff View**:
A single scrolling presentation of the entire **Patch**.
_Avoid_: File-first navigation, split file browser

**Side-by-side Diff**:
A two-column rendering that compares removed and added lines across the **Patch**.
_Avoid_: Unified-only view, layout toggle

**Highlighted Diff**:
A **Patch** rendering with syntax highlighting for changed files.
_Avoid_: Plain text diff

**Basic Review UI**:
A minimal **Local Review UI** that relies on the diff renderer's default presentation.
_Avoid_: Custom visual system, bespoke performance layer

## Relationships

- A **Review Session** captures one Git command result at launch time.
- A **Review Session** contains exactly one non-empty **Patch**.
- A **Review Session** contains **Review Context** such as the command, arguments, repository, and capture time.
- **Review Context** includes the **Repository Context** for the captured Git command.
- A **Review Session** does not contain comments, approvals, notes, or saved review state in v1.
- A **Commit Review** includes commit identity and authorship in its **Review Context**.
- A **Review Session** is presented through a **Local Review UI** by default.
- A **Local Review UI** includes a **Review Header**.
- A **Workflow Runtime** creates and serves each **Review Session**.
- **Workflow Tests** cover the **Workflow Runtime**, not browser interactions, in v1.
- The v1 **Local Review UI** is a **Basic Review UI**.
- The v1 **Local Review UI** presents the **Patch** as a **Continuous Diff View**.
- The v1 **Continuous Diff View** uses a **Side-by-side Diff** layout.
- The v1 **Continuous Diff View** is a **Highlighted Diff** when the renderer supports it.
- A **One-shot Server** serves exactly one **Review Session**.
- A **One-shot Server** exposes its **Review Session** through a **Session Endpoint**.
- `diffuser diff` uses **Git-shaped Arguments** to choose which changes the **Review Session** captures.
- `diffuser show` creates a **Commit Review**, defaulting to `HEAD` when no commit-ish is provided, and uses controlled Git output for patch plus metadata.
- `diffuser show` may use Git pathspecs to create a path-filtered **Commit Review** when that remains low complexity.
- The **Diffuser Command** is available as an installed CLI binary in v1.
- The v1 **Diffuser Command** uses **Source-based Distribution**.

## Example dialogue

> **Dev:** "If I edit a file after opening Diffuser, does the page update?"
> **Domain expert:** "No — the **Review Session** remains the snapshot captured when Diffuser launched."

## Flagged ambiguities

- "diff view" could mean either a live view of the working tree or an immutable **Review Session** — resolved: Diffuser starts with immutable sessions.
- "commands and params" could imply custom Diffuser syntax — resolved: Diffuser mirrors Git's argument language for `diff`, with only `--no-open` owned by Diffuser in v1.
- `--no-open` is a global option accepted before `diff` or `show`; flags after the subcommand remain **Git-shaped Arguments**.
- Bare `diffuser` prints help instead of creating a default **Review Session**.
- Mirroring Git means `diffuser diff` does not add untracked files beyond what `git diff` itself reports.
- Mirroring Git means `diffuser diff --cached` and `diffuser diff --staged` both work through Git-shaped args.
- Git errors do not create a **Review Session**; they remain terminal errors.
- "`show`" could mean Git's broad object display — resolved: Diffuser uses `show` for **Commit Review** only.
- `diffuser show` does not pass through arbitrary Git formatting options that could prevent a **Commit Review** from having a patch and metadata.
- A path-filtered **Commit Review** still shows commit metadata for the commit, while the **Patch** may be limited to selected paths.
- "launch webui" means opening a **Local Review UI** automatically by default; `--no-open` prints the URL without opening a browser.
- Diffuser v1 does not expose other local server options such as a custom port.
- Server lifecycle is tied to a **One-shot Server**, not a reusable daemon.
- The **One-shot Server** binds to `127.0.0.1`, not all network interfaces.
- The **Session Endpoint** is local and read-only; it does not imply persistence.
- An empty **Patch** does not create a **Review Session**.
- "review" means read-only inspection in v1, not commenting, approving, or saving notes.
- The **Review Header** shows the exact Diffuser command and repository context that produced the session.
- The **Basic Review UI** uses the diff renderer's default styles and performance behavior.
- The v1 UI uses a **Continuous Diff View**, not file-first navigation.
- The v1 UI uses only a **Side-by-side Diff** layout, not unified rendering or a layout toggle.
- Syntax highlighting should come from the diff renderer's built-in capabilities, not custom v1 language or theme configuration.
- Git commands run from the user's original working directory so Git-shaped pathspecs keep normal Git behavior.
- Diffuser uses Effect for the **Workflow Runtime** from the start; React remains the rendering layer for the **Local Review UI**.
- v1 defers bundling and publishing decisions until the **Diffuser Command** behavior is proven.
- v1 tests should cover CLI and session behavior without browser automation.
