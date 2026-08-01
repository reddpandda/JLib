// ============================================================================
// services/triggers.js
// ============================================================================
/*
 * triggers — decides WHEN the sampling pipeline (or anything else) runs,
 * so it never runs eagerly/automatically just because a page loaded.
 * Two genuinely different kinds, kept structurally separate rather than
 * one mechanism doing both jobs:
 *
 *   watch(key, selector, callback, opts?) — passive. Fires when
 *     something matching `selector` appears under `opts.root` (default
 *     the light DOM). The "an author's element got inserted onto the
 *     page" case.
 *
 *   fire(key, fn) — active. An explicit call site (a panel's own
 *     open(), say) that wants dedup protection against rapid repeat
 *     calls for the same real intent — reuses JLib.dedupe rather than
 *     reinventing concurrency control.
 *
 * watch()'s own callback is deliberately NEVER deduped through fire() —
 * each mutation-observed match is a genuinely distinct real event
 * (something new actually appeared), not a redundant repeat of the same
 * demand. Deduping those would risk two legitimately different elements
 * collapsing into one fire. fire()'s dedup is for the other case: the
 * same demand happening more than once in quick succession (a user
 * double-clicking, or spam-clicking, the same trigger).
 *
 * Depends on: JLib.dedupe (fire()), JLib.console (warn on a duplicate
 * watch key).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.triggers = (function () {
  const watches = new Map(); // key -> { stop }

  // watch(key, selector, callback, opts?) -> stop() function.
  //   opts.root: element/root to observe (default document.documentElement
  //     for real page content). Pass JLib.shadow.getRoot() explicitly to
  //     watch our own chrome instead — MutationObserver on the light DOM
  //     does NOT see into a shadow tree at all (confirmed elsewhere in
  //     this codebase already), so watching "our own stuff" always needs
  //     this passed explicitly, never inferred.
  //   opts.once: stop after the first match (default true — the common
  //     case is "the first time X appears," not "every time"). false
  //     keeps observing and fires again for every subsequent NEW match,
  //     tracked so an already-fired element is never re-fired for.
  //
  // Checks immediately on registration, in case the awaited element
  // already exists before watch() was even called (a common case — a
  // script loading after the DOM it cares about is already there).
  //
  // No debounce on the observer callback, unlike colorProvider's own
  // cache-invalidation observer — a deliberately different tradeoff.
  // colorProvider debounces because it does real rebuild work per
  // mutation and only cares about a burst's SETTLED state. A trigger's
  // whole point is firing the moment the awaited thing first exists —
  // debouncing that would add avoidable latency to something a caller
  // is actively waiting on. The check itself (querySelector) is cheap,
  // and for the default once:true case the observer disconnects on the
  // very first match anyway, so a mutation burst before that match
  // costs nothing beyond a few cheap re-checks.
  function watch(key, selector, callback, opts) {
    opts = opts || {};
    if (watches.has(key)) {
      JLib.console.warn('triggers.duplicateKey', key);
      return () => {};
    }
    const root = opts.root || document.documentElement;
    const once = opts.once !== false;
    const seen = once ? null : new WeakSet();

    function stop() {
      observer.disconnect();
      watches.delete(key);
    }

    function fireFor(el) {
      if (seen) seen.add(el);
      callback(el);
      if (once) stop();
    }

    function check() {
      if (once) {
        const match = root.querySelector(selector);
        if (match) fireFor(match);
        return;
      }
      const matches = root.querySelectorAll(selector);
      for (let i = 0; i < matches.length; i++) {
        const el = matches[i];
        if (!seen.has(el)) fireFor(el);
      }
    }

    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    watches.set(key, { stop });

    check();
    return stop;
  }

  // fire(key, fn) -> Promise. Demand-trigger entry point — wraps
  // JLib.dedupe.once() so a rapid repeat call for the same key (a user
  // double-clicking, or spam-clicking, whatever triggers this) collapses
  // into the SAME in-flight execution instead of kicking off a real
  // pipeline run multiple times concurrently. Falls back to running fn
  // directly (still as a promise, for a consistent return shape) if
  // JLib.dedupe isn't loaded, rather than hard-failing on a missing
  // optional dependency.
  function fire(key, fn) {
    if (!JLib.dedupe) return Promise.resolve().then(fn);
    return JLib.dedupe.once(key, fn);
  }

  // stopAll() — disconnects every active watch. Same "explicit clear-
  // everything escape hatch" shape as invalidateAll() elsewhere in this
  // codebase.
  function stopAll() {
    watches.forEach((w) => w.stop());
  }

  return { watch, fire, stopAll };
})();
