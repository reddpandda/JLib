# AGENTS.md — JLib docs branch

This branch is edited source. A GitHub Action builds it and commits
output to `main`. **Never edit `main` directly, under any
circumstance** — a future push here silently overwrites anything
hand-edited there.

- Prose/structure rules: see `docs/Formatting.md` — don't restate them
  here, read that file.
- Structural validation rules: see `build/shapes/*.md`.
- Doc-id → path resolution: see `build/manifest.json`.
- Every `<details>`/`<dd>` needs a blank line immediately after its
  opening tag, or GitHub renders its contents as literal text instead
  of markdown — a known, easy-to-reintroduce bug, not obvious from the
  rendered output until you check.
- Anchor `id`s get silently rewritten by GitHub's renderer
  (`user-content-` prefix) but `href`s should stay unprefixed — GitHub
  resolves the mismatch at click-time. Don't "fix" this if you notice
  it looking wrong in raw source.
- If you ever hand-edit through GitHub's web UI specifically, check
  the diff before committing — it's been known to mangle whitespace on
  paste.
