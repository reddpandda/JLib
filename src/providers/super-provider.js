var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ============================================================================
// providers/super-provider.js
// ============================================================================
/*
 * superProvider — namespace, not a singleton. .css is the composition
 * layer for the five visual mini-providers; other domains (.a11y, .motion)
 * were named during design but explicitly not built — no evidence of
 * need yet, same bar as everything else in this system.
 */
JLib.superProvider = JLib.superProvider || {};

JLib.superProvider.css = (function () {
  const cp = JLib.colorProvider;

  // resolve(el, opts?) -> flat bundle, e.g. { color, font, radius,
  // shadow, border }. Anchor-resolve-once is fixed at the source
  // (colorProvider.resolveAnchorBoundary itself is memoized via
  // JLib.dedupe now — see that function's comment) rather than here;
  // every mini-provider call below still goes through its own public
  // (el)-taking API, but that API's internal boundary resolution now
  // collapses into one real DOM walk regardless of how many of these
  // five calls happen in the same tick.
  //
  // opts keys: omitted = that provider's own default; `false` =
  // excluded, key absent from the bundle; any other value = "run this
  // provider" (font accepts a 1-3 rank; other providers currently just
  // run at default when given any non-false value — richer per-provider
  // instruction shapes are real future work, not yet built for
  // color/radius/shadow color).
  //
  // border is resolved AFTER color, deliberately, not just by file
  // order — when color is included in the bundle, its resolved
  // palette.base is passed to borderProvider as opts.targetBg, so a
  // border sampled here is WCAG-contrast-checked against the SAME
  // background this bundle's own color slot resolved to, not a
  // separately-guessed one. When color is excluded (opts.color ===
  // false), border falls back to borderProvider's own default —
  // capture-only, no correction — since there's no real background in
  // this call to correct against.
  function resolve(el, opts) {
    opts = opts || {};
    const bundle = {};

    if (opts.color !== false) {
      bundle.color = opts.seedHue !== undefined ? cp.getPalette(el, { seedHue: opts.seedHue }) : cp.getPalette(el);
    }
    if (opts.font !== false) {
      const rank = typeof opts.font === 'number' ? opts.font : 1;
      bundle.font = JLib.fontProvider.fontType(el, rank);
    }
    if (opts.radius !== false) {
      bundle.radius = JLib.radiusProvider.get(el);
    }
    if (opts.shadow !== false) {
      bundle.shadow = JLib.shadowProvider.get(el);
    }
    if (opts.border !== false) {
      const borderOpts = bundle.color ? { targetBg: bundle.color.base } : undefined;
      bundle.border = JLib.borderProvider.get(el, borderOpts);
    }
    return bundle;
  }

  // apply(el, opts?) -> resolves AND writes the whole bundle onto `el`
  // in one call — the actual one-call shortcut the design always
  // promised, instead of every consumer manually unpacking resolve()'s
  // return value. Color slots become CSS vars via colorProvider's own
  // convention (--jlib-color-*); structural values map to their direct
  // CSS-property equivalents.
  function apply(el, opts) {
    const bundle = resolve(el, opts);
    if (bundle.color) cp.applyPaletteAsVars(el, bundle.color);
    if (bundle.font) el.style.fontFamily = bundle.font;
    if (bundle.radius) el.style.borderRadius = bundle.radius;
    if (bundle.shadow) el.style.boxShadow = bundle.shadow;
    if (bundle.border) el.style.border = bundle.border;
    return bundle;
  }

  // reveal(el, buildFn, opts?) — bundle-aware version of
  // colorProvider.reveal(): builds hidden, resolves the FULL bundle
  // (not just color), applies it, then fades opacity in once. No
  // fallback color/font/structure is ever painted, same reasoning as
  // the palette-only version this extends.
  function reveal(el, buildFn, opts) {
    el.style.opacity = '0';
    const bundle = apply(el, opts);
    if (buildFn) buildFn(bundle);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 180ms linear';
      el.style.opacity = '1';
    });
    return bundle;
  }

  // transition(el, fromBundle, toBundle, opts?) — bundle-aware version
  // of colorProvider.transitionPalette(). Color slots interpolate in
  // OKLCH exactly as before. Structural values that are plain strings
  // (radius, border) snap instantly — they're not colors, there's no
  // meaningful "halfway" state for a border-radius the way there is for
  // a color. Shadow gets a simple opacity crossfade between old and new
  // (via the same overlay trick colorProvider uses for gradients),
  // since a shadow genuinely can look jarring snapping instantly the
  // way a border-radius change doesn't.
  function transition(el, fromBundle, toBundle, opts) {
    opts = opts || {};
    if (fromBundle.color && toBundle.color) {
      cp.transitionPalette(el, fromBundle.color, toBundle.color, opts);
    }
    if (toBundle.font) el.style.fontFamily = toBundle.font;
    if (toBundle.radius) el.style.borderRadius = toBundle.radius;
    if (toBundle.border) el.style.border = toBundle.border;
    if (toBundle.shadow && fromBundle.shadow && toBundle.shadow !== fromBundle.shadow) {
      const overlay = document.createElement('div');
      overlay.setAttribute('style', `position:absolute;inset:0;pointer-events:none;box-shadow:${fromBundle.shadow};opacity:1;transition:opacity 300ms ease;border-radius:inherit;`);
      el.style.boxShadow = toBundle.shadow;
      el.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.opacity = '0';
      });
      setTimeout(() => overlay.remove(), 340);
    } else if (toBundle.shadow) {
      el.style.boxShadow = toBundle.shadow;
    }
  }

  // fitText(el, container, text, opts?) — resolves the bundle (or just
  // asks for font if opts.font !== false and everything else is
  // excluded) and runs fontProvider.layout.fitText against the
  // resolved font in one call, instead of a consumer chaining
  // superProvider.css.resolve() and fontProvider.layout.fitText()
  // themselves every time.
  function fitText(el, container, text, opts) {
    opts = Object.assign({ color: false, radius: false, shadow: false, border: false }, opts || {});
    const bundle = resolve(el, opts);
    const font = bundle.font || JLib.fontProvider.fontType(el, 1);
    return JLib.fontProvider.layout.fitText(container, text, font);
  }

  // invalidateAll() — cascades to every mini-provider's own
  // invalidateAll(). superProvider.css is the composition point; an
  // author using it shouldn't need to separately know about, or call,
  // five individual providers' own invalidateAll() functions just to
  // clear everything this facade resolves.
  function invalidateAll() {
    cp.invalidateAll();
    JLib.radiusProvider.invalidateAll();
    JLib.shadowProvider.invalidateAll();
    JLib.borderProvider.invalidateAll();
    JLib.fontProvider.invalidateAll();
  }

  return { resolve, apply, reveal, transition, fitText, invalidateAll };
})();
