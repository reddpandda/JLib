---
shapeVersion: 1
appliesTo: docs/Glossary.md
requires:
  - dt
  - dd
  - anchor
  - rowAnchor
  - backlink
blankLineAfter:
  - dd
  - details
optional:
  - details
---

# Shape: glossary entry

One entry per named internal component, inside Glossary.md's
`Components` section. All entries share a single `<dl>`.

## Structure

```html
<dt><a id="g-x"></a><code>componentName</code></dt>
<dd>

What it is, in one to a few sentences — the quick version.

<details>
<summary>How it actually works internally</summary>

The deeper mechanism, when there's real depth worth knowing. Omit
this block entirely for a component that's already fully explained by
the quick version above.

</details>

[↑ Back to table](#row-g-x)

</dd>
```

## Rules checked

- Same anchor/back-link/blank-line requirements as `functionEntry`,
  with `g-`/`row-g-` prefixes instead of `ref-`/`row-ref-`.
- Unlike a function entry, a glossary entry has no `Returns:` concept
  and never contains a runnable code example as its primary content —
  if a component's explanation needs a runnable example, it belongs in
  API.md as a real function entry instead, not here.
- The `<details>` block, when present, is for depth/mechanism, not for
  hiding basic information the reader needs to understand what the
  component is for at a glance — the quick version in `<dd>` must stand
  alone as a complete (if brief) answer.
