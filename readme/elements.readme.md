# src/elements/

> Verified against commit `3c8011f` (2026-08-01) — if this folder has
> moved since, treat contents as unconfirmed.
>
> **Links to:** Architecture.md ×1

Reusable visual primitives. Order: see `.order.json`. Deep explanation:
see [../../Architecture.md](../../Architecture.md).

All of these share one styling pattern worth naming once instead of
repeating per row: a single constructable `CSSStyleSheet`, parsed once,
adopted into whichever real root (page light DOM, or JLib's own shared
shadow root) the element actually ends up connected to — resolved via
`discovery.js` the instant that connection happens, since the real
destination genuinely doesn't exist yet at creation time.

| File | What it is |
|---|---|
| `discovery.js` | The mechanism every other file here routes through instead of guessing at creation time where an element will end up — watches for the instant it actually connects, then resolves style adoption from there. Loaded first within this folder. |
| `button.js` | Plain button, no row/label wrapper — split out of `inputs.js` since it's used standalone (toolbar actions, cog controls, dismiss buttons) more often than as part of a settings row. |
| `modal.js` | Native `<dialog>` + `showModal()`, styled directly as the real panel — no invisible wrapper div. Real native top-layer promotion, `::backdrop`, and focus-trap instead of hand-built equivalents; one deliberate override (looping Tab-cycle instead of escaping to browser chrome). |
| `inputs.js` | Toggle, dropdown, number, and text row builders. `actionRow()` here delegates to `button.js`. |
| `tabs.js` | Generic vertical nav list. Always receives an already-connected container from its caller, so — unlike the others above — there's no pending-connection wait; stylesheet adoption happens synchronously. |
| `search-input.js` | Tokenized fuzzy search — stop-word filtering, diacritic folding, tiered exact/prefix/substring scoring, length-scaled edit-distance tolerance. Deliberately no stemming (collides with i18n) or phonetic matching (wrong tool for short UI labels). `inputField()` adds a debounced text-input UI over the matching engine. |
