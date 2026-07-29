// ============================================================================
// providers/border-provider.js
// ============================================================================
/*
 * borderProvider — same shape as radiusProvider, scoped to border
 * width/style/color together.
 *
 * Depends on: JLib.colorProvider (anchor resolution), JLib.utils
 * (_jlibSampleStructuralValue)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.borderProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_BORDER = '1px solid rgba(255, 255, 255, 0.08)';
  let cache = new WeakMap();

  function sampleBorder(boundaryEl) {
    const found = _jlibSampleStructuralValue(
      boundaryEl,
      (node) => {
        const cs = getComputedStyle(node);
        return cs.borderWidth !== '0px' && cs.borderStyle !== 'none' ? `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}` : null;
      },
      (val) => !!val
    );
    return found || DEFAULT_BORDER;
  }

  function get(el) {
    const boundary = cp.resolveAnchorBoundary(el);
    if (cache.has(boundary)) return cache.get(boundary);
    const border = sampleBorder(boundary);
    cache.set(boundary, border);
    return border;
  }

  function getGlobal() {
    return get(document.body);
  }

  // invalidate(el) / invalidateAll() — same reason colorProvider has
  // these: closes the same "site changed dynamically after we sampled,
  // no way to recover" gap already fixed once for radiusProvider.
  function invalidate(el) {
    if (!el) throw new Error('JLib.borderProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache = new WeakMap();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_BORDER };
})();
