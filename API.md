# JLib — API

> Verified against commit `3c8011f` + Pass B (2026-08-02). **Read this note before anything else below.**

This is a different document from [Architecture.md](Architecture.md), on purpose: Architecture.md explains *why* the codebase is built the way it is, for someone maintaining or extending it; this explains *what you can call*, for someone writing a userscript against it. They will drift apart differently and shouldn't be merged.

**Honest, upfront: this file is the most likely of all of JLib's docs to fall behind.** Every other doc in this repo describes architecture, rules, or file-level purpose — things that change rarely. This one is tied to individual function signatures, which change every time a parameter gets added or a return shape shifts. There is no automated check keeping it in sync (see `bundles/README.md`'s `.version.json` section for the one doc-staleness mechanism that *does* exist — this file isn't wired into it). Treat a mismatch between this file and the real source as expected eventually, not a sign something else is broken. If you find one, the source is correct and this file is stale — please don't infer the reverse.

The core of the library — registration, providers, storage, the module/dashboard shell — is stable and has been for a while (see [changelog.md](changelog.md)). It's this document that will age, not the code underneath it.

**Three sections, three different jobs:**

- **[Onboarding](#onboarding)** — a curated dozen-ish functions, in the order you'd actually reach for them writing your first script, with a few plain-English examples each.
- **[Reference](#reference)** — every function, glossary-style. Name and definition always visible; examples are collapsed by default (click to expand) so the page stays scannable even though nothing is left out.
- **[Function Index](#function-index)** — one collapsed table, every function, one row each, jump-linked straight into Reference. For when you remember roughly what a function is called and just want to land on it fast.

---

## Onboarding

New to JLib? This is the actual order a first script tends to touch things in — register, build something, put content in it, save a setting, maybe notify, then render. Everything here also appears in Reference below with its full, uncondensed entry; this is the fast, illustrated path, not a separate feature set.

### `JLib.registerScript({ namespace })`

The first line of real code in almost any script that uses JLib. Establishes your script's identity — everything namespace-scoped refuses to operate until this has run.

**Example 1:** At the very top of your userscript, right after your `@require` lines: `JLib.registerScript({ namespace: 'myWalmartScript' });` — one call, once, before anything else.

**Example 2:** Forget to call it, and any Settings Panel or `JLib.cache` call in your script will `console.warn` and quietly do nothing instead of throwing — this is what that warning is telling you to fix.

### `JLib.registerModule(moduleDef)` + `JLib.moduleBase.create(config)`

These two are almost always used together — `moduleBase.create` builds a module definition with the right shape, `registerModule` adds it to the dashboard. You rarely call one without the other.

**Example 1:** A settings-free "About / Links" panel:
```js
JLib.registerModule(JLib.moduleBase.create({
  id: 'links', label: 'Quick Links',
  onMount(view) {
    view.header('Quick Links');
    view.section('Bookmarks', body => { /* build your content here */ });
  },
}));
```

**Example 2:** Register two modules instead of one, and the dashboard automatically switches from a single-shell layout to a menu-driven dashboard with both listed — nothing else in your code has to change for that to happen.

### `JLib.scheduleRender(opts?)`

Call this exactly once, at the very end of your script. It builds whatever shell your registered modules need.

**Example 1:** The last line of your userscript: `JLib.scheduleRender();` — that's the whole call, most of the time.

**Example 2:** `JLib.scheduleRender({ title: 'My Script' })` — gives the dashboard shell a custom title instead of the default.

### `JLib.storage.createStore(features, options)`

Your settings backend. Define what you're storing once, get load/save/toggle for free.

**Example 1:** Two boolean toggles:
```js
const store = JLib.storage.createStore(
  [{ id: 'hideAds', default: true }, { id: 'darkMode', default: false }],
  { storageKeyPrefix: 'myScript_settings' }
);
const settings = store.load();
if (settings.hideAds) { /* ... */ }
```

**Example 2:** A number setting with bounds: `{ id: 'maxItems', default: 20, min: 1, max: 100 }` — Settings Panel's number row respects `min`/`max` automatically once you register this as a feature there too.

### `JLib.elements.button.button(label, onClick, opts?)`

The one you'll reach for constantly for anything clickable that isn't a full settings row.

**Example 1:** A plain action button: `JLib.elements.button.button('Refresh', () => location.reload())`.

**Example 2:** A dangerous action, visually flagged: `JLib.elements.button.button('Delete All', doDelete, { variant: 'danger' })`.

**Example 3:** A disabled button while something's loading: `JLib.elements.button.button('Export', onExport, { disabled: isLoading })`.

### `JLib.elements.inputs` row builders — `toggleRow`, `dropdownRow`, `numberRow`, `textRow`, `actionRow`

The building blocks a settings section is actually made of.

**Example 1:** A toggle: `toggleRow('Hide ads', 'Removes sponsored tiles', settings.hideAds, (v) => { settings.hideAds = v; store.save(undefined, settings); })`.

**Example 2:** A dropdown: `dropdownRow('Theme', '', [{value:'dark',label:'Dark'},{value:'light',label:'Light'}], settings.theme, onChange)`.

**Example 3:** A number input with bounds baked into the feature object: `numberRow('Max results', '', { min: 1, max: 100 }, settings.maxResults, onChange)`.

**Example 4:** An action row with its own button inside it: `actionRow('Clear cache', 'Frees up storage', clearCacheFn)`.

### `JLib.dom.el(tag, opts?, children?)`

The building block underneath almost everything else in JLib — you'll likely use it directly too, any time you're building your own bit of UI.

**Example 1:** `el('div', { className: 'my-badge' }, ['NEW'])` — a simple labeled div.

**Example 2:** Nesting: `el('div', {}, [el('strong', {}, ['Price: ']), el('span', {}, ['$19.99'])])`.

### `JLib.events.on(container, eventType, selector, handler, options?)`

The answer to "handle clicks on things that don't exist yet."

**Example 1:** A site keeps loading more product tiles as you scroll — `JLib.events.on(document, 'click', '.product-tile', (e, tile) => console.log(tile.dataset.id))` catches tiles that appear long after this line ran.

**Example 2:** Scoped to a narrower, known-stable container instead of the whole document, which is cheaper: `JLib.events.on(document.querySelector('#results'), 'click', '.item', handler)`.

### `JLib.triggers.watch(key, selector, callback, opts?)`

For "run this the moment something specific shows up on the page" — the single most common userscript need.

**Example 1:** Wait for a button that only appears after an XHR-driven page section loads: `JLib.triggers.watch('loadMore', '.load-more-btn', (el) => el.click())`.

**Example 2:** Scoped to a subtree instead of the whole page for efficiency: `JLib.triggers.watch('modalClose', '.close-btn', fn, { root: modalContainer })`.

**Example 3:** A one-off — fire once and be done: `JLib.triggers.watch('banner', '.cookie-banner', (el) => el.remove())` — if the selector never matches again, it simply never fires again either; you don't need to explicitly stop it for a truly one-time page element.

### `JLib.notifications.create(opts?)` + `.notify(message, opts?)`

Your toast/banner/modal system, in two calls.

**Example 1:** Set up once near the top of your script: `const notifications = JLib.notifications.create();` — then anywhere later, `notifications.notify('Saved!', { level: 'success', staleAfter: { type: 'default' } })` shows a toast that auto-dismisses in 4 seconds.

**Example 2:** Something that should stick around until the user dismisses it: `notifications.notify('Heads up: this page changed its layout', { level: 'warning' })` — omitting `staleAfter` means it persists.

### `JLib.cache.get(key)` / `.set(key, value)`

Persistent storage for anything that isn't a user-facing setting.

**Example:** `await JLib.cache.set('parsedPageIndex', expensiveData);` on one visit, `const data = await JLib.cache.get('parsedPageIndex');` on the next — survives a reload, no rebuild needed.

### `JLib.superProvider.css.apply(el, opts?)`

The one-call shortcut for "make this element I built visually belong to the page it's on."

**Example:** `JLib.superProvider.css.apply(myBadge, { color: true })` — samples the page around `myBadge` and writes a real, contrast-checked palette onto it as CSS variables, all in one call.

---

## Reference

Every function, in file order (matching `src/`'s own layout — see each `src/*/README.md` for the same order at the folder level). Name and one-line definition are always visible; click **Examples** to expand where one exists. Example count is not capped — a function with a lot of real range gets as many as it has, a self-evident one gets one or none; nothing here is padded to hit a number.

### Registration (`services/registration.js`)

Every one of these follows "registration is existence" — refuses and warns (or throws, for a few genuine programmer errors) rather than silently defaulting.

<a id="ref-registerscript"></a>
#### `JLib.registerScript(config)` → `bool`

Establishes your script's identity. `config.namespace` is required. Everything namespace-scoped (Settings Panel, `JLib.cache`) refuses to operate until this runs.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.registerScript({ namespace: 'myScript' })` at the top of your userscript, once.

**Example 2:** Calling it a second time (e.g. from an accidentally double-loaded `@require`) is refused and warned — the second call is a no-op, the first registration wins.
</details>

<a id="ref-composenamespace"></a>
#### `JLib.composeNamespace(localPiece?)` → `string | null`

Combines your registered namespace with an optional local piece (a sub-identity like a specific Settings Panel instance). Returns `null` and warns if no script is registered.

<details>
<summary>Examples</summary>

**Example:** Internally, `JLib.cache` and Settings Panel both call this to build their real storage key. You'd only call it directly building your own namespace-scoped feature — `JLib.composeNamespace('myFeature')` on a script registered as `'myScript'` returns `'myScript.myFeature'`.
</details>

<a id="ref-registertheme"></a>
#### `JLib.registerTheme(name, resolveFn)` → `bool`

Adds a theme. `resolveFn(targetEl)` returns a `{ '--jsp-*': value, ... }` object.

<details>
<summary>Examples</summary>

**Example:** A theme that always matches a specific site's brand color regardless of what page you're on:
```js
JLib.registerTheme('myBrand', () => ({ '--jsp-bg': '#1a1a2e', '--jsp-accent': '#e94560' }));
```
</details>

<a id="ref-registermodule"></a>
#### `JLib.registerModule(moduleDef)` → `void`

Adds a module to the dashboard. Throws if `moduleDef.id` is missing (a real config error, not a runtime condition).

<details>
<summary>Examples</summary>

**Example:** See Onboarding's `registerModule` + `moduleBase.create` entry above — they're almost always called together.
</details>

<a id="ref-i18n-registerdictionary"></a>
#### `JLib.i18n.registerDictionary({ lang, selfName, strings, isDefault? })` → `bool`

Adds a language.

<details>
<summary>Examples</summary>

**Example:** A partial Spanish dictionary:
```js
JLib.i18n.registerDictionary({
  lang: 'es', selfName: 'Español',
  strings: { Save: 'Guardar', Cancel: 'Cancelar' },
});
```
</details>

### Utilities (`services/utils.js`)

<a id="ref-debounce"></a>
#### `JLib.utils.debounce(fn, wait)` → debounced `fn`, with `.cancel()`

Trailing-edge: runs `wait`ms after the *last* call, not the first.

<details>
<summary>Examples</summary>

**Example:** React once a burst of page mutations has settled: `const settled = JLib.utils.debounce(scanPage, 200); observer = new MutationObserver(settled);`.
</details>

<a id="ref-throttle"></a>
#### `JLib.utils.throttle(fn, wait)` → throttled `fn`, with `.cancel()`

Leading-edge: runs immediately, then at most once per `wait`ms while calls keep coming.

<details>
<summary>Examples</summary>

**Example:** A scroll handler that should react right away, then rate-limit: `window.addEventListener('scroll', JLib.utils.throttle(onScroll, 100))`.
</details>

<a id="ref-debounceperkey"></a>
#### `JLib.utils.debouncePerKey(fn, wait)` → keyed debounced `fn`, with `.cancel(key?)`

Like `debounce`, but each distinct first argument gets its own independent timer.

<details>
<summary>Examples</summary>

**Example:** Debouncing "flush this specific setting to disk" per setting id — plain `debounce` would silently drop the second setting's flush if both changed within the same window; this keeps them independent: `const flush = JLib.utils.debouncePerKey((key, val) => save(key, val), 250);`.
</details>

<a id="ref-makelogger"></a>
#### `JLib.utils.makeLogger(name, version?)` → `{ log, warn, error }`

Console methods prefixed with `[name vX.Y.Z]`.

<details>
<summary>Examples</summary>

**Example:** `const logger = JLib.utils.makeLogger('MyScript', '1.0.0'); logger.warn('something looked off');` prints `[MyScript v1.0.0] something looked off`.
</details>

<a id="ref-samplestructuralvalue"></a>
#### `JLib.utils.sampleStructuralValue(boundaryEl, readValue, isUsable)` → value or `null`

Scans a handful of likely candidates under `boundaryEl`, majority-votes on whichever value `readValue` returns most often among ones `isUsable` accepts. What `radiusProvider`/`shadowProvider` are built on.

<details>
<summary>Examples</summary>

**Example:** "The border-radius this page seems to use most":
```js
JLib.utils.sampleStructuralValue(document.body,
  (node) => getComputedStyle(node).borderRadius,
  (val) => val && val !== '0px'
);
```
</details>

### Heuristics (`services/heuristics.js`)

<a id="ref-heuristics-capture"></a>
#### `JLib.heuristics.capture(rootEl?)` → captured candidate data

Walks the DOM under `rootEl` (default `document.body`) collecting tag/class/attribute data per element.

<a id="ref-heuristics-rank"></a>
#### `JLib.heuristics.rank(captured, keywords)` → ranked array

Scores captured elements against a keyword list via real BM25.

<a id="ref-heuristics-captureandrank"></a>
#### `JLib.heuristics.captureAndRank(keywords, rootEl?)` → ranked array

Convenience combining `capture` + `rank` in one call.

<details>
<summary>Examples</summary>

**Example:** "The elements on this page most likely to be navigation": `JLib.heuristics.captureAndRank(['nav', 'menu', 'header'])`.
</details>

<a id="ref-heuristics-withscrolllock"></a>
#### `JLib.heuristics.withScrollLock(fn)` → `fn`'s return value

Runs `fn` behind a real native blocking dialog, protecting a capture-then-read sequence from a SPA scroll library recycling elements mid-read.

<details>
<summary>Examples</summary>

**Example:** Internally, `colorProvider`'s accent discovery wraps its whole capture+rank+read sequence in this so a virtualized list can't swap elements out from under it mid-scan — `JLib.heuristics.withScrollLock(() => { const ranked = capture...(); return readColorsFrom(ranked); })`.
</details>

### Anchor cache (`services/anchor-cache.js`)

<a id="ref-anchorcache-create"></a>
#### `JLib.anchorCache.create()` → `{ get, set, has, delete, invalidateAll }`

A fresh `WeakMap`-by-element cache with automatic invalidation on class/style/data-theme changes.

<details>
<summary>Examples</summary>

**Example:** Writing your own small provider-like utility without hand-rolling cache invalidation:
```js
const cache = JLib.anchorCache.create();
function get(el) {
  const boundary = resolveMyBoundary(el);
  if (cache.has(boundary)) return cache.get(boundary);
  const value = computeExpensiveThing(boundary);
  cache.set(boundary, value);
  return value;
}
```
</details>

### Console (`services/console.js`)

<a id="ref-console-register"></a>
#### `JLib.console.register(id, { template, explain?, hint? })` → `bool`

Adds a named, findable warning/message definition.

<a id="ref-console-warn"></a>
#### `JLib.console.warn(id, ...args)` / `JLib.console.info(id, ...args)`

Emits a registered message.

<details>
<summary>Examples</summary>

**Example:** A feature of your own with a real, recurring failure mode:
```js
JLib.console.register('myFeature.missingConfig', {
  template: () => 'myFeature refused — config.apiKey is required.',
  hint: 'Pass { apiKey: "..." } to myFeature.init().',
});
// later, anywhere this can fail:
JLib.console.warn('myFeature.missingConfig');
```
</details>

<a id="ref-console-explain"></a>
#### `JLib.console.explain(id)` → `string | null`

Looks up the "why" for a registered message id.

### DOM & shadow (`services/dom.js`)

<a id="ref-dom-el"></a>
#### `JLib.dom.el(tag, opts?, children?)` → `HTMLElement` (alias `h`)

`opts`: `className`, `id`, `dataset`, `attrs`.

<details>
<summary>Examples</summary>

**Example 1:** `el('div', { className: 'my-box' }, ['Hello', el('span', {}, ['world'])])` — a div with mixed text and nested element children.

**Example 2:** With a dataset attribute: `el('div', { dataset: { itemId: '42' } })` — produces `<div data-item-id="42">`.

**Example 3:** With a raw attribute (for things `dataset` doesn't cover, like ARIA): `el('div', { attrs: { role: 'button', tabindex: '0' } })`.
</details>

<a id="ref-dom-select"></a>
#### `JLib.dom.$(selector, root?)` / `JLib.dom.$$(selector, root?)`

`querySelector`/`querySelectorAll` shortcuts — `$$` returns a real array, not a `NodeList`.

<a id="ref-shadow-getroot"></a>
#### `JLib.shadow.getRoot()` → `ShadowRoot`

The one shared closed shadow root JLib's own chrome lives in, created on first use.

<a id="ref-shadow-isourroot"></a>
#### `JLib.shadow.isOurRoot(rootNode)` → `bool`

Is this element's root JLib's own shared shadow root?

<a id="ref-shadow-adoptstylesheet"></a>
#### `JLib.shadow.adoptStylesheet(sheet, rootNode)`

Adopts a `CSSStyleSheet` onto a root's `adoptedStyleSheets` — the real, CSP-safe way to style something (a constructed stylesheet was never parsed as inline style content, unlike a `<style>` tag).

<details>
<summary>Examples</summary>

**Example:** Building your own reusable UI piece, CSP-safe the way JLib's own elements are:
```js
const sheet = new CSSStyleSheet();
sheet.replaceSync('.my-thing { color: red; }');
JLib.shadow.adoptStylesheet(sheet, myElement.getRootNode());
```
Instead of appending a `<style>` tag to `document.head`, which a strict-CSP site can silently block.
</details>

<a id="ref-shadow-onrootcreated"></a>
#### `JLib.shadow.onRootCreated(cb)`

Fires the instant the shared shadow root is actually created (or immediately if it already exists).

### Events (`services/events.js`)

<a id="ref-events-on"></a>
#### `JLib.events.on(container, eventType, selector, handler, options?)` → `off()` function

Delegated listener — `handler(event, matchedElement)` fires when something matching `selector` is clicked (or whatever `eventType`), even if it didn't exist yet when `on` was called.

<details>
<summary>Examples</summary>

**Example 1:** A site's product list keeps adding new tiles as you scroll — instead of re-attaching a listener to every new tile: `JLib.events.on(document, 'click', '.product-tile', (e, tile) => console.log(tile.dataset.id))`.

**Example 2:** Scoped to a narrower, known-stable container rather than the whole document, which is both cheaper and avoids matching unrelated parts of the page: `JLib.events.on(document.querySelector('#results'), 'click', '.item', handler)`.

**Example 3:** Capture phase, to observe before the site's own handlers run: `JLib.events.on(document, 'click', 'a', handler, { capture: true })`.

**Example 4:** Cleaning up when a feature toggles off: `const off = JLib.events.on(...); /* later */ off();`.
</details>

<a id="ref-events-oncapture"></a>
#### `JLib.events.onCapture(eventType, selector, handler)` → `off()`

Shortcut for `on(document, eventType, selector, handler, true)` (capture phase).

### Dedupe (`services/dedupe.js`)

<a id="ref-dedupe-once"></a>
#### `JLib.dedupe.once(key, fn)` → `Promise`

If a call under `key` is already in flight, returns the *same* promise instead of running `fn` again.

<details>
<summary>Examples</summary>

**Example:** Two different parts of your script both trigger a fetch for the same data at nearly the same moment — wrapping both calls in `JLib.dedupe.once('sameKey', fetchFn)` means only one real fetch happens; both callers get the same result.
</details>

<a id="ref-dedupe-memosync"></a>
#### `JLib.dedupe.memoSync(key, fn, ttlMs?)` → value

Synchronous version — caches `fn()`'s result for `ttlMs` (0 = no caching, just collapses simultaneous calls within the same tick).

<a id="ref-dedupe-clear"></a>
#### `JLib.dedupe.clear(key?)`

Clears one key, or everything if omitted.

### Triggers (`services/triggers.js`)

<a id="ref-triggers-watch"></a>
#### `JLib.triggers.watch(key, selector, callback, opts?)` → a function that stops watching

Fires `callback` when something matching `selector` appears under `opts.root` (default light DOM) — checked immediately in case it already exists.

<details>
<summary>Examples</summary>

**Example 1:** Wait for a button that only appears after an XHR-driven page section loads: `JLib.triggers.watch('loadMore', '.load-more-btn', (el) => el.click())`.

**Example 2:** Scoped to a subtree instead of the whole page: `JLib.triggers.watch('modalClose', '.close-btn', fn, { root: modalContainer })`.

**Example 3:** Stop watching manually once you no longer need it (e.g. a feature toggled off): `const stop = JLib.triggers.watch('key', sel, cb); /* later */ stop();`.

**Example 4:** Re-registering under the same key while a watch is still active is refused and warned — call the returned stop function first if you genuinely want to replace it.
</details>

<a id="ref-triggers-fire"></a>
#### `JLib.triggers.fire(key, fn)`

An explicit, demand-dedup-protected trigger (routed through `JLib.dedupe`) — for a call site that wants dedup protection against rapid repeat calls, not element-appearance watching.

### Storage (`services/storage.js`)

<a id="ref-storage-createstore"></a>
#### `JLib.storage.createStore(features, options)` → store

`options.storageKeyPrefix` is required. Returns `{ load(scope?), save(scope?, obj), toggle(obj, id), watch(scope?, cb), getDefaults(scope?), appliesTo, enforceDependencies, storageKey, featuresById, features }` — a schema-driven `GM_setValue`/`GM_getValue` wrapper with dependency enforcement.

<details>
<summary>Examples</summary>

**Example 1:** Three boolean settings: define them as `[{ id: 'showBadges', default: true }, ...]`, call `createStore` once, use `.load()`/`.save()` instead of hand-rolling `GM_getValue`/`GM_setValue` JSON parsing.

**Example 2:** A parent/child dependency — a child feature that only applies when its parent is on: `{ id: 'badgeColor', parent: 'showBadges', default: 'red' }` — `enforceDependencies` automatically forces `badgeColor` off if `showBadges` is off.

**Example 3:** Multi-scope storage (e.g. per-site settings within one script): `store.load('siteA')` and `store.load('siteB')` read independent settings objects from the same store definition.

**Example 4:** Reacting live to a setting changed from another tab: `store.watch(scope, (freshSettings) => { /* re-render with freshSettings */ })`.

**Example 5:** Migrating an old shape forward: pass `{ migrate: (loaded) => { if (loaded.oldKey) loaded.newKey = loaded.oldKey; } }` in `options` — runs once per load, before defaults are merged in.
</details>

### Theme (`services/theme.js`)

<a id="ref-theme-create"></a>
#### `JLib.theme.create(opts?)` → instance

`opts.defaultMode` (theme name), `opts.animationsEnabled`. Returns `{ apply(targetEl, opts?), setMode(name, targetEl?), getMode(), setAnimationsEnabled(bool), startWatching(targetEl), stopWatching(), forceReExtract(targetEl), themes }`. This is what `JLib.render()` uses internally for the dashboard shell — you'd only call `create()` yourself for a *separate* themed surface outside the dashboard.

<details>
<summary>Examples</summary>

**Example 1:** A floating button of your own, outside the settings dashboard, themed the same way: `const myTheme = JLib.theme.create(); myTheme.apply(myButton);`.

**Example 2:** Re-sampling live as the host page's own theme changes: `myTheme.startWatching(myButton);` — keeps `myButton` in sync with page theme changes automatically from then on.

**Example 3:** Forcing a fresh sample after you know the page changed in a way JLib's automatic watchers might have missed: `myTheme.forceReExtract(myButton);`.
</details>

### Notifications (`services/notifications.js`)

<a id="ref-notifications-create"></a>
#### `JLib.notifications.create(opts?)` → core

`opts.store` (optional, a `JLib.storage` store, needed for "do not show again"). Returns `{ notify(message, opts?), dismiss(id, opts?), subscribe(fn), getActive(), getHistory() }`. `notify` returns `{ id, dismiss() }` or `null` if suppressed.

<details>
<summary>Examples</summary>

**Example 1:** A message that auto-dismisses: `notifications.notify('Saved!', { level: 'success', staleAfter: { type: 'default' } })` (4 seconds).

**Example 2:** A message that persists until manually dismissed: omit `staleAfter` entirely.

**Example 3:** Dismiss on the user's next click or keypress anywhere: `{ staleAfter: { type: 'interaction' } }`.

**Example 4:** A dismissible-forever notice: `{ dismissKey: 'onboardingTip', allowDoNotShowAgain: true }` (requires `opts.store` on `create()`), paired with the `modal` presenter's built-in "Don't show again" button.

**Example 5:** Subscribing to react to every show/dismiss event yourself, e.g. for a custom counter badge: `notifications.subscribe((event, record) => { if (event === 'show') badge.textContent = notifications.getActive().length; })`.
</details>

<a id="ref-notifications-presenters"></a>
#### `JLib.notifications.presenters.toast(core)` / `.banner(core)` / `.modal(core)` → `unsubscribe`

Wires a visual presenter to a core instance — call once per page per presenter you want active. A notification's `presenter` option (`'toast'`/`'banner'`/`'modal'`) picks which one renders it.

<details>
<summary>Examples</summary>

**Example:** Wiring all three, so different notifications can pick whichever fits: `JLib.notifications.presenters.toast(notifications); JLib.notifications.presenters.modal(notifications);` — then `notify(msg, { presenter: 'modal' })` for something that needs to block, `notify(msg2)` (default `'toast'`) for something that doesn't.
</details>

### Module lifecycle (`services/module-lifecycle.js`)

<a id="ref-modulebase-create"></a>
#### `JLib.moduleBase.create(config)` → module def

`config: { id, label, order?, onMount(view, services, container), onUnmount() }`. `view` gives you `.header(title, rightControls?)` and `.section(label, renderBody, opts?)`. This is what every module (Settings Panel, Notification Center) is built through.

<details>
<summary>Examples</summary>

**Example 1:** A minimal module: see Onboarding's entry above.

**Example 2:** Multiple sections in one module: call `view.section(...)` more than once inside `onMount` — each call adds its own collapsible category block.

**Example 3:** Reading `services` inside `onMount` to reach the dashboard's shared theme/shell instance: `onMount(view, services) { services.theme.forceReExtract(services.shell.panelEl); }`.

**Example 4:** Cleaning up a subscription or listener your module set up: `onUnmount() { unsubscribeFn(); }` — called automatically when the dashboard navigates away from your module.
</details>

<a id="ref-render"></a>
#### `JLib.render(opts?)` / `JLib.scheduleRender(opts?)`

Builds the one dashboard/standalone shell from every registered module. `scheduleRender` defers to a microtask so it runs after all your other code — call this, not `render`, in almost every real script. Call once, at the very end.

<a id="ref-dashboard"></a>
#### `JLib.dashboard` (only exists after render)

`{ open(), close(), toggle(), destroy(), panelEl }`.

<details>
<summary>Examples</summary>

**Example:** A custom keyboard shortcut or floating button of your own that opens your settings panel: `myButton.addEventListener('click', () => JLib.dashboard.open());`.
</details>

### Cache (`services/cache.js`)

<a id="ref-cache-set"></a>
#### `JLib.cache.set(key, value)` → `Promise`

Persists non-settings data, IndexedDB-backed, cross-tab synced.

<a id="ref-cache-get"></a>
#### `JLib.cache.get(key)` → `Promise<value | undefined>`

<a id="ref-cache-delete"></a>
#### `JLib.cache.delete(key)` → `Promise`

<details>
<summary>Examples</summary>

**Example:** Caching a parsed, expensive-to-rebuild index of page data across reloads: `await JLib.cache.set('pageIndex', data);` on one visit, `await JLib.cache.get('pageIndex');` on the next, instead of rebuilding it from scratch every time.
</details>

<a id="ref-cache-watch"></a>
#### `JLib.cache.watch(key, callback)` → `unsubscribe`

Fires on any change to `key`, local or from another tab.

<a id="ref-cache-ensureinit"></a>
#### `JLib.cache.ensureInit()` → `Promise`

Usually called implicitly by the above; call directly if you need to know when the cache is genuinely ready.

<a id="ref-cache-versionchanged"></a>
#### `JLib.cache.versionChanged` (getter, `bool`)

True if `GM_info.script.version` differs from what was recorded last session. Purely informational — nothing is wiped or migrated automatically.

<details>
<summary>Examples</summary>

**Example:** Deciding whether to invalidate a cached shape after a version bump: `await JLib.cache.ensureInit(); if (JLib.cache.versionChanged) { await JLib.cache.delete('pageIndex'); }`.
</details>

### Color provider (`providers/color-provider.js`)

<a id="ref-colorprovider-getpalette"></a>
#### `JLib.colorProvider.getPalette(el, opts?)` → palette

Anchor-relative sampling. `opts.seedHue` (0-360) requests a specific hue instead of pure extraction. Returns `{ base, surface, elevated, ink, muted, accent, 'accent-hover', danger, success, warning }`, every slot a real, contrast-checked `{ r, g, b }`.

<details>
<summary>Examples</summary>

**Example 1:** A badge that should visually belong to whatever product tile it sits on: `const palette = JLib.colorProvider.getPalette(tileEl);` gives you real, usable colors sampled from that specific tile's surroundings.

**Example 2:** Requesting your own brand hue but letting the page's real lightness/chroma still inform it: `JLib.colorProvider.getPalette(el, { seedHue: 260 })` — blended or overridden depending on how far the site's own accent is from that hue.

**Example 3:** Applying the resulting palette manually as CSS vars: `JLib.colorProvider.applyPaletteAsVars(el, palette);` then reference `var(--jlib-color-accent)` in your own CSS.
</details>

<a id="ref-colorprovider-getglobalpalette"></a>
#### `JLib.colorProvider.getGlobalPalette()` → palette

Same shape, one page-wide sample instead of anchor-relative.

<a id="ref-colorprovider-validate"></a>
#### `JLib.colorProvider.validate(partial)` → full palette

Fills in any missing slots with defaults and runs contrast correction — the "one door" every palette passes through.

<a id="ref-colorprovider-ensurecontrast"></a>
#### `JLib.colorProvider.ensureContrast(fg, bg, minRatio)` → `{r,g,b}`

Nudges `fg` toward more/less lightness until it clears `minRatio` against `bg`.

<details>
<summary>Examples</summary>

**Example:** Making sure a custom text color you picked is actually legible against your own background: `const safeInk = JLib.colorProvider.ensureContrast({ r: 100, g: 100, b: 200 }, myBg, 4.5);`.
</details>

<a id="ref-colorprovider-contrast"></a>
#### `JLib.colorProvider.contrastRatio(c1, c2)` / `.relativeLuminance(c)` → number

Real WCAG math.

<a id="ref-colorprovider-tocss"></a>
#### `JLib.colorProvider.toCssRgb(rgb)` / `.toCssRgba(rgb, a)` → CSS string

<a id="ref-colorprovider-resolveanchorboundary"></a>
#### `JLib.colorProvider.resolveAnchorBoundary(el)` → element

The real, dedup-cached "which real visual surface does this belong to" walk every provider shares.

<a id="ref-colorprovider-invalidate"></a>
#### `JLib.colorProvider.invalidate(el)` / `.invalidateAll()`

Manual cache-clear escape hatches, for cases automatic invalidation genuinely can't cover.

<a id="ref-colorprovider-preview"></a>
#### `JLib.colorProvider.preview(el, paletteOrSlot)`

Dev-only: paint a palette (or one slot) onto an element via CSS vars, no caching.

<a id="ref-colorprovider-transitionpalette"></a>
#### `JLib.colorProvider.transitionPalette(el, fromPalette, toPalette, opts?)`

Animates between two palettes on `el` — `opts.mode: 'ambient' | 'salient'`, `opts.surfaceKind: 'panel' | 'solid'`.

<details>
<summary>Examples</summary>

**Example:** A theme toggle you built yourself, crossfading instead of snapping: `JLib.colorProvider.transitionPalette(el, oldPalette, newPalette, { mode: 'salient' });`.
</details>

<a id="ref-colorprovider-reveal"></a>
#### `JLib.colorProvider.reveal(el, buildFn, opts?)` / `.revealAnchored(el, buildFn)`

Builds hidden, resolves the real palette, then fades in — no fallback color ever briefly shown. `opts.source: 'anchor' | 'global'`.

<details>
<summary>Examples</summary>

**Example:** A brand-new floating element that shouldn't flash an unthemed color before its real palette resolves: `JLib.colorProvider.reveal(myEl, (palette) => { myEl.textContent = 'Hi'; });`.
</details>

<a id="ref-colorprovider-applypaletteasvars"></a>
#### `JLib.colorProvider.applyPaletteAsVars(el, palette, prefix?)`

Writes a palette onto `el.style` as CSS custom properties (default prefix `--jlib-color-`).

<a id="ref-colorprovider-enrichwithexternalsources"></a>
#### `JLib.colorProvider.enrichWithExternalSources(palette, boundaryEl?)` → `Promise<palette>`

Optional async layer — checks manifest theme_color / favicon / meta theme-color against an already-resolved palette.

<details>
<summary>Examples</summary>

**Example:** Refining an already-rendering synchronous palette in the background: `const better = await JLib.colorProvider.enrichWithExternalSources(palette); if (better !== palette) applyUpdatedPalette(better);`.
</details>

<a id="ref-colorprovider-getaccentviashortlist"></a>
#### `JLib.colorProvider.getAccentViaShortlist(boundaryEl, base)` → `Promise<rgb | null>`

Optional async layer — a persistent, drift-revalidated cache of which element/property won accent discovery last time, cheaper than full rediscovery on a reload.

<a id="ref-colorprovider-detectdisplaygamut"></a>
#### `JLib.colorProvider.detectDisplayGamut()` → `'srgb' | 'p3' | 'rec2020'`

### Structural providers (`providers/radius-provider.js`, `shadow-provider.js`, `border-provider.js`, `font-provider.js`)

All four share the same shape.

<a id="ref-radiusprovider"></a>
#### `JLib.radiusProvider.get(el)` / `.getGlobal()` → CSS string

<details>
<summary>Examples</summary>

**Example:** `el.style.borderRadius = JLib.radiusProvider.get(anchorEl);` matches whatever radius convention the surrounding page uses.
</details>

<a id="ref-shadowprovider"></a>
#### `JLib.shadowProvider.get(el)` / `.getGlobal()` → CSS string

<a id="ref-borderprovider"></a>
#### `JLib.borderProvider.get(el, opts?)` / `.getGlobal(opts?)` → CSS string

`opts.targetBg` (optional `{r,g,b}`) requests WCAG contrast correction against a specific background.

<details>
<summary>Examples</summary>

**Example:** A border color you want actually legible against a background you already resolved: `JLib.borderProvider.get(anchorEl, { targetBg: palette.base })`.
</details>

<a id="ref-structural-invalidate"></a>
#### `.invalidate(el)` / `.invalidateAll()` (all three above) and each has a `DEFAULT_*` constant

<a id="ref-fontprovider-getranked"></a>
#### `JLib.fontProvider.getRanked(el)` → 3 font-family strings

Rank 1/2/3, always real values.

<a id="ref-fontprovider-fonttype"></a>
#### `JLib.fontProvider.fontType(el, rank)` → one font-family string

`rank` 1-3.

<a id="ref-fontprovider-fittext"></a>
#### `JLib.fontProvider.layout.fitText(container, text, fontFamily, opts?)` → final text applied

The default entry point — fixed shrink → wrap → truncate pipeline, applied to `container` directly.

<details>
<summary>Examples</summary>

**Example 1:** A title that has to fit a fixed-width sidebar tab: `JLib.fontProvider.layout.fitText(tabEl, longTitle, font);` — shrinks the font size, then wraps, then truncates with an ellipsis, whichever actually makes it fit.

**Example 2:** Checking fit without committing to any changes: `JLib.fontProvider.layout.fits(container, text, font, size)` → `bool`.
</details>

<a id="ref-fontprovider-layout-parts"></a>
#### `.layout.shrink` / `.layout.wrap` / `.layout.truncate` / `.layout.fits` / `.layout.measure`

The individual strategies, for a caller with a genuine reason to deviate from the fixed pipeline.

### Super provider (`providers/super-provider.js`)

<a id="ref-superprovider-resolve"></a>
#### `JLib.superProvider.css.resolve(el, opts?)` → bundle `{ color?, font?, radius?, shadow?, border? }`

`opts` keys: omit for default, `false` to exclude, anything else to include (font accepts a 1-3 rank).

<details>
<summary>Examples</summary>

**Example 1:** Everything except border: `JLib.superProvider.css.resolve(el, { border: false })`.

**Example 2:** Color plus a specific font rank: `JLib.superProvider.css.resolve(el, { font: 2 })`.
</details>

<a id="ref-superprovider-apply"></a>
#### `JLib.superProvider.css.apply(el, opts?)` → bundle

Resolves *and writes* the whole bundle onto `el` in one call.

<details>
<summary>Examples</summary>

**Example 1:** A card that should match the page's color, radius, shadow, and font all at once: `JLib.superProvider.css.apply(cardEl, { color: true });` instead of calling five providers separately.

**Example 2:** Only structural properties, no color (e.g. you're theming color yourself another way): `JLib.superProvider.css.apply(el, { color: false })`.
</details>

<a id="ref-superprovider-reveal"></a>
#### `JLib.superProvider.css.reveal(el, buildFn, opts?)`

Bundle-aware version of `colorProvider.reveal()`.

<a id="ref-superprovider-transition"></a>
#### `JLib.superProvider.css.transition(el, fromBundle, toBundle, opts?)`

Bundle-aware version of `colorProvider.transitionPalette()`.

<a id="ref-superprovider-fittext"></a>
#### `JLib.superProvider.css.fitText(el, container, text, opts?)`

Resolves the bundle's font and runs it through `fontProvider.layout.fitText` in one call.

<a id="ref-superprovider-invalidate"></a>
#### `JLib.superProvider.css.invalidate(el)` / `.invalidateAll()`

Cascades to all five mini-providers at once.

### Elements (`elements/*.js`)

<a id="ref-elements-button"></a>
#### `JLib.elements.button.button(label, onClick, opts?)` → `HTMLButtonElement`

`opts.variant: 'default' | 'danger' | 'ghost'`, `opts.disabled`, `opts.className`.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.elements.button.button('Refresh', () => location.reload())`.

**Example 2:** `JLib.elements.button.button('Delete All', doDelete, { variant: 'danger' })`.

**Example 3:** `JLib.elements.button.button('Export', onExport, { disabled: isLoading })`.
</details>

<a id="ref-elements-inputs"></a>
#### `JLib.elements.inputs.toggleRow` / `.dropdownRow` / `.numberRow` / `.textRow` / `.actionRow(label, desc, ..., onChange, opts?)` → row `HTMLElement`

The row builders Settings Panel's schema dispatch uses — callable directly if you're building your own settings-like UI outside a full Settings Panel instance.

<details>
<summary>Examples</summary>

**Example 1:** `toggleRow('Hide ads', '', settings.hideAds, onChange)`.

**Example 2:** `dropdownRow('Theme', '', options, settings.theme, onChange)`.

**Example 3:** `numberRow('Max results', '', { min: 1, max: 100 }, settings.maxResults, onChange)`.

**Example 4:** `actionRow('Clear cache', '', clearCacheFn)`.
</details>

<a id="ref-elements-makekeyboardactivatable"></a>
#### `JLib.elements.inputs.makeKeyboardActivatable(el)`

Adds Enter/Space-triggers-click to a non-native interactive element (e.g. a `div` with `role="button"`).

<a id="ref-elements-modal"></a>
#### `JLib.elements.modal.create(config)` → instance `{ open(), close(), toggle(), destroy(), setPosition(pos), setKeyboardShortcut(combo), setTitle(title), panelEl, bodyEl, headerActionsEl }`

`config: { id, title, position?, content(bodyEl), footerText?, keyboardShortcut?, onOpen?, onClose?, appendTo? }`.

<details>
<summary>Examples</summary>

**Example 1:** A popup separate from the dashboard: `const myModal = JLib.elements.modal.create({ id: 'myThing', title: 'My Thing', content: (body) => body.appendChild(...) }); myModal.open();` — a real native `<dialog>` with focus-trap and backdrop, for free.

**Example 2:** A modal with its own keyboard shortcut: `{ ..., keyboardShortcut: 'Ctrl+Shift+M' }`.

**Example 3:** Appending to the real page instead of JLib's shared shadow root (default), for a modal an author wants to remain reachable from page-level CSS: `{ ..., appendTo: document.body }`.
</details>

<a id="ref-elements-getfocusableelements"></a>
#### `JLib.elements.modal.getFocusableElements(container)`

The utility the modal's own Tab-loop uses internally — exposed in case you're building a similar focus-trap yourself.

<a id="ref-elements-tabs"></a>
#### `JLib.elements.tabs.render(container, items, activeId, onSelect)`

`items: [{ id, label, badge?, groupLabel? }]`. Renders a vertical nav list into an already-connected `container`.

<a id="ref-elements-search"></a>
#### `JLib.elements.search.search(items, query, getText?)` → filtered, ranked array

`getText(item)` defaults to `String(item)`.

<details>
<summary>Examples</summary>

**Example 1:** A list of 40 settings with a search box: `JLib.elements.search.search(features, userQuery, f => f.label + ' ' + f.description)`.

**Example 2:** Plain strings, no `getText` needed: `JLib.elements.search.search(['Apple', 'Banana', 'Cherry'], 'appl')` → `['Apple']`.
</details>

<a id="ref-elements-search-inputfield"></a>
#### `JLib.elements.search.inputField(opts?)` → `HTMLInputElement`

`opts: { placeholder?, debounceMs?, onQuery(query) }`. A ready-made debounced search box wired to `onQuery`.

<details>
<summary>Examples</summary>

**Example:** `JLib.elements.search.inputField({ placeholder: 'Search settings…', onQuery: (q) => renderResults(JLib.elements.search.search(items, q, getText)) })`.
</details>

### Modules (`modules/*.js`)

<a id="ref-notificationcenter"></a>
#### `JLib.modules.notificationCenter.create(config?)` → module def

Register with `JLib.registerModule(...)`. Pass `services.notifications` (a `JLib.notifications.create()` core) when rendering so it has something to display.

<a id="ref-settingspanel-create"></a>
#### `JLib.modules.settingsPanel.create(config)` → module def with `.full` / `.lite` / `.api`

`config: { namespace, title?, categories, features, scopes?, getCurrentScope?, extraSections?, about?, migrate?, onFeatureChange? }`. This is the big one — a whole feature schema in one call.

<details>
<summary>Examples</summary>

**Example 1:** A minimal panel, one boolean feature, one category:
```js
JLib.registerModule(JLib.modules.settingsPanel.create({
  namespace: 'myScript',
  categories: [{ id: 'general', label: 'General' }],
  features: [{ id: 'hideAds', type: 'boolean', category: 'general', label: 'Hide ads', default: true }],
}));
```

**Example 2:** A dependent child feature: `{ id: 'badgeColor', type: 'enum', category: 'general', label: 'Badge color', parent: 'hideAds', options: [...] }` — automatically disabled/greyed while `hideAds` is off.

**Example 3:** Multi-scope (e.g. per-site config within one script): `scopes: [{ id: 'siteA', label: 'Site A' }, { id: 'siteB', label: 'Site B' }], getCurrentScope: () => currentSiteId`.

**Example 4:** An About tab with more detail behind a drill-in: `about: { summary: 'Short one-liner.', details: (container) => container.appendChild(...) }`.
</details>

<a id="ref-settingspanel-api"></a>
#### `.api` (on a mounted `settingsPanel.create()` instance)

- **`api.getSettings(scopeId?)`** / **`api.setSettings(scopeId, obj)`** — read/write the live settings object directly.
- **`api.buildLink(opts)`** / **`api.parseLink(str)`** / **`api.openLink(str)`** / **`api.navigateTo(opts)`** — deep linking.
- **`api.showPanelSettings()`** — jumps straight to the theme/position/shortcut chrome tab.

<details>
<summary>Examples</summary>

**Example 1:** A "configure this" button on something injected into the page, jumping straight to one specific setting: `settingsInstance.api.navigateTo({ feature: 'showBadges' })` — opens the panel scrolled and highlighted to that exact row.

**Example 2:** Reading a setting from outside the panel entirely, e.g. in a content script that needs to check a preference: `const settings = settingsInstance.api.getSettings(); if (settings.hideAds) { ... }`.

**Example 3:** Building a shareable deep link: `const link = settingsInstance.api.buildLink({ category: 'appearance' });` — a URL-safe string you could put in your own script's help text or a bookmark.
</details>

---

## Function Index

<details>
<summary><strong>▶ Function Index (click to expand — jump-links into Reference above)</strong></summary>

| Function | Section |
|---|---|
| [`JLib.registerScript(config)`](#ref-registerscript) | Registration |
| [`JLib.composeNamespace(localPiece?)`](#ref-composenamespace) | Registration |
| [`JLib.registerTheme(name, resolveFn)`](#ref-registertheme) | Registration |
| [`JLib.registerModule(moduleDef)`](#ref-registermodule) | Registration |
| [`JLib.i18n.registerDictionary(config)`](#ref-i18n-registerdictionary) | Registration |
| [`JLib.utils.debounce(fn, wait)`](#ref-debounce) | Utilities |
| [`JLib.utils.throttle(fn, wait)`](#ref-throttle) | Utilities |
| [`JLib.utils.debouncePerKey(fn, wait)`](#ref-debounceperkey) | Utilities |
| [`JLib.utils.makeLogger(name, version?)`](#ref-makelogger) | Utilities |
| [`JLib.utils.sampleStructuralValue(boundaryEl, readValue, isUsable)`](#ref-samplestructuralvalue) | Utilities |
| [`JLib.heuristics.capture(rootEl?)`](#ref-heuristics-capture) | Heuristics |
| [`JLib.heuristics.rank(captured, keywords)`](#ref-heuristics-rank) | Heuristics |
| [`JLib.heuristics.captureAndRank(keywords, rootEl?)`](#ref-heuristics-captureandrank) | Heuristics |
| [`JLib.heuristics.withScrollLock(fn)`](#ref-heuristics-withscrolllock) | Heuristics |
| [`JLib.anchorCache.create()`](#ref-anchorcache-create) | Anchor cache |
| [`JLib.console.register(id, def)`](#ref-console-register) | Console |
| [`JLib.console.warn(id, ...args)` / `.info(...)`](#ref-console-warn) | Console |
| [`JLib.console.explain(id)`](#ref-console-explain) | Console |
| [`JLib.dom.el(tag, opts?, children?)` (alias `h`)](#ref-dom-el) | DOM & shadow |
| [`JLib.dom.$(selector, root?)` / `.$$(...)`](#ref-dom-select) | DOM & shadow |
| [`JLib.shadow.getRoot()`](#ref-shadow-getroot) | DOM & shadow |
| [`JLib.shadow.isOurRoot(rootNode)`](#ref-shadow-isourroot) | DOM & shadow |
| [`JLib.shadow.adoptStylesheet(sheet, rootNode)`](#ref-shadow-adoptstylesheet) | DOM & shadow |
| [`JLib.shadow.onRootCreated(cb)`](#ref-shadow-onrootcreated) | DOM & shadow |
| [`JLib.events.on(container, eventType, selector, handler, options?)`](#ref-events-on) | Events |
| [`JLib.events.onCapture(eventType, selector, handler)`](#ref-events-oncapture) | Events |
| [`JLib.dedupe.once(key, fn)`](#ref-dedupe-once) | Dedupe |
| [`JLib.dedupe.memoSync(key, fn, ttlMs?)`](#ref-dedupe-memosync) | Dedupe |
| [`JLib.dedupe.clear(key?)`](#ref-dedupe-clear) | Dedupe |
| [`JLib.triggers.watch(key, selector, callback, opts?)`](#ref-triggers-watch) | Triggers |
| [`JLib.triggers.fire(key, fn)`](#ref-triggers-fire) | Triggers |
| [`JLib.storage.createStore(features, options)`](#ref-storage-createstore) | Storage |
| [`JLib.theme.create(opts?)`](#ref-theme-create) | Theme |
| [`JLib.notifications.create(opts?)`](#ref-notifications-create) | Notifications |
| [`JLib.notifications.presenters.toast/banner/modal(core)`](#ref-notifications-presenters) | Notifications |
| [`JLib.moduleBase.create(config)`](#ref-modulebase-create) | Module lifecycle |
| [`JLib.render(opts?)` / `.scheduleRender(opts?)`](#ref-render) | Module lifecycle |
| [`JLib.dashboard`](#ref-dashboard) | Module lifecycle |
| [`JLib.cache.set(key, value)`](#ref-cache-set) | Cache |
| [`JLib.cache.get(key)`](#ref-cache-get) | Cache |
| [`JLib.cache.delete(key)`](#ref-cache-delete) | Cache |
| [`JLib.cache.watch(key, callback)`](#ref-cache-watch) | Cache |
| [`JLib.cache.ensureInit()`](#ref-cache-ensureinit) | Cache |
| [`JLib.cache.versionChanged`](#ref-cache-versionchanged) | Cache |
| [`JLib.colorProvider.getPalette(el, opts?)`](#ref-colorprovider-getpalette) | Color provider |
| [`JLib.colorProvider.getGlobalPalette()`](#ref-colorprovider-getglobalpalette) | Color provider |
| [`JLib.colorProvider.validate(partial)`](#ref-colorprovider-validate) | Color provider |
| [`JLib.colorProvider.ensureContrast(fg, bg, minRatio)`](#ref-colorprovider-ensurecontrast) | Color provider |
| [`JLib.colorProvider.contrastRatio/relativeLuminance(...)`](#ref-colorprovider-contrast) | Color provider |
| [`JLib.colorProvider.toCssRgb/toCssRgba(...)`](#ref-colorprovider-tocss) | Color provider |
| [`JLib.colorProvider.resolveAnchorBoundary(el)`](#ref-colorprovider-resolveanchorboundary) | Color provider |
| [`JLib.colorProvider.invalidate(el)` / `.invalidateAll()`](#ref-colorprovider-invalidate) | Color provider |
| [`JLib.colorProvider.preview(el, paletteOrSlot)`](#ref-colorprovider-preview) | Color provider |
| [`JLib.colorProvider.transitionPalette(el, from, to, opts?)`](#ref-colorprovider-transitionpalette) | Color provider |
| [`JLib.colorProvider.reveal(el, buildFn, opts?)` / `.revealAnchored(...)`](#ref-colorprovider-reveal) | Color provider |
| [`JLib.colorProvider.applyPaletteAsVars(el, palette, prefix?)`](#ref-colorprovider-applypaletteasvars) | Color provider |
| [`JLib.colorProvider.enrichWithExternalSources(palette, boundaryEl?)`](#ref-colorprovider-enrichwithexternalsources) | Color provider |
| [`JLib.colorProvider.getAccentViaShortlist(boundaryEl, base)`](#ref-colorprovider-getaccentviashortlist) | Color provider |
| [`JLib.colorProvider.detectDisplayGamut()`](#ref-colorprovider-detectdisplaygamut) | Color provider |
| [`JLib.radiusProvider.get(el)` / `.getGlobal()`](#ref-radiusprovider) | Structural providers |
| [`JLib.shadowProvider.get(el)` / `.getGlobal()`](#ref-shadowprovider) | Structural providers |
| [`JLib.borderProvider.get(el, opts?)` / `.getGlobal(opts?)`](#ref-borderprovider) | Structural providers |
| [`.invalidate(el)` / `.invalidateAll()` (radius/shadow/border)](#ref-structural-invalidate) | Structural providers |
| [`JLib.fontProvider.getRanked(el)`](#ref-fontprovider-getranked) | Structural providers |
| [`JLib.fontProvider.fontType(el, rank)`](#ref-fontprovider-fonttype) | Structural providers |
| [`JLib.fontProvider.layout.fitText(container, text, fontFamily, opts?)`](#ref-fontprovider-fittext) | Structural providers |
| [`.layout.shrink/wrap/truncate/fits/measure`](#ref-fontprovider-layout-parts) | Structural providers |
| [`JLib.superProvider.css.resolve(el, opts?)`](#ref-superprovider-resolve) | Super provider |
| [`JLib.superProvider.css.apply(el, opts?)`](#ref-superprovider-apply) | Super provider |
| [`JLib.superProvider.css.reveal(el, buildFn, opts?)`](#ref-superprovider-reveal) | Super provider |
| [`JLib.superProvider.css.transition(el, from, to, opts?)`](#ref-superprovider-transition) | Super provider |
| [`JLib.superProvider.css.fitText(el, container, text, opts?)`](#ref-superprovider-fittext) | Super provider |
| [`JLib.superProvider.css.invalidate(el)` / `.invalidateAll()`](#ref-superprovider-invalidate) | Super provider |
| [`JLib.elements.button.button(label, onClick, opts?)`](#ref-elements-button) | Elements |
| [`JLib.elements.inputs.toggleRow/dropdownRow/numberRow/textRow/actionRow(...)`](#ref-elements-inputs) | Elements |
| [`JLib.elements.inputs.makeKeyboardActivatable(el)`](#ref-elements-makekeyboardactivatable) | Elements |
| [`JLib.elements.modal.create(config)`](#ref-elements-modal) | Elements |
| [`JLib.elements.modal.getFocusableElements(container)`](#ref-elements-getfocusableelements) | Elements |
| [`JLib.elements.tabs.render(container, items, activeId, onSelect)`](#ref-elements-tabs) | Elements |
| [`JLib.elements.search.search(items, query, getText?)`](#ref-elements-search) | Elements |
| [`JLib.elements.search.inputField(opts?)`](#ref-elements-search-inputfield) | Elements |
| [`JLib.modules.notificationCenter.create(config?)`](#ref-notificationcenter) | Modules |
| [`JLib.modules.settingsPanel.create(config)`](#ref-settingspanel-create) | Modules |
| [`.api` (settingsPanel instance)](#ref-settingspanel-api) | Modules |

</details>

---

*If a function you expected to find here isn't listed, it's very likely internal (anything under `JLib._sp.*`, or a closure-private helper) rather than a real omission — see [Architecture.md](Architecture.md)'s glossary for the internal picture, or the relevant `src/*/README.md` for a file-level index.*
