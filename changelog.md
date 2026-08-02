# Changelog

> Verified against commit `3c8011f` (2026-08-01) — if `src/` has moved
> since, treat entries above the last one as unconfirmed.

## Pass B — full read, remaining docs filled in

- **Fixed:** `JLIB_ABOUT` (the real, end-user-facing About panel text
  in `chrome-config.js`) still described the pre-v3.0.0 "core/modules"
  split. Updated to name the real `services`/`providers`/`elements`/
  `modules` structure.
- **Fixed:** both CSP-vulnerable raw `document.head` `<style>` tag
  injections found this pass — `module-lifecycle.js`'s `DASHBOARD_CSS`
  and `chrome-config.js`'s `PANEL_CSS`. Both now go through
  `JLib.shadow.adoptStylesheet()` with a real constructable
  `CSSStyleSheet`, the same CSP-exempt mechanism every other piece of
  JLib's own chrome (`button.js`, `inputs.js`, `tabs.js`,
  `search-input.js`) already used — these two were the only holdouts
  still using the vulnerable pattern.
- **Completed:** `Reference.md`'s glossary, and the four subfolder
  `README.md` placeholders (`theme.js`, `cache.js`, `color-provider.js`,
  all of `settings-panel/`) — every file in `src/` has now been read in
  full at least once.

## Housekeeping pass — namespace guard fix, stale references, bundle docs

Not a version bump — a cleanup pass ahead of a documentation freeze, not
new functionality.

- **Fixed:** `module-lifecycle.js` was missing its namespace guard
  (`var JLib = typeof JLib !== 'undefined' ? JLib : {};`) on the
  `moduleBase` section — the one file in the whole codebase where a
  first-loaded require would have thrown instead of degrading. Guard
  added at the top of the file; the redundant second guard further down
  the same file removed.
- **Fixed:** a handful of comments still named `dom-toolkit.js`,
  `settings-schema.js`, and other pre-rewrite provenance (`dom.js`,
  `events.js`, `notifications.js`, `module-lifecycle.js`) — that history
  is already in the v3.0.0/v4.0.0 entries below, so it didn't need to
  live in source comments too. `border-provider.js` also had a stale
  reference to `_jlibSampleStructuralValue`, an old internal name for
  what's now the public `JLib.utils.sampleStructuralValue`.
- **Fixed:** `bundles/README.md`'s hand-written "every individual file"
  `@require` list had drifted from reality — `heuristics.js`,
  `anchor-cache.js`, and `triggers.js` all exist in
  `src/services/.order.json` and ship in the real `services.js` bundle,
  but weren't in the README's list at all. Following the old list
  literally would have `@require`d providers before the `anchorCache`
  they depend on. Section rewritten to say plainly that `.order.json`
  is the real source of truth, not a prose list.
- **Documented:** `bundles/.version.json` (sourceHash/lastBuilt/builtFrom,
  written by `build.js` on every run) wasn't mentioned anywhere in
  `bundles/README.md` despite already existing and doing real work —
  added a section explaining what it's for.

## Development phase complete

Everything below this note is the initial build-out — new systems,
architecture passes, full rewrites. Entries from here forward are
bug-fix-in-real-use and polish passes instead: this codebase now has a
real toolset (settings/dashboard, notifications, a full color/font/
structure provider family, localization, cross-tab-aware storage) built
against the scope laid out in [SCOPE.md](SCOPE.md) and the rules laid
out in [REFERENCE.md](REFERENCE.md).

## v4.0.0 — providers, localization, cross-tab storage, mandatory registration

Breaking. `JLib.registerScript({ namespace })` must now be called before
anything namespace-scoped will operate — Settings Panel instances,
`JLib.cache`. A script that doesn't register gets a `console.warn` and a
refusal, not a silent default. See `REFERENCE.md` — "registration is
existence" now applies to the userscript itself, not just modules.

**New — provider family**

- `colorProvider`: rebuilt on vendored OKLCH color math (perceptually
  uniform, replacing the old HSL-based contrast nudging). Anchor-relative
  sampling (`getPalette(el)`) alongside the existing whole-page
  `getGlobalPalette()`. CSS custom-property detection before falling
  back to visual sampling. A seed-hue confidence spectrum — confirm the
  site's real accent, blend, or override outright, scaled continuously
  by how far off-hue the sample is, not a binary yes/no. Two-tier caching
  (per-hostname global, `WeakRef`-tracked per-anchor local) with a
  single shared, subtree-aware `MutationObserver`. `invalidate()` /
  `invalidateAll()`, `preview()` for debugging.
- `fontProvider`: font-family detection only, always-length-3 ranked
  list (real detected fonts padded with JLib's own authored font as the
  guaranteed final slot).
- `fontProvider.layout`: real text-fitting — fixed shrink → wrap →
  truncate (binary-search truncation, not char-by-char), a too-small-
  for-even-an-ellipsis floor that warns instead of looping.
- `radiusProvider` / `shadowProvider` / `borderProvider`: same
  sample-then-fallback shape as `colorProvider`, "must provide" —
  never return empty.
- `superProvider.css`: composition facade over all five —
  `resolve()`/`apply()`/`reveal()`/`transition()`/`fitText()`.
- `JLib.dedupe`: general request/task deduplication. Fixed a real bug in
  `superProvider.css` — it was independently re-resolving the same
  anchor boundary once per mini-provider called, instead of once.
- Shared animation clock: one `requestAnimationFrame` loop drives every
  transitioning property together (fixes cross-property desync that two
  independently-timed CSS transitions can't guarantee). Ambient
  (near-linear, tuned to stay under peripheral notice) and salient
  (short, punchy) presets, duration scaled by real perceptual color
  distance rather than a fixed constant.

**New — localization**

- `JLib.i18n`: registration-based, two-tier dictionary lookup. A bare
  string is the default key (`"Save"`); an explicitly qualified variant
  (`"Save (verb)"`) only where English itself would already phrase
  something differently by role — no tagging system, no forced
  classification of every string.
- English registers as a normal dictionary, not a hardcoded special case
  — the only difference is it registers first.
- Default-status conflicts (two dictionaries both claiming default) deny
  *both* and fall back to English — never resolved by `@require` load
  order.
- Settings Panel language dropdown: every registered dictionary,
  alphabetized by its own self-declared name, "Default" pinned to the
  top and translated through whichever dictionary is currently active.

**New — storage**

- `JLib.cache`: non-settings persistent storage. IndexedDB as the sole
  physical backend (chosen after verifying Tampermonkey's real, current
  failure modes — extension-messaging overflow around 23MB, key-volume
  failure at 100k+ keys — are specific to the GM-storage pipeline, which
  this never touches). In-memory layer on top for synchronous-feeling
  reads, hybrid eager/lazy loading gated by measured size. Debounced
  writes. `BroadcastChannel` cross-tab sync with a per-key logical clock
  resolving out-of-order message arrival. Startup and bfcache-resume
  reconciliation (`pageshow`/`event.persisted`, verified to be the real
  restoration signal — `visibilitychange` is not the same event and
  doesn't reliably fire for this case). Settings remain on GM storage,
  unchanged — this is specifically for everything that isn't a
  userscript's own settings.
- `JLib.composeNamespace()`: sub-identities (a Settings Panel instance,
  a cache key) supply only their local piece; JLib composes it against
  the registered script namespace. Validated against the one confirmed
  Web Locks platform restriction (names starting with `-` are reserved).

**New — Settings Panel**

- Deep linking (`buildLink`/`parseLink`/`openLink`/`navigateTo`) and a
  breadcrumb.
- A real Back button — restores a full prior view snapshot (expanded
  categories, scroll position), not just a tree-parent jump.
- Tokenized "smart-enough" search (stop-words, diacritic folding, tiered
  exact/prefix/substring scoring, length-scaled fuzzy tolerance) with an
  optional per-feature `keywords: [...]` array folded into matching.
- New `'info'` feature type (summary + optional "More Info" drill-in),
  used for every About entry, available to any feature in any category.
- Chrome settings (theme/position/shortcut/backup/about) are now real
  schema features rendered through the same dispatch path as any
  userscript's own settings — no more bespoke hand-built chrome UI.

**Fixed**

- Notification's `modal` presenter, dashboard menu items, the back
  button, and the cog button now go through `JLib.elements.modal` /
  `JLib.elements.button` instead of hand-rolled DOM.
- Toast presenter now uses anchored (not global) palette sampling and
  `superProvider.css.reveal()` — a toast lives in one screen corner, not
  spread across the page, so it should theme itself locally.
- Notification history now persists across a page reload via
  `JLib.cache` — previously session-only.
- Real overflow protection (`fontProvider.layout`) on the two genuinely
  fixed-width, single-line zones that needed it: the sidebar tab list
  and the modal title. Row labels/descriptions were checked and found to
  already wrap correctly by default — deliberately left alone rather
  than forced through fitting logic that would have made them worse.

---

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
