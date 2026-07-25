# JLib

A small userscript toolkit — `@require`-able, no build step, no bundler.
Plain global-namespace scripts, same as Tampermonkey expects.

## Layout

```
core/       services.js, elements.js — foundational, non-visual pieces
            (DOM, storage, cache, notifications, the color/font/radius/
            shadow/border provider family, localization, module/theme/
            script registration) and reusable visual primitives
            (buttons, rows, modal, tabs, search)
modules/    settings-panel.js, notification-center.js — full features,
            each one file
Examples/   working userscripts covering standalone mode, dashboard
            mode, cross-tab cache sync, and localization
```

For the reasoning behind how this is built — the rules every part of it
follows and what each internal piece actually is — see
[REFERENCE.md](REFERENCE.md). For how the project's scope evolved (what
shipped, what grew, what was cut, what might come later) see
[SCOPE.md](SCOPE.md).

## Install

`@require` in order — `core/` first, then whichever `modules/` you want,
pinned to a tag once one exists.

```
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/core/services.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/core/elements.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/modules/settings-panel.js
```

Then, before anything else, register your script:

```js
JLib.registerScript({ namespace: 'myScript' });
```

This is required — not optional. Settings Panel instances, `JLib.cache`,
and anything else namespace-scoped will refuse to operate (with a
`console.warn` explaining why) until a script has registered. Nothing in
JLib invents a namespace on your behalf.

## How it works

Modules self-register — call `JLib.registerModule(moduleDef)` any time
before render, whether that module arrived via `@require` or was written
inline in your own userscript. Registration *is* existence throughout
this whole library — the same rule applies to modules, themes,
dictionaries, and scripts themselves.

Call `JLib.scheduleRender()` once, at the end of your script — it defers
to a microtask so it runs after every `@require` and your own code has
executed, meaning module count is exact by the time it fires:

- **1 module registered** → a single shell, no menu, no cog. If it's
  Settings Panel, its `full` variant mounts — Panel Settings and About
  both live inline as tabs alongside the userscript's own settings.
- **2+ modules registered** → a menu-style dashboard shell: pick a module
  to open it full-screen with a "Back to Dashboard" control. Settings
  Panel, if registered, opens its `lite` variant here — userscript
  settings only. Cog next to the close button opens a *different*,
  unregistered settings module (theme/position/shortcut/backup/about)
  that never counts toward module count — two separate surfaces, reached
  two different ways.

Settings Panel features support an optional `keywords: [...]` array
(folded into search matching alongside label/description) and an
`'info'` feature type (a summary line plus an optional "More Info"
drill-in) — used internally for every About entry, but available to any
feature in any category.

## The provider family

Sample the environment, get back a validated, ready-to-use answer,
instead of hand-writing CSS per site. Every provider is a shortcut, not
a requirement — none of this stops you from writing your own CSS where
you'd rather:

- `colorProvider` — a real palette engine (OKLCH color math, anchor-
  relative sampling, CSS-custom-property detection, WCAG-correct
  contrast). `JLib.theme` consumes it for the panel chrome; call
  `colorProvider.getPalette(el)` directly for anything else you're
  building that should visually belong to the page it's on.
- `fontProvider` / `fontProvider.layout` — font-family detection plus a
  real shrink → wrap → truncate text-fitting system.
- `radiusProvider` / `shadowProvider` / `borderProvider` — the same
  sample-then-fallback shape, one structural property each.
- `superProvider.css` — resolves all of the above at once:
  `resolve()`, `apply()`, `reveal()`, `transition()`, `fitText()`.

## Localization

`JLib.i18n` — register a dictionary (English already is one, by
default), and Settings Panel's language dropdown picks it up
automatically, alphabetized by each dictionary's own name for itself.
Dictionary conflicts (two both claiming default) deny both and fall
back to English, rather than resolving by `@require` load order.

## Storage

Userscript settings and dashboard chrome settings (theme, position,
etc.) both stay on GM storage — they need true cross-site reach (the
same setting following you from one site to another), which is
something only GM storage actually provides.

Everything else — arbitrary cached or derived data that doesn't need
that cross-site reach — lives in `JLib.cache`, backed by IndexedDB. On
top of IndexedDB, `JLib.cache` keeps a synchronous, in-memory layer:
once a key's been read once, every read after that is an instant
in-memory lookup, not a fresh IndexedDB transaction. Writes update that
in-memory copy immediately and are debounced/deduped before actually
hitting IndexedDB, so rapid repeated writes to the same key collapse
into one real disk write instead of many. Changes also sync live across
open tabs of the same script via `BroadcastChannel`, with a per-key
logical clock resolving anything that arrives out of order.

## License

MIT — see [LICENSE](LICENSE).
