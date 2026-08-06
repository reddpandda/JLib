---
shapeVersion: 1
appliesTo: readme/*.readme.md
usesShape: folderIndex
---

# Template: readme/*.readme.md (shared by all five)

One shared template, not five separate ones — every folder-index file
follows this exact skeleton regardless of which real folder it
describes.

## Required skeleton, in order

1. H1 — the real destination path this readme describes (e.g.
   `# src/elements/`), except `main.readme.md`, whose H1 is just
   `# JLib` (it describes the whole project, not one folder).
2. Stamp block.
3. One or two sentences of intro: what the folder is for, plus a
   pointer to Architecture.md for deeper reasoning. `main.readme.md`
   is the one exception with substantially more intro content (install
   instructions, the provider-family overview, etc.) — it's covering
   the whole project, not a single folder.
4. One `folderIndex`-shaped table.
5. Optionally, one H2 subsection with its own `folderIndex`-shaped
   table, for a folder with real internal structure worth separating
   (see `folderIndex`'s own rule on this).

## Validated cross-checks

None beyond `folderIndex`'s own per-row rules. `main.readme.md` is
exempt from the "one or two sentences of intro" line-count expectation
given its broader scope, but still requires the table.
