// ============================================================================
// providers/border-provider.js
// ============================================================================
/*
 * borderProvider — same sample-then-fallback shape as radiusProvider,
 * scoped to border width/style/color together, with one real difference
 * from radius/shadow: a border's color is a real color, not just a
 * structural number, so it goes through colorProvider's actual color
 * pipeline instead of being carried around as an opaque, unvalidated
 * substring the way the raw computed-style string would be.
 *
 * Two distinct things colorProvider already draws a line between apply
 * here too:
 *   - capture fidelity (resolveSampledColor) — always applied. A
 *     border authored in wide-gamut CSS shouldn't be trusted at face
 *     value any more than a background or text color read elsewhere in
 *     this codebase already isn't.
 *   - contrast correction (ensureContrast) — opt-in via opts.targetBg,
 *     never automatic. A standalone call has no reliable way to know
 *     what background the border will actually land on (see
 *     superProvider.css.resolve, which supplies this using the SAME
 *     palette.base it already resolved for color, no separate
 *     getPalette() call from in here) — correcting against a guessed
 *     background could "fix" a border relative to the wrong backdrop,
 *     which is worse than not correcting it at all. Omitting targetBg
 *     stays purely descriptive: exactly what the real page renders, no
 *     second-guessing the site's own contrast choice.
 *
 * Depends on: JLib.colorProvider (anchor resolution, resolveSampledColor,
 * ensureContrast, toCssRgb — the real color pipeline, not just the
 * anchor-boundary utility this file used before), JLib.anchorCache
 * (shared auto-invalidating cache), JLib.utils
 * (_jlibSampleStructuralValue is NOT used here — border needs the
 * color component split out from the width/style, which the shared
 * generic-string helper can't do, so this file scans candidates
 * itself using the same shape).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.borderProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_BORDER = '1px solid rgba(255, 255, 255, 0.08)';

  // Sub-pixel border widths (e.g. "0.3px") are real, valid computed
  // values on high-DPI displays but unlikely to render as a
  // meaningfully visible stroke — a candidate this thin is treated the
  // same as no border at all, rather than sampled as if it were a
  // deliberate, intentional border. Not yet empirically tuned — same
  // honesty flag as the other new thresholds this pass.
  const BORDER_MIN_WIDTH_PX = 0.5;

  // Cache holds the RAW sampled parts (width/style/colorStr/sourceEl),
  // not a finished border string — capture is boundary-dependent and
  // expensive (DOM scan), correction is context-dependent and cheap
  // (one ensureContrast call), so they're deliberately kept separate.
  // Caching the finished string the way radius/shadow do would mean
  // whichever targetBg happened to be passed on the FIRST call for a
  // given boundary got baked in for every subsequent call, silently
  // wrong for any caller with a different real background.
  //
  // Shared auto-invalidating cache, same pattern radius/shadow now
  // use — stores parts (which may legitimately be null, meaning "no
  // usable border found here"), .has() distinguishes that from "never
  // sampled at all" so a genuine null result doesn't trigger a
  // pointless re-scan on every call.
  const cache = JLib.anchorCache.create();

  function sampleBorderParts(boundaryEl) {
    const candidates = Array.prototype.slice.call(boundaryEl.querySelectorAll('button, [role="button"], .card, [class*="card"], [class*="panel"], [class*="modal"]')).slice(0, 20);
    candidates.unshift(boundaryEl);
    const counts = new Map(); // "width style colorStr" -> count
    let best = null;
    let bestCount = 0;
    candidates.forEach((node) => {
      const cs = getComputedStyle(node);
      if (cs.borderStyle === 'none') return;
      if (parseFloat(cs.borderWidth) < BORDER_MIN_WIDTH_PX) return; // 0px, or too thin to be a real, intentional border
      const key = `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}`;
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      if (count > bestCount) {
        bestCount = count;
        best = { width: cs.borderWidth, style: cs.borderStyle, colorStr: cs.borderColor, sourceEl: node };
      }
    });
    return best; // null if nothing usable found
  }

  // get(el, opts?) -> "Npx style color" string, "must provide" as
  // always — never returns nothing, falls back to DEFAULT_BORDER.
  // opts.targetBg ({r,g,b}) — when supplied, the sampled (fidelity-
  // corrected) border color is WCAG-contrast-checked against it via
  // ensureContrast, same 3:1 non-text-UI bar colorProvider already
  // uses for muted/accent. Omitted: capture-only, no correction.
  function get(el, opts) {
    opts = opts || {};
    const boundary = cp.resolveAnchorBoundary(el);
    if (!cache.has(boundary)) {
      cache.set(boundary, sampleBorderParts(boundary));
    }
    const parts = cache.get(boundary);
    if (!parts) return DEFAULT_BORDER;

    const rgb = cp.resolveSampledColor(parts.colorStr, parts.sourceEl);
    if (!rgb) return `${parts.width} ${parts.style} ${parts.colorStr}`; // unparseable — fall back to the raw string rather than lose the sample

    const finalRgb = opts.targetBg ? cp.ensureContrast(rgb, opts.targetBg, 3) : rgb;
    return `${parts.width} ${parts.style} ${cp.toCssRgb(finalRgb)}`;
  }

  function getGlobal(opts) {
    return get(document.body, opts);
  }

  // invalidate(el) — manual escape hatch kept alongside the shared
  // cache's automatic invalidation, for cases automatic detection
  // genuinely can't cover. Only clears the cached CAPTURE (width/
  // style/colorStr) — correction was never cached in the first place,
  // so there's nothing else to clear.
  function invalidate(el) {
    if (!el) throw new Error('JLib.borderProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache.invalidateAll();
  }

  return { get, getGlobal, invalidate, invalidateAll, DEFAULT_BORDER };
})();
