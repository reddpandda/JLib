// ============================================================================
// providers/radius-provider.js
// ============================================================================
/*
 * radiusProvider — same shape as colorProvider's sampling half, much
 * smaller: sample a border-radius off the resolved anchor boundary, fall
 * back to a sane authored default if nothing usable is found. "Providers
 * must provide" applies here too — never returns an empty/undefined
 * result.
 *
 * Depends on: JLib.colorProvider (anchor resolution), JLib.utils
 * (JLib.utils.sampleStructuralValue), JLib.anchorCache (shared
 * auto-invalidating cache)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.radiusProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_RADIUS = '8px';
  // Shared cache — same auto-invalidating WeakMap-by-boundary pattern
  // colorProvider's own getPalette() already uses, extracted so this
  // provider doesn't reimplement it. A site changing its own
  // structural styling dynamically (class/style/data-theme attribute
  // changes on a watched node) now invalidates automatically, rather
  // than requiring a manual invalidate() call to ever recover from it.
  const cache = JLib.anchorCache.create();

  function sampleRadius(boundaryEl) {
    const found = JLib.utils.sampleStructuralValue(
      boundaryEl,
      (node) => getComputedStyle(node).borderRadius,
      (val) => val && val !== '0px' && val !== '0px 0px 0px 0px'
    );
    return found || DEFAULT_RADIUS; // must provide — never returns nothing
  }

  function get(el) {
    const boundary = cp.resolveAnchorBoundary(el);
    if (cache.has(boundary)) return cache.get(boundary);
    const radius = sampleRadius(boundary);
    cache.set(boundary, radius);
    return radius;
  }

  function getGlobal() {
    return get(document.body);
  }

  // invalidate(el) — manual escape hatch still kept alongside the new
  // automatic invalidation above, for the cases automatic detection
  // genuinely can't cover (e.g. a framework re-rendering with new
  // inline styles or structure but no attribute change on a watched
  // node at all).
  function invalidate(el) {
    if (!el) throw new Error('JLib.radiusProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache.invalidateAll();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_RADIUS };
})();
