# JLib — API
<style>
  
  :root {
  --jlib-accent: #6c5ce7;
  --jlib-accent-soft: #6c5ce71a;
  --jlib-code-bg: #00000008;
  --jlib-border: #00000022;
}
@media (prefers-color-scheme: dark) {
  :root {
    --jlib-accent: #a29bfe;
    --jlib-accent-soft: #a29bfe26;
    --jlib-code-bg: #ffffff10;
    --jlib-border: #ffffff22;
  }
}
body { max-width: 850px; margin: 0 auto; padding: 0 1.5em 4em;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
  Arial, sans-serif; line-height: 1.7; }
h1 { font-size: 1.9em; color: var(--jlib-accent);
  border-bottom: 2px solid var(--jlib-accent); padding-bottom: 0.3em; }
h2 { font-size: 1.4em; border-bottom: 1px solid var(--jlib-accent-soft);
  padding-bottom: 0.25em; margin-top: 2em; }
h3 { font-size: 1.15em; border-left: 4px solid var(--jlib-accent-soft);
  padding-left: 0.6em; margin-top: 1.8em; }
code { background: var(--jlib-code-bg); padding: 0.15em 0.4em; border-radius: 4px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone; }
pre { background: var(--jlib-code-bg); border-radius: 8px; padding: 1.1em;
  border: 1px solid var(--jlib-border); }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th { background: var(--jlib-accent-soft); text-align: left; padding: 0.5em 0.7em; }
td { padding: 0.45em 0.7em; border-bottom: 1px solid var(--jlib-border); vertical-align: top; }
dt { margin-top: 1.4em; }
dt code { font-size: 1.02em; font-weight: 600; }
dd { margin-left: 1.2em; border-left: 2px solid var(--jlib-accent-soft);
  padding-left: 1em; margin-bottom: 0.6em; }
details { margin: 0.6em 0; border: 1px solid var(--jlib-border); border-radius: 6px; padding: 0.5em 1em; }
summary { cursor: pointer; font-weight: 600; color: var(--jlib-accent); }

</style>
> Verified against commit `3c8011f` + Pass B (2026-08-02). **Read this note before anything else below.**
>
> **Links to:** Onboarding.md ×5, Architecture.md ×1, Glossary.md ×1

This is the function reference — every `JLib.*` call, what it returns, what it does. If you're new to the library and want a guided first script instead, start with **[Onboarding.md](Onboarding.md)**; every function taught there has its full entry here too.

**Honest, upfront: this file is the most likely of all of JLib's docs to fall behind.** It's tied to individual function signatures, which change every time a parameter gets added or a return shape shifts — there is no automated check keeping it in sync (see `bundles/README.md`'s `.version.json` section for the one doc-staleness mechanism that *does* exist; this file isn't wired into it). If you find a mismatch, the source is correct and this file is stale — please don't infer the reverse.

**How to use this document:** the table below is the whole index — every function, one row, a real one-line definition, and a ↓ link straight to its full entry. Click ↓, read the entry, click ↑ to land back on that exact row. Nothing here is collapsed except the code examples inside each entry — the table and every definition are visible without a single click.

---

## Function Index

| Function | | Where from | Definition |
|---|---|---|---|
| <a id="row-ref-registerscript"></a>`JLib.registerScript(config)` | [↓](#ref-registerscript) | `services/registration.js` | Establishes your script's identity; required before anything namespace-scoped works. |
| <a id="row-ref-composenamespace"></a>`JLib.composeNamespace(localPiece?)` | [↓](#ref-composenamespace) | `services/registration.js` | Combines your registered namespace with an optional local piece. |
| <a id="row-ref-registertheme"></a>`JLib.registerTheme(name, resolveFn)` | [↓](#ref-registertheme) | `services/registration.js` | Registers a custom theme resolver function. |
| <a id="row-ref-registermodule"></a>`JLib.registerModule(moduleDef)` | [↓](#ref-registermodule) | `services/registration.js` | Adds a module to the dashboard. |
| <a id="row-ref-i18n-registerdictionary"></a>`JLib.i18n.registerDictionary(config)` | [↓](#ref-i18n-registerdictionary) | `services/registration.js` | Adds a language dictionary. |
| <a id="row-ref-debounce"></a>`JLib.utils.debounce(fn, wait)` | [↓](#ref-debounce) | `services/utils.js` | Trailing-edge debounced function, with `.cancel()`. |
| <a id="row-ref-throttle"></a>`JLib.utils.throttle(fn, wait)` | [↓](#ref-throttle) | `services/utils.js` | Leading-edge throttled function, with `.cancel()`. |
| <a id="row-ref-debounceperkey"></a>`JLib.utils.debouncePerKey(fn, wait)` | [↓](#ref-debounceperkey) | `services/utils.js` | Debounce that keys independently per first argument. |
| <a id="row-ref-makelogger"></a>`JLib.utils.makeLogger(name, version?)` | [↓](#ref-makelogger) | `services/utils.js` | Console logger prefixed with your script's name/version. |
| <a id="row-ref-samplestructuralvalue"></a>`JLib.utils.sampleStructuralValue(el, readValue, isUsable)` | [↓](#ref-samplestructuralvalue) | `services/utils.js` | Majority-votes the most common CSS value under an element. |
| <a id="row-ref-heuristics-capture"></a>`JLib.heuristics.capture(rootEl?)` | [↓](#ref-heuristics-capture) | `services/heuristics.js` | Walks the DOM collecting tag/class/attribute candidate data. |
| <a id="row-ref-heuristics-rank"></a>`JLib.heuristics.rank(captured, keywords)` | [↓](#ref-heuristics-rank) | `services/heuristics.js` | Scores captured elements against keywords via BM25. |
| <a id="row-ref-heuristics-captureandrank"></a>`JLib.heuristics.captureAndRank(keywords, rootEl?)` | [↓](#ref-heuristics-captureandrank) | `services/heuristics.js` | Convenience combining `capture` + `rank` in one call. |
| <a id="row-ref-heuristics-withscrolllock"></a>`JLib.heuristics.withScrollLock(fn)` | [↓](#ref-heuristics-withscrolllock) | `services/heuristics.js` | Runs `fn` behind a blocking dialog to freeze scroll-driven DOM changes. |
| <a id="row-ref-anchorcache-create"></a>`JLib.anchorCache.create()` | [↓](#ref-anchorcache-create) | `services/anchor-cache.js` | A fresh, auto-invalidating element cache for provider-like utilities. |
| <a id="row-ref-console-register"></a>`JLib.console.register(id, def)` | [↓](#ref-console-register) | `services/console.js` | Registers a named, findable warning/message definition. |
| <a id="row-ref-console-warn"></a>`JLib.console.warn(id, ...args)` / `.info(...)` | [↓](#ref-console-warn) | `services/console.js` | Emits a previously registered message. |
| <a id="row-ref-console-explain"></a>`JLib.console.explain(id)` | [↓](#ref-console-explain) | `services/console.js` | Looks up the "why" behind a registered message id. |
| <a id="row-ref-dom-el"></a>`JLib.dom.el(tag, opts?, children?)` | [↓](#ref-dom-el) | `services/dom.js` | Builds a DOM element (alias `h`). |
| <a id="row-ref-dom-select"></a>`JLib.dom.$(selector, root?)` / `.$$(...)` | [↓](#ref-dom-select) | `services/dom.js` | `querySelector`/`querySelectorAll` shortcuts. |
| <a id="row-ref-shadow-getroot"></a>`JLib.shadow.getRoot()` | [↓](#ref-shadow-getroot) | `services/dom.js` | The one shared closed shadow root JLib's own chrome lives in. |
| <a id="row-ref-shadow-isourroot"></a>`JLib.shadow.isOurRoot(rootNode)` | [↓](#ref-shadow-isourroot) | `services/dom.js` | Is this element's root JLib's own shared shadow root? |
| <a id="row-ref-shadow-adoptstylesheet"></a>`JLib.shadow.adoptStylesheet(sheet, rootNode)` | [↓](#ref-shadow-adoptstylesheet) | `services/dom.js` | The CSP-safe way to attach a stylesheet to a root. |
| <a id="row-ref-shadow-onrootcreated"></a>`JLib.shadow.onRootCreated(cb)` | [↓](#ref-shadow-onrootcreated) | `services/dom.js` | Fires the instant the shared shadow root is created. |
| <a id="row-ref-events-on"></a>`JLib.events.on(container, eventType, selector, handler, options?)` | [↓](#ref-events-on) | `services/events.js` | Delegated listener that catches elements added later. |
| <a id="row-ref-events-oncapture"></a>`JLib.events.onCapture(eventType, selector, handler)` | [↓](#ref-events-oncapture) | `services/events.js` | Capture-phase shortcut for `events.on`. |
| <a id="row-ref-dedupe-once"></a>`JLib.dedupe.once(key, fn)` | [↓](#ref-dedupe-once) | `services/dedupe.js` | Collapses concurrent calls under the same key into one promise. |
| <a id="row-ref-dedupe-memosync"></a>`JLib.dedupe.memoSync(key, fn, ttlMs?)` | [↓](#ref-dedupe-memosync) | `services/dedupe.js` | Synchronous memoization with an optional TTL. |
| <a id="row-ref-dedupe-clear"></a>`JLib.dedupe.clear(key?)` | [↓](#ref-dedupe-clear) | `services/dedupe.js` | Clears one dedupe entry, or everything. |
| <a id="row-ref-triggers-watch"></a>`JLib.triggers.watch(key, selector, callback, opts?)` | [↓](#ref-triggers-watch) | `services/triggers.js` | Fires a callback the moment a selector appears in the DOM. |
| <a id="row-ref-triggers-fire"></a>`JLib.triggers.fire(key, fn)` | [↓](#ref-triggers-fire) | `services/triggers.js` | An explicit, dedup-protected demand trigger. |
| <a id="row-ref-storage-createstore"></a>`JLib.storage.createStore(features, options)` | [↓](#ref-storage-createstore) | `services/storage.js` | Schema-driven GM-storage settings backend. |
| <a id="row-ref-theme-create"></a>`JLib.theme.create(opts?)` | [↓](#ref-theme-create) | `services/theme.js` | A themed instance for a surface outside the dashboard shell. |
| <a id="row-ref-notifications-create"></a>`JLib.notifications.create(opts?)` | [↓](#ref-notifications-create) | `services/notifications.js` | Headless toast/banner/modal notification core. |
| <a id="row-ref-notifications-presenters"></a>`JLib.notifications.presenters.toast/banner/modal(core)` | [↓](#ref-notifications-presenters) | `services/notifications.js` | Wires a visual presenter to a notification core. |
| <a id="row-ref-modulebase-create"></a>`JLib.moduleBase.create(config)` | [↓](#ref-modulebase-create) | `services/module-lifecycle.js` | Shared header/section scaffold every module is built through. |
| <a id="row-ref-render"></a>`JLib.render(opts?)` / `.scheduleRender(opts?)` | [↓](#ref-render) | `services/module-lifecycle.js` | Builds the dashboard/standalone shell from every registered module. |
| <a id="row-ref-dashboard"></a>`JLib.dashboard` | [↓](#ref-dashboard) | `services/module-lifecycle.js` | Open/close/toggle handles for the rendered shell. |
| <a id="row-ref-cache-set"></a>`JLib.cache.set(key, value)` | [↓](#ref-cache-set) | `services/cache.js` | Persists non-settings data. |
| <a id="row-ref-cache-get"></a>`JLib.cache.get(key)` | [↓](#ref-cache-get) | `services/cache.js` | Reads persisted non-settings data. |
| <a id="row-ref-cache-delete"></a>`JLib.cache.delete(key)` | [↓](#ref-cache-delete) | `services/cache.js` | Deletes a cached key. |
| <a id="row-ref-cache-watch"></a>`JLib.cache.watch(key, callback)` | [↓](#ref-cache-watch) | `services/cache.js` | Fires on any change to a cached key, local or cross-tab. |
| <a id="row-ref-cache-ensureinit"></a>`JLib.cache.ensureInit()` | [↓](#ref-cache-ensureinit) | `services/cache.js` | Resolves once the cache is genuinely ready. |
| <a id="row-ref-cache-versionchanged"></a>`JLib.cache.versionChanged` | [↓](#ref-cache-versionchanged) | `services/cache.js` | True if the script's version changed since last session. |
| <a id="row-ref-colorprovider-getpalette"></a>`JLib.colorProvider.getPalette(el, opts?)` | [↓](#ref-colorprovider-getpalette) | `providers/color-provider.js` | Anchor-relative, sampled, contrast-checked color palette. |
| <a id="row-ref-colorprovider-getglobalpalette"></a>`JLib.colorProvider.getGlobalPalette()` | [↓](#ref-colorprovider-getglobalpalette) | `providers/color-provider.js` | Same shape as `getPalette`, sampled page-wide. |
| <a id="row-ref-colorprovider-validate"></a>`JLib.colorProvider.validate(partial)` | [↓](#ref-colorprovider-validate) | `providers/color-provider.js` | Fills in and contrast-corrects a partial palette. |
| <a id="row-ref-colorprovider-ensurecontrast"></a>`JLib.colorProvider.ensureContrast(fg, bg, minRatio)` | [↓](#ref-colorprovider-ensurecontrast) | `providers/color-provider.js` | Nudges a color until it clears a contrast ratio. |
| <a id="row-ref-colorprovider-contrast"></a>`JLib.colorProvider.contrastRatio(c1, c2)` / `.relativeLuminance(c)` | [↓](#ref-colorprovider-contrast) | `providers/color-provider.js` | Real WCAG contrast math. |
| <a id="row-ref-colorprovider-tocss"></a>`JLib.colorProvider.toCssRgb(rgb)` / `.toCssRgba(rgb, a)` | [↓](#ref-colorprovider-tocss) | `providers/color-provider.js` | Converts an `{r,g,b}` object to a CSS color string. |
| <a id="row-ref-colorprovider-resolveanchorboundary"></a>`JLib.colorProvider.resolveAnchorBoundary(el)` | [↓](#ref-colorprovider-resolveanchorboundary) | `providers/color-provider.js` | Finds the real visual surface an element belongs to. |
| <a id="row-ref-colorprovider-invalidate"></a>`JLib.colorProvider.invalidate(el)` / `.invalidateAll()` | [↓](#ref-colorprovider-invalidate) | `providers/color-provider.js` | Manual cache-clear escape hatches. |
| <a id="row-ref-colorprovider-preview"></a>`JLib.colorProvider.preview(el, paletteOrSlot)` | [↓](#ref-colorprovider-preview) | `providers/color-provider.js` | Dev-only palette paint, no caching. |
| <a id="row-ref-colorprovider-transitionpalette"></a>`JLib.colorProvider.transitionPalette(el, from, to, opts?)` | [↓](#ref-colorprovider-transitionpalette) | `providers/color-provider.js` | Animates an element between two palettes. |
| <a id="row-ref-colorprovider-reveal"></a>`JLib.colorProvider.reveal(el, buildFn, opts?)` / `.revealAnchored(...)` | [↓](#ref-colorprovider-reveal) | `providers/color-provider.js` | Builds hidden, resolves the real palette, then fades in. |
| <a id="row-ref-colorprovider-applypaletteasvars"></a>`JLib.colorProvider.applyPaletteAsVars(el, palette, prefix?)` | [↓](#ref-colorprovider-applypaletteasvars) | `providers/color-provider.js` | Writes a palette onto an element as CSS custom properties. |
| <a id="row-ref-colorprovider-enrichwithexternalsources"></a>`JLib.colorProvider.enrichWithExternalSources(palette, boundaryEl?)` | [↓](#ref-colorprovider-enrichwithexternalsources) | `providers/color-provider.js` | Async refinement using manifest/favicon/meta color. |
| <a id="row-ref-colorprovider-getaccentviashortlist"></a>`JLib.colorProvider.getAccentViaShortlist(boundaryEl, base)` | [↓](#ref-colorprovider-getaccentviashortlist) | `providers/color-provider.js` | Async, cached accent-discovery shortcut. |
| <a id="row-ref-colorprovider-detectdisplaygamut"></a>`JLib.colorProvider.detectDisplayGamut()` | [↓](#ref-colorprovider-detectdisplaygamut) | `providers/color-provider.js` | Detects sRGB/P3/Rec2020 display support. |
| <a id="row-ref-radiusprovider"></a>`JLib.radiusProvider.get(el)` / `.getGlobal()` | [↓](#ref-radiusprovider) | `providers/radius-provider.js` | Sampled `border-radius` value, with authored fallback. |
| <a id="row-ref-shadowprovider"></a>`JLib.shadowProvider.get(el)` / `.getGlobal()` | [↓](#ref-shadowprovider) | `providers/shadow-provider.js` | Sampled `box-shadow` value, with authored fallback. |
| <a id="row-ref-borderprovider"></a>`JLib.borderProvider.get(el, opts?)` / `.getGlobal(opts?)` | [↓](#ref-borderprovider) | `providers/border-provider.js` | Sampled border color/style, with contrast-correction option. |
| <a id="row-ref-structural-invalidate"></a>`.invalidate(el)` / `.invalidateAll()` (radius/shadow/border) | [↓](#ref-structural-invalidate) | `providers/*-provider.js` | Manual cache-clear, shared shape across all three. |
| <a id="row-ref-fontprovider-getranked"></a>`JLib.fontProvider.getRanked(el)` | [↓](#ref-fontprovider-getranked) | `providers/font-provider.js` | Three ranked, always-real font-family candidates. |
| <a id="row-ref-fontprovider-fonttype"></a>`JLib.fontProvider.fontType(el, rank)` | [↓](#ref-fontprovider-fonttype) | `providers/font-provider.js` | One font-family string by rank (1–3). |
| <a id="row-ref-fontprovider-fittext"></a>`JLib.fontProvider.layout.fitText(container, text, fontFamily, opts?)` | [↓](#ref-fontprovider-fittext) | `providers/font-provider.js` | Shrink → wrap → truncate text-fitting pipeline. |
| <a id="row-ref-fontprovider-layout-parts"></a>`.layout.shrink` / `.wrap` / `.truncate` / `.fits` / `.measure` | [↓](#ref-fontprovider-layout-parts) | `providers/font-provider.js` | The individual text-fitting strategies. |
| <a id="row-ref-superprovider-resolve"></a>`JLib.superProvider.css.resolve(el, opts?)` | [↓](#ref-superprovider-resolve) | `providers/super-provider.js` | Resolves a bundle of multiple providers at once. |
| <a id="row-ref-superprovider-apply"></a>`JLib.superProvider.css.apply(el, opts?)` | [↓](#ref-superprovider-apply) | `providers/super-provider.js` | Resolves and writes a provider bundle onto an element. |
| <a id="row-ref-superprovider-reveal"></a>`JLib.superProvider.css.reveal(el, buildFn, opts?)` | [↓](#ref-superprovider-reveal) | `providers/super-provider.js` | Bundle-aware version of `colorProvider.reveal()`. |
| <a id="row-ref-superprovider-transition"></a>`JLib.superProvider.css.transition(el, from, to, opts?)` | [↓](#ref-superprovider-transition) | `providers/super-provider.js` | Bundle-aware version of `colorProvider.transitionPalette()`. |
| <a id="row-ref-superprovider-fittext"></a>`JLib.superProvider.css.fitText(el, container, text, opts?)` | [↓](#ref-superprovider-fittext) | `providers/super-provider.js` | Resolves the bundle's font and fits text in one call. |
| <a id="row-ref-superprovider-invalidate"></a>`JLib.superProvider.css.invalidate(el)` / `.invalidateAll()` | [↓](#ref-superprovider-invalidate) | `providers/super-provider.js` | Cascading cache-clear across all five mini-providers. |
| <a id="row-ref-elements-button"></a>`JLib.elements.button.button(label, onClick, opts?)` | [↓](#ref-elements-button) | `elements/button.js` | Builds a styled `<button>`. |
| <a id="row-ref-elements-inputs"></a>`JLib.elements.inputs.toggleRow` / `.dropdownRow` / `.numberRow` / `.textRow` / `.actionRow` | [↓](#ref-elements-inputs) | `elements/inputs.js` | Row builders a settings section is made of. |
| <a id="row-ref-elements-makekeyboardactivatable"></a>`JLib.elements.inputs.makeKeyboardActivatable(el)` | [↓](#ref-elements-makekeyboardactivatable) | `elements/inputs.js` | Adds Enter/Space activation to a non-native element. |
| <a id="row-ref-elements-modal"></a>`JLib.elements.modal.create(config)` | [↓](#ref-elements-modal) | `elements/modal.js` | Builds a native `<dialog>`-based modal. |
| <a id="row-ref-elements-getfocusableelements"></a>`JLib.elements.modal.getFocusableElements(container)` | [↓](#ref-elements-getfocusableelements) | `elements/modal.js` | Lists focusable elements, for building a custom focus-trap. |
| <a id="row-ref-elements-tabs"></a>`JLib.elements.tabs.render(container, items, activeId, onSelect)` | [↓](#ref-elements-tabs) | `elements/tabs.js` | Renders a vertical nav list into a connected container. |
| <a id="row-ref-elements-search"></a>`JLib.elements.search.search(items, query, getText?)` | [↓](#ref-elements-search) | `elements/search-input.js` | Fuzzy-searches and ranks a list. |
| <a id="row-ref-elements-search-inputfield"></a>`JLib.elements.search.inputField(opts?)` | [↓](#ref-elements-search-inputfield) | `elements/search-input.js` | A ready-made debounced search input. |
| <a id="row-ref-notificationcenter"></a>`JLib.modules.notificationCenter.create(config?)` | [↓](#ref-notificationcenter) | `modules/notification-center.js` | A module listing notification history. |
| <a id="row-ref-settingspanel-create"></a>`JLib.modules.settingsPanel.create(config)` | [↓](#ref-settingspanel-create) | `modules/settings-panel/` | Builds a full, schema-driven settings panel module. |
| <a id="row-ref-settingspanel-api"></a>`.api` (settingsPanel instance) | [↓](#ref-settingspanel-api) | `modules/settings-panel/` | Read/write settings + deep-linking methods. |

---

## Reference

Full definitions, in the same order as the table above. Every entry ends with `↑ Back to table`, which lands you back on that exact row.

### Registration (`services/registration.js`)

Every one of these follows "registration is existence" — refuses and warns rather than silently defaulting.

<dl>

<dt><a id="ref-registerscript"></a><code>JLib.registerScript(config)</code> → <code>bool</code></dt>
<dd>

Establishes your script's identity. `config.namespace` is required. Everything namespace-scoped (Settings Panel, `JLib.cache`) refuses to operate until this runs.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.registerScript({ namespace: 'myScript' })` at the top of your userscript, once.

**Example 2:** Calling it a second time (e.g. from an accidentally double-loaded `@require`) is refused and warned — the second call is a no-op, the first registration wins.

</details>

[↑ Back to table](#row-ref-registerscript)

</dd>

<dt><a id="ref-composenamespace"></a><code>JLib.composeNamespace(localPiece?)</code> → <code>string | null</code></dt>
<dd>

Combines your registered namespace with an optional local piece (a sub-identity like a specific Settings Panel instance). Returns `null` and warns if no script is registered.

<details>
<summary>Examples</summary>

**Example:** Internally, `JLib.cache` and Settings Panel both call this to build their real storage key — `JLib.composeNamespace('myFeature')` on a script registered as `'myScript'` returns `'myScript.myFeature'`.

</details>

[↑ Back to table](#row-ref-composenamespace)

</dd>

<dt><a id="ref-registertheme"></a><code>JLib.registerTheme(name, resolveFn)</code> → <code>bool</code></dt>
<dd>

Adds a theme. `resolveFn(targetEl)` returns a `{ '--jsp-*': value, ... }` object.

<details>
<summary>Examples</summary>

**Example:** A theme that always matches a specific site's brand color:

```js
JLib.registerTheme('myBrand', () => ({ '--jsp-bg': '#1a1a2e', '--jsp-accent': '#e94560' }));
```

</details>

[↑ Back to table](#row-ref-registertheme)

</dd>

<dt><a id="ref-registermodule"></a><code>JLib.registerModule(moduleDef)</code> → <code>void</code></dt>
<dd>

Adds a module to the dashboard. Throws if `moduleDef.id` is missing.

<details>
<summary>Examples</summary>

**Example:** See [Onboarding.md](Onboarding.md#2-build-a-module) — `registerModule` + `moduleBase.create` are almost always called together.

</details>

[↑ Back to table](#row-ref-registermodule)

</dd>

<dt><a id="ref-i18n-registerdictionary"></a><code>JLib.i18n.registerDictionary({ lang, selfName, strings, isDefault? })</code> → <code>bool</code></dt>
<dd>

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

[↑ Back to table](#row-ref-i18n-registerdictionary)

</dd>

</dl>

### Utilities (`services/utils.js`)

<dl>

<dt><a id="ref-debounce"></a><code>JLib.utils.debounce(fn, wait)</code> → debounced <code>fn</code>, with <code>.cancel()</code></dt>
<dd>

Trailing-edge: runs `wait`ms after the *last* call, not the first.

<details>
<summary>Examples</summary>

**Example:** React once a burst of page mutations has settled: `const settled = JLib.utils.debounce(scanPage, 200); observer = new MutationObserver(settled);`.

</details>

[↑ Back to table](#row-ref-debounce)

</dd>

<dt><a id="ref-throttle"></a><code>JLib.utils.throttle(fn, wait)</code> → throttled <code>fn</code>, with <code>.cancel()</code></dt>
<dd>

Leading-edge: runs immediately, then at most once per `wait`ms while calls keep coming.

<details>
<summary>Examples</summary>

**Example:** A scroll handler that should react right away, then rate-limit: `window.addEventListener('scroll', JLib.utils.throttle(onScroll, 100))`.

</details>

[↑ Back to table](#row-ref-throttle)

</dd>

<dt><a id="ref-debounceperkey"></a><code>JLib.utils.debouncePerKey(fn, wait)</code> → keyed debounced <code>fn</code>, with <code>.cancel(key?)</code></dt>
<dd>

Like `debounce`, but each distinct first argument gets its own independent timer.

<details>
<summary>Examples</summary>

**Example:** Debouncing "flush this specific setting to disk" per setting id — plain `debounce` would silently drop the second setting's flush if both changed within the same window: `const flush = JLib.utils.debouncePerKey((key, val) => save(key, val), 250);`.

</details>

[↑ Back to table](#row-ref-debounceperkey)

</dd>

<dt><a id="ref-makelogger"></a><code>JLib.utils.makeLogger(name, version?)</code> → <code>{ log, warn, error }</code></dt>
<dd>

Console methods prefixed with `[name vX.Y.Z]`.

<details>
<summary>Examples</summary>

**Example:** `const logger = JLib.utils.makeLogger('MyScript', '1.0.0'); logger.warn('something looked off');` prints `[MyScript v1.0.0] something looked off`.

</details>

[↑ Back to table](#row-ref-makelogger)

</dd>

<dt><a id="ref-samplestructuralvalue"></a><code>JLib.utils.sampleStructuralValue(boundaryEl, readValue, isUsable)</code> → value or <code>null</code></dt>
<dd>

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

[↑ Back to table](#row-ref-samplestructuralvalue)

</dd>

</dl>

### Heuristics (`services/heuristics.js`)

<dl>

<dt><a id="ref-heuristics-capture"></a><code>JLib.heuristics.capture(rootEl?)</code> → captured candidate data</dt>
<dd>

Walks the DOM under `rootEl` (default `document.body`) collecting tag/class/attribute data per element.

[↑ Back to table](#row-ref-heuristics-capture)

</dd>

<dt><a id="ref-heuristics-rank"></a><code>JLib.heuristics.rank(captured, keywords)</code> → ranked array</dt>
<dd>

Scores captured elements against a keyword list via real BM25.

[↑ Back to table](#row-ref-heuristics-rank)

</dd>

<dt><a id="ref-heuristics-captureandrank"></a><code>JLib.heuristics.captureAndRank(keywords, rootEl?)</code> → ranked array</dt>
<dd>

Convenience combining `capture` + `rank` in one call.

<details>
<summary>Examples</summary>

**Example:** "The elements on this page most likely to be navigation": `JLib.heuristics.captureAndRank(['nav', 'menu', 'header'])`.

</details>

[↑ Back to table](#row-ref-heuristics-captureandrank)

</dd>

<dt><a id="ref-heuristics-withscrolllock"></a><code>JLib.heuristics.withScrollLock(fn)</code> → <code>fn</code>'s return value</dt>
<dd>

Runs `fn` behind a real native blocking dialog, protecting a capture-then-read sequence from a SPA scroll library recycling elements mid-read.

<details>
<summary>Examples</summary>

**Example:** Internally, `colorProvider`'s accent discovery wraps its whole capture+rank+read sequence in this so a virtualized list can't swap elements out from under it mid-scan.

</details>

[↑ Back to table](#row-ref-heuristics-withscrolllock)

</dd>

</dl>

### Anchor cache (`services/anchor-cache.js`)

<dl>

<dt><a id="ref-anchorcache-create"></a><code>JLib.anchorCache.create()</code> → <code>{ get, set, has, delete, invalidateAll }</code></dt>
<dd>

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

[↑ Back to table](#row-ref-anchorcache-create)

</dd>

</dl>

### Console (`services/console.js`)

<dl>

<dt><a id="ref-console-register"></a><code>JLib.console.register(id, { template, explain?, hint? })</code> → <code>bool</code></dt>
<dd>

Adds a named, findable warning/message definition.

[↑ Back to table](#row-ref-console-register)

</dd>

<dt><a id="ref-console-warn"></a><code>JLib.console.warn(id, ...args)</code> / <code>JLib.console.info(id, ...args)</code></dt>
<dd>

Emits a registered message.

<details>
<summary>Examples</summary>

**Example:** A feature of your own with a real, recurring failure mode:

```js
JLib.console.register('myFeature.missingConfig', {
  template: () => 'myFeature refused — config.apiKey is required.',
  hint: 'Pass { apiKey: "..." } to myFeature.init().',
});
JLib.console.warn('myFeature.missingConfig');
```

</details>

[↑ Back to table](#row-ref-console-warn)

</dd>

<dt><a id="ref-console-explain"></a><code>JLib.console.explain(id)</code> → <code>string | null</code></dt>
<dd>

Looks up the "why" for a registered message id.

[↑ Back to table](#row-ref-console-explain)

</dd>

</dl>

### DOM & shadow (`services/dom.js`)

<dl>

<dt><a id="ref-dom-el"></a><code>JLib.dom.el(tag, opts?, children?)</code> → <code>HTMLElement</code> (alias <code>h</code>)</dt>
<dd>

`opts`: `className`, `id`, `dataset`, `attrs`.

<details>
<summary>Examples</summary>

**Example 1:** `el('div', { className: 'my-box' }, ['Hello', el('span', {}, ['world'])])`.

**Example 2:** `el('div', { dataset: { itemId: '42' } })` produces `<div data-item-id="42">`.

**Example 3:** `el('div', { attrs: { role: 'button', tabindex: '0' } })` for things `dataset` doesn't cover.

</details>

[↑ Back to table](#row-ref-dom-el)

</dd>

<dt><a id="ref-dom-select"></a><code>JLib.dom.$(selector, root?)</code> / <code>JLib.dom.$$(selector, root?)</code></dt>
<dd>

`querySelector`/`querySelectorAll` shortcuts — `$$` returns a real array, not a `NodeList`.

[↑ Back to table](#row-ref-dom-select)

</dd>

<dt><a id="ref-shadow-getroot"></a><code>JLib.shadow.getRoot()</code> → <code>ShadowRoot</code></dt>
<dd>

The one shared closed shadow root JLib's own chrome lives in, created on first use.

[↑ Back to table](#row-ref-shadow-getroot)

</dd>

<dt><a id="ref-shadow-isourroot"></a><code>JLib.shadow.isOurRoot(rootNode)</code> → <code>bool</code></dt>
<dd>

Is this element's root JLib's own shared shadow root?

[↑ Back to table](#row-ref-shadow-isourroot)

</dd>

<dt><a id="ref-shadow-adoptstylesheet"></a><code>JLib.shadow.adoptStylesheet(sheet, rootNode)</code></dt>
<dd>

Adopts a `CSSStyleSheet` onto a root's `adoptedStyleSheets` — the real, CSP-safe way to style something.

<details>
<summary>Examples</summary>

**Example:**

```js
const sheet = new CSSStyleSheet();
sheet.replaceSync('.my-thing { color: red; }');
JLib.shadow.adoptStylesheet(sheet, myElement.getRootNode());
```

</details>

[↑ Back to table](#row-ref-shadow-adoptstylesheet)

</dd>

<dt><a id="ref-shadow-onrootcreated"></a><code>JLib.shadow.onRootCreated(cb)</code></dt>
<dd>

Fires the instant the shared shadow root is actually created (or immediately if it already exists).

[↑ Back to table](#row-ref-shadow-onrootcreated)

</dd>

</dl>

### Events (`services/events.js`)

<dl>

<dt><a id="ref-events-on"></a><code>JLib.events.on(container, eventType, selector, handler, options?)</code> → <code>off()</code> function</dt>
<dd>

Delegated listener — fires when something matching `selector` is clicked (or whatever `eventType`), even if it didn't exist yet when `on` was called.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.events.on(document, 'click', '.product-tile', (e, tile) => console.log(tile.dataset.id))`.

**Example 2:** Scoped to a narrower container: `JLib.events.on(document.querySelector('#results'), 'click', '.item', handler)`.

**Example 3:** Capture phase: `JLib.events.on(document, 'click', 'a', handler, { capture: true })`.

**Example 4:** Cleaning up: `const off = JLib.events.on(...); /* later */ off();`.

</details>

[↑ Back to table](#row-ref-events-on)

</dd>

<dt><a id="ref-events-oncapture"></a><code>JLib.events.onCapture(eventType, selector, handler)</code> → <code>off()</code></dt>
<dd>

Shortcut for `on(document, eventType, selector, handler, true)`.

[↑ Back to table](#row-ref-events-oncapture)

</dd>

</dl>

### Dedupe (`services/dedupe.js`)

<dl>

<dt><a id="ref-dedupe-once"></a><code>JLib.dedupe.once(key, fn)</code> → <code>Promise</code></dt>
<dd>

If a call under `key` is already in flight, returns the *same* promise instead of running `fn` again.

<details>
<summary>Examples</summary>

**Example:** Two different parts of your script both trigger a fetch for the same data at nearly the same moment: `JLib.dedupe.once('sameKey', fetchFn)` means only one real fetch happens.

</details>

[↑ Back to table](#row-ref-dedupe-once)

</dd>

<dt><a id="ref-dedupe-memosync"></a><code>JLib.dedupe.memoSync(key, fn, ttlMs?)</code> → value</dt>
<dd>

Synchronous version — caches `fn()`'s result for `ttlMs` (0 = no caching, just collapses simultaneous calls).

[↑ Back to table](#row-ref-dedupe-memosync)

</dd>

<dt><a id="ref-dedupe-clear"></a><code>JLib.dedupe.clear(key?)</code></dt>
<dd>

Clears one key, or everything if omitted.

[↑ Back to table](#row-ref-dedupe-clear)

</dd>

</dl>

### Triggers (`services/triggers.js`)

<dl>

<dt><a id="ref-triggers-watch"></a><code>JLib.triggers.watch(key, selector, callback, opts?)</code> → a function that stops watching</dt>
<dd>

Fires `callback` when something matching `selector` appears under `opts.root` — checked immediately in case it already exists.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.triggers.watch('loadMore', '.load-more-btn', (el) => el.click())`.

**Example 2:** Scoped: `JLib.triggers.watch('modalClose', '.close-btn', fn, { root: modalContainer })`.

**Example 3:** `const stop = JLib.triggers.watch('key', sel, cb); /* later */ stop();`.

**Example 4:** Re-registering under the same key while a watch is still active is refused and warned.

</details>

[↑ Back to table](#row-ref-triggers-watch)

</dd>

<dt><a id="ref-triggers-fire"></a><code>JLib.triggers.fire(key, fn)</code></dt>
<dd>

An explicit, demand-dedup-protected trigger (routed through `JLib.dedupe`).

[↑ Back to table](#row-ref-triggers-fire)

</dd>

</dl>

### Storage (`services/storage.js`)

<dl>

<dt><a id="ref-storage-createstore"></a><code>JLib.storage.createStore(features, options)</code> → store</dt>
<dd>

`options.storageKeyPrefix` is required. Returns `{ load(scope?), save(scope?, obj), toggle(obj, id), watch(scope?, cb), getDefaults(scope?), appliesTo, enforceDependencies, storageKey, featuresById, features }`.

<details>
<summary>Examples</summary>

**Example 1:** Three boolean settings: `[{ id: 'showBadges', default: true }, ...]`, then `.load()`/`.save()`.

**Example 2:** Parent/child dependency: `{ id: 'badgeColor', parent: 'showBadges', default: 'red' }` — `enforceDependencies` forces it off if the parent is off.

**Example 3:** Multi-scope: `store.load('siteA')` and `store.load('siteB')` are independent.

**Example 4:** Reacting live: `store.watch(scope, (freshSettings) => { /* re-render */ })`.

**Example 5:** Migration: `{ migrate: (loaded) => { if (loaded.oldKey) loaded.newKey = loaded.oldKey; } }`.

</details>

[↑ Back to table](#row-ref-storage-createstore)

</dd>

</dl>

### Theme (`services/theme.js`)

<dl>

<dt><a id="ref-theme-create"></a><code>JLib.theme.create(opts?)</code> → instance</dt>
<dd>

`opts.defaultMode`, `opts.animationsEnabled`. Returns `{ apply(targetEl, opts?), setMode(name, targetEl?), getMode(), setAnimationsEnabled(bool), startWatching(targetEl), stopWatching(), forceReExtract(targetEl), themes }`.

<details>
<summary>Examples</summary>

**Example 1:** A floating button outside the dashboard, themed the same way: `const myTheme = JLib.theme.create(); myTheme.apply(myButton);`.

**Example 2:** Re-sampling live: `myTheme.startWatching(myButton);`.

**Example 3:** Forcing a fresh sample: `myTheme.forceReExtract(myButton);`.

</details>

[↑ Back to table](#row-ref-theme-create)

</dd>

</dl>

### Notifications (`services/notifications.js`)

<dl>

<dt><a id="ref-notifications-create"></a><code>JLib.notifications.create(opts?)</code> → core</dt>
<dd>

`opts.store` (optional, needed for "do not show again"). Returns `{ notify(message, opts?), dismiss(id, opts?), subscribe(fn), getActive(), getHistory() }`.

<details>
<summary>Examples</summary>

**Example 1:** Auto-dismissing: `notifications.notify('Saved!', { level: 'success', staleAfter: { type: 'default' } })`.

**Example 2:** Persistent: omit `staleAfter` entirely.

**Example 3:** Dismiss on next interaction: `{ staleAfter: { type: 'interaction' } }`.

**Example 4:** Dismissible-forever: `{ dismissKey: 'onboardingTip', allowDoNotShowAgain: true }`.

**Example 5:** Subscribing: `notifications.subscribe((event, record) => { if (event === 'show') badge.textContent = notifications.getActive().length; })`.

</details>

[↑ Back to table](#row-ref-notifications-create)

</dd>

<dt><a id="ref-notifications-presenters"></a><code>JLib.notifications.presenters.toast(core)</code> / <code>.banner(core)</code> / <code>.modal(core)</code> → <code>unsubscribe</code></dt>
<dd>

Wires a visual presenter to a core instance — call once per page per presenter you want active.

<details>
<summary>Examples</summary>

**Example:** Wiring all three: `JLib.notifications.presenters.toast(notifications); JLib.notifications.presenters.modal(notifications);` — then `notify(msg, { presenter: 'modal' })` for something that needs to block.

</details>

[↑ Back to table](#row-ref-notifications-presenters)

</dd>

</dl>

### Module lifecycle (`services/module-lifecycle.js`)

<dl>

<dt><a id="ref-modulebase-create"></a><code>JLib.moduleBase.create(config)</code> → module def</dt>
<dd>

`config: { id, label, order?, onMount(view, services, container), onUnmount() }`. `view` gives you `.header(title, rightControls?)` and `.section(label, renderBody, opts?)`.

<details>
<summary>Examples</summary>

**Example 1:** See [Onboarding.md](Onboarding.md#2-build-a-module).

**Example 2:** Multiple sections: call `view.section(...)` more than once inside `onMount`.

**Example 3:** Reading `services`: `onMount(view, services) { services.theme.forceReExtract(services.shell.panelEl); }`.

**Example 4:** Cleanup: `onUnmount() { unsubscribeFn(); }`.

</details>

[↑ Back to table](#row-ref-modulebase-create)

</dd>

<dt><a id="ref-render"></a><code>JLib.render(opts?)</code> / <code>JLib.scheduleRender(opts?)</code></dt>
<dd>

Builds the one dashboard/standalone shell. `scheduleRender` defers to a microtask so it runs after all your other code — call this, not `render`, in almost every real script.

[↑ Back to table](#row-ref-render)

</dd>

<dt><a id="ref-dashboard"></a><code>JLib.dashboard</code> (only exists after render)</dt>
<dd>

`{ open(), close(), toggle(), destroy(), panelEl }`.

<details>
<summary>Examples</summary>

**Example:** `myButton.addEventListener('click', () => JLib.dashboard.open());`.

</details>

[↑ Back to table](#row-ref-dashboard)

</dd>

</dl>

### Cache (`services/cache.js`)

<dl>

<dt><a id="ref-cache-set"></a><code>JLib.cache.set(key, value)</code> → <code>Promise</code></dt>
<dd>

Persists non-settings data, IndexedDB-backed, cross-tab synced.

[↑ Back to table](#row-ref-cache-set)

</dd>

<dt><a id="ref-cache-get"></a><code>JLib.cache.get(key)</code> → <code>Promise&lt;value | undefined&gt;</code></dt>
<dd>

Reads persisted data. See [Onboarding.md](Onboarding.md#7-persist-non-setting-data) for the get/set pairing.

[↑ Back to table](#row-ref-cache-get)

</dd>

<dt><a id="ref-cache-delete"></a><code>JLib.cache.delete(key)</code> → <code>Promise</code></dt>
<dd>

Deletes a cached key.

[↑ Back to table](#row-ref-cache-delete)

</dd>

<dt><a id="ref-cache-watch"></a><code>JLib.cache.watch(key, callback)</code> → <code>unsubscribe</code></dt>
<dd>

Fires on any change to `key`, local or from another tab.

[↑ Back to table](#row-ref-cache-watch)

</dd>

<dt><a id="ref-cache-ensureinit"></a><code>JLib.cache.ensureInit()</code> → <code>Promise</code></dt>
<dd>

Usually called implicitly by the above; call directly if you need to know when the cache is genuinely ready.

[↑ Back to table](#row-ref-cache-ensureinit)

</dd>

<dt><a id="ref-cache-versionchanged"></a><code>JLib.cache.versionChanged</code> (getter, <code>bool</code>)</dt>
<dd>

True if `GM_info.script.version` differs from what was recorded last session. Purely informational.

<details>
<summary>Examples</summary>

**Example:** `await JLib.cache.ensureInit(); if (JLib.cache.versionChanged) { await JLib.cache.delete('pageIndex'); }`.

</details>

[↑ Back to table](#row-ref-cache-versionchanged)

</dd>

</dl>

### Color provider (`providers/color-provider.js`)

<dl>

<dt><a id="ref-colorprovider-getpalette"></a><code>JLib.colorProvider.getPalette(el, opts?)</code> → palette</dt>
<dd>

Anchor-relative sampling. `opts.seedHue` (0-360) requests a specific hue. Returns `{ base, surface, elevated, ink, muted, accent, 'accent-hover', danger, success, warning }`, every slot a real, contrast-checked `{ r, g, b }`.

<details>
<summary>Examples</summary>

**Example 1:** `const palette = JLib.colorProvider.getPalette(tileEl);` — colors sampled from that specific tile's surroundings.

**Example 2:** Requesting a brand hue: `JLib.colorProvider.getPalette(el, { seedHue: 260 })`.

**Example 3:** Applying manually: `JLib.colorProvider.applyPaletteAsVars(el, palette);` then `var(--jlib-color-accent)`.

</details>

[↑ Back to table](#row-ref-colorprovider-getpalette)

</dd>

<dt><a id="ref-colorprovider-getglobalpalette"></a><code>JLib.colorProvider.getGlobalPalette()</code> → palette</dt>
<dd>

Same shape, one page-wide sample instead of anchor-relative.

[↑ Back to table](#row-ref-colorprovider-getglobalpalette)

</dd>

<dt><a id="ref-colorprovider-validate"></a><code>JLib.colorProvider.validate(partial)</code> → full palette</dt>
<dd>

Fills in any missing slots with defaults and runs contrast correction — the "one door" every palette passes through.

[↑ Back to table](#row-ref-colorprovider-validate)

</dd>

<dt><a id="ref-colorprovider-ensurecontrast"></a><code>JLib.colorProvider.ensureContrast(fg, bg, minRatio)</code> → <code>{r,g,b}</code></dt>
<dd>

Nudges `fg` toward more/less lightness until it clears `minRatio` against `bg`.

<details>
<summary>Examples</summary>

**Example:** `const safeInk = JLib.colorProvider.ensureContrast({ r: 100, g: 100, b: 200 }, myBg, 4.5);`.

</details>

[↑ Back to table](#row-ref-colorprovider-ensurecontrast)

</dd>

<dt><a id="ref-colorprovider-contrast"></a><code>JLib.colorProvider.contrastRatio(c1, c2)</code> / <code>.relativeLuminance(c)</code> → number</dt>
<dd>

Real WCAG math.

[↑ Back to table](#row-ref-colorprovider-contrast)

</dd>

<dt><a id="ref-colorprovider-tocss"></a><code>JLib.colorProvider.toCssRgb(rgb)</code> / <code>.toCssRgba(rgb, a)</code> → CSS string</dt>
<dd>

[↑ Back to table](#row-ref-colorprovider-tocss)

</dd>

<dt><a id="ref-colorprovider-resolveanchorboundary"></a><code>JLib.colorProvider.resolveAnchorBoundary(el)</code> → element</dt>
<dd>

The real, dedup-cached "which real visual surface does this belong to" walk every provider shares.

[↑ Back to table](#row-ref-colorprovider-resolveanchorboundary)

</dd>

<dt><a id="ref-colorprovider-invalidate"></a><code>JLib.colorProvider.invalidate(el)</code> / <code>.invalidateAll()</code></dt>
<dd>

Manual cache-clear escape hatches, for cases automatic invalidation genuinely can't cover.

[↑ Back to table](#row-ref-colorprovider-invalidate)

</dd>

<dt><a id="ref-colorprovider-preview"></a><code>JLib.colorProvider.preview(el, paletteOrSlot)</code></dt>
<dd>

Dev-only: paint a palette (or one slot) onto an element via CSS vars, no caching.

[↑ Back to table](#row-ref-colorprovider-preview)

</dd>

<dt><a id="ref-colorprovider-transitionpalette"></a><code>JLib.colorProvider.transitionPalette(el, fromPalette, toPalette, opts?)</code></dt>
<dd>

Animates between two palettes on `el` — `opts.mode: 'ambient' | 'salient'`, `opts.surfaceKind: 'panel' | 'solid'`.

<details>
<summary>Examples</summary>

**Example:** `JLib.colorProvider.transitionPalette(el, oldPalette, newPalette, { mode: 'salient' });`.

</details>

[↑ Back to table](#row-ref-colorprovider-transitionpalette)

</dd>

<dt><a id="ref-colorprovider-reveal"></a><code>JLib.colorProvider.reveal(el, buildFn, opts?)</code> / <code>.revealAnchored(el, buildFn)</code></dt>
<dd>

Builds hidden, resolves the real palette, then fades in — no fallback color ever briefly shown. `opts.source: 'anchor' | 'global'`.

<details>
<summary>Examples</summary>

**Example:** `JLib.colorProvider.reveal(myEl, (palette) => { myEl.textContent = 'Hi'; });`.

</details>

[↑ Back to table](#row-ref-colorprovider-reveal)

</dd>

<dt><a id="ref-colorprovider-applypaletteasvars"></a><code>JLib.colorProvider.applyPaletteAsVars(el, palette, prefix?)</code></dt>
<dd>

Writes a palette onto `el.style` as CSS custom properties (default prefix `--jlib-color-`).

[↑ Back to table](#row-ref-colorprovider-applypaletteasvars)

</dd>

<dt><a id="ref-colorprovider-enrichwithexternalsources"></a><code>JLib.colorProvider.enrichWithExternalSources(palette, boundaryEl?)</code> → <code>Promise&lt;palette&gt;</code></dt>
<dd>

Optional async layer — checks manifest theme_color / favicon / meta theme-color against an already-resolved palette.

<details>
<summary>Examples</summary>

**Example:** `const better = await JLib.colorProvider.enrichWithExternalSources(palette); if (better !== palette) applyUpdatedPalette(better);`.

</details>

[↑ Back to table](#row-ref-colorprovider-enrichwithexternalsources)

</dd>

<dt><a id="ref-colorprovider-getaccentviashortlist"></a><code>JLib.colorProvider.getAccentViaShortlist(boundaryEl, base)</code> → <code>Promise&lt;rgb | null&gt;</code></dt>
<dd>

Optional async layer — a persistent, drift-revalidated cache of which element/property won accent discovery last time.

[↑ Back to table](#row-ref-colorprovider-getaccentviashortlist)

</dd>

<dt><a id="ref-colorprovider-detectdisplaygamut"></a><code>JLib.colorProvider.detectDisplayGamut()</code> → <code>'srgb' | 'p3' | 'rec2020'</code></dt>
<dd>

[↑ Back to table](#row-ref-colorprovider-detectdisplaygamut)

</dd>

</dl>

### Structural providers (`providers/radius-provider.js`, `shadow-provider.js`, `border-provider.js`, `font-provider.js`)

All four share the same shape.

<dl>

<dt><a id="ref-radiusprovider"></a><code>JLib.radiusProvider.get(el)</code> / <code>.getGlobal()</code> → CSS string</dt>
<dd>

<details>
<summary>Examples</summary>

**Example:** `el.style.borderRadius = JLib.radiusProvider.get(anchorEl);`.

</details>

[↑ Back to table](#row-ref-radiusprovider)

</dd>

<dt><a id="ref-shadowprovider"></a><code>JLib.shadowProvider.get(el)</code> / <code>.getGlobal()</code> → CSS string</dt>
<dd>

[↑ Back to table](#row-ref-shadowprovider)

</dd>

<dt><a id="ref-borderprovider"></a><code>JLib.borderProvider.get(el, opts?)</code> / <code>.getGlobal(opts?)</code> → CSS string</dt>
<dd>

`opts.targetBg` (optional `{r,g,b}`) requests WCAG contrast correction against a specific background.

<details>
<summary>Examples</summary>

**Example:** `JLib.borderProvider.get(anchorEl, { targetBg: palette.base })`.

</details>

[↑ Back to table](#row-ref-borderprovider)

</dd>

<dt><a id="ref-structural-invalidate"></a><code>.invalidate(el)</code> / <code>.invalidateAll()</code> (all three above)</dt>
<dd>

Each also has a `DEFAULT_*` constant.

[↑ Back to table](#row-ref-structural-invalidate)

</dd>

<dt><a id="ref-fontprovider-getranked"></a><code>JLib.fontProvider.getRanked(el)</code> → 3 font-family strings</dt>
<dd>

Rank 1/2/3, always real values.

[↑ Back to table](#row-ref-fontprovider-getranked)

</dd>

<dt><a id="ref-fontprovider-fonttype"></a><code>JLib.fontProvider.fontType(el, rank)</code> → one font-family string</dt>
<dd>

`rank` 1-3.

[↑ Back to table](#row-ref-fontprovider-fonttype)

</dd>

<dt><a id="ref-fontprovider-fittext"></a><code>JLib.fontProvider.layout.fitText(container, text, fontFamily, opts?)</code> → final text applied</dt>
<dd>

The default entry point — fixed shrink → wrap → truncate pipeline, applied to `container` directly.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.fontProvider.layout.fitText(tabEl, longTitle, font);`.

**Example 2:** Checking without committing: `JLib.fontProvider.layout.fits(container, text, font, size)` → `bool`.

</details>

[↑ Back to table](#row-ref-fontprovider-fittext)

</dd>

<dt><a id="ref-fontprovider-layout-parts"></a><code>.layout.shrink</code> / <code>.layout.wrap</code> / <code>.layout.truncate</code> / <code>.layout.fits</code> / <code>.layout.measure</code></dt>
<dd>

The individual strategies, for a caller with a genuine reason to deviate from the fixed pipeline.

[↑ Back to table](#row-ref-fontprovider-layout-parts)

</dd>

</dl>

### Super provider (`providers/super-provider.js`)

<dl>

<dt><a id="ref-superprovider-resolve"></a><code>JLib.superProvider.css.resolve(el, opts?)</code> → bundle <code>{ color?, font?, radius?, shadow?, border? }</code></dt>
<dd>

`opts` keys: omit for default, `false` to exclude, anything else to include (font accepts a 1-3 rank).

<details>
<summary>Examples</summary>

**Example 1:** `JLib.superProvider.css.resolve(el, { border: false })`.

**Example 2:** `JLib.superProvider.css.resolve(el, { font: 2 })`.

</details>

[↑ Back to table](#row-ref-superprovider-resolve)

</dd>

<dt><a id="ref-superprovider-apply"></a><code>JLib.superProvider.css.apply(el, opts?)</code> → bundle</dt>
<dd>

Resolves *and writes* the whole bundle onto `el` in one call. See [Onboarding.md](Onboarding.md#8-theme-it-to-match-the-page).

<details>
<summary>Examples</summary>

**Example 1:** `JLib.superProvider.css.apply(cardEl, { color: true });` — matches color, radius, shadow, and font at once.

**Example 2:** `JLib.superProvider.css.apply(el, { color: false })` — structural only.

</details>

[↑ Back to table](#row-ref-superprovider-apply)

</dd>

<dt><a id="ref-superprovider-reveal"></a><code>JLib.superProvider.css.reveal(el, buildFn, opts?)</code></dt>
<dd>

Bundle-aware version of `colorProvider.reveal()`.

[↑ Back to table](#row-ref-superprovider-reveal)

</dd>

<dt><a id="ref-superprovider-transition"></a><code>JLib.superProvider.css.transition(el, fromBundle, toBundle, opts?)</code></dt>
<dd>

Bundle-aware version of `colorProvider.transitionPalette()`.

[↑ Back to table](#row-ref-superprovider-transition)

</dd>

<dt><a id="ref-superprovider-fittext"></a><code>JLib.superProvider.css.fitText(el, container, text, opts?)</code></dt>
<dd>

Resolves the bundle's font and runs it through `fontProvider.layout.fitText` in one call.

[↑ Back to table](#row-ref-superprovider-fittext)

</dd>

<dt><a id="ref-superprovider-invalidate"></a><code>JLib.superProvider.css.invalidate(el)</code> / <code>.invalidateAll()</code></dt>
<dd>

Cascades to all five mini-providers at once.

[↑ Back to table](#row-ref-superprovider-invalidate)

</dd>

</dl>

### Elements (`elements/*.js`)

<dl>

<dt><a id="ref-elements-button"></a><code>JLib.elements.button.button(label, onClick, opts?)</code> → <code>HTMLButtonElement</code></dt>
<dd>

`opts.variant: 'default' | 'danger' | 'ghost'`, `opts.disabled`, `opts.className`.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.elements.button.button('Refresh', () => location.reload())`.

**Example 2:** `JLib.elements.button.button('Delete All', doDelete, { variant: 'danger' })`.

**Example 3:** `JLib.elements.button.button('Export', onExport, { disabled: isLoading })`.

</details>

[↑ Back to table](#row-ref-elements-button)

</dd>

<dt><a id="ref-elements-inputs"></a><code>JLib.elements.inputs.toggleRow</code> / <code>.dropdownRow</code> / <code>.numberRow</code> / <code>.textRow</code> / <code>.actionRow(label, desc, ..., onChange, opts?)</code> → row <code>HTMLElement</code></dt>
<dd>

The row builders Settings Panel's schema dispatch uses.

<details>
<summary>Examples</summary>

**Example 1:** `toggleRow('Hide ads', '', settings.hideAds, onChange)`.

**Example 2:** `dropdownRow('Theme', '', options, settings.theme, onChange)`.

**Example 3:** `numberRow('Max results', '', { min: 1, max: 100 }, settings.maxResults, onChange)`.

**Example 4:** `actionRow('Clear cache', '', clearCacheFn)`.

</details>

[↑ Back to table](#row-ref-elements-inputs)

</dd>

<dt><a id="ref-elements-makekeyboardactivatable"></a><code>JLib.elements.inputs.makeKeyboardActivatable(el)</code></dt>
<dd>

Adds Enter/Space-triggers-click to a non-native interactive element.

[↑ Back to table](#row-ref-elements-makekeyboardactivatable)

</dd>

<dt><a id="ref-elements-modal"></a><code>JLib.elements.modal.create(config)</code> → instance <code>{ open(), close(), toggle(), destroy(), setPosition(pos), setKeyboardShortcut(combo), setTitle(title), panelEl, bodyEl, headerActionsEl }</code></dt>
<dd>

`config: { id, title, position?, content(bodyEl), footerText?, keyboardShortcut?, onOpen?, onClose?, appendTo? }`.

<details>
<summary>Examples</summary>

**Example 1:** `const myModal = JLib.elements.modal.create({ id: 'myThing', title: 'My Thing', content: (body) => body.appendChild(...) }); myModal.open();`.

**Example 2:** `{ ..., keyboardShortcut: 'Ctrl+Shift+M' }`.

**Example 3:** `{ ..., appendTo: document.body }` — appends to the real page instead of JLib's shared shadow root.

</details>

[↑ Back to table](#row-ref-elements-modal)

</dd>

<dt><a id="ref-elements-getfocusableelements"></a><code>JLib.elements.modal.getFocusableElements(container)</code></dt>
<dd>

The utility the modal's own Tab-loop uses internally.

[↑ Back to table](#row-ref-elements-getfocusableelements)

</dd>

<dt><a id="ref-elements-tabs"></a><code>JLib.elements.tabs.render(container, items, activeId, onSelect)</code></dt>
<dd>

`items: [{ id, label, badge?, groupLabel? }]`.

[↑ Back to table](#row-ref-elements-tabs)

</dd>

<dt><a id="ref-elements-search"></a><code>JLib.elements.search.search(items, query, getText?)</code> → filtered, ranked array</dt>
<dd>

`getText(item)` defaults to `String(item)`.

<details>
<summary>Examples</summary>

**Example 1:** `JLib.elements.search.search(features, userQuery, f => f.label + ' ' + f.description)`.

**Example 2:** `JLib.elements.search.search(['Apple', 'Banana', 'Cherry'], 'appl')` → `['Apple']`.

</details>

[↑ Back to table](#row-ref-elements-search)

</dd>

<dt><a id="ref-elements-search-inputfield"></a><code>JLib.elements.search.inputField(opts?)</code> → <code>HTMLInputElement</code></dt>
<dd>

`opts: { placeholder?, debounceMs?, onQuery(query) }`.

<details>
<summary>Examples</summary>

**Example:** `JLib.elements.search.inputField({ placeholder: 'Search settings…', onQuery: (q) => renderResults(JLib.elements.search.search(items, q, getText)) })`.

</details>

[↑ Back to table](#row-ref-elements-search-inputfield)

</dd>

</dl>

### Modules (`modules/*.js`)

<dl>

<dt><a id="ref-notificationcenter"></a><code>JLib.modules.notificationCenter.create(config?)</code> → module def</dt>
<dd>

Register with `JLib.registerModule(...)`. Pass `services.notifications` when rendering so it has something to display.

[↑ Back to table](#row-ref-notificationcenter)

</dd>

<dt><a id="ref-settingspanel-create"></a><code>JLib.modules.settingsPanel.create(config)</code> → module def with <code>.full</code> / <code>.lite</code> / <code>.api</code></dt>
<dd>

`config: { namespace, title?, categories, features, scopes?, getCurrentScope?, extraSections?, about?, migrate?, onFeatureChange? }`.

<details>
<summary>Examples</summary>

**Example 1:** Minimal panel:

```js
JLib.registerModule(JLib.modules.settingsPanel.create({
  namespace: 'myScript',
  categories: [{ id: 'general', label: 'General' }],
  features: [{ id: 'hideAds', type: 'boolean', category: 'general', label: 'Hide ads', default: true }],
}));
```

**Example 2:** Dependent child: `{ id: 'badgeColor', type: 'enum', category: 'general', label: 'Badge color', parent: 'hideAds', options: [...] }`.

**Example 3:** Multi-scope: `scopes: [{ id: 'siteA', label: 'Site A' }, ...], getCurrentScope: () => currentSiteId`.

**Example 4:** About tab with drill-in: `about: { summary: 'Short one-liner.', details: (container) => container.appendChild(...) }`.

</details>

[↑ Back to table](#row-ref-settingspanel-create)

</dd>

<dt><a id="ref-settingspanel-api"></a><code>.api</code> (on a mounted <code>settingsPanel.create()</code> instance)</dt>
<dd>

- **`api.getSettings(scopeId?)`** / **`api.setSettings(scopeId, obj)`** — read/write the live settings object directly.
- **`api.buildLink(opts)`** / **`api.parseLink(str)`** / **`api.openLink(str)`** / **`api.navigateTo(opts)`** — deep linking.
- **`api.showPanelSettings()`** — jumps straight to the theme/position/shortcut chrome tab.

<details>
<summary>Examples</summary>

**Example 1:** `settingsInstance.api.navigateTo({ feature: 'showBadges' })` — opens the panel scrolled and highlighted to that exact row.

**Example 2:** `const settings = settingsInstance.api.getSettings(); if (settings.hideAds) { ... }`.

**Example 3:** `const link = settingsInstance.api.buildLink({ category: 'appearance' });`.

</details>

[↑ Back to table](#row-ref-settingspanel-api)

</dd>

</dl>

---

*If a function you expected to find here isn't listed, it's very likely internal (anything under `JLib._sp.*`, or a closure-private helper) rather than a real omission — see [Architecture.md](Architecture.md) for core rules, [Glossary.md](Glossary.md) for the internal component picture, or the relevant `src/*/README.md` for a file-level index.*
