# JLib — docs branch

This branch is the **source** for JLib's documentation — edited here,
never edited directly on `main`. A GitHub Action builds this branch's
content and commits the real output to `main` on every push.

Broadly: `docs/` holds the actual documentation, `readme/` holds
folder-index sources that get written out to their real nested
locations on `main`, and `build/` holds the builder itself. Exact
contents of each will change over time — this file deliberately
doesn't enumerate them, so it doesn't go stale as they do.

**Don't confuse this file with `readme/main.readme.md`** — that one is
the source for the real repo's README on `main`. This file only
describes this branch, and is never copied anywhere.

Never hand-edit anything generated on `main`. If the build fails
validation, nothing reaches `main` — fix the source here and push again.
