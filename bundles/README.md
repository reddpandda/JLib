# JLib bundles

> Verified against commit `3c8011f` (2026-08-01) — if `src/*/.order.json`
> or `bundles/build.js` have moved since, treat the require list below
> as unconfirmed and regenerate it from `.order.json` directly.

These are the files a userscript actually `@require`s. Everything here is
generated from `../src/` by `build.js` — don't hand-edit anything in this
folder, edit the source and rebuild instead (`node build.js`).

The order below isn't arbitrary — it's the dependency order confirmed
correct by actually loading and executing every file in a real (simulated-
browser) test, not just syntax-checked. A couple of ordering assumptions
that looked reasonable on paper turned out to be wrong once actually run
(`console.js` needs `utils.js` loaded first; `theme.js`'s built-in themes
need every structural provider loaded first) — this order reflects what
was actually verified to work, not a guess.

## Minimum — 5 lines, what most scripts want

```
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/registration-console.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/providers.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/services.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/elements.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/modules/settings-panel.js
```

Add any other module individually as needed, e.g.:

```
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/bundles/modules/notification-center.js
```

Then, before anything else, register your script:

```js
JLib.registerScript({ namespace: 'yourScriptName' });
```

## Maximum — every individual source file

For testing, development, or if you only want specific pieces rather than
a whole bundle. This is also exactly what this project's own test/example
userscripts `@require` directly while iterating, rather than rebuilding
bundles on every change.

The order is never hand-duplicated here — `.order.json` inside each
`src/` subfolder (`services/`, `providers/`, `elements/`, and each
`modules/<name>/` folder) is the one real source of truth, the same file
`build.js` itself reads. A list copy-pasted into this README would only
be accurate the moment it was written and silently drift the next time a
file gets added or reordered — which is exactly what happened to the
previous version of this section. If you're wiring up the unbundled
form, read the actual order straight from each folder's `.order.json`
rather than trusting any prose list, including this one.

Current real order, for reference (regenerate this block from
`.order.json` rather than hand-editing it if it ever looks wrong):

```
// @require .../src/services/utils.js
// @require .../src/services/heuristics.js
// @require .../src/services/anchor-cache.js
// @require .../src/services/console.js
// @require .../src/services/registration.js
// @require .../src/providers/color-provider.js
// @require .../src/providers/radius-provider.js
// @require .../src/providers/shadow-provider.js
// @require .../src/providers/border-provider.js
// @require .../src/providers/font-provider.js
// @require .../src/providers/super-provider.js
// @require .../src/services/dom.js
// @require .../src/services/events.js
// @require .../src/services/dedupe.js
// @require .../src/services/triggers.js
// @require .../src/services/storage.js
// @require .../src/services/theme.js
// @require .../src/services/i18n.js
// @require .../src/services/notifications.js
// @require .../src/services/module-lifecycle.js
// @require .../src/services/cache.js
// @require .../src/elements/discovery.js
// @require .../src/elements/button.js
// @require .../src/elements/modal.js
// @require .../src/elements/inputs.js
// @require .../src/elements/tabs.js
// @require .../src/elements/search-input.js
// @require .../src/modules/settings-panel/validator.js
// @require .../src/modules/settings-panel/schema-dispatch.js
// @require .../src/modules/settings-panel/navigation.js
// @require .../src/modules/settings-panel/chrome-config.js
// @require .../src/modules/notification-center.js
```

Each line's real prefix is `https://raw.githubusercontent.com/reddpandda/JLib/main/`
— omitted above for width. Whatever order suits how you're working is
fine to experiment with, but this specific order is the one actually
proven to load and execute correctly (see `build.js`'s own comment on
the `console.js`/`utils.js` and `theme.js`/providers ordering bugs this
caught) — deviate from it and you're on your own for figuring out why
something's undefined.

## Staleness check — `.version.json`

Every `node build.js` run writes `bundles/.version.json`: a
`sourceHash` (SHA-256 over every generated bundle/module file's actual
bytes — not raw `src/`, so an `.order.json` reordering with zero file
content changes still moves the hash), a `lastBuilt` timestamp, and
`builtFrom` (the git commit SHA at build time, when available). Nothing
enforces a rebuild after a source edit — this file exists so "are the
committed bundles still what `src/` would currently produce" is a
question you can actually check instead of trusting memory. It's
generated, not hand-maintained; don't edit it directly.

## What's in each bundle

| Bundle | Contents |
|---|---|
| `registration-console.js` | `utils.js`, `console.js`, `registration.js` — the one place every `registerX` function and its state lives, plus the message registry everything else warns through. |
| `providers.js` | Color, radius, shadow, border, font, and the composing `superProvider.css` — sample the page, return a validated value. |
| `services.js` | Everything else: the heuristics engine and anchor-cache invalidation providers share, DOM/event helpers, dedupe, appearance/navigation triggers, GM-storage-backed settings, theming, localization, notifications, module lifecycle, and the IndexedDB-backed cache. |
| `elements.js` | Reusable UI primitives — buttons, the modal shell, form rows, tabs, search. |
| `modules/settings-panel.js` | The full settings panel: schema dispatch, chrome config (theme/position/shortcut/backup/about), navigation (deep links, breadcrumb, history), and config validation. |
| `modules/notification-center.js` | The optional Notification Center module. |
