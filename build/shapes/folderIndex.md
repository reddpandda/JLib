---
shapeVersion: 1
appliesTo: readme/*.readme.md
requires:
  - fileColumn
  - descriptionColumn
optional:
  - subsection
---

# Shape: folder index row

One table row per real file in the source folder a `readme/*.readme.md`
document describes.

## Structure

```md
| File | What it is |
|---|---|
| `filename.js` | One or two sentences: what it is, and anything a
  reader needs to know that isn't obvious from the filename alone. |
```

## Rules checked

- Two columns only: the real filename (as `` `code` ``), and a
  description. No third column — if a row needs more structure than
  that, it's a signal the folder needs a real topic doc, not a bigger
  table.
- Every real, non-`.order.json` file in the source folder has a row.
  A file present in the folder but absent from the table is treated as
  an omission, not an intentional exclusion — there's no "internal, not
  listed" convention for folder indexes the way there is for API.md.
- A **subsection** (an H2 below the main table, itself containing
  another `File | What it is` table) is allowed for a folder with real
  internal structure worth calling out separately — `modules.readme.md`
  ↔ `settings-panel/`'s four files is the current example. Optional,
  not every readme needs one.
- No anchors, no back-links — folder indexes are short enough that the
  table-then-details navigation pattern used elsewhere isn't needed.
