---
shapeVersion: 1
appliesTo: docs/API.md
usesShape: functionEntry
---

# Template: API.md

Document-level structure the builder validates `docs/API.md` against,
on top of `functionEntry`'s per-entry checks. This is a structural
definition, not literal text the builder assembles the file from — the
real file stays one continuous, hand-edited document.

## Required skeleton, in order

1. H1 title.
2. Stamp block (`Verified against...` + `Links to:`).
3. Staleness-disclaimer prose — this file is explicitly the most likely
   in the doc set to drift from real source; that warning must remain
   present, not just implied.
4. `## Function Index` — one table, columns `Function | | Where from |
   Definition`, one row per function, in the same order the Reference
   section below presents them.
5. `## Reference` — one H3 per `src/` file/folder, in file order. Each
   H3's functions live in one shared `<dl>`, each function a real
   `functionEntry`-shaped `<dt>`/`<dd>` pair.
6. Closing note pointing to Architecture.md/Glossary.md for anything
   not found here.

## Validated cross-checks

- Every Function Index row's function name and every `functionEntry`'s
  `<dt>` signature match — same function, same signature, both places.
- Function Index row count equals `functionEntry` count exactly — no
  function documented in one place and not the other.
- H3 order in Reference matches Function Index row grouping order.
