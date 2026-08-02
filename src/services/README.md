# src/services/

> Verified against commit `3c8011f` (2026-08-01) — if this folder has
> moved since, treat contents as unconfirmed. `theme.js` and `cache.js`
> entries below are still placeholders pending a full read (Pass B).

Foundational, non-visual pieces. Order and dependency chain: see
`.order.json` (`bundles/build.js` reads this directly — it's the real
source of truth, not this list). Deep explanation of why any of this
works the way it does: see [../../Reference.md](../../Reference.md).

| File | What it is |
|---|---|
| `utils.js` | `debounce`/`throttle`/`debouncePerKey`, `makeLogger`, `sampleStructuralValue`. No DOM, no privileged APIs. |
| `heuristics.js` | Provider-agnostic discovery engine: `capture`/`rank` (real BM25) DOM candidates against a keyword query, plus `withScrollLock` — protects a capture-through-read span against SPA scroll libraries recycling elements mid-read. |
| `anchor-cache.js` | Shared `WeakMap`-by-boundary-element cache with automatic `MutationObserver` invalidation, extracted from `colorProvider`'s own pattern so every structural provider can reuse it instead of reimplementing it. |
| `console.js` | Registry for every message JLib emits — not scattered hand-typed `console.warn()` calls. Each warning gets a real definition: a template, why it fires, and a hint pointing at the fix. |
| `registration.js` | Every `registerX` function (`registerModule`, `registerTheme`, `registerScript`, `i18n.registerDictionary`) and the state it governs, in one place — "registration is existence." |
| `dom.js` | `el()`/`h()` builder, `$`/`$$` selectors — pure construction, no privileged APIs. Also owns `JLib.shadow`, the one shared closed shadow root all of JLib's own chrome renders into. |
| `events.js` | One delegated listener per stable container, matched against dynamically-added descendants via `closest()`. |
| `dedupe.js` | If several callers ask for the same expensive operation in a short window, do the work once, share the result. First real consumer: `superProvider.css`'s anchor resolution. |
| `triggers.js` | `watch(key, selector, callback, opts?)` — fire when something matching a selector appears. `fire(key, fn)` — demand-trigger with dedup protection against rapid repeat calls. |
| `storage.js` | Schema-driven `GM_setValue`/`GM_getValue` settings backend — per-scope storage, parent/child dependency enforcement, migration support. What Settings Panel is built on. Settings stay on GM storage deliberately: true cross-site reach is something only GM storage provides. |
| `theme.js` | *Not yet fully read this pass — placeholder.* Registration-based theming; eight built-in themes (`dark`, `light`, `neutral`, and others) registered through the same public `registerTheme()` mechanism, nothing special-cased internally. |
| `i18n.js` | Two-tier dictionary lookup (bare-string default, qualified variant like `"Save (verb)"` where English itself would phrase something differently by role). English is a normal registered dictionary that happens to register first. Default-conflict resolution denies both and falls back to English rather than trusting `@require` order. |
| `notifications.js` | Headless core (queue + staling engine + dismissal memory). `toast` is one of three presenters (toast/banner/modal) driven by the same core. |
| `module-lifecycle.js` | `JLib.moduleBase` — the shared header/section scaffold every module is built through. `JLib.render()`/`scheduleRender()` — builds the one dashboard shell, single-module or menu-driven depending on registered count. |
| `cache.js` | *Not yet fully read this pass — placeholder.* IndexedDB-backed (via a vendored `idb-keyval` subset — see [../../CREDITS.md](../../CREDITS.md)), cross-tab-synced (`BroadcastChannel` + per-key logical clock) non-settings persistent storage, with a synchronous in-memory read layer. |
