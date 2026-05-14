# Browser-local comment persistence

Diffuser will keep **Draft Review Comments** in browser-local storage across launches, keyed by **Repository Context** and a **Patch Fingerprint** derived from the complete captured **Patch** text. This keeps large-diff review notes resilient to reloads and server restarts while preserving the boundary that comments belong to the **Local Review UI**, not to immutable **Review Sessions**.

The trade-off is deliberate: persistence is always on and may store sensitive reviewer notes in the browser, but copied, discarded, and cleared comments are removed from storage so local persistence behaves as a mirror of current submitted draft comment state rather than as an archive or collaboration layer.
