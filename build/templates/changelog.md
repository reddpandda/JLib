---
shapeVersion: 1
appliesTo: docs/changelog.md
usesShape: changelogItem
---

# Template: changelog.md

## Required skeleton, in order

1. H1 title (`# Changelog`, not `# JLib — Changelog` — this is the one
   doc that drops the `JLib — ` prefix, since it's a universally
   understood document type on its own).
2. Stamp block.
3. A sequence of H2-grouped sections, each a real version number or a
   dated/named pass, each containing `changelogItem`-shaped bullets —
   see `changelogItem` for the grouping/ordering rules.
4. Optionally, a "Development phase complete" divider marking where
   initial build-out entries end and maintenance-mode entries begin —
   present if the project has reached that point, omitted if not.

## Validated cross-checks

None beyond `changelogItem`'s own per-bullet and per-section rules.
