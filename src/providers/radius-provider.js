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
 * (JLib.utils.sampleStructuralValue)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.radiusProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_RADIUS = '8px';
  let cache = new WeakMap();

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

  // invalidate(el) / invalidateAll() — same reason colorProvider has
  // these: a site can change its own structural styling dynamically
  // after this provider already sampled and cached a value, and without
  // an explicit clear there was previously no way to recover from that,
  // ever, for the lifetime of the page. Same manual-escape-hatch
  // pattern, not automatic detection — no evidence a polling/observing
  // approach is needed over an explicit call, same bar as everything
  // else in this codebase.
  function invalidate(el) {
    if (!el) throw new Error('JLib.radiusProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache = new WeakMap();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_RADIUS };
})();
