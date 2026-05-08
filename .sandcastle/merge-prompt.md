# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After resolving conflicts, run `bun run typecheck`, `bun test`, and `bun run check` to verify everything works
4. If type checking, tests, or lint checks fail, fix the issues before proceeding to the next branch

# ROADBLOCKS

If an environment/setup problem, broken tool, missing permission, or other roadblock prevents you from doing the work that should be possible, create a GitHub issue for the repository using the `gh` CLI and add the `ready-for-human` label. Include what you tried, what failed, and what human setup or decision is needed. This is for blockers outside the task itself, not normal implementation work you can fix.

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each branch that was merged, close its issue using the following command:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Here are all the issues:

{{ISSUES}}

Once you've merged everything you can, output <promise>COMPLETE</promise>.
