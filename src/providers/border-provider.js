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
  const cache = new WeakMap();

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

  return { get, getGlobal, DEFAULT_BORDER };
})();
