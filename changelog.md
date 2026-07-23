# Changelog

## v3.0.0 — full rewrite

Breaking. Old `@require` paths (`src/dom-toolkit.js`, `src/settings-schema.js`,
`src/utils.js`, `src/event-delegation.js`, `src/settings-panel.js`) are gone —
anything still pointing at those breaks. New layout:

```
core/services.js
core/elements.js
modules/settings-panel.js
modules/notification-center.js
```

**New**

- Module system: `JLib.registerModule()` / `JLib.scheduleRender()`.
  Registration count decides standalone-shell vs. dashboard-shell
  automatically — see README.
- `services.js` → `notifications`: staling engine (time/interaction/
  other/default/persist), `dismissKey` + do-not-show-again, toast/banner/
  modal presenters.
- `services.js` → `theme`: palette extraction from the host page (base/
  ink/accent sampling) with real WCAG contrast-ratio correction (not a
  single-channel luminance approximation), background crossfade on every
  theme change, three-tier fallback (extracted → contrast-corrected →
  binary dark/light) if extraction finds nothing usable.
- `core/elements.js` → `search`: tokenized fuzzy search (stop-words,
  diacritic folding, tiered exact/prefix/substring scoring, length-scaled
  edit-distance tolerance).
- `modules/settings-panel.js`: deep linking (`buildLink`/`parseLink`/
  `openLink`/`navigateTo`), breadcrumb, and a Back button that restores a
  full prior view snapshot (expanded categories + scroll position), not
  just a tree-parent jump.
- Settings Panel ships as two sibling variants (`full`/`lite`) from one
  shared factory — `full` (standalone, only module registered) mixes
  Panel Settings and About inline as tabs with the userscript's own
  settings; `lite` (dashboard menu's "Settings" entry) is userscript
  settings only. The dashboard cog opens a third, separate thing: a
  shared chrome module (theme/position/shortcut/backup/about) built the
  same way any userscript's settings module would be, just never
  registered — doesn't count toward module count.
- Chrome settings (theme/position/shortcut/backup) are real schema
  features (enum/boolean/custom/action) rendered through the same
  feature-dispatch path as any userscript's own settings — no more
  bespoke hand-built chrome UI.
- New `'info'` feature type — a summary line plus an optional "More Info"
  drill-in, reusing the existing breadcrumb/back-history navigation. Used
  for every About entry; available to any feature in any category.
- Features support an optional `keywords: [...]` array, folded into
  search matching alongside label/description.

**Removed**

- No more per-module owned modal/theme instances — a single shared shell
  is built once by `JLib.render()` regardless of module count.

**Fixed (first real-world test pass)**

- Modal now locks page scroll while open and blocks scroll-chaining on
  the overlay, instead of letting the host page scroll behind it.
- Every scroll region gets consistent cross-browser scrollbar styling
  (Firefox `scrollbar-width`/`scrollbar-color`, `::-webkit-scrollbar` for
  everything else).
- Cog button is now grouped tightly with the close button instead of
  floating at the header's midpoint (`justify-content: space-between`
  with 3 loose children was the bug).
- Shell panel has a fixed height, not just `max-height` — switching tabs
  with different content lengths no longer resizes the whole panel.
- Defensive CSS reset on buttons/inputs/selects inside our chrome, so
  host-page global tag-selector rules (seen on Twitch) can't reposition
  or restyle our controls.
- Theme mode and animations-enabled are now actually restored on page
  load — previously nothing read the persisted chrome settings back into
  `theme.create()`, so a saved preference silently reset to default until
  Panel Settings happened to be opened again that session.
- Dogfooding pass: notification's `modal` presenter, dashboard menu
  items, the back button, and the cog button now all go through
  `JLib.elements.modal`/`JLib.elements.button` instead of hand-rolled
  DOM, same as everything else in the system.
- `examples/` renamed to `Examples/` to match the live repo.
