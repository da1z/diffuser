# Capture diff file snapshots for expandable context

Status: Superseded by [0003](0003-remove-diff-file-snapshots.md).

Diffuser will include best-effort **Diff File Snapshots** in a **Review Session** so Pierre can render expandable unchanged context in the **Continuous Diff View**. This intentionally expands the **Session Endpoint** payload beyond the **Patch**, trading larger immutable launch-time snapshots for the must-have ability to inspect hidden lines without changing the read-only, one-shot review model.

