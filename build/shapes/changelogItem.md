---
shapeVersion: 1
appliesTo: docs/changelog.md
requires:
  - boldVerb
  - prose
grouping: dated-or-versioned-H2
---

# Shape: changelog item

One bullet per change, grouped under a dated or versioned H2 heading.

## Structure

```md
- **Fixed:** prose describing what changed and, where it isn't
  obvious, why.
```

## Rules checked

- Bold **verb** (not a subject) opens the line — `Fixed:`, `Added:`,
  `Changed:`, `Removed:`, `Documented:`, `Renamed:` are the recognized
  set. This is the one place in the doc set a bold opener is a verb
  rather than a term — deliberate, since changelog entries are actions,
  not concepts.
- Every item sits under an H2 that's either a real version number
  (`## v4.0.0 — ...`) or a dated/named pass (`## Housekeeping pass —
  ...`) — no bare bullets floating outside a grouping heading.
- Newest entries at the top of the file, oldest at the bottom — reverse
  chronological, never resorted.
