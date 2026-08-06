---
shapeVersion: 1
appliesTo: docs/API.md
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

# Shape: function entry

One entry per callable `JLib.*` function, inside API.md's `Reference`
section. Every H3 namespace group shares a single `<dl>`; each function
is one `<dt>`/`<dd>` pair inside it.

## Structure

```html
<dt><a id="ref-x"></a><code>JLib.thing(arg)</code> → <code>type</code></dt>
<dd>

Description prose. `Returns:` info can live in the heading itself
(as above) or as the first line of prose — pick one and stay
consistent within a section.

<details>
<summary>Examples</summary>

**Example:** ...

</details>

[↑ Back to table](#row-ref-x)

</dd>
```

## Rules checked

- `<dt>` contains the real, current call signature as `<code>`, and an
  `<a id="ref-...">` anchor — the target every Function Index row's ↓
  link points at.
- `<dd>` has a blank line immediately after its opening tag and before
  its closing tag — without it, GitHub renders the contents as literal
  text instead of parsing them as markdown.
- If a `<details>` block is present, same blank-line rule applies right
  after `<summary>`.
- Every entry ends with a `[↑ Back to table](#row-ref-...)` link, and
  that `row-ref-...` id must exist as a real anchor in the Function
  Index table — checked both directions (every `ref-` anchor has a
  matching Function Index row, every `row-ref-` anchor has a matching
  entry).
- Examples are uncapped — zero, one, or several, sized to how much real
  distinct usage the function has. Never padded to hit a count.
