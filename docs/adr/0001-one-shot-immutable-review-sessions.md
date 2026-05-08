# One-shot immutable review sessions

Diffuser launches browser-based reviews from Git commands, but each invocation captures a single immutable, read-only Review Session rather than maintaining a live watcher, reusable daemon, or collaborative review workspace. This keeps v1 aligned with Git's command-oriented model, limits local code exposure to a localhost-only one-shot server, and avoids persistence or lifecycle complexity until the core review flow is proven.
