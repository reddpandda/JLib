var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ============================================================================
// providers/font-provider.js
// ============================================================================
JLib.fontProvider = (function () {
  const cp = JLib.colorProvider;
  const JLIB_AUTHORED_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  // Shared auto-invalidating cache, same pattern radius/shadow/border
  // now use — consistent across every mini-provider rather than this
  // one staying on the old manual-invalidate-only WeakMap.
  const cache = JLib.anchorCache.create();

  // Splits a computed font-family stack into individual family names, in
  // the order the browser/site declared them — this ordering already
  // reflects the site's own fallback intent, which is what "secondary
  // candidate" (rank 2) is sourced from.
  function splitFontStack(stackStr) {
    return stackStr
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  // resolveRanked(el) -> always-length-3 array of font-family strings.
  // Rank 1: the anchor's own primary declared font. Rank 2: the next
  // entry in that same declared stack, if one exists — otherwise JLib's
  // authored font repeated (still a real, usable value, never undefined).
  // Rank 3: JLib's authored font, always — the guaranteed final slot.
  function resolveRanked(boundaryEl) {
    const declared = splitFontStack(getComputedStyle(boundaryEl).fontFamily || '');
    const rank1 = declared[0] || JLIB_AUTHORED_FONT;
    const rank2 = declared[1] || JLIB_AUTHORED_FONT;
    const rank3 = JLIB_AUTHORED_FONT;
    return [rank1, rank2, rank3];
  }

  function getRanked(el) {
    const boundary = cp.resolveAnchorBoundary(el);
    if (cache.has(boundary)) return cache.get(boundary);
    const ranked = resolveRanked(boundary);
    cache.set(boundary, ranked);
    return ranked;
  }

  // fontType(el, rank) — rank is 1, 2, or 3. Always resolves to a real
  // font-family string.
  function fontType(el, rank) {
    const ranked = getRanked(el);
    const idx = Math.max(1, Math.min(3, rank || 1)) - 1;
    return ranked[idx];
  }

  // ---------- fontProvider.layout ----------
  // Fixed shrink -> wrap -> truncate order, no deviation from the
  // default path (independently-callable strategies still exist below
  // for a caller with a genuine reason to want a different order for
  // their own layout).
  const layout = (function () {
    let probe = null;
    function ensureProbe() {
      if (!probe) {
        probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;top:-9999px;left:-9999px;';
        document.body.appendChild(probe);
      }
      return probe;
    }

    // measure(container, text, fontFamily, fontSizePx) -> { width, height }
    // Probe is sized/fonted to match the caller's real container, not
    // ours — this is the fix for "our own fit-check assumed our own
    // fixed panel," per the earlier design correction: any container can
    // be passed here, not just our own chrome.
    function measure(container, text, fontFamily, fontSizePx) {
      const p = ensureProbe();
      const containerStyles = getComputedStyle(container);
      p.style.fontFamily = fontFamily;
      p.style.fontSize = fontSizePx + 'px';
      p.style.fontWeight = containerStyles.fontWeight;
      p.style.letterSpacing = containerStyles.letterSpacing;
      p.textContent = text;
      return { width: p.scrollWidth, height: p.scrollHeight };
    }

    function fits(container, text, fontFamily, fontSizePx) {
      const size = measure(container, text, fontFamily, fontSizePx);
      const box = container.getBoundingClientRect();
      return size.width <= box.width && size.height <= box.height;
    }

    // shrink(container, text, fontFamily, opts?) -> the largest font size
    // (down to a legibility floor, default 10px) that fits, or the floor
    // size if nothing fits even there.
    function shrink(container, text, fontFamily, opts) {
      opts = opts || {};
      const minSize = opts.minSize || 10;
      const startSize = opts.startSize || parseFloat(getComputedStyle(container).fontSize) || 13;
      let size = startSize;
      while (size > minSize) {
        if (fits(container, text, fontFamily, size)) return size;
        size -= 1;
      }
      return minSize;
    }

    // wrap(container) -> just flips the container to allow multi-line
    // text instead of forcing a single line. Doesn't touch font size or
    // content — a pure layout permission change.
    function wrap(container) {
      container.style.whiteSpace = 'normal';
      container.style.wordBreak = 'break-word';
    }

    // truncate(container, text, fontFamily, fontSizePx) -> the longest
    // prefix of `text` + an ellipsis that fits, via binary search rather
    // than trimming one character at a time. If even a bare "…" doesn't
    // fit, warns and returns "…" anyway as the best possible result —
    // this is the one case fontProvider.layout can't rescue, and it's a
    // caller configuration issue, not a bug here.
    function truncate(container, text, fontFamily, fontSizePx) {
      if (fits(container, text, fontFamily, fontSizePx)) return text;
      if (!fits(container, '\u2026', fontFamily, fontSizePx)) {
        JLib.console.warn('font.ellipsisTooSmall', container);
        return '\u2026';
      }
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = text.slice(0, mid) + '\u2026';
        if (fits(container, candidate, fontFamily, fontSizePx)) lo = mid;
        else hi = mid - 1;
      }
      return text.slice(0, lo) + '\u2026';
    }

    // fitText(container, text, fontFamily, opts?) — the default entry
    // point: fixed shrink -> wrap -> truncate order, applied to
    // `container` directly (sets font-size, textContent, and wrap
    // permission as needed). Returns the final text actually applied.
    function fitText(container, text, fontFamily, opts) {
      opts = opts || {};
      container.textContent = text;
      container.style.fontFamily = fontFamily;
      const baseSize = parseFloat(getComputedStyle(container).fontSize) || 13;
      if (fits(container, text, fontFamily, baseSize)) return text;

      const shrunkSize = shrink(container, text, fontFamily, opts);
      container.style.fontSize = shrunkSize + 'px';
      if (fits(container, text, fontFamily, shrunkSize)) return text;

      wrap(container);
      if (fits(container, text, fontFamily, shrunkSize)) return text;

      const truncated = truncate(container, text, fontFamily, shrunkSize);
      container.textContent = truncated;
      return truncated;
    }

    return { measure, fits, shrink, wrap, truncate, fitText };
  })();

  // invalidate(el) — manual escape hatch kept alongside the shared
  // cache's automatic invalidation, for cases automatic detection
  // genuinely can't cover.
  function invalidate(el) {
    if (!el) throw new Error('JLib.fontProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    cache.delete(cp.resolveAnchorBoundary(el));
  }
  function invalidateAll() {
    cache.invalidateAll();
  }

  return { getRanked, fontType, layout, invalidate, invalidateAll, JLIB_AUTHORED_FONT };
})();
