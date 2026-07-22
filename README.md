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
examples/   working userscripts showing both usage shapes
```

## Install

`@require` in order — `core/` first, then whichever `modules/` you want,
pinned to a tag once one exists (see [example-dashboard-userscript.user.js](examples/example-dashboard-userscript.user.js)
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

- **1 module registered** → a single shell, no tabs, no cog. If it's
  Settings Panel, its `full` variant mounts, with Panel Settings rendered
  as its own inline tab.
- **2+ modules registered** → a dashboard shell: tab strip to switch
  modules, cog next to the close button for whichever module exposes
  `renderChromeSettings` (Settings Panel's `lite` variant, normally).

See both shapes end to end in [examples/](examples/).

## License

MIT — see [LICENSE](LICENSE).
