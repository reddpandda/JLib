// ============================================================================
// providers/shadow-provider.js
// ============================================================================
/*
 * shadowProvider — same shape as radiusProvider, scoped to box-shadow.
 *
 * Depends on: JLib.colorProvider (anchor resolution), JLib.utils
 * (_jlibSampleStructuralValue)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.shadowProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.35)';
  const cache = new WeakMap();

  function sampleShadow(boundaryEl) {
    const found = _jlibSampleStructuralValue(
      boundaryEl,
      (node) => getComputedStyle(node).boxShadow,
      (val) => val && val !== 'none'
    );
    return found || DEFAULT_SHADOW;
  }

  function get(el) {
    const boundary = cp.resolveAnchorBoundary(el);
    if (cache.has(boundary)) return cache.get(boundary);
    const shadow = sampleShadow(boundary);
    cache.set(boundary, shadow);
    return shadow;
  }

  function getGlobal() {
    return get(document.body);
  }

  return { get, getGlobal, DEFAULT_SHADOW };
})();
