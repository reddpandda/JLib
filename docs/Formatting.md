# JLib — Formatting

> Verified against `3c8011f` + Pass B (2026-08-02) — if `src/` has moved
> since, treat contents as unconfirmed.

This is the rulebook for how every `.md` file in this repo is written and
styled, established so future edits don't have to re-derive these
decisions from scratch. If a doc looks inconsistent with what's written
here, the rule wins — fix the doc, not this file, unless the rule itself
is being deliberately revised.

## The header stamp

Every doc opens with two lines directly under the H1, before any prose:

```
> Verified against commit `<sha>` (<date>) — if `src/` has moved
> since, treat contents as unconfirmed.
>
> **Links to:** TargetA ×N, TargetB ×N, ...
```

- The verified-against line already existed before this doc; unchanged.
- **Links to** is new: every other `.md` file this document links to,
  by name, with a real count of how many times. Counted mechanically
  (grep the file for markdown link syntax pointing at each target), not
  estimated — the entire point of this field is to make a rename or a
  broken-link check fast, so an inaccurate count is worse than no count
  at all. Recompute it any time links are added, removed, or a target
  file is renamed. A doc that links nowhere omits the field entirely
  rather than showing `Links to: none`.

## Heading hierarchy

Four levels, each with one job. Nothing below uses a heading for
anything outside its assigned job.

- **H1** — the document title. Exactly one, the first line of the file.
- **H2** — major sections (chapters). `Onboarding`, `Reference`,
  `Function Index` in API.md; `Core rules`, `Glossary` in
  Architecture.md.
- **H3** — namespace/file groupings within an H2 section. In API.md
  these map 1:1 to a `src/` file or folder (`Registration
  (services/registration.js)`), which is deliberate — the heading
  doubles as a pointer to where the real code lives.
- **H4** — one individual function/entry, always, and only. This is
  the level that gets an explicit `<a id="ref-...">` anchor and a row
  in a Function Index table. Never use H4 for anything that isn't
  independently indexable.

**Soft subgroups** (bold text, not a heading) are the one sanctioned
way to chunk a long H3 section without adding a fifth heading level:

```
**Palette resolution**

#### `JLib.colorProvider.getPalette(el, opts?)`

**Returns:** palette
...
```

Rules for when to use one:
- Only inside an H3 section with **8 or more H4 entries** — this is a
  hard threshold, not a judgment call, so it doesn't need re-deciding
  per section. Below 8, leave the section flat.
- No anchor, no Function Index row, no outline entry — it's purely a
  visual aid for the reader's eye and must never be treated as
  navigable structure.

## Entry separators

Every H4 entry in a Reference-style section ends with a horizontal
rule (`---`) before the next heading, once its `<details>` block (if
any) is closed. This is the one thing that reliably marks "this entry
is over" at a glance in a stack of near-identical sections — cheap,
native, renders everywhere.

## The `Returns:` line

Directly under an H4 heading, before any other prose, one bold line:

```
**Returns:** `bool`
```

Always present, always in this position, even when the heading itself
already states the return type — the point is a fixed, scannable
anchor for the eye to jump to across many entries, not new information.

## Collapsed examples

`<details><summary>Examples</summary>` wraps every example block.
GitHub requires a **blank line immediately after `<summary>`** for the
markdown inside the block to render instead of showing as raw text —
every collapsed block in this repo must follow that, and a future
manual edit that removes the blank line will silently break rendering
without an error.

Example count per entry is **not capped**. Size it to how many
genuinely distinct real-world shapes a function has — one for
something self-evident, more for something like `triggers.watch` or
`storage.createStore` that has real range. Never pad to hit a number.

**Known, accepted limitation:** a fenced code block placed inside a
`<details>` block does not visually respect the block's indent/border
in every renderer — the code block's own styling can appear to "leak"
past the collapsed region's boundary. No clean fix was found for this
across GitHub + VS Code + Typora + Obsidian simultaneously without
material added complexity; it's accepted as a small, known cosmetic
issue rather than a bug to keep chasing.

## Tables

- Use a table when comparing the same 2–4 attributes across many rows
  (a file index, a function index). Use a bolded/prose list instead
  when entries have meaningfully different shapes from each other —
  forcing uneven content into table cells reads worse than a list.
- **Alignment:** left-align text columns (the default; no `:` markup
  needed). Right-align only genuinely numeric columns
  (`---:`). Center-align (`:---:`) only for short, fixed-width status
  markers (a single word, a checkmark, a version number) — never for
  prose, since centered paragraph text is harder to read than
  left-aligned.
- Keep a header row on every table, even a two-column one — an
  unlabeled table forces the reader to infer what each column means.

## Color and emphasis on GitHub

`style=` and `<style>` are stripped by GitHub's renderer — nothing
below relies on either working there. In order of preference for
GitHub-native emphasis:

1. **GFM alert callouts** — `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
   `[!WARNING]`, `[!CAUTION]`. Five real colors, real icons, no HTML.
   Use for anything a reader should not skim past — the API.md
   staleness warning is the canonical example.
2. **A `diff` fenced code block** (` ```diff `, lines prefixed `+`/`-`)
   when something is genuinely being shown as an addition/removal or a
   before/after — renders in real green/red across GitHub and most
   local viewers. Don't repurpose this for arbitrary coloring; it's a
   diff renderer, not a paint tool.
3. Plain **bold** for everything else that needs emphasis but isn't
   urgent enough for a callout.

Images are out of scope except in a genuinely limited capacity
(a small icon, a shields.io badge) — never as a substitute for colored
or styled text, since an image can't be copied, searched, grepped, or
reflowed, and won't adapt to the reader's light/dark theme.

## The embedded stylesheet

**Note (Pass A): this section describes an earlier per-file, top-of-file
live `<style>` block design that has since been superseded — the
footer note/style injection is now a builder responsibility (see
`build/shapes/`), not something hand-authored per file. Left in place
as historical rationale rather than rewritten in this pass; treat the
specific mechanics below as stale until the builder's real footer
shape formally replaces it.**

For local previewers that *do* respect embedded CSS (VS Code, Typora,
Obsidian) — GitHub's own web view ignores this entirely; that's a
platform limitation, not a bug in the block below. Every `.md` file in
this repo embeds the same block, directly under the H1, so the result
is consistent regardless of which file someone opens first.

Since GitHub was never going to render any of this anyway, the block
is a genuine enrichment rather than a minimal compatibility patch: a
real accent color, tinted code/table backgrounds, rounded corners on
`pre`/`details`, zebra-striped tables, and a hover state on links. All
of it routes through four CSS custom properties defined once in
`:root` and swapped for dark-mode-appropriate values inside a single
`prefers-color-scheme: dark` media query — so the color is real, but it
still adapts to the reader's theme instead of fighting it. Deliberately
uses only plain tag selectors (`h1`, `p`, `table`, `pre`, ...) — never a
class name — since VS Code/Typora/Obsidian each wrap rendered markdown
in their own container with their own class names that can't be
targeted reliably:

```html
<style>
:root {
  --jlib-accent: #6c5ce7;
  --jlib-accent-soft: #6c5ce71a;
  --jlib-code-bg: #00000008;
  --jlib-border: #00000022;
}
@media (prefers-color-scheme: dark) {
  :root {
    --jlib-accent: #a29bfe;
    --jlib-accent-soft: #a29bfe26;
    --jlib-code-bg: #ffffff10;
    --jlib-border: #ffffff22;
  }
}
body { max-width: 820px; margin: 0 auto; padding: 0 1.5em 4em;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
  Arial, sans-serif; line-height: 1.7; }
h1, h2, h3, h4 { margin-top: 1.8em; margin-bottom: 0.6em; line-height: 1.3; }
h1 { font-size: 1.9em; color: var(--jlib-accent);
  border-bottom: 2px solid var(--jlib-accent); padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid var(--jlib-accent-soft);
  padding-bottom: 0.25em; }
h3 { font-size: 1.2em; border-left: 3px solid var(--jlib-accent-soft);
  padding-left: 0.6em; }
h4 { font-size: 1.05em; opacity: 0.9; }
p, li { line-height: 1.7; }
a { color: var(--jlib-accent); text-decoration: none;
  border-bottom: 1px solid var(--jlib-accent-soft); }
a:hover { border-bottom-color: var(--jlib-accent); }
code { font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em; background: var(--jlib-code-bg); padding: 0.15em 0.4em;
  border-radius: 4px; }
pre { background: var(--jlib-code-bg); border: 1px solid var(--jlib-border);
  border-radius: 8px; padding: 1em; }
pre code { background: none; padding: 0; line-height: 1.5; }
table { border-collapse: collapse; margin: 1em 0; width: 100%; }
th { background: var(--jlib-accent-soft); }
th, td { border: 1px solid var(--jlib-border); padding: 0.5em 0.8em; text-align: left; }
tr:nth-child(even) td { background: var(--jlib-code-bg); }
blockquote { border-left: 3px solid var(--jlib-accent);
  background: var(--jlib-accent-soft); padding: 0.6em 1em; margin-left: 0;
  border-radius:  0 6px 6px 0; }
details { margin: 0.8em 0; border: 1px solid var(--jlib-border);
  border-radius: 6px; padding: 0.6em 1em; }
summary { cursor: pointer; font-weight: 600; color: var(--jlib-accent); }
hr { border: none; border-top: 2px solid var(--jlib-accent-soft); margin: 2.5em 0; }
</style>
```

Why not a shared, linked external stylesheet instead of duplicating
this block in every file: a `<link rel="stylesheet">` from inside
rendered markdown is not confirmed to resolve reliably in every target
viewer (Obsidian in particular has its own CSS-snippet system with
uncertain handling of an arbitrary in-content `<link>` tag). Embedding
directly costs some duplication but removes that one uncertain
dependency — every file works the same way regardless of which local
viewer opens it, with no external file that could go missing.

The accent hue (`#6c5ce7` / `#a29bfe` dark) is not meaningful beyond
"a single consistent color across the whole doc set" — swap both hex
pairs in the `:root` block and its dark override to re-theme every
file at once, since they all share this exact block verbatim.
