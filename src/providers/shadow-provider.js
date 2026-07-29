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
  let cache = new WeakMap();

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

  // invalidate(el) / invalidateAll() — same reason colorProvider has
  // these: closes the same "site changed dynamically after we sampled,
  // no way to recover" gap already fixed once for radiusProvider.
  function invalidate(el) {
    if (!el) throw new Error('JLib.shadowProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache = new WeakMap();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_SHADOW };
})();
