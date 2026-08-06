---
shapeVersion: 1
appliesTo: docs/Scope.md
requires:
  - boldSubject
  - prose
maxNestingDepth: 1
---

# Shape: scope item

One bullet per named decision, inside any of Scope.md's sections
(*Met*, *Exceeded*, *Cut*, *Future*).

## Structure

```md
- **Subject** — prose explaining the decision, in past tense for
  something that happened, present tense for something still true.
  Cross-references to other docs use real `[File.md](File.md)` links.
```

## Rules checked

- Bold subject, em-dash, prose — no other opening shape.
- Maximum one level of list nesting. A sub-bullet under a scope item is
  allowed once; a sub-bullet under that is not — if content needs a
  second level, it's a sign the item should become its own bullet or
  the section needs restructuring, not deeper nesting.
- *Cut* items in particular must include the actual reason something
  was rejected, not just that it was considered — "rejected because X"
  is required content for anything in that section, not optional
  color.
