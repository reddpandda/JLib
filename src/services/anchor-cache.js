// ============================================================================
// services/anchor-cache.js
// ============================================================================
/*
 * anchorCache — a WeakMap-by-boundary-element cache with automatic
 * MutationObserver-based invalidation, extracted from colorProvider's
 * own already-built, already-tested pattern so radius/shadow/border/
 * font providers can share it instead of each reimplementing it. This
 * is pass-list item #3 from early in this project: "automatic cache
 * invalidation... pull shared WeakMap+MutationObserver pattern into
 * shared helper."
 *
 * create(opts?) -> { get, has, set, delete, invalidateAll }
 *   opts.attributeFilter: which attributes to watch for changes
 *     (default ['class', 'style', 'data-theme'] — the same "did
 *     something about this region's theme/style change" signal
 *     colorProvider already used).
 *   opts.debounceMs: how long to wait after a mutation burst settles
 *     before actually invalidating (default 200, matching
 *     colorProvider's own tuning).
 *
 * Each create() call returns its OWN independent MutationObserver and
 * OWN independent liveBoundaries tracking — multiple provider caches
 * (color, radius, shadow, border) can coexist without interfering
 * with each other's invalidation timing or entries, even though
 * they're all watching the same underlying DOM.
 *
 * Deliberately a Map-like primitive (get/has/set/delete), not a
 * getOrCompute(el, fn) convenience — each provider's own get() already
 * has its own specific compute logic; this only owns the caching and
 * invalidation mechanics, not what gets cached.
 *
 * liveBoundaries holds WeakRefs, not raw elements, tracked via
 * FinalizationRegistry — same reasoning as colorProvider's original:
 * a plain Set of real element references would defeat the entire
 * point of the cache being a WeakMap, since a removed element could
 * never actually be garbage collected while something still held a
 * strong reference to it.
 *
 * Depends on: JLib.utils (debounce, optional — falls back to an
 * undebounced handler if not loaded, since debouncing is a
 * performance nicety here, not a correctness requirement).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.anchorCache = (function () {
  function create(opts) {
    opts = opts || {};
    const attributeFilter = opts.attributeFilter || ['class', 'style', 'data-theme'];
    const debounceMs = opts.debounceMs !== undefined ? opts.debounceMs : 200;

    let cache = new WeakMap();
    let liveBoundaries = new Set();
    const registry =
      typeof FinalizationRegistry !== 'undefined'
        ? new FinalizationRegistry((weakRef) => {
            liveBoundaries.delete(weakRef);
          })
        : null;

    function trackLiveBoundary(el) {
      const ref = new WeakRef(el);
      liveBoundaries.add(ref);
      if (registry) registry.register(el, ref);
    }
    function forEachLiveBoundary(fn) {
      liveBoundaries.forEach((ref) => {
        const el = ref.deref();
        if (el) fn(el, ref);
        else liveBoundaries.delete(ref); // already collected, sweep it
      });
    }

    function handleMutations(mutations) {
      forEachLiveBoundary((node, ref) => {
        for (const m of mutations) {
          if (m.target === node || (node.contains && node.contains(m.target)) || (m.target.contains && m.target.contains(node))) {
            cache.delete(node);
            liveBoundaries.delete(ref);
            break;
          }
        }
      });
    }

    let observer = null;
    function ensureObserver() {
      if (observer) return;
      const handler = JLib.utils && JLib.utils.debounce ? JLib.utils.debounce(handleMutations, debounceMs) : handleMutations;
      observer = new MutationObserver(handler);
      observer.observe(document.documentElement, { attributes: true, attributeFilter, subtree: true });
    }

    function get(boundaryEl) {
      ensureObserver();
      return cache.get(boundaryEl);
    }
    function has(boundaryEl) {
      ensureObserver();
      return cache.has(boundaryEl);
    }
    function set(boundaryEl, value) {
      ensureObserver();
      cache.set(boundaryEl, value);
      trackLiveBoundary(boundaryEl);
      return value;
    }
    function deleteEntry(boundaryEl) {
      cache.delete(boundaryEl);
      forEachLiveBoundary((node, ref) => {
        if (node === boundaryEl) liveBoundaries.delete(ref);
      });
    }
    function invalidateAll() {
      cache = new WeakMap();
      liveBoundaries.clear();
    }

    return { get, has, set, delete: deleteEntry, invalidateAll };
  }

  return { create };
})();
