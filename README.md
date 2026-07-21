# JLib

Personal userscript toolkit — five small, dependency-light libraries meant
to be `@require`'d directly into Tampermonkey userscripts. No build step,
no bundler, no npm package. Plain global-namespace scripts, same as
Tampermonkey expects.

Repo: https://github.com/reddpandda/JLib

## What's here

| File | Depends on | What it does |
|---|---|---|
| `dom-toolkit.js` | — | `el()`/`h()` DOM builder, `$`/`$$` selector shortcuts, `toast()` |
| `event-delegation.js` | — | `on(container, eventType, selector, handler)` — one real listener, delegated via `closest()` |
| `settings-schema.js` | — | Schema-driven `GM_setValue`/`GM_getValue` storage: per-scope keys, `parent` dependency gating, migration hook |
| `utils.js` | — | `debounce`, `throttle`, `makeLogger` |
| `settings-panel.js` | `dom-toolkit.js`, `settings-schema.js`, `utils.js` | Full importable settings UI — sidebar, categories, 6 feature types, dynamic theming that follows the host site's light/dark mode |

`settings-panel.js` is the only file with real dependencies. Everything
else is standalone — `@require` only what you actually need.

## Cut a version tag before depending on this anywhere

This repo doesn't have a tagged release yet as of writing this. Do that
first, from the repo root:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Then use `v1.0.0` in the jsDelivr URLs below. **Never leave a real script
pointed at `@main`** — jsDelivr caches tagged versions aggressively so a
pinned tag stays stable forever, but `@main` tracks whatever's on the
branch right now, so a future push here can silently break every script
requiring it, with no warning, the next time Tampermonkey re-fetches. Bump
the tag (`v1.1.0`, etc.) and update your `@require` lines deliberately
when you actually want a script to pick up a change — check
`CHANGELOG.md` first to see if anything that script depends on moved.

## Install (in a userscript)

`@require` in dependency order, pinned to a tag:

```
// @require https://cdn.jsdelivr.net/gh/reddpandda/JLib@v1.0.0/src/dom-toolkit.js
// @require https://cdn.jsdelivr.net/gh/reddpandda/JLib@v1.0.0/src/settings-schema.js
// @require https://cdn.jsdelivr.net/gh/reddpandda/JLib@v1.0.0/src/utils.js
// @require https://cdn.jsdelivr.net/gh/reddpandda/JLib@v1.0.0/src/settings-panel.js
// @require https://cdn.jsdelivr.net/gh/reddpandda/JLib@v1.0.0/src/event-delegation.js
```

Swap `v1.0.0` for whatever tag you actually cut. While actively developing
a change to one of these files and testing it in a script before tagging
a new version, `file:///PATH_TO_REPO/src/...` `@require`s (Tampermonkey
needs "Allow access to file URLs" enabled for this) or a throwaway
`@main` URL are fine — just don't leave either in a script you're relying
on day to day.

See `examples/example-userscript.user.js` for a full working script using
all five files.

## Quick reference

### `JLib.dom`
```js
const node = JLib.dom.el('div', { className: 'foo', attrs: { title: 'bar' } }, ['text', childNode]);
const item = JLib.dom.$('.selector');       // querySelector
const items = JLib.dom.$$('.selector');     // querySelectorAll -> real array
const dismiss = JLib.dom.toast('Saved!', { duration: 3000 }); // returns an early-dismiss fn
```

### `JLib.events`
```js
const off = JLib.events.on(document.body, 'click', '[data-item-id]', (e, matched) => {
  console.log('clicked', matched.dataset.itemId);
});
off(); // remove the listener
```

### `JLib.settingsSchema`
```js
const store = JLib.settingsSchema.createStore(features, {
  storageKeyPrefix: 'myScript',
  migrate: (raw) => raw, // optional, run before defaults-merge
});
const settings = store.load(scope);      // scope optional
store.save(scope, settings);
store.toggle(settings, 'someFeatureId'); // respects `parent` gating
```

### `JLib.utils`
```js
const debounced = JLib.utils.debounce(fn, 200);
const throttled = JLib.utils.throttle(fn, 200);
const log = JLib.utils.makeLogger('MyScript', '1.0.0'); // log.log/.warn/.error
```

### `JLib.settingsPanel`
```js
const panel = JLib.settingsPanel.create({
  namespace: 'myScript',
  title: 'My Script Settings',
  categories: [{ id: 'general', label: 'General', icon: '⚙' }],
  features: [ /* see examples/ for all 6 types */ ],
});
GM_registerMenuCommand('⚙ My Script Settings', panel.toggle);
```

Full feature-type and config reference is documented inline at the top of
`src/settings-panel.js`.

## License

MIT — see `LICENSE`.
