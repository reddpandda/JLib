# src/providers/

> Verified against `3c8011f` + Pass B (2026-08-02) — if this folder has
> moved since, treat contents as unconfirmed. Every file below has now
> been fully read.
>
> **Links to:** Architecture.md ×1, CREDITS.md ×1

Sample the environment, get back a validated, ready-to-use answer,
instead of hand-writing CSS per site. Order: see `.order.json` — note
`color-provider.js` loads first; every other provider here depends on
it for anchor resolution. Deep explanation ("providers must provide,"
the "one door" rule): see [Architecture.md]({{link:architecture}}).

| File | What it is |
|---|---|
| `color-provider.js` | The only thing in the codebase that does color math (1,671 lines, largest file). Vendored OKLCH/OKLCH↔sRGB math (see [CREDITS.md]({{link:credits}})) plus real gamut-mapping (binary search on chroma, not naive clipping — browsers don't do this themselves), optional Display-P3 output for JLib's own chrome, BM25-ranked accent discovery via `JLib.heuristics`, WCAG contrast correction, a shared `requestAnimationFrame` clock so multiple animating properties can't drift apart, and an optional async layer (`enrichWithExternalSources`, manifest/favicon/meta-tag color; `getAccentViaShortlist`, a persistent drift-revalidated cache) neither of which touches the synchronous `getPalette()` path. |
| `radius-provider.js` | Same sample-then-fallback shape as color, much smaller — border-radius off the resolved anchor boundary, falling back to an authored default. |
| `shadow-provider.js` | Same shape, scoped to `box-shadow`. Handles the case where a computed shadow value is technically non-`"none"` but visually a zero-state. |
| `border-provider.js` | Same shape, but a border's color is a real color — routed through `colorProvider`'s actual pipeline rather than carried as an opaque substring. Contrast correction against a target background is opt-in only, never automatic (no reliable way to guess the real backdrop from a standalone call). |
| `font-provider.js` | Font-family detection only — an always-length-3 ranked candidate list, padded with JLib's own authored font as the guaranteed final slot. `font-provider.js`'s `.layout` half does the actual shrink → wrap → truncate text-fitting. |
| `super-provider.js` | `superProvider` — a namespace, not a singleton. `.css` is the composition facade resolving all five mini-providers above at once (`resolve()`, `apply()`, `reveal()`, `transition()`, `fitText()`). `.a11y`/`.motion` were named during design, explicitly not built — no evidence of need yet. |
