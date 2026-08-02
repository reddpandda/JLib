// ============================================================================
// providers/shadow-provider.js
// ============================================================================
/*
 * shadowProvider — same shape as radiusProvider, scoped to box-shadow.
 *
 * Depends on: JLib.colorProvider (anchor resolution), JLib.utils
 * (JLib.utils.sampleStructuralValue), JLib.anchorCache (shared
 * auto-invalidating cache)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.shadowProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.35)';
  // Shared cache — same auto-invalidating pattern colorProvider's own
  // getPalette() and radiusProvider already use.
  const cache = JLib.anchorCache.create();

  // isVisibleShadow(val) -> bool. A computed box-shadow value can be
  // non-"none" and still be visually invisible — e.g.
  // "rgba(0, 0, 0, 0) 0px 0px 0px 0px", a zero-state some design
  // systems produce via a CSS custom property resolving to a
  // transparent/zero-size fallback instead of the literal string
  // "none". Rejects a value only if EVERY comma-separated shadow
  // layer is invisible (fully transparent, OR every offset/blur/
  // spread measurement is ~0); accepts if at least one layer would
  // actually render something.
  function isVisibleShadow(val) {
    if (!val || val === 'none') return false;
    const layers = val.split(/,(?![^(]*\))/); // split on commas NOT inside a color function's parens
    return layers.some((layer) => {
      // Only rgba() (literally 4-argument) can carry an alpha channel
      // — a regex not anchored on the exact function name can
      // misread a plain rgb()'s last color channel as if it were a
      // 4th alpha argument (confirmed a real bug via direct testing,
      // not a hypothetical — caught before shipping).
      const alphaMatch = layer.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
      if (alphaMatch && parseFloat(alphaMatch[1]) <= 0.001) return false;
      if (/\btransparent\b/.test(layer)) return false;
      const measurements = layer.match(/(-?[\d.]+)px/g);
      if (measurements && measurements.every((m) => Math.abs(parseFloat(m)) < 0.5)) return false;
      return true;
    });
  }

  function sampleShadow(boundaryEl) {
    const found = JLib.utils.sampleStructuralValue(boundaryEl, (node) => getComputedStyle(node).boxShadow, isVisibleShadow);
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

  // invalidate(el) — manual escape hatch kept alongside the shared
  // cache's automatic invalidation, for cases automatic detection
  // genuinely can't cover.
  function invalidate(el) {
    if (!el) throw new Error('JLib.shadowProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache.invalidateAll();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_SHADOW };
})();
