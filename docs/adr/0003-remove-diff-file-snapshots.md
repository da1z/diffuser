# Remove diff file snapshots from review sessions

Diffuser Review Sessions are patch-only again. `diffuser diff` and `diffuser show` capture the **Patch** and **Review Context** without reading full old/new file contents for renderer-only hidden context.

This keeps the **Session Endpoint** contract small and makes the **Local Review UI** render the captured **Patch** directly. Whole-file collapse, **Viewed File** state, and **Draft Review Comments** remain browser-session state layered on top of the patch-only rendering.
