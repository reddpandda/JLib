# JLib — Scope

## Original scope

A modular settings/dashboard system a userscript could `@require`
instead of hand-building per script — a settings panel with real
schema/dependency/export-import behavior, a notification system, and a
dashboard shell that adapts based on how many modules a given script
actually registers. The underlying goal behind that: stop rewriting the
same UI/settings/notification plumbing from scratch in every new
userscript, and give scripts a shared, importable toolset instead.

## Met

The original scope above shipped in full, and shipped dogfooded — JLib's
own chrome settings are themselves a registered settings module built
through the same schema system any userscript's settings would be, not
a bespoke hand-built exception.

## Exceeded

Several systems grew well past the original ask, each because a real gap
surfaced during use, not because they sounded interesting in the
abstract:

- **The provider family** (color/font/radius/shadow/border,
  `superProvider.css`) — began as "don't hand-write theme CSS per site,"
  became a general "sample the environment, get a validated answer"
  pattern reused across five different structural properties.
- **Localization** — added once it became clear a settings panel meant
  to be reused across scripts needed a real answer for translated text,
  not just English strings baked into the schema.
- **`JLib.cache`** — grew out of asking where non-settings persistent
  data should live at all, once GM storage's real documented limits
  (extension-messaging overflow, key-volume failure) were checked rather
  than assumed.
- **Deep linking, breadcrumb, and true state-restoring Back** — began as
  a "smart-enough search" idea, grew into full navigation history once
  the underlying view-snapshot mechanism turned out to generalize.

## Cut

Named deliberately, not silently dropped, so a plausible-sounding future
idea doesn't get re-proposed without the reasoning that already rejected
it being visible:

- **`JLib.gm`** — a `GM_*` compatibility/abstraction layer. Every
  concrete friction point considered (menu commands, cross-origin
  requests, clipboard, notifications, tab management, custom context
  menus) was rejected against actual usage — Tampermonkey-only, no
  repeated pain, or already better-solved elsewhere.
- **`JLib.selectorKit`** — the version worth building (a weighted
  heuristic selector-finder, robust against DOM/class-name churn) was
  rejected on its own merits: tuning cost doesn't amortize, since a site
  change invalidates the tuning the same way it invalidates a
  hand-written selector, just with more up-front effort spent to get
  there. The diminished version (fallback chains, visibility checks)
  wasn't judged worth a named tool.
- **`superProvider.a11y` / `superProvider.motion`** — named during the
  provider-family design as a plausible future namespace member, not
  built. No evidence of need yet.
- **Reverse-staling storage promotion** (auto-moving "hot" cached data
  toward faster storage) — rejected specifically for a correctness risk:
  a promotion engine has no way to know whether a frequently-read key is
  self-contained or references other data that stayed behind, risking a
  silently split, drifting logical record across two backends.
- **Cross-script broadcast throttling** — considered when multiple
  JLib-based scripts might run on one page simultaneously, rejected
  because the capacity concerns that justified other design decisions
  (verified Tampermonkey extension-messaging limits) don't apply to
  `BroadcastChannel` traffic at all, and a shared throttle would require
  coordination state between scripts that are otherwise deliberately
  namespace-isolated from each other.
- **Push-based cross-tab presence detection** (a `SharedWorker`, or a
  `localStorage`-plus-reconciliation confidence tree) — explored at
  length once Web Locks' snapshot-only nature was identified as a real
  limitation, then dropped once it became clear presence-gating itself
  wasn't load-bearing: `BroadcastChannel` traffic into an empty channel
  costs nothing, so the one remaining case that still needed a presence
  check (an infrequent long-running-tab health-check trigger) was
  already well served by a plain point-in-time `navigator.locks.query()`
  call, and didn't justify new infrastructure to make faster or more
  exact.

## Future

Ideas named here are possibilities under consideration, not commitments
— nothing in this section should be read as a plan already underway or
a likely next step. They're recorded so a future decision has this
context available, the same reason anything in *Cut* is written down
rather than just abandoned.

- **A companion browser-extension bridge.** A separate, higher-privilege
  companion project exists that could, in principle, feed data into a
  userscript at a level a userscript can't reach on its own. Whether or
  when that integration happens, and what shape it would take, is
  entirely undecided. If it's ever built, it would need to satisfy the
  "no confused deputies" rule in [ARCHITECTURE.md](ARCHITECTURE.md) with a
  real, dedicated trust model — not an assumption that reporting-only
  behavior is automatically safe just because that's the intent.
- **Other tooling explored and shelved during design** — several
  candidates (`JLib.gm`, `JLib.selectorKit`'s heuristic version) were
  evaluated and rejected for the present, as detailed under *Cut*, but
  aren't ruled out permanently — a future script's real, repeated need
  could reopen any of them, the same evidence bar that governs
  everything else in this codebase.
