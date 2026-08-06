---
shapeVersion: 1
appliesTo: docs/Glossary.md
usesShape: glossaryEntry
---

# Template: Glossary.md

## Required skeleton, in order

1. H1 title.
2. Stamp block.
3. One paragraph distinguishing this document from API.md (component
   picture vs. callable functions) and from Architecture.md (what
   things are vs. the rules they follow).
4. A short definition of what a "provider" means as a category — not
   itself a table row, since it names a concept, not one specific
   component.
5. `## Component Index` — one table, columns `Component | | Where from
   | Definition`, one row per component.
6. `## Components` — one shared `<dl>`, each component a real
   `glossaryEntry`-shaped `<dt>`/`<dd>` pair, same order as the index.
7. Closing note pointing to API.md and Architecture.md.

## Validated cross-checks

Same shape as `api.md`'s: index row count matches entry count, index
order matches entry order, component names match between the two
exactly.
