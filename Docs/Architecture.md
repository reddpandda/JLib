# JLib — Architecture

> Verified against `3c8011f` + Pass B (2026-08-02) — if `src/` has moved
> since, treat contents as unconfirmed. Every file in `src/` has now
> been read; the glossary below covers the full codebase.

This document exists for one reason: so a decision made once doesn't have
to be re-argued from scratch later. It covers the rules this codebase is
built on and what the internal building blocks actually are — a quick
lookup, not a narrative. For how the project's scope evolved (what
shipped, what grew, what was cut, what might come later), see
[SCOPE.md](SCOPE.md).

## Core rules

**Registration is existence.** If it isn't registered, it doesn't exist —
no exceptions, no silent defaults invented on its behalf. A module, a
theme, a dictionary, a script itself (`JLib.registerScript`) — any call
into a registration-gated system without its prerequisite registered
warns and refuses rather than guessing. This is the single rule most of
the rest of the system is built to reflect consistently.

**Providers must provide.** Every provider (color, font, radius, shadow,
border) always resolves to a real, usable value — sampled, then
corrected, then falls back to a sane authored default if sampling finds
nothing. "Nothing found" is never a state a caller has to handle.

**One door.** All the math for a given domain lives in exactly one
place. `colorProvider` is the only thing that computes color —
consumers like `theme.js` are pure mappers, structurally incapable of
producing an invalid result because they never compute one.

**Shortcut, never a requirement.** Every provider and every system here
is an opt-in convenience. Raw CSS, raw `GM_setValue`, raw IndexedDB
always still work. Nothing traps an author inside a system that doesn't
fit their case.

**Fixed default order; deviate through the parts, not the whole.**
Shrink → wrap → truncate is the one default text-fitting path, no
permutation-searching for a "better" order (an easy trap — truncation
"succeeds" trivially, so a search biases toward the worst-fidelity
answer). A caller with a genuine layout reason to deviate calls the
individual strategies directly; the fixed pipeline is the opinionated
shortcut, not a mandate.

**Evidence before infrastructure.** Nothing gets built on "might need
it." Every real feature in this codebase exists because a concrete,
named use case justified it. Plausible-but-unproven ideas get named and
shelved, not built and not silently dropped either — see
[SCOPE.md](SCOPE.md)'s *Cut* section.

**English, internally, always.** Every `console.warn`, every code
comment, every developer-facing diagnostic stays hardcoded English
regardless of what the localization system supports. This boundary is
absolute: it marks the line between developer-facing and end-user-facing
text, and it never bends, even for the localization system's own
internal warnings.

**Compose, don't replace.** A sub-identity (a Settings Panel instance's
local namespace, a cache key) supplies only its own local piece; JLib
composes it against whatever's already registered above it
(`JLib.composeNamespace`). This preserves real multi-instance
flexibility without ever inventing an identity nobody asked for.

**No confused deputies.** Anything with elevated privilege talking to
something less privileged *reports*, it never *acts on instruction* from
that lower-privileged side. This is the one rule held regardless of how
compelling an alternative design sounds — not a tradeoff to be weighed
against convenience, but a structural boundary that applies to any
future privileged intermediary this library might ever talk to.

## Glossary — what things are

**Provider.** A service that samples an environment (the page's DOM, in
most cases here) and returns a validated, "must provide" result. Never
owns UI, never has a visible surface of its own — consumed by things
that do.

- **`colorProvider`** — the palette engine. Vendored OKLCH color math,
  anchor-relative sampling (not a single whole-page average), CSS
  custom-property detection before falling back to visual sampling, a
  seed-hue confidence spectrum (confirm the site's own accent, blend, or
  override, depending on how far off-hue the sample actually is), and
  the shared animation clock (`transitionPalette`, `reveal`) other
  providers' bundle-aware versions build on.
- **`fontProvider`** — pure detection. Resolves an always-length-3 ranked
  list of font-family candidates from the anchor's own declared stack,
  padding with JLib's authored font as the guaranteed final slot. No
  sizing or fitting logic of its own.
- **`fontProvider.layout`** — the text-fitting system. Fixed shrink →
  wrap → truncate order (ellipsis-terminated; a container too small even
  for a bare ellipsis is treated as a caller sizing problem, not
  something this system tries to rescue further).
- **`radiusProvider` / `shadowProvider` / `borderProvider`** — the same
  sample-then-fallback shape as `colorProvider`, scoped to one structural
  CSS property each. No independent math; each is a small, focused
  "must provide" sampler.
- **`superProvider.css`** — the composition facade. Resolves an anchor
  once and calls whichever of the five above are requested, merging them
  into one bundle. `.resolve()` (data), `.apply()` (bundle → element in
  one call), `.reveal()`/`.transition()` (bundle-aware versions of
  `colorProvider`'s animation primitives), `.fitText()` (resolves the
  bundle's font and runs it through `fontProvider.layout` in one call).
  Named as a namespace (`superProvider.css`), not a singleton, since
  other domains were considered and explicitly not built — see
  [SCOPE.md](SCOPE.md).

**`JLib.i18n`.** Two-tier dictionary lookup (a bare string as the
default key; an explicitly qualified variant — `"Save (verb)"` — only
where English itself would already phrase something differently by
role). Dictionaries are registered, not configured — English is a normal
registered dictionary that happens to register first. Default-status
conflicts (two dictionaries both claiming default) deny *both* and fall
back to English, deliberately never resolved by `@require` load order.

**`JLib.cache`.** Non-settings persistent storage: IndexedDB as the only
physical backend, an in-memory layer on top for synchronous-feeling
reads, debounced writes, `BroadcastChannel` for live cross-tab sync with
a per-key logical clock (not wall-clock time) resolving out-of-order
message arrival, and Web Locks for tab-presence checks. Namespace-scoped
and registration-gated like everything else. Settings remain on GM
storage via the existing schema-driven store — this system is
specifically for everything that isn't a userscript's own settings.

**`JLib.dedupe`.** General request/task deduplication — if several
callers ask for the same expensive operation in a short window, the work
happens once and the result is shared. First real use: fixing
`superProvider.css`'s anchor-resolution, which previously re-walked the
DOM once per mini-provider it called instead of once total.

**Registration family.** `JLib.registerModule`, `JLib.registerTheme`,
`JLib.i18n.registerDictionary`, `JLib.registerScript` — the same pattern
applied consistently across every extensible surface in the codebase.
Each refuses (warns, does not silently substitute a default) without its
prerequisite met.

**`JLib.triggers`.** Decides WHEN something runs, so nothing fires
eagerly just because a page loaded. Two structurally separate halves:
`watch(key, selector, callback, opts?)` is passive — fires when
something matching `selector` appears under `opts.root` (default the
light DOM), checked immediately on registration in case the awaited
element already exists. `fire(key, fn)` is active — an explicit call
site wanting dedup protection against rapid repeat calls, routed through
`JLib.dedupe` rather than reinventing it. `watch()`'s matches are never
deduped through `fire()` — each is a genuinely distinct new element, not
a redundant repeat of the same demand.

**`JLib.anchorCache`.** A `WeakMap`-by-boundary-element cache with
automatic `MutationObserver`-based invalidation (default watching
`class`/`style`/`data-theme` changes, debounced), extracted from
`colorProvider`'s own pattern so `radius`/`shadow`/`border`/`font`
providers can share one implementation instead of four. Each `create()`
call gets its own independent observer and tracking, so multiple
provider caches can coexist without cross-interference. Tracks live
boundaries via `WeakRef` + `FinalizationRegistry`, not raw references,
so a removed element can actually be garbage collected.

**`JLib.heuristics`.** The provider-agnostic discovery engine every
provider's sampling builds on — knows markup, not rendering.
`capture(rootEl?)` collects raw tag/class/attribute data per element;
`rank(captured, keywords)` scores that data via real BM25 (proper
tokenization, corpus-derived same-page stopwords, length-normalized),
sorted descending, zero-score entries dropped. Callers supply their own
keyword query (`colorProvider`'s is accent/brand/nav/..., a structural
provider's might be rounded/corner/pill/...) — this file has no opinion
on what the keywords mean. `withScrollLock(fn)` runs `fn()` behind a
real native `<dialog>` blocking all input, protecting a capture-through-
read span against a custom-scroll-library SPA recycling the DOM
elements underneath it mid-read — a danger synchronous execution alone
does not rule out, since a JS-driven scroll handler isn't bound by the
same "can't interleave with sync code" guarantee native scroll is.

**Module lifecycle (`JLib.moduleBase`, `JLib.render`).**
`JLib.moduleBase.create(config)` is the shared scaffold every module is
built through — header/section markup and the `{ id, label, order,
mount, unmount }` shape the dashboard expects, so module authors don't
each reinvent it. `JLib.render()` (or `JLib.scheduleRender()`, deferred
to a microtask so it's the last thing to run for that page load) builds
exactly one modal shell regardless of module count — what changes is
what's inside it: a single module with no dashboard chrome at
`count === 1`, a menu-driven dashboard with an unregistered, uncounted
"cog" settings surface at `count >= 2`. A module never owns its own
modal; `services.shell` is how it reaches the one that always exists.

**`JLib.events`.** One delegated listener on a stable container, matched
against dynamically-added descendants via `closest()` — the shared
answer to "handle clicks on elements that don't exist yet."

**`JLib.dom` / `JLib.shadow`.** `JLib.dom` is pure DOM construction
(`el`/`h` builder, `$`/`$$` selector shortcuts) — no privileged APIs, no
opinion on where anything ends up. `JLib.shadow` owns the one shared
`closed`-mode shadow root all of JLib's own chrome renders into, created
lazily on first use. `isOurRoot(rootNode)` is reference-equality only —
the exact test `colorProvider`'s sampling-fidelity buckets need to know
whether an element is JLib's own chrome or real page content.
`adoptStylesheet(sheet, rootNode)` pushes a constructable stylesheet
onto a root's `adoptedStyleSheets` — the actual CSP-exempt mechanism
(a constructed `CSSStyleSheet` was never parsed as inline style content,
unlike a `<style>` tag, which is still bound by the document's
`style-src` regardless of which DOM subtree it sits in).

**`JLib.console`.** A registry, not scattered hand-typed
`console.warn()` calls — every message JLib can emit is registered once
(`JLib.console.register(id, { template, explain?, hint? })`) with a
findable definition, not just the inline text visible at whichever call
site fires it. `warn(id, ...args)` and `info(id, ...args)` render the
registered template and pass `args` through raw as well, so a caller
passing a DOM element still gets it as an inspectable object in
devtools. `explain(id)` exposes the "why" for anything that wants to
surface it. Delivery mechanism for the "wrong door" convention this
whole codebase follows: refuse, name the mistake, point at the fix —
never refuse silently.

**`JLib.theme`.** Registration-based, same pattern as modules/
dictionaries — `registerTheme(name, resolverFn)` lives in
`registration.js` alongside every other `registerX`; this file just
registers the eight built-ins through that same public mechanism and
provides `JLib.theme.create()`. `theme.js` itself does zero color/
structure math — every resolver either returns a fully authored static
palette (`dark`/`light`/`neutral`) or defers to `colorProvider`/
`superProvider.css` (`followWebsite`, `smart-dark`/`smart-light`
— authored color, provider-sourced structure) or another resolver
(`system`/`smartSystem` picking between two others via
`prefers-color-scheme`). `neutral` exists specifically as an instant,
zero-cost, deliberately-unfinished-looking paint for the moment before
a real target theme resolves — `JLib.triggers`' reveal path applies it
immediately, then crossfades once the real result is ready. A `create()`
instance owns its own `MutationObserver` + `prefers-color-scheme`
listener pair (`startWatching`/`stopWatching`) for re-sampling
provider-backed themes when the host page's own theme changes.

**`JLib.cache`, in more depth.** Backed by a small vendored subset of
`idb-keyval` (see CREDITS.md) rather than a hand-rolled IndexedDB
wrapper — same "small, stable, vendor it" reasoning as the OKLCH math.
A hybrid eager/lazy load: under 500 keys, everything loads into the
in-memory layer at init; above that threshold, individual `get()`s load
on demand and warm the memory cache as they go. Cross-tab sync uses
`BroadcastChannel` gated by `navigator.locks.query()` tab-presence
checks (broadcasting into an empty channel is free, but the query still
avoids waking tabs unnecessarily) — with a stated, honest gap: Web Locks
has no native "another tab just joined" event, only point-in-time
snapshots, so the presence check has a real but narrow, low-consequence
race window. `checkScriptVersion()` compares `GM_info.script.version`
against what was recorded last session and sets a read-only
`versionChanged` flag — informational only, never an automatic wipe or
migration, since a false-positive-driven auto-wipe risks destroying
good data for a version bump that never touched cache shape at all.

**Settings Panel (`src/modules/settings-panel/`).** Four files, one
subsystem, assembled under the shared `JLib._sp` namespace (an
intentionally private prefix — not part of the public `JLib.*` surface
an author calls directly):
- **`validator.js`** — `JLib._sp.validateConfig` — Settings Panel's own
  "wrong door" checks, bounded strictly to config an author's own code
  supplies to `create()`. Each check maps to a real, confirmed silent-
  misbehavior path (duplicate feature ids silently overwriting the same
  storage key, a dependency referencing a feature that doesn't exist
  always evaluating false, an empty enum rendering a dropdown with
  nothing in it).
- **`schema-dispatch.js`** — `JLib._sp.buildFeatureRow` — given a
  feature definition, the current scope, and the live settings object,
  renders the right row type (boolean/enum/number/text/action/custom)
  and wires its `commit()` through save + dependency-enforcement +
  `onChange` + rerender.
- **`navigation.js`** — the largest file in the codebase after
  `color-provider.js` (549 lines): deep linking (`buildLink`/
  `parseLink`/`openLink`/`navigateTo`), a real breadcrumb/history stack
  (`pushHistory`/`goBack`, snapshotting expanded categories and scroll
  position, not just a tree-parent jump), export/import (a downloaded
  JSON blob keyed by scope, re-imported by merging over fresh defaults),
  tokenized search over the current scope's features once a scope
  exceeds `SEARCH_THRESHOLD` (8) features, and `mount()`/`buildVariant()`
  tying all of it together into one per-instance state object `S`
  (replacing what used to be closure locals, so every extracted function
  can share and mutate the same state by reference).
- **`chrome-config.js`** — the shared "Panel Settings" chrome (theme/
  language/animations/position/keyboard-shortcut/export-import)
  expressed as real schema features through the exact same dispatch
  path as any userscript's own settings, not bespoke rows. Also the
  final assembly point: `JLib.modules.settingsPanel` itself is built
  here from what the other three files registered onto `JLib._sp`,
  since this file loads last within the module's own file set.
