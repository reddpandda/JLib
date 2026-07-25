# JLib — Reference

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
