---
shapeVersion: 1
appliesTo: docs/Scope.md
usesShape: scopeItem
---

# Template: Scope.md

## Required skeleton, in order

1. H1 title.
2. Stamp block.
3. `## Original scope` — prose, no list required (this section
   describes the starting ask, not a set of discrete decisions).
4. `## Met` — prose or `scopeItem`-shaped bullets.
5. `## Exceeded` — `scopeItem`-shaped bullets.
6. `## Cut` — `scopeItem`-shaped bullets; every item's prose must state
   a real rejection reason (see `scopeItem`'s own rule on this).
7. `## Future` — `scopeItem`-shaped bullets, framed as possibilities,
   never as commitments or plans already underway.

## Validated cross-checks

None beyond `scopeItem`'s own per-bullet rules — sections here don't
cross-reference each other by name/count the way API.md's index and
entries do.
