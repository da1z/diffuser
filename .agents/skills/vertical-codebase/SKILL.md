---
name: vertical-codebase
description: Guide agents to organize code by functionality instead of technical file type. Use when adding features, refactoring project structure, reviewing architecture, colocating related code, or deciding where components, hooks, types, utilities, tests, styles, and API code should live.
---

# Vertical Codebase

Use this skill to keep code organized around what it does, not what kind of file it is.

## Core Principle

Code that changes together should live together.

Prefer verticals such as `src/widgets/`, `src/dashboard/`, `src/auth/`, or `src/design-system/` over horizontal buckets such as `src/components/`, `src/hooks/`, `src/types/`, and `src/utils/`.

A vertical may contain components, hooks, query options, API clients, types, constants, styles, tests, fixtures, and local utilities. The grouping is based on functionality, domain language, route ownership, or product ownership.

## When Adding Code

1. Ask what user-facing or domain concept the code belongs to.
2. Look for an existing vertical with that concept.
3. If none exists, create a small vertical named after the concept.
4. Colocate all closely related implementation details inside that vertical.
5. Export only the public interface other verticals should use.

## Choosing A Vertical

Use these signals, in order:

- Route or page ownership: code for `/dashboard` starts in `src/dashboard/`.
- Domain concept: code for widgets starts in `src/widgets/`.
- Product ownership: code owned by a team or product area can form its own vertical.
- Reuse pattern: if a concept is used by multiple verticals, it may deserve its own shared vertical.
- Design system scope: generic reusable UI belongs in a design-system vertical, not a catch-all component folder.

Do not choose a location only because a file is technically a component, hook, type, or utility.

## Shared Code

Shared code should usually become a named vertical, not a dumping ground.

Good shared verticals have a clear concept and public interface, such as `design-system`, `page-filters`, `routing`, `auth`, or `analytics`.

Avoid vague buckets like:

- `utils`
- `helpers`
- `common`
- `shared`
- `types`

If a shared folder already exists, add to it only when the concept is genuinely generic. Otherwise, create or use a more specific vertical.

## Boundaries

Colocation increases cohesion, but boundaries keep coupling under control.

For each vertical:

- Keep private implementation files internal to the vertical.
- Provide a public interface through `index.ts`, package exports, or the repo's existing public API pattern.
- Import from another vertical through its public interface.
- Avoid deep imports into another vertical's private files.
- If dependency rules exist, follow them. If they do not, preserve the boundary by convention.

## Refactoring Workflow

When reorganizing existing horizontal code:

1. Pick one concept at a time.
2. Find files that change together across components, hooks, types, utilities, tests, styles, and API code.
3. Move those files into one vertical.
4. Replace scattered imports with imports from the vertical's public interface.
5. Keep the refactor narrow and behavior-preserving.
6. Run the relevant tests and type checks.

Do not reorganize the whole project just to make the tree look pure. Vertical structure should reduce cognitive load for real changes.

## Review Checklist

Use this checklist when reviewing or planning changes:

- Does the code live near the concept it implements?
- Would a maintainer know where to look if they knew the feature or domain name?
- Are related props, types, data fetching, local utilities, tests, and styles colocated?
- Is shared code named after a real concept instead of a generic bucket?
- Is the public interface clear?
- Are other verticals prevented from depending on private implementation details?
- Does the change improve cohesion without creating unnecessary churn?

## Default Recommendation

When unsure, start vertical and small. It is easier to extract a clearly named shared vertical later than to recover meaning from scattered horizontal folders.
