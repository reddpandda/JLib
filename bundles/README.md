# JLib bundles

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
a whole bundle. Same dependency order as above, just unbundled — this is
also exactly what this project's own test/example userscripts `@require`
directly while iterating, rather than rebuilding bundles on every change.

```
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/utils.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/console.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/registration.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/color-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/radius-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/shadow-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/border-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/font-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/providers/super-provider.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/dom.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/events.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/dedupe.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/storage.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/theme.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/i18n.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/notifications.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/module-lifecycle.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/services/cache.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/discovery.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/button.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/modal.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/inputs.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/tabs.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/elements/search-input.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/modules/settings-panel/validator.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/modules/settings-panel/schema-dispatch.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/modules/settings-panel/navigation.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/modules/settings-panel/chrome-config.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/src/modules/notification-center.js
```

That's 29 lines (28 required + 1 optional module shown). Whatever order
suits how you're working is fine to experiment with, but this specific
order is the one actually proven to load and execute correctly — deviate
from it and you're on your own for figuring out why something's undefined.

## What's in each bundle

| Bundle | Contents |
|---|---|
| `registration-console.js` | `utils.js`, `console.js`, `registration.js` — the one place every `registerX` function and its state lives, plus the message registry everything else warns through. |
| `providers.js` | Color, radius, shadow, border, font, and the composing `superProvider.css` — sample the page, return a validated value. |
| `services.js` | Everything else: DOM/event helpers, dedupe, GM-storage-backed settings, theming, localization, notifications, module lifecycle, and the IndexedDB-backed cache. |
| `elements.js` | Reusable UI primitives — buttons, the modal shell, form rows, tabs, search. |
| `modules/settings-panel.js` | The full settings panel: schema dispatch, chrome config (theme/position/shortcut/backup/about), navigation (deep links, breadcrumb, history), and config validation. |
| `modules/notification-center.js` | The optional Notification Center module. |
