# JLib

A small userscript toolkit — `@require`-able, no build step, no bundler.
Plain global-namespace scripts, same as Tampermonkey expects.

## Layout

```
core/       services.js, elements.js — foundational, non-visual pieces
            (DOM, storage, theme, notifications, module lifecycle) and
            reusable visual primitives (buttons, rows, modal, tabs, search)
modules/    settings-panel.js, notification-center.js — full features,
            each one file
Examples/   working userscripts showing both usage shapes
```

## Install

`@require` in order — `core/` first, then whichever `modules/` you want,
pinned to a tag once one exists (see [Example dashboard userscript.user.js](Examples/Example%20dashboard%20userscript.user.js)
for the full block).

```
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/core/services.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/core/elements.js
// @require https://raw.githubusercontent.com/reddpandda/JLib/main/modules/settings-panel.js
```

## How it works

Modules self-register — call `JLib.registerModule(moduleDef)` any time
before render, whether that module arrived via `@require` or was written
inline in your own userscript. Registration *is* existence; nothing
"loaded but unused" to track.

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

See both shapes end to end in [Examples/](Examples/).

## License

MIT — see [LICENSE](LICENSE).
