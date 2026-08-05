# JLib — Architecture

> Verified against `3c8011f` + Pass B (2026-08-02) — if `src/` has moved
> since, treat contents as unconfirmed.
>
> **Links to:** Scope.md ×3, Glossary.md ×1

The rules this codebase is built on — nine of them, each with a real, still-current reason. For what the individual pieces built under these rules actually *are* — `colorProvider`, `JLib.cache`, `JLib.triggers`, and the rest — see **[Glossary.md](Glossary.md)**, which is deliberately a separate document with its own lookup table, not a section of this one. For how the project's scope evolved (what shipped, what grew, what was cut, what might come later), see [Scope.md](Scope.md).

---

## Registration is existence

If it isn't registered, it doesn't exist — no exceptions, no silent defaults invented on its behalf. A module, a theme, a dictionary, a script itself (`JLib.registerScript`) — any call into a registration-gated system without its prerequisite registered warns and refuses rather than guessing. This is the single rule most of the rest of the system is built to reflect consistently.

## Providers must provide

Every provider (color, font, radius, shadow, border) always resolves to a real, usable value — sampled, then corrected, then falls back to a sane authored default if sampling finds nothing. "Nothing found" is never a state a caller has to handle.

## One door

All the math for a given domain lives in exactly one place. `colorProvider` is the only thing that computes color — consumers like `theme.js` are pure mappers, structurally incapable of producing an invalid result because they never compute one.

## Shortcut, never a requirement

Every provider and every system here is an opt-in convenience. Raw CSS, raw `GM_setValue`, raw IndexedDB always still work. Nothing traps an author inside a system that doesn't fit their case.

## Fixed default order; deviate through the parts, not the whole

Shrink → wrap → truncate is the one default text-fitting path, no permutation-searching for a "better" order (an easy trap — truncation "succeeds" trivially, so a search biases toward the worst-fidelity answer). A caller with a genuine layout reason to deviate calls the individual strategies directly; the fixed pipeline is the opinionated shortcut, not a mandate.

## Evidence before infrastructure

Nothing gets built on "might need it." Every real feature in this codebase exists because a concrete, named use case justified it. Plausible-but-unproven ideas get named and shelved, not built and not silently dropped either — see [Scope.md](Scope.md)'s *Cut* section.

## English, internally, always

Every `console.warn`, every code comment, every developer-facing diagnostic stays hardcoded English regardless of what the localization system supports. This boundary is absolute: it marks the line between developer-facing and end-user-facing text, and it never bends, even for the localization system's own internal warnings.

## Compose, don't replace

A sub-identity (a Settings Panel instance's local namespace, a cache key) supplies only its own local piece; JLib composes it against whatever's already registered above it (`JLib.composeNamespace`). This preserves real multi-instance flexibility without ever inventing an identity nobody asked for.

## No confused deputies

Anything with elevated privilege talking to something less privileged *reports*, it never *acts on instruction* from that lower-privileged side. This is the one rule held regardless of how compelling an alternative design sounds — not a tradeoff to be weighed against convenience, but a structural boundary that applies to any future privileged intermediary this library might ever talk to.
