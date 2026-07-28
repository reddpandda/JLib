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
 * (_jlibSampleStructuralValue)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.radiusProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_RADIUS = '8px';
  const cache = new WeakMap();

  function sampleRadius(boundaryEl) {
    const found = _jlibSampleStructuralValue(
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

  return { get, getGlobal, DEFAULT_RADIUS };
})();
