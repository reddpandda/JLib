# JLib — API

> Verified against commit `3c8011f` + Pass B (2026-08-02). **Read this note before anything else below.**

This is a flat, function-by-function lookup — signature, what it does, one plain-English example. It is a different document from [Reference.md](Reference.md), on purpose: Reference.md explains *why* the codebase is built the way it is, for someone maintaining or extending it; this explains *what you can call*, for someone writing a userscript against it. They will drift apart differently and shouldn't be merged.

**Honest, upfront: this file is the most likely of all of JLib's docs to fall behind.** Every other doc in this repo describes architecture, rules, or file-level purpose — things that change rarely. This one is tied to individual function signatures, which change every time a parameter gets added or a return shape shifts. There is no automated check keeping it in sync (see `bundles/README.md`'s `.version.json` section for the one doc-staleness mechanism that *does* exist — this file isn't wired into it). Treat a mismatch between this file and the real source as expected eventually, not a sign something else is broken. If you find one, the source is correct and this file is stale — please don't infer the reverse.

The core of the library — registration, providers, storage, the module/dashboard shell — is stable and has been for a while (see [changelog.md](changelog.md)). It's this document that will age, not the code underneath it.

---

## Registration (`services/registration.js`)

Every one of these follows "registration is existence" — refuses and warns (or throws, for a few genuine programmer errors) rather than silently defaulting.

- **`JLib.registerScript({ namespace })` → `bool`.** Establishes your script's identity. Everything namespace-scoped (Settings Panel, `JLib.cache`) refuses to operate until this runs. *Example: at the very top of your userscript, right after the `@require` lines, you call this once with a unique name for your script — everything downstream that needs to know "which script is this" reads from here.*
- **`JLib.composeNamespace(localPiece?)` → `string | null`.** Combines your registered namespace with an optional local piece (a sub-identity like a specific Settings Panel instance). Returns `null` and warns if no script is registered. *Example: internally, `JLib.cache` and Settings Panel both call this to build their real storage key — you rarely call it directly unless you're building your own namespace-scoped feature.*
- **`JLib.registerTheme(name, resolveFn)` → `bool`.** Adds a theme. `resolveFn(targetEl)` returns a `{ '--jsp-*': value }` object. *Example: you want a theme that always matches your favorite streaming site's purple, regardless of what page you're on — you register a `resolveFn` that returns hardcoded purple values instead of sampling anything.*
- **`JLib.registerModule(moduleDef)` → `void`.** Adds a module to the dashboard. Throws if `moduleDef.id` is missing (a real config error, not a runtime condition). *Example: you build a small "Quick Links" panel and call this once so it shows up in the dashboard menu alongside Settings and Notifications.*
- **`JLib.i18n.registerDictionary({ lang, selfName, strings, isDefault? })` → `bool`.** Adds a language. *Example: you want to ship a Spanish translation of your userscript's settings panel — you build a `strings` object mapping your English labels to Spanish ones and register it.*

## Utilities (`services/utils.js`)

- **`JLib.utils.debounce(fn, wait)` → debounced `fn`, with `.cancel()`.** Trailing-edge: runs `wait`ms after the *last* call. *Example: you want to react once a burst of page mutations has settled, not on every single one — wrap your handler in `debounce`.*
- **`JLib.utils.throttle(fn, wait)` → throttled `fn`, with `.cancel()`.** Leading-edge: runs immediately, then at most once per `wait`ms. *Example: a scroll handler that should react right away but not fire hundreds of times a second while scrolling continues.*
- **`JLib.utils.debouncePerKey(fn, wait)` → keyed debounced `fn`, with `.cancel(key?)`.** Like `debounce`, but each distinct first argument gets its own timer. *Example: you're debouncing "save this specific setting to disk" — plain `debounce` would drop the second setting's save if both change within the same window; this doesn't.*
- **`JLib.utils.makeLogger(name, version?)` → `{ log, warn, error }`.** Console methods prefixed with `[name vX.Y.Z]`. *Example: instead of typing `console.log('[MyScript]', ...)` everywhere, call `makeLogger('MyScript', '1.0.0')` once and use `.log(...)` from then on.*
- **`JLib.utils.sampleStructuralValue(boundaryEl, readValue, isUsable)` → value or `null`.** Scans a handful of likely candidates under `boundaryEl`, majority-votes on whichever value `readValue` returns most often among ones `isUsable` accepts. What `radiusProvider`/`shadowProvider` are built on. *Example: you want "the border-radius this page seems to use most" — you'd pass a function reading `borderRadius` and a function rejecting `0px`.*

## Heuristics (`services/heuristics.js`)

- **`JLib.heuristics.capture(rootEl?)` → captured candidate data.** Walks the DOM under `rootEl` (default `document.body`) collecting tag/class/attribute info per element.
- **`JLib.heuristics.rank(captured, keywords)` → ranked array.** Scores captured elements against a keyword list via BM25.
- **`JLib.heuristics.captureAndRank(keywords, rootEl?)` → ranked array.** Convenience combining the two above in one call. *Example: you're building your own provider-like feature and want "the elements on this page most likely to be navigation" — pass `['nav', 'menu', 'header']` as keywords.*
- **`JLib.heuristics.withScrollLock(fn)` → `fn`'s return value.** Runs `fn` behind a real native blocking dialog, protecting a capture-then-read sequence from a SPA scroll library recycling elements mid-read. *Example: internally, `colorProvider`'s accent discovery wraps its whole capture+rank+read sequence in this so a virtualized list can't swap elements out from under it mid-scan.*

## Anchor cache (`services/anchor-cache.js`)

- **`JLib.anchorCache.create()` → `{ get, set, has, delete, invalidateAll }`.** A fresh `WeakMap`-by-element cache with automatic invalidation on class/style/data-theme changes. *Example: you're writing your own small provider-like utility and don't want to hand-roll cache invalidation — call `create()` once for your provider and use the returned cache the same way `radiusProvider` does internally.*

## Console (`services/console.js`)

- **`JLib.console.register(id, { template, explain?, hint? })` → `bool`.** Adds a named, findable warning/message definition.
- **`JLib.console.warn(id, ...args)`** / **`JLib.console.info(id, ...args)`.** Emits a registered message.
- **`JLib.console.explain(id)` → `string | null`.** Looks up the "why" for a message id. *Example: you're building a feature of your own that has a real, recurring failure mode — instead of a bare `console.warn('oops')`, register a message with a template and hint once, then call `JLib.console.warn('yourFeature.thatFailure', ...)` everywhere it can happen, so every occurrence is consistent and self-explanatory.*

## DOM & shadow (`services/dom.js`)

- **`JLib.dom.el(tag, opts?, children?)` → `HTMLElement`** (alias `h`). `opts`: `className`, `id`, `dataset`, `attrs`. *Example: `el('div', { className: 'my-box' }, ['Hello', el('span', {}, ['world'])])` builds a div containing text and a nested span, without touching `document.createElement` yourself.*
- **`JLib.dom.$(selector, root?)`** / **`JLib.dom.$$(selector, root?)`.** `querySelector`/`querySelectorAll` shortcuts, `$$` returns a real array.
- **`JLib.shadow.getRoot()` → `ShadowRoot`.** The one shared closed shadow root JLib's own chrome lives in, created on first use.
- **`JLib.shadow.isOurRoot(rootNode)` → `bool`.** Is this element's root JLib's own shared shadow root?
- **`JLib.shadow.adoptStylesheet(sheet, rootNode)`.** Adopts a `CSSStyleSheet` onto a root's `adoptedStyleSheets` — the CSP-safe way to style something. *Example: you're building your own reusable UI piece and want it CSP-safe the way JLib's own elements are — build a `CSSStyleSheet` once with `new CSSStyleSheet(); .replaceSync(css)`, then call `adoptStylesheet` on whatever root your element ends up in, instead of appending a `<style>` tag to `document.head`.*
- **`JLib.shadow.onRootCreated(cb)`.** Fires the instant the shared shadow root is actually created (or immediately if it already exists).

## Events (`services/events.js`)

- **`JLib.events.on(container, eventType, selector, handler, options?)` → `off()` function.** Delegated listener — `handler(event, matchedElement)` fires when something matching `selector` is clicked (or whatever `eventType`), even if it didn't exist yet when `on` was called. *Example: a site's product list keeps adding new tiles as you scroll — instead of re-attaching a listener to every new tile, call `JLib.events.on(document, 'click', '.product-tile', (e, tile) => ...)` once, and it catches tiles that don't exist yet.*
- **`JLib.events.onCapture(eventType, selector, handler)` → `off()`.** Shortcut for `on(document, eventType, selector, handler, true)` (capture phase).

## Dedupe (`services/dedupe.js`)

- **`JLib.dedupe.once(key, fn)` → `Promise`.** If a call under `key` is already in flight, returns the *same* promise instead of running `fn` again. *Example: two different parts of your script both trigger a fetch for the same data at nearly the same moment — wrapping both calls in `once('sameKey', fetchFn)` means only one real fetch happens; both callers get the same result.*
- **`JLib.dedupe.memoSync(key, fn, ttlMs?)` → value.** Synchronous version — caches `fn()`'s result for `ttlMs` (0 = no caching, just collapses simultaneous calls).
- **`JLib.dedupe.clear(key?)`.** Clears one key, or everything if omitted.

## Triggers (`services/triggers.js`)

- **`JLib.triggers.watch(key, selector, callback, opts?)` → a function that stops watching.** Fires `callback` when something matching `selector` appears under `opts.root` (default light DOM) — checked immediately in case it already exists. *Example: you want to react the moment a site's "load more" button appears, even though it doesn't exist on initial page load — `JLib.triggers.watch('loadMoreBtn', '.load-more', (el) => el.click())`.*
- **`JLib.triggers.fire(key, fn)`.** An explicit, demand-dedup-protected trigger (routed through `JLib.dedupe`) — for a call site that wants dedup protection against rapid repeat calls, not element-appearance watching.

## Storage (`services/storage.js`)

- **`JLib.storage.createStore(features, options)` → store.** `options.storageKeyPrefix` is required. Returns `{ load(scope?), save(scope?, obj), toggle(obj, id), watch(scope?, cb), getDefaults(scope?), appliesTo, ... }` — a schema-driven `GM_setValue`/`GM_getValue` wrapper with dependency enforcement. *Example: you have three boolean settings for your userscript — define them as `[{ id: 'showBadges', default: true }, ...]`, call `createStore` once, and use `.load()`/`.save()` instead of hand-rolling `GM_getValue`/`GM_setValue` JSON parsing yourself.*

## Theme (`services/theme.js`)

- **`JLib.theme.create(opts?)` → instance.** `opts.defaultMode` (theme name), `opts.animationsEnabled`. Returns `{ apply(targetEl, opts?), setMode(name, targetEl?), getMode(), setAnimationsEnabled(bool), startWatching(targetEl), stopWatching(), forceReExtract(targetEl), themes }`. This is what `JLib.render()` uses internally for the dashboard shell — you'd only call `create()` yourself for a *separate* themed surface outside the dashboard. *Example: you're building a floating button of your own, outside the settings dashboard, and want it to theme itself the same way — create your own theme instance and call `.apply()` on your button.*

## Notifications (`services/notifications.js`)

- **`JLib.notifications.create(opts?)` → core.** `opts.store` (optional, a `JLib.storage` store, needed for "do not show again"). Returns `{ notify(message, opts?), dismiss(id, opts?), subscribe(fn), getActive(), getHistory() }`. `notify` returns `{ id, dismiss() }` or `null` if suppressed. *Example: `const notifications = JLib.notifications.create(); notifications.notify('Saved!', { level: 'success', staleAfter: { type: 'default' } })` shows a message that auto-dismisses after 4 seconds.*
- **`JLib.notifications.presenters.toast(core)`** / **`.banner(core)`** / **`.modal(core)`** → `unsubscribe`. Wires a visual presenter to a core instance — call once per page per presenter you want active. A notification's `presenter` option (`'toast'`/`'banner'`/`'modal'`) picks which one renders it.

## Module lifecycle (`services/module-lifecycle.js`)

- **`JLib.moduleBase.create(config)` → module def.** `config: { id, label, order?, onMount(view, services, container), onUnmount() }`. `view` gives you `.header(title, rightControls?)` and `.section(label, renderBody, opts?)`. This is what every module (Settings Panel, Notification Center) is built through. *Example: you want a "Quick Links" module in the dashboard — `JLib.moduleBase.create({ id: 'links', label: 'Links', onMount: (view) => { view.header('Links'); view.section('Bookmarks', body => { ... }) } })`, then `JLib.registerModule(...)` the result.*
- **`JLib.render(opts?)`** / **`JLib.scheduleRender(opts?)`.** Builds the one dashboard/standalone shell from every registered module. `scheduleRender` defers to a microtask so it runs after all your other code — call this, not `render`, in almost every real script. Call once, at the very end.
- **`JLib.dashboard`** (only exists after render): `{ open(), close(), toggle(), destroy(), panelEl }`. *Example: you want a custom keyboard shortcut or button that opens your settings panel — call `JLib.dashboard.open()` from wherever that trigger lives.*

## Cache (`services/cache.js`)

- **`JLib.cache.set(key, value)` → `Promise`.** Persists non-settings data, IndexedDB-backed, cross-tab synced.
- **`JLib.cache.get(key)` → `Promise<value | undefined>`.**
- **`JLib.cache.delete(key)` → `Promise`.**
- **`JLib.cache.watch(key, callback)` → `unsubscribe`.** Fires on any change to `key`, local or from another tab.
- **`JLib.cache.ensureInit()` → `Promise`.** Usually called implicitly by the above; call directly if you need to know when the cache is genuinely ready.
- **`JLib.cache.versionChanged`** (getter, `bool`) — true if `GM_info.script.version` differs from what was recorded last session. *Example: you're caching a parsed, expensive-to-rebuild index of page data across reloads — `await JLib.cache.set('pageIndex', data)` on one visit, `await JLib.cache.get('pageIndex')` on the next, instead of rebuilding it from scratch every time.*

## Color provider (`providers/color-provider.js`)

- **`JLib.colorProvider.getPalette(el, opts?)` → palette.** Anchor-relative sampling. `opts.seedHue` (0-360) requests a specific hue instead of pure extraction. Returns `{ base, surface, elevated, ink, muted, accent, 'accent-hover', danger, success, warning }`, every slot a real, contrast-checked `{ r, g, b }`. *Example: you're building a badge that should visually belong to whatever product tile it sits on — `const palette = JLib.colorProvider.getPalette(tileEl)` gives you real, usable colors sampled from that specific tile's surroundings.*
- **`JLib.colorProvider.getGlobalPalette()` → palette.** Same shape, one page-wide sample instead of anchor-relative.
- **`JLib.colorProvider.validate(partial)` → full palette.** Fills in any missing slots with defaults and runs contrast correction — the "one door" every palette passes through.
- **`JLib.colorProvider.ensureContrast(fg, bg, minRatio)` → `{r,g,b}`.** Nudges `fg` toward more/less lightness until it clears `minRatio` against `bg`.
- **`JLib.colorProvider.contrastRatio(c1, c2)`** / **`.relativeLuminance(c)`** → number. Real WCAG math.
- **`JLib.colorProvider.toCssRgb(rgb)`** / **`.toCssRgba(rgb, a)`** → CSS string.
- **`JLib.colorProvider.resolveAnchorBoundary(el)` → element.** The real, dedup-cached "which real visual surface does this belong to" walk every provider shares.
- **`JLib.colorProvider.invalidate(el)`** / **`.invalidateAll()`.** Manual cache-clear escape hatches.
- **`JLib.colorProvider.preview(el, paletteOrSlot)`.** Dev-only: paint a palette (or one slot) onto an element via CSS vars, no caching.
- **`JLib.colorProvider.transitionPalette(el, fromPalette, toPalette, opts?)`.** Animates between two palettes on `el` — `opts.mode: 'ambient' | 'salient'`, `opts.surfaceKind: 'panel' | 'solid'`.
- **`JLib.colorProvider.reveal(el, buildFn, opts?)`** / **`.revealAnchored(el, buildFn)`.** Builds hidden, resolves the real palette, then fades in — no fallback color ever briefly shown. `opts.source: 'anchor' | 'global'`.
- **`JLib.colorProvider.applyPaletteAsVars(el, palette, prefix?)`.** Writes a palette onto `el.style` as CSS custom properties (default prefix `--jlib-color-`).
- **`JLib.colorProvider.enrichWithExternalSources(palette, boundaryEl?)` → `Promise<palette>`.** Optional async layer — checks manifest theme_color / favicon / meta theme-color against an already-resolved palette. *Example: you already have `getPalette()`'s synchronous result rendering, but want to refine it in the background — `const better = await JLib.colorProvider.enrichWithExternalSources(palette)` once it resolves.*
- **`JLib.colorProvider.getAccentViaShortlist(boundaryEl, base)` → `Promise<rgb | null>`.** Optional async layer — a persistent, drift-revalidated cache of which element/property won accent discovery last time, cheaper than full rediscovery on a reload.
- **`JLib.colorProvider.detectDisplayGamut()` → `'srgb' | 'p3' | 'rec2020'`.**

## Structural providers (`providers/radius-provider.js`, `shadow-provider.js`, `border-provider.js`, `font-provider.js`)

All four share the same shape:

- **`JLib.radiusProvider.get(el)`** / **`.getGlobal()`** → CSS string. *Example: `el.style.borderRadius = JLib.radiusProvider.get(anchorEl)` matches whatever radius convention the surrounding page uses.*
- **`JLib.shadowProvider.get(el)`** / **`.getGlobal()`** → CSS string.
- **`JLib.borderProvider.get(el, opts?)`** / **`.getGlobal(opts?)`** → CSS string. `opts.targetBg` (optional `{r,g,b}`) requests WCAG contrast correction against a specific background.
- Each has **`.invalidate(el)`** / **`.invalidateAll()`**, and a `DEFAULT_*` constant.

Font is the one with more shape:

- **`JLib.fontProvider.getRanked(el)` → 3 font-family strings.** Rank 1/2/3, always real values.
- **`JLib.fontProvider.fontType(el, rank)` → one font-family string.** `rank` 1-3.
- **`JLib.fontProvider.layout.fitText(container, text, fontFamily, opts?)` → final text applied.** The default entry point — fixed shrink → wrap → truncate pipeline, applied to `container` directly. *Example: a title you're injecting has to fit a fixed-width sidebar tab — `JLib.fontProvider.layout.fitText(tabEl, longTitle, font)` shrinks the font size, then wraps, then truncates with an ellipsis, whichever actually makes it fit.*
- **`.layout.shrink/.wrap/.truncate/.fits/.measure`** — the individual strategies, for a caller with a genuine reason to deviate from the fixed pipeline.

## Super provider (`providers/super-provider.js`)

- **`JLib.superProvider.css.resolve(el, opts?)` → bundle** `{ color?, font?, radius?, shadow?, border? }`. `opts` keys: omit for default, `false` to exclude, anything else to include (font accepts a 1-3 rank).
- **`JLib.superProvider.css.apply(el, opts?)` → bundle.** Resolves *and writes* the whole bundle onto `el` in one call. *Example: you're building a card that should match the page's color, radius, shadow, and font all at once — `JLib.superProvider.css.apply(cardEl, { color: true })` instead of calling five providers separately.*
- **`.reveal(el, buildFn, opts?)`**, **`.transition(el, fromBundle, toBundle, opts?)`**, **`.fitText(el, container, text, opts?)`** — bundle-aware versions of the color provider's equivalents.
- **`.invalidate(el)`** / **`.invalidateAll()`** — cascades to all five mini-providers at once.

## Elements (`elements/*.js`)

- **`JLib.elements.button.button(label, onClick, opts?)` → `HTMLButtonElement`.** `opts.variant: 'default' | 'danger' | 'ghost'`, `opts.disabled`, `opts.className`.
- **`JLib.elements.inputs.toggleRow/.dropdownRow/.numberRow/.textRow/.actionRow(label, desc, ..., onChange, opts?)` → row `HTMLElement`.** The row builders Settings Panel's schema dispatch uses — callable directly if you're building your own settings-like UI outside a full Settings Panel instance.
- **`JLib.elements.inputs.makeKeyboardActivatable(el)`.** Adds Enter/Space-triggers-click to a non-native interactive element.
- **`JLib.elements.modal.create(config)` → instance** `{ open(), close(), toggle(), destroy(), setPosition(pos), setKeyboardShortcut(combo), setTitle(title), panelEl, bodyEl, headerActionsEl }`. `config: { id, title, position?, content(bodyEl), footerText?, keyboardShortcut?, onOpen?, onClose?, appendTo? }`. *Example: you want your own popup separate from the dashboard — `const myModal = JLib.elements.modal.create({ id: 'myThing', title: 'My Thing', content: (body) => body.appendChild(...) }); myModal.open();` gives you a real native `<dialog>` with focus-trap and backdrop for free.*
- **`JLib.elements.tabs.render(container, items, activeId, onSelect)`.** `items: [{ id, label, badge?, groupLabel? }]`. Renders a vertical nav list into an already-connected `container`.
- **`JLib.elements.search.search(items, query, getText?)` → filtered, ranked array.** `getText(item)` defaults to `String(item)`. *Example: you have a list of 40 settings and want a search box — `JLib.elements.search.search(features, userQuery, f => f.label + ' ' + f.description)`.*
- **`JLib.elements.search.inputField(opts?)` → `HTMLInputElement`.** `opts: { placeholder?, debounceMs?, onQuery(query) }`. A ready-made debounced search box wired to `onQuery`.

## Modules (`modules/*.js`)

- **`JLib.modules.notificationCenter.create(config?)` → module def.** Register with `JLib.registerModule(...)`. Pass `services.notifications` (a `JLib.notifications.create()` core) when rendering so it has something to display.
- **`JLib.modules.settingsPanel.create(config)` → module def with `.full`/`.lite`/`.api`.** `config: { namespace, title?, categories, features, scopes?, getCurrentScope?, extraSections?, about?, migrate?, onFeatureChange? }`. This is the big one — a whole feature schema in one call. Once mounted, `.api` exposes:
  - **`api.getSettings(scopeId?)`** / **`api.setSettings(scopeId, obj)`** — read/write the live settings object directly.
  - **`api.buildLink(opts)`** / **`api.parseLink(str)`** / **`api.openLink(str)`** / **`api.navigateTo(opts)`** — deep linking. *Example: you want a "configure this" button on something you've injected into the page, that jumps straight to one specific setting — `settingsInstance.api.navigateTo({ feature: 'showBadges' })` opens the panel scrolled and highlighted to that exact row.*
  - **`api.showPanelSettings()`** — jumps straight to the theme/position/shortcut chrome tab.

---

*If a function you expected to find here isn't listed, it's very likely internal (anything under `JLib._sp.*`, or a closure-private helper) rather than a real omission — see [Reference.md](Reference.md)'s glossary for the internal picture, or the relevant `src/*/README.md` for a file-level index.*
