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
- Settings Panel ships as two sibling variants (`full`/`lite`) built from
  one shared factory — `full` includes the Panel Settings tab inline,
  `lite` exposes the same UI via `renderChromeSettings` for the
  dashboard's cog instead. Render-time module count picks which one
  mounts.

**Removed**

- No more per-module owned modal/theme instances — a single shared shell
  is built once by `JLib.render()` regardless of module count.
