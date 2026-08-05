# JLib — Glossary

> Verified against `3c8011f` + Pass B (2026-08-02) — if `src/` has moved
> since, treat contents as unconfirmed.
>
> **Links to:** API.md ×3, Architecture.md ×2, Scope.md ×1, CREDITS.md ×1

What the internal pieces of JLib actually are — one entry per named component, what it's for, and (where there's real depth worth knowing) how it actually works internally. This is not a function reference — for individual callable `JLib.*` functions, see **[API.md](API.md)**. For the *rules* these components were built to follow, see **[Architecture.md](Architecture.md)**.

A **provider** (as a category, not a specific one) is a service that samples an environment — almost always the page's DOM — and returns a validated, "must provide" result. A provider never owns UI and never has a visible surface of its own; it's consumed by things that do. Five of the entries below are providers; the rest are services.

---

## Component Index

| Component | | Where from | Definition |
|---|---|---|---|
| <a id="row-g-colorprovider"></a>`colorProvider` | [↓](#g-colorprovider) | `providers/color-provider.js` | The palette engine — vendored OKLCH math, anchor-relative sampling, seed-hue blending. |
| <a id="row-g-fontprovider"></a>`fontProvider` | [↓](#g-fontprovider) | `providers/font-provider.js` | Pure font-family detection; an always-length-3 ranked candidate list. |
| <a id="row-g-fontproviderlayout"></a>`fontProvider.layout` | [↓](#g-fontproviderlayout) | `providers/font-provider.js` | The text-fitting system: fixed shrink → wrap → truncate. |
| <a id="row-g-structuralproviders"></a>`radiusProvider` / `shadowProvider` / `borderProvider` | [↓](#g-structuralproviders) | `providers/{radius,shadow,border}-provider.js` | Same sample-then-fallback shape as `colorProvider`, one structural CSS property each. |
| <a id="row-g-superprovider"></a>`superProvider.css` | [↓](#g-superprovider) | `providers/super-provider.js` | The composition facade resolving all five providers into one bundle. |
| <a id="row-g-i18n"></a>`JLib.i18n` | [↓](#g-i18n) | `services/i18n.js` | Two-tier registered-dictionary localization lookup. |
| <a id="row-g-cache"></a>`JLib.cache` | [↓](#g-cache) | `services/cache.js` | Non-settings persistent storage — IndexedDB-backed, cross-tab synced. |
| <a id="row-g-dedupe"></a>`JLib.dedupe` | [↓](#g-dedupe) | `services/dedupe.js` | General request/task deduplication. |
| <a id="row-g-registration"></a>Registration family | [↓](#g-registration) | `services/registration.js` | `registerModule`/`registerTheme`/`registerScript`/`i18n.registerDictionary` — one consistent refuse-or-register pattern. |
| <a id="row-g-triggers"></a>`JLib.triggers` | [↓](#g-triggers) | `services/triggers.js` | Decides WHEN something runs: passive `watch()` + active, dedup-protected `fire()`. |
| <a id="row-g-anchorcache"></a>`JLib.anchorCache` | [↓](#g-anchorcache) | `services/anchor-cache.js` | Shared `WeakMap`-by-boundary cache with automatic mutation-based invalidation. |
| <a id="row-g-heuristics"></a>`JLib.heuristics` | [↓](#g-heuristics) | `services/heuristics.js` | The provider-agnostic discovery engine every provider's sampling builds on. |
| <a id="row-g-modulelifecycle"></a>Module lifecycle | [↓](#g-modulelifecycle) | `services/module-lifecycle.js` | `moduleBase.create` + `render`/`scheduleRender` — the shared dashboard shell. |
| <a id="row-g-events"></a>`JLib.events` | [↓](#g-events) | `services/events.js` | One delegated listener per stable container, catches elements added later. |
| <a id="row-g-domshadow"></a>`JLib.dom` / `JLib.shadow` | [↓](#g-domshadow) | `services/dom.js` | Pure DOM construction, plus the one shared closed shadow root JLib's chrome lives in. |
| <a id="row-g-console"></a>`JLib.console` | [↓](#g-console) | `services/console.js` | A registry of findable warnings — not scattered `console.warn()` calls. |
| <a id="row-g-theme"></a>`JLib.theme` | [↓](#g-theme) | `services/theme.js` | Registration-based theming; zero color/structure math of its own. |
| <a id="row-g-settingspanel"></a>Settings Panel | [↓](#g-settingspanel) | `modules/settings-panel/` | The full settings panel subsystem — four files under the private `JLib._sp` namespace. |

---

## Components

Full definitions, same order as the table. Every entry ends with `↑ Back to table`.

<dl>

<dt><a id="g-colorprovider"></a><code>colorProvider</code></dt>
<dd>

Vendored OKLCH color math, anchor-relative sampling (not a single whole-page average), CSS custom-property detection before falling back to visual sampling, a seed-hue confidence spectrum (confirm the site's own accent, blend, or override, depending on how far off-hue the sample actually is), and the shared animation clock (`transitionPalette`, `reveal`) other providers' bundle-aware versions build on.

<details>
<summary>Full callable surface</summary>

See [API.md](API.md#ref-colorprovider-getpalette) for `getPalette`, `getGlobalPalette`, `validate`, `ensureContrast`, `contrastRatio`/`relativeLuminance`, `toCssRgb`/`toCssRgba`, `resolveAnchorBoundary`, `invalidate`/`invalidateAll`, `preview`, `transitionPalette`, `reveal`/`revealAnchored`, `applyPaletteAsVars`, `enrichWithExternalSources`, `getAccentViaShortlist`, `detectDisplayGamut`.

</details>

[↑ Back to table](#row-g-colorprovider)

</dd>

<dt><a id="g-fontprovider"></a><code>fontProvider</code></dt>
<dd>

Pure detection. Resolves an always-length-3 ranked list of font-family candidates from the anchor's own declared stack, padding with JLib's authored font as the guaranteed final slot. No sizing or fitting logic of its own — see `fontProvider.layout` below for that.

[↑ Back to table](#row-g-fontprovider)

</dd>

<dt><a id="g-fontproviderlayout"></a><code>fontProvider.layout</code></dt>
<dd>

The text-fitting system. Fixed shrink → wrap → truncate order (ellipsis-terminated; a container too small even for a bare ellipsis is treated as a caller sizing problem, not something this system tries to rescue further).

[↑ Back to table](#row-g-fontproviderlayout)

</dd>

<dt><a id="g-structuralproviders"></a><code>radiusProvider</code> / <code>shadowProvider</code> / <code>borderProvider</code></dt>
<dd>

The same sample-then-fallback shape as `colorProvider`, scoped to one structural CSS property each. No independent math; each is a small, focused "must provide" sampler.

[↑ Back to table](#row-g-structuralproviders)

</dd>

<dt><a id="g-superprovider"></a><code>superProvider.css</code></dt>
<dd>

The composition facade. Resolves an anchor once and calls whichever of the five providers above are requested, merging them into one bundle. `.resolve()` (data), `.apply()` (bundle → element in one call), `.reveal()`/`.transition()` (bundle-aware versions of `colorProvider`'s animation primitives), `.fitText()` (resolves the bundle's font and runs it through `fontProvider.layout` in one call). Named as a namespace, not a singleton, since other domains (`.a11y`, `.motion`) were considered during design and explicitly not built — see [Scope.md](Scope.md).

[↑ Back to table](#row-g-superprovider)

</dd>

<dt><a id="g-i18n"></a><code>JLib.i18n</code></dt>
<dd>

Two-tier dictionary lookup (a bare string as the default key; an explicitly qualified variant — `"Save (verb)"` — only where English itself would already phrase something differently by role). Dictionaries are registered, not configured — English is a normal registered dictionary that happens to register first. Default-status conflicts (two dictionaries both claiming default) deny *both* and fall back to English, deliberately never resolved by `@require` load order.

[↑ Back to table](#row-g-i18n)

</dd>

<dt><a id="g-cache"></a><code>JLib.cache</code></dt>
<dd>

Non-settings persistent storage: IndexedDB as the only physical backend, an in-memory layer on top for synchronous-feeling reads, debounced writes, `BroadcastChannel` for live cross-tab sync with a per-key logical clock (not wall-clock time) resolving out-of-order message arrival, and Web Locks for tab-presence checks. Namespace-scoped and registration-gated like everything else. Settings remain on GM storage via the existing schema-driven store — this system is specifically for everything that isn't a userscript's own settings.

<details>
<summary>How it actually works internally</summary>

Backed by a small vendored subset of `idb-keyval` (see [CREDITS.md](CREDITS.md)) rather than a hand-rolled IndexedDB wrapper — same "small, stable, vendor it" reasoning as the OKLCH math. A hybrid eager/lazy load: under 500 keys, everything loads into the in-memory layer at init; above that threshold, individual `get()`s load on demand and warm the memory cache as they go. Cross-tab sync uses `BroadcastChannel` gated by `navigator.locks.query()` tab-presence checks (broadcasting into an empty channel is free, but the query still avoids waking tabs unnecessarily) — with a stated, honest gap: Web Locks has no native "another tab just joined" event, only point-in-time snapshots, so the presence check has a real but narrow, low-consequence race window. `checkScriptVersion()` compares `GM_info.script.version` against what was recorded last session and sets a read-only `versionChanged` flag — informational only, never an automatic wipe or migration, since a false-positive-driven auto-wipe risks destroying good data for a version bump that never touched cache shape at all.

</details>

[↑ Back to table](#row-g-cache)

</dd>

<dt><a id="g-dedupe"></a><code>JLib.dedupe</code></dt>
<dd>

General request/task deduplication — if several callers ask for the same expensive operation in a short window, the work happens once and the result is shared. First real use: fixing `superProvider.css`'s anchor-resolution, which previously re-walked the DOM once per mini-provider it called instead of once total.

[↑ Back to table](#row-g-dedupe)

</dd>

<dt><a id="g-registration"></a>Registration family</dt>
<dd>

`JLib.registerModule`, `JLib.registerTheme`, `JLib.i18n.registerDictionary`, `JLib.registerScript` — the same pattern applied consistently across every extensible surface in the codebase. Each refuses (warns, does not silently substitute a default) without its prerequisite met.

[↑ Back to table](#row-g-registration)

</dd>

<dt><a id="g-triggers"></a><code>JLib.triggers</code></dt>
<dd>

Decides WHEN something runs, so nothing fires eagerly just because a page loaded. Two structurally separate halves: `watch(key, selector, callback, opts?)` is passive — fires when something matching `selector` appears under `opts.root` (default the light DOM), checked immediately on registration in case the awaited element already exists. `fire(key, fn)` is active — an explicit call site wanting dedup protection against rapid repeat calls, routed through `JLib.dedupe` rather than reinventing it. `watch()`'s matches are never deduped through `fire()` — each is a genuinely distinct new element, not a redundant repeat of the same demand.

[↑ Back to table](#row-g-triggers)

</dd>

<dt><a id="g-anchorcache"></a><code>JLib.anchorCache</code></dt>
<dd>

A `WeakMap`-by-boundary-element cache with automatic `MutationObserver`-based invalidation (default watching `class`/`style`/`data-theme` changes, debounced), extracted from `colorProvider`'s own pattern so `radius`/`shadow`/`border`/`font` providers can share one implementation instead of four. Each `create()` call gets its own independent observer and tracking. Tracks live boundaries via `WeakRef` + `FinalizationRegistry`, not raw references, so a removed element can actually be garbage collected.

[↑ Back to table](#row-g-anchorcache)

</dd>

<dt><a id="g-heuristics"></a><code>JLib.heuristics</code></dt>
<dd>

The provider-agnostic discovery engine every provider's sampling builds on — knows markup, not rendering. `capture(rootEl?)` collects raw tag/class/attribute data per element; `rank(captured, keywords)` scores that data via real BM25 (proper tokenization, corpus-derived same-page stopwords, length-normalized), sorted descending, zero-score entries dropped. Callers supply their own keyword query — this file has no opinion on what the keywords mean. `withScrollLock(fn)` runs `fn()` behind a real native `<dialog>` blocking all input, protecting a capture-through-read span against a custom-scroll-library SPA recycling the DOM elements underneath it mid-read.

[↑ Back to table](#row-g-heuristics)

</dd>

<dt><a id="g-modulelifecycle"></a>Module lifecycle</dt>
<dd>

`JLib.moduleBase.create(config)` is the shared scaffold every module is built through — header/section markup and the `{ id, label, order, mount, unmount }` shape the dashboard expects, so module authors don't each reinvent it. `JLib.render()` (or `JLib.scheduleRender()`, deferred to a microtask so it's the last thing to run for that page load) builds exactly one modal shell regardless of module count — what changes is what's inside it: a single module with no dashboard chrome at `count === 1`, a menu-driven dashboard with an unregistered, uncounted "cog" settings surface at `count >= 2`. A module never owns its own modal; `services.shell` is how it reaches the one that always exists.

[↑ Back to table](#row-g-modulelifecycle)

</dd>

<dt><a id="g-events"></a><code>JLib.events</code></dt>
<dd>

One delegated listener on a stable container, matched against dynamically-added descendants via `closest()` — the shared answer to "handle clicks on elements that don't exist yet."

[↑ Back to table](#row-g-events)

</dd>

<dt><a id="g-domshadow"></a><code>JLib.dom</code> / <code>JLib.shadow</code></dt>
<dd>

`JLib.dom` is pure DOM construction (`el`/`h` builder, `$`/`$$` selector shortcuts) — no privileged APIs, no opinion on where anything ends up. `JLib.shadow` owns the one shared `closed`-mode shadow root all of JLib's own chrome renders into, created lazily on first use. `isOurRoot(rootNode)` is reference-equality only. `adoptStylesheet(sheet, rootNode)` pushes a constructable stylesheet onto a root's `adoptedStyleSheets` — the actual CSP-exempt mechanism, since a constructed `CSSStyleSheet` was never parsed as inline style content the way a `<style>` tag is.

[↑ Back to table](#row-g-domshadow)

</dd>

<dt><a id="g-console"></a><code>JLib.console</code></dt>
<dd>

A registry, not scattered hand-typed `console.warn()` calls — every message JLib can emit is registered once (`JLib.console.register(id, { template, explain?, hint? })`) with a findable definition, not just the inline text visible at whichever call site fires it. `warn(id, ...args)` and `info(id, ...args)` render the registered template and pass `args` through raw as well. `explain(id)` exposes the "why" for anything that wants to surface it. Delivery mechanism for the "wrong door" convention this whole codebase follows: refuse, name the mistake, point at the fix — never refuse silently.

[↑ Back to table](#row-g-console)

</dd>

<dt><a id="g-theme"></a><code>JLib.theme</code></dt>
<dd>

Registration-based, same pattern as modules/dictionaries — `registerTheme(name, resolverFn)` lives in `registration.js` alongside every other `registerX`; this file just registers the eight built-ins through that same public mechanism and provides `JLib.theme.create()`. Does zero color/structure math itself — every resolver either returns a fully authored static palette (`dark`/`light`/`neutral`) or defers to `colorProvider`/`superProvider.css`, or another resolver (`system`/`smartSystem` picking between two others via `prefers-color-scheme`). `neutral` exists specifically as an instant, zero-cost, deliberately-unfinished-looking paint for the moment before a real target theme resolves — `JLib.triggers`' reveal path applies it immediately, then crossfades once the real result is ready.

[↑ Back to table](#row-g-theme)

</dd>

<dt><a id="g-settingspanel"></a>Settings Panel</dt>
<dd>

Four files, one subsystem, assembled under the shared `JLib._sp` namespace (an intentionally private prefix — not part of the public `JLib.*` surface). `validator.js` is Settings Panel's own "wrong door" config validation, bounded strictly to config an author's own code supplies to `create()`. `schema-dispatch.js` renders the right row type given a feature definition and the live settings object. `navigation.js` — the largest file in the codebase after `color-provider.js` — handles deep linking, a real breadcrumb/history stack, export/import, and tokenized search past an 8-feature threshold. `chrome-config.js` is the shared "Panel Settings" chrome, and the final assembly point where `JLib.modules.settingsPanel` itself is built.

[↑ Back to table](#row-g-settingspanel)

</dd>

</dl>

---

*For the callable functions each of these components exposes, see [API.md](API.md). For the rules they were all built to follow, see [Architecture.md](Architecture.md).*
