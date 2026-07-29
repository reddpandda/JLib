// ============================================================================
// services/color-provider.js
// ============================================================================
/*
 * colorProvider — the only thing in this codebase that does color math.
 * Everything else (theme.js, and any future consumer — toasts, tooltips,
 * whatever) is a pure mapper: ask this for a palette, apply it, never
 * compute a color independently. That's a structural guarantee, not a
 * convention someone has to remember — a consumer literally has no color
 * math available to it that isn't routed back through validate() here.
 *
 * Built around OKLCH (perceptually uniform lightness/chroma/hue), not HSL —
 * equal steps in OKLCH actually look like equal steps, which matters for
 * contrast correction and for generating consistent hover/muted variants
 * from one base color. The OKLab/OKLCH <-> sRGB conversion below is
 * vendored from Björn Ottosson's published formulas (public domain), not
 * pulled in as a dependency — it's ~40 lines of stable math that doesn't
 * need updates, same reasoning as vendoring the search algorithm verbatim
 * elsewhere in this codebase.
 *
 * Anchor-relative, not page-global: getPalette(el) samples the DOM
 * neighborhood around `el` (nearest opaque/positioned ancestor), not one
 * whole-page average. A whole-page average is both noisy (mixing unrelated
 * regions together) and locally wrong (a color fine against the page's
 * overall tone can still be wrong sitting next to one specific element).
 * getGlobalPalette() still exists for the panel shell, which legitimately
 * wants one page-wide palette rather than per-element sampling.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.colorProvider = (function () {
  const { debounce } = JLib.utils;

  // ==========================================================================
  // OKLab / OKLCH <-> sRGB conversion (vendored, public-domain formulas)
  // ==========================================================================
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  // Raw, unclamped conversion — deliberately kept separate from the
  // clamping step below, since the gamut-mapping fix needs to test
  // whether a value is ALREADY in-gamut before anything clamps it.
  function linearToSrgbRaw(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
  }
  function linearToSrgb(c) {
    return Math.max(0, Math.min(255, Math.round(linearToSrgbRaw(c))));
  }
  function rgbToOklab({ r, g, b }) {
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    };
  }
  function oklabToRgb({ L, a, b }) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
  }
  // Raw, unclamped variant — needed by the gamut-mapping fix below to
  // test whether a candidate OKLCH value is already in-gamut, before
  // anything rounds or clips it.
  function oklabToRgbRaw({ L, a, b }) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return { r: linearToSrgbRaw(lr), g: linearToSrgbRaw(lg), b: linearToSrgbRaw(lb) };
  }
  function isInGamutRgb(rgb) {
    return rgb.r >= 0 && rgb.r <= 255 && rgb.g >= 0 && rgb.g <= 255 && rgb.b >= 0 && rgb.b <= 255;
  }
  function oklabToOklch({ L, a, b }) {
    const C = Math.hypot(a, b);
    let H = (Math.atan2(b, a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
  }
  function oklchToOklab({ L, C, H }) {
    const rad = (H * Math.PI) / 180;
    return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
  }
  function rgbToOklch(rgb) {
    return oklabToOklch(rgbToOklab(rgb));
  }
  // gamutMapOklch({L,C,H}) -> in-gamut {L,C,H}, via binary search on
  // chroma with L and H held FIXED — the CSS Color 4 spec's own
  // recommended algorithm. Confirmed necessary, not redundant with
  // anything the platform already does: a direct empirical test (three
  // browser engines, canvas rasterization readback) showed real browsers
  // do NOT do this — they do naive per-channel clipping instead, exactly
  // the technique this function replaces, confirmed byte-identical to
  // clipping the raw unclamped math. Naive clipping distorts both hue
  // and lightness (a yellow-green input rendered as pure red in the
  // confirmed test); holding L/H fixed and only reducing chroma
  // preserves the intended color's actual character.
  function gamutMapOklch(oklch) {
    const raw = oklchToRgbRawUnmapped(oklch);
    if (isInGamutRgb(raw)) return oklch;
    let lo = 0, hi = oklch.C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (isInGamutRgb(oklchToRgbRawUnmapped({ L: oklch.L, C: mid, H: oklch.H }))) lo = mid;
      else hi = mid;
    }
    return { L: oklch.L, C: lo, H: oklch.H };
  }
  function oklchToRgbRawUnmapped(oklch) {
    return oklabToRgbRaw(oklchToOklab(oklch));
  }
  function oklchToRgb(oklch) {
    return oklabToRgb(oklchToOklab(gamutMapOklch(oklch)));
  }

  // Perceptual distance between two sRGB colors — plain Euclidean distance
  // in OKLab, which (unlike raw sRGB or HSL distance) is close enough to
  // perceptually uniform to use directly as a ΔE-style metric without
  // needing the full CIEDE2000 apparatus.
  function perceptualDistance(rgbA, rgbB) {
    const a = rgbToOklab(rgbA), b = rgbToOklab(rgbB);
    return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
  }

  // Shortest circular distance between two hue angles, 0-180.
  function hueDistance(h1, h2) {
    const d = Math.abs(h1 - h2) % 360;
    return d > 180 ? 360 - d : d;
  }
  // Shortest-path interpolation between two hue angles.
  function circularLerp(a, b, t) {
    let diff = ((b - a + 180) % 360) - 180;
    if (diff < -180) diff += 360;
    return (a + diff * t + 360) % 360;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Confidently-far-off-hue threshold for seed-hue override, in OKLCH hue
  // degrees. Above this, the local sample is treated as "a real color, just
  // not the one requested" and the seed hue wins outright (still borrowing
  // the local sample's lightness/chroma bounds for contrast). Below it,
  // it's a continuous distance-weighted blend instead of a hard cutoff.
  const SEED_HUE_OVERRIDE_THRESHOLD_DEG = 90;

  // ==========================================================================
  // WCAG contrast (unchanged formula — this is a legal/spec-mandated
  // calculation, not a place OKLCH improves on the standard)
  // ==========================================================================
  function relativeLuminance({ r, g, b }) {
    const chan = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }
  function contrastRatio(c1, c2) {
    const l1 = relativeLuminance(c1), l2 = relativeLuminance(c2);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  // Nudges `fg` toward more/less lightness in OKLCH space (perceptually
  // uniform steps, unlike the old HSL-lightness version) until it clears
  // `minRatio` against `bg`, or gives up after 24 steps and returns its
  // best effort. Hue/chroma held constant so the corrected color still
  // visually relates to the one that was sampled. NOTE: if the 24-step
  // budget runs out before clearing minRatio (e.g. bg and fg are both
  // near mid-lightness with a huge minRatio target), the returned color
  // is NOT guaranteed to meet minRatio — it's the last candidate tried,
  // not a verified-passing one. Callers that need a hard guarantee should
  // check contrastRatio() on the result themselves.
  function ensureContrast(fg, bg, minRatio) {
    if (contrastRatio(fg, bg) >= minRatio) return fg;
    const oklch = rgbToOklch(fg);
    const bgIsDark = relativeLuminance(bg) < 0.5;
    const step = bgIsDark ? 0.035 : -0.035;
    let candidate = Object.assign({}, oklch);
    for (let i = 0; i < 24; i++) {
      candidate.L = Math.max(0, Math.min(1, candidate.L + step));
      const rgb = oklchToRgb(candidate);
      if (contrastRatio(rgb, bg) >= minRatio) return rgb;
      if (candidate.L === 0 || candidate.L === 1) break;
    }
    return oklchToRgb(candidate);
  }

  // ==========================================================================
  // Palette contract — fixed slots, guaranteed present, validated before
  // they ever leave this module. A consumer never sees an unvalidated or
  // partial palette.
  // ==========================================================================
  const DEFAULT_PALETTE = {
    base: { r: 20, g: 20, b: 28 },
    surface: { r: 30, g: 30, b: 40 },
    elevated: { r: 38, g: 38, b: 50 },
    ink: { r: 232, g: 232, b: 232 },
    muted: { r: 138, g: 138, b: 154 },
    accent: { r: 139, g: 92, b: 246 },
    'accent-hover': { r: 157, g: 117, b: 247 },
    danger: { r: 231, g: 76, b: 60 },
    success: { r: 46, g: 204, b: 113 },
    warning: { r: 241, g: 196, b: 15 },
  };

  function deriveHover(accentRgb) {
    const oklch = rgbToOklch(accentRgb);
    oklch.L = oklch.L > 0.5 ? Math.max(0, oklch.L - 0.08) : Math.min(1, oklch.L + 0.08);
    return oklchToRgb(oklch);
  }

  // validate(partialPalette) -> full palette, every slot present, ink/
  // muted/accent contrast-corrected against base. This is the one door —
  // anything that becomes a palette this module hands out passes through
  // here first.
  function validate(partial) {
    const merged = Object.assign({}, DEFAULT_PALETTE, partial || {});
    merged.ink = ensureContrast(merged.ink, merged.base, 4.5);
    merged.muted = ensureContrast(merged.muted, merged.base, 3);
    merged.accent = ensureContrast(merged.accent, merged.base, 3);
    merged['accent-hover'] = deriveHover(merged.accent);
    return merged;
  }

  // deriveShade — the escape hatch for "I need something not in the fixed
  // slot list." Still routes through the same validation, so a consumer
  // can't produce an invalid color even when asking for something custom.
  function deriveShade(palette, baseSlot, lightnessAdjust) {
    const oklch = rgbToOklch(palette[baseSlot] || DEFAULT_PALETTE[baseSlot]);
    oklch.L = Math.max(0, Math.min(1, oklch.L + (lightnessAdjust || 0)));
    const rgb = oklchToRgb(oklch);
    return ensureContrast(rgb, palette.base, 3);
  }

  // ==========================================================================
  // Color parsing / detection helpers
  // ==========================================================================
  function parseRgb(str) {
    const m = str && str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  }
  function isOpaqueColor(str) {
    const c = parseRgb(str);
    return !!c && c.a > 0.05 && str !== 'transparent';
  }
  function toCssRgb(rgb) {
    return `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
  }
  function toCssRgba(rgb, a) {
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
  }

  // CSS custom property detection — checks a known-name list against the
  // anchor's computed style before ever sampling visually. Not exhaustive
  // (there's no DOM API to enumerate arbitrary custom properties without
  // knowing their names), but catches the common cases for free and skips
  // visual sampling entirely when it hits.
  const KNOWN_VAR_NAMES = {
    base: ['--background', '--bg', '--color-background', '--surface', '--background-color'],
    accent: ['--primary', '--accent', '--brand', '--color-primary', '--brand-color', '--accent-color'],
    ink: ['--foreground', '--fg', '--text', '--color-text', '--text-color'],
  };

  // Single reused hidden probe for resolving non-rgb() color values (hex,
  // named colors, etc.) via the browser's own parser, instead of
  // hand-rolling a second color parser. Created lazily, kept off-screen
  // and out of layout (display:none) so touching it repeatedly across
  // many candidates doesn't cause layout thrash.
  let colorProbe = null;
  function resolveColorValue(val) {
    if (!colorProbe) {
      colorProbe = document.createElement('div');
      colorProbe.style.display = 'none';
      document.body.appendChild(colorProbe);
    }
    colorProbe.style.color = val;
    return getComputedStyle(colorProbe).color;
  }

  function detectCssVars(el) {
    const styles = getComputedStyle(el);
    const found = {};
    for (const slot in KNOWN_VAR_NAMES) {
      for (const varName of KNOWN_VAR_NAMES[slot]) {
        const val = styles.getPropertyValue(varName).trim();
        if (val && isOpaqueColor(val)) {
          found[slot] = parseRgb(val);
          break;
        }
        if (val) {
          const resolved = resolveColorValue(val);
          if (isOpaqueColor(resolved)) {
            found[slot] = parseRgb(resolved);
            break;
          }
        }
      }
    }
    return found;
  }

  // ==========================================================================
  // Anchor boundary resolution
  // ==========================================================================
  // Operational definition (deliberately simpler than walking siblings/
  // parent's-other-children — that scan gets expensive on a busy page and
  // undermines the whole point of caching by boundary element): walk up
  // from `el`, capped at 8 hops, stop at the first ancestor with an opaque
  // background OR position fixed/sticky (both signal "this is a real visual
  // surface, not just a layout wrapper") OR documentElement.
  //
  // Must always resolve to the true light-DOM host, never stop inside
  // our own shadow tree — sampling something inside our own chrome would
  // tell colorProvider nothing about the real page. parentElement
  // becomes null both at the genuine top of the light DOM AND at a
  // shadow root's own boundary; getRootNode().host distinguishes the
  // two (a ShadowRoot has a real .host, `document` does not), letting
  // the walk cross back out into the light DOM rather than stopping
  // early.
  function resolveAnchorBoundaryUncached(el) {
    let node = el;
    let hops = 0;
    while (node && node !== document.documentElement && hops < 8) {
      const cs = getComputedStyle(node);
      if (isOpaqueColor(cs.backgroundColor) || cs.position === 'fixed' || cs.position === 'sticky') return node;
      let next = node.parentElement;
      if (!next) {
        const root = node.getRootNode();
        next = root && root.host ? root.host : null;
      }
      node = next;
      hops++;
    }
    return document.body;
  }
  // The actual anchor-resolve-once fix: superProvider.css calls five
  // mini-providers in immediate synchronous succession for the same
  // element, and each used to independently re-walk the DOM to find the
  // same boundary. Memoizing the walk itself (keyed on the element, a
  // few ms window — comfortably longer than five synchronous calls take,
  // short enough that a real subsequent call still gets a fresh walk)
  // collapses that into one real walk regardless of which provider
  // triggers it first or how many call it after. No provider's public
  // API had to change to accept a pre-resolved boundary — the fix lives
  // at the one shared choke point everything already goes through.
  function resolveAnchorBoundary(el) {
    if (!JLib.dedupe) return resolveAnchorBoundaryUncached(el);
    // Map keys compare by reference for objects — pass el directly, not
    // concatenated into a string (string-coercing a DOM element yields a
    // generic, non-unique value like "[object HTMLDivElement]" for every
    // element, which would silently collapse unrelated elements onto the
    // same cache entry).
    return JLib.dedupe.memoSync(el, () => resolveAnchorBoundaryUncached(el), 4);
  }

  // Samples base/ink from the boundary itself, accent from a small,
  // frequency-weighted scan of nearby interactive elements — not
  // single-highest-saturation-wins (which lets one loud outlier hijack the
  // whole palette), but the most saturation-weighted-by-occurrence color
  // among what's actually there.
  // ==========================================================================
  // Sampling fidelity — bucket 1 vs. buckets 2/3
  // ==========================================================================
  // getComputedStyle preserves an author's pre-clip color intent for
  // wide-gamut CSS (oklch()/color()) — confirmed empirically: it does
  // NOT reflect the browser's real, rasterized, on-screen pixel for an
  // out-of-gamut value. Faithfully matching a specific piece of content
  // already on the real page (bucket 1) means simulating what a human
  // eye actually sees there, not what the author's raw CSS said —
  // confirmed via direct testing (canvas 2D fillStyle + getImageData)
  // to reveal the real, naive-clipped rendered value, unlike
  // getComputedStyle on a light-DOM element.
  //
  // Content inside our OWN known shadow root (buckets 2/3 — floating
  // chrome, nothing specific being visually merged with) skips this
  // entirely and uses proper math directly — there's no real rendered
  // pixel to chase, so simulating the platform's confirmed-bad clipping
  // would just reintroduce the exact distortion this whole fix exists
  // to avoid, aimed at nothing real.
  let fidelityProbeCanvas = null;
  function simulateRenderedColor(cssColorString) {
    if (!fidelityProbeCanvas) {
      fidelityProbeCanvas = document.createElement('canvas');
      fidelityProbeCanvas.width = 1;
      fidelityProbeCanvas.height = 1;
    }
    const ctx = fidelityProbeCanvas.getContext('2d');
    try {
      ctx.fillStyle = cssColorString;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2] };
    } catch (e) {
      return parseRgb(cssColorString); // canvas rejected the value — fall back to our own parser rather than lose the sample entirely
    }
  }
  // resolveSampledColor(cssColorString, sourceEl) — the one choke point
  // every real-page color read goes through. sourceEl is whatever
  // element the string was read from, used only to determine which
  // bucket applies.
  function resolveSampledColor(cssColorString, sourceEl) {
    const isOurs = JLib.shadow && JLib.shadow.isOurRoot(sourceEl.getRootNode());
    return isOurs ? parseRgb(cssColorString) : simulateRenderedColor(cssColorString);
  }

  function sampleAnchor(boundaryEl) {
    const boundaryStyles = getComputedStyle(boundaryEl);
    const base = isOpaqueColor(boundaryStyles.backgroundColor) ? resolveSampledColor(boundaryStyles.backgroundColor, boundaryEl) : DEFAULT_PALETTE.base;
    const ink = isOpaqueColor(boundaryStyles.color) ? resolveSampledColor(boundaryStyles.color, boundaryEl) : relativeLuminance(base) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

    const candidates = Array.prototype.slice.call(boundaryEl.querySelectorAll('button, a, [role="button"]')).slice(0, 30);
    const buckets = new Map(); // rounded-hue-bucket -> { count, sample }
    candidates.forEach((node) => {
      const styles = getComputedStyle(node);
      [styles.backgroundColor, styles.borderColor, styles.color].forEach((str) => {
        if (!isOpaqueColor(str)) return;
        const rgb = resolveSampledColor(str, node);
        const oklch = rgbToOklch(rgb);
        if (oklch.C < 0.03) return; // not saturated enough to be a real accent candidate
        const bucket = Math.round(oklch.H / 15) * 15; // group nearby hues together
        const entry = buckets.get(bucket) || { count: 0, sample: rgb, chroma: oklch.C };
        entry.count += 1;
        if (oklch.C > entry.chroma) {
          entry.sample = rgb;
          entry.chroma = oklch.C;
        }
        buckets.set(bucket, entry);
      });
    });
    let accent = null;
    let bestScore = 0;
    buckets.forEach((entry) => {
      const score = entry.count * entry.chroma; // frequency-weighted, not just "most saturated"
      if (score > bestScore) {
        bestScore = score;
        accent = entry.sample;
      }
    });
    if (!accent) accent = ink;

    return { base, ink, accent, muted: mixTowardBg(ink, base, 0.4), surface: mixTowardBg(base, ink, 0.06), elevated: mixTowardBg(base, ink, 0.12) };
  }
  function mixTowardBg(fg, bg, amount) {
    return { r: lerp(fg.r, bg.r, amount), g: lerp(fg.g, bg.g, amount), b: lerp(fg.b, bg.b, amount) };
  }

  // ==========================================================================
  // Caching — global (per-hostname) + local (WeakMap by boundary element)
  // ==========================================================================
  let globalCache = {};
  let anchorCache = new WeakMap();

  // liveBoundaries used to be a plain Set holding real element references —
  // that defeated the entire point of anchorCache being a WeakMap, since a
  // removed element could never actually be garbage collected while this
  // Set still held a strong reference to it. WeakRef + FinalizationRegistry
  // gets the same "let the observer find affected entries without walking
  // the whole DOM" behavior without preventing collection: the registry's
  // cleanup callback drops our tracking entry once the element is actually
  // gone, so nothing here outlives the element it's tracking.
  let liveBoundaries = new Set(); // holds WeakRefs, not elements
  const boundaryRegistry =
    typeof FinalizationRegistry !== 'undefined'
      ? new FinalizationRegistry((weakRef) => {
          liveBoundaries.delete(weakRef);
        })
      : null;
  function trackLiveBoundary(el) {
    const ref = new WeakRef(el);
    liveBoundaries.add(ref);
    if (boundaryRegistry) boundaryRegistry.register(el, ref);
  }
  function forEachLiveBoundary(fn) {
    liveBoundaries.forEach((ref) => {
      const el = ref.deref();
      if (el) fn(el, ref);
      else liveBoundaries.delete(ref); // already collected, sweep it
    });
  }

  let sharedObserver = null;
  function ensureObserver() {
    if (sharedObserver) return;
    const handleMutations = debounce((mutations) => {
      delete globalCache[location.hostname];
      forEachLiveBoundary((node, ref) => {
        for (const m of mutations) {
          if (m.target === node || (node.contains && node.contains(m.target)) || (m.target.contains && m.target.contains(node))) {
            anchorCache.delete(node);
            liveBoundaries.delete(ref);
            break;
          }
        }
      });
    }, 200);
    sharedObserver = new MutationObserver(handleMutations);
    sharedObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'], subtree: true });
  }

  function buildPalette(boundaryEl) {
    const detected = detectCssVars(boundaryEl);
    const sampled = sampleAnchor(boundaryEl);
    return validate(Object.assign({}, sampled, detected));
  }

  // getGlobalPalette() — one page-wide palette, for consumers that
  // legitimately want that (the panel shell). Cached per-hostname.
  function getGlobalPalette() {
    ensureObserver();
    const host = location.hostname;
    if (globalCache[host]) return globalCache[host];
    const palette = buildPalette(document.body);
    globalCache[host] = palette;
    return palette;
  }

  // getPalette(el, opts?) — anchor-relative. opts.seedHue (0-360) runs the
  // confidence-spectrum logic below instead of pure extraction.
  // opts.seedHueOverrideThresholdDeg overrides SEED_HUE_OVERRIDE_THRESHOLD_DEG
  // for this call only, for consumers with a reason to want a tighter or
  // looser "confidently far off-hue" cutoff than the default.
  function getPalette(el, opts) {
    opts = opts || {};
    ensureObserver();
    const boundary = resolveAnchorBoundary(el);
    if (opts.seedHue === undefined && anchorCache.has(boundary)) return anchorCache.get(boundary);
    let palette = buildPalette(boundary);
    if (opts.seedHue !== undefined) {
      palette = applySeedHue(palette, opts.seedHue, opts.seedHueOverrideThresholdDeg, { seedLightness: opts.seedLightness, seedChroma: opts.seedChroma });
    }
    anchorCache.set(boundary, palette);
    trackLiveBoundary(boundary);
    return palette;
  }

  // Confidence spectrum, not a binary confirm/reject:
  //  - local accent close to seed hue -> use it as-is (site "confirmed")
  //  - local accent desaturated (no real color to borrow) -> keep seed
  //    hue, borrow only the local lightness for contrast fit
  //  - moderate hue distance -> blend, weighted continuously by distance
  //  - confidently far off-hue (>= threshold) -> seed hue wins outright,
  //    still borrowing local lightness/chroma bounds
  // Perceptual-distance budget for how far the seed-hue PREFERENCE layer
  // (not correctness passes, which always apply regardless) is allowed
  // to pull the final accent from the site's own real sampled color.
  // Measured in OKLab Euclidean distance via perceptualDistance() — the
  // same metric already used for shared-clock animation timing
  // elsewhere in this file. A generous but real ceiling, not a hard
  // wall: exceeding it scales the whole preference contribution back
  // proportionally rather than clipping abruptly.
  const MAX_SEED_HUE_DRIFT = 0.35;

  // applySeedHue(palette, seedHueDeg, thresholdOverride, opts?) — opts
  // may include seedLightness/seedChroma (0-1 OKLCH values) for full
  // L/C/H harmonization, not just hue. Omitting them preserves the
  // original hue-only behavior exactly (targets default to the site's
  // own sampled L/C, so nothing changes for a caller only ever passing
  // seedHue).
  function applySeedHue(palette, seedHueDeg, thresholdOverride, opts) {
    opts = opts || {};
    const threshold = thresholdOverride !== undefined ? thresholdOverride : SEED_HUE_OVERRIDE_THRESHOLD_DEG;
    const originalAccent = palette.accent; // true baseline — drift is always measured against THIS, never a prior pipeline stage's output
    const accentOklch = rgbToOklch(originalAccent);
    const targetL = opts.seedLightness !== undefined ? opts.seedLightness : accentOklch.L;
    const targetC = opts.seedChroma !== undefined ? opts.seedChroma : accentOklch.C;

    let resultOklch;
    if (accentOklch.C < 0.04) {
      resultOklch = { L: targetL, C: Math.max(targetC, 0.15), H: seedHueDeg };
    } else {
      const dist = hueDistance(accentOklch.H, seedHueDeg);
      if (dist >= threshold) {
        resultOklch = { L: targetL, C: targetC, H: seedHueDeg };
      } else {
        const weight = dist / threshold;
        resultOklch = {
          L: lerp(accentOklch.L, targetL, weight),
          C: lerp(accentOklch.C, targetC, weight),
          H: circularLerp(accentOklch.H, seedHueDeg, weight),
        };
      }
    }

    // oklchToRgb() already runs the real gamut-mapping fix internally —
    // correctness applies here unconditionally, before the drift budget
    // is even checked, exactly as designed: correctness spends first,
    // preference gets whatever's left.
    let candidateRgb = oklchToRgb(resultOklch);
    const drift = perceptualDistance(candidateRgb, originalAccent);
    if (drift > MAX_SEED_HUE_DRIFT) {
      const scaleBack = MAX_SEED_HUE_DRIFT / drift;
      candidateRgb = oklchToRgb({
        L: lerp(accentOklch.L, resultOklch.L, scaleBack),
        C: lerp(accentOklch.C, resultOklch.C, scaleBack),
        H: circularLerp(accentOklch.H, resultOklch.H, scaleBack),
      });
    }

    palette.accent = ensureContrast(candidateRgb, palette.base, 3);
    palette['accent-hover'] = deriveHover(palette.accent);
    return palette;
  }

  // Manual override for sites known to theme dynamically without
  // triggering the watched attributes (e.g. a framework re-rendering with
  // new inline styles/CSS vars but no class/style/data-theme attribute
  // change on a watched node). No automatic detection for this case yet —
  // no evidence it's a real problem versus a hypothetical one, so this
  // stays a manual escape hatch rather than a polling loop.
  // invalidate(el) — clears this specific anchor's cached palette only.
  // For the global-palette case, use invalidateAll() explicitly rather
  // than calling this with no argument — an argument-dependent meaning
  // ("no el = clear everything") was a sharp edge worth naming instead.
  function invalidate(el) {
    if (!el) throw new Error('JLib.colorProvider.invalidate(el) requires an element — use invalidateAll() to clear everything.');
    const boundary = resolveAnchorBoundary(el);
    anchorCache.delete(boundary);
    forEachLiveBoundary((node, ref) => {
      if (node === boundary) liveBoundaries.delete(ref);
    });
  }

  // invalidateAll() — clears the global palette cache and every cached
  // anchor. The explicit "everything" case, named as its own function
  // rather than invalidate()'s no-argument behavior.
  function invalidateAll() {
    globalCache = {};
    anchorCache = new WeakMap();
    liveBoundaries.clear();
  }

  // Dev-only debugging aid — temporarily paint a palette (or a single
  // slot's color, as a quick check) onto an element via CSS vars, no
  // caching, no persistence.
  function preview(el, paletteOrSlot) {
    const palette = typeof paletteOrSlot === 'string' ? validate({ accent: DEFAULT_PALETTE[paletteOrSlot] || DEFAULT_PALETTE.accent }) : validate(paletteOrSlot);
    applyPaletteAsVars(el, palette);
  }

  function applyPaletteAsVars(el, palette, prefix) {
    prefix = prefix || '--jlib-color-';
    for (const slot in palette) {
      el.style.setProperty(prefix + slot, toCssRgb(palette[slot]));
    }
  }

  // ==========================================================================
  // Shared animation clock — one rAF loop drives every property being
  // transitioned together, so background (gradient overlay) and solid
  // colors (OKLCH-interpolated) can never drift out of sync the way two
  // independently-timed CSS transitions could.
  // ==========================================================================
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  // Ambient (default): near-linear, not eased. Ease-in-out covers the same
  // total change in the same total time by moving slower at the ends and
  // faster in the middle — a *higher* peak rate of change than linear,
  // which is what peripheral vision actually notices. Linear keeps peak
  // rate lower and more constant, which is what actually stays unnoticed.
  function linearEase(t) {
    return t;
  }

  // transitionPalette(el, fromPalette, toPalette, opts?)
  //   opts.mode: 'ambient' (default, tuned to avoid drawing the eye) or
  //     'salient' (deliberately tuned to draw it — short, punchy,
  //     high-chroma). Duration scales with perceptual distance between the
  //     two palettes' accents, so a small shift stays fast and a big one
  //     (e.g. a full light/dark flip) gets proportionally more time.
  //   opts.surfaceKind: 'panel' or 'solid' (default 'solid').
  //     'panel' is the ONLY mode that will create a gradient-overlay
  //     crossfade (via opts.fromBgCss) — because that's the only case
  //     where we own the CSS and can guarantee (or safely, temporarily
  //     establish) a positioning context on the host. It checks
  //     getComputedStyle(el).position and, only if it's 'static',
  //     temporarily sets position:relative for the duration of the
  //     transition and restores the exact prior inline value afterward —
  //     not just clears it, since a caller may have had their own reason
  //     for that value.
  //     'solid' (anchored elements, or a standalone/global-palette
  //     consumer like a draggable persistent button) NEVER touches
  //     position and NEVER creates an overlay — every property animates
  //     via direct per-frame OKLCH interpolation of CSS custom
  //     properties only. This is what makes it safe to point at an
  //     arbitrary host element we don't own the layout of: there is no
  //     DOM mutation for it to interact badly with, because there's
  //     nothing inserted and nothing repositioned.
  function transitionPalette(el, fromPalette, toPalette, opts) {
    opts = opts || {};
    const animMode = opts.mode === 'salient' ? 'salient' : 'ambient';
    const surfaceKind = opts.surfaceKind === 'panel' ? 'panel' : 'solid';
    const dist = perceptualDistance(fromPalette.accent, toPalette.accent);
    const duration = animMode === 'salient' ? 220 : Math.min(1200, Math.max(150, dist * 2200));
    const ease = animMode === 'salient' ? easeOutBack : linearEase;
    const start = performance.now();

    let overlay = null;
    let restorePosition = null;
    if (surfaceKind === 'panel' && opts.fromBgCss) {
      const priorPosition = el.style.position;
      if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
        restorePosition = () => {
          el.style.position = priorPosition;
        };
      }
      overlay = document.createElement('div');
      overlay.setAttribute('style', `position:absolute;inset:0;pointer-events:none;background:${opts.fromBgCss};z-index:0;border-radius:inherit;`);
      el.insertBefore(overlay, el.firstChild);
    }

    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const et = ease(t);
      for (const slot in toPalette) {
        const a = rgbToOklch(fromPalette[slot] || toPalette[slot]);
        const b = rgbToOklch(toPalette[slot]);
        const mixed = { L: lerp(a.L, b.L, et), C: lerp(a.C, b.C, et), H: circularLerp(a.H, b.H, et) };
        el.style.setProperty('--jlib-color-' + slot, toCssRgb(oklchToRgb(mixed)));
      }
      if (overlay) overlay.style.opacity = String(Math.max(0, 1 - et));
      if (t < 1) {
        requestAnimationFrame(frame);
      } else if (overlay) {
        overlay.remove();
        if (restorePosition) restorePosition();
      }
    }
    requestAnimationFrame(frame);
  }

  // reveal(el, buildFn, opts?) — the first-paint case, deliberately not a
  // crossfade. There's no prior visible state for a brand-new element, so
  // waiting for the real palette and revealing once (rather than painting
  // a fallback color and fading between two states) eliminates pop-in
  // entirely instead of smoothing over it. buildFn receives the resolved
  // palette so the caller can finish building content with it before the
  // reveal fires.
  //   opts.source: 'anchor' (default — local DOM-neighborhood sampling
  //     via getPalette(el)) or 'global' (the page-wide palette via
  //     getGlobalPalette() — the right choice for something like a
  //     persistent draggable control that moves across unrelated regions
  //     of the page and shouldn't re-sample, or visually "chameleon",
  //     based on wherever it currently sits).
  function reveal(el, buildFn, opts) {
    opts = opts || {};
    el.style.opacity = '0';
    const palette = opts.source === 'global' ? getGlobalPalette() : getPalette(el, opts);
    applyPaletteAsVars(el, palette);
    if (buildFn) buildFn(palette);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 180ms linear';
      el.style.opacity = '1';
    });
    return palette;
  }
  // Back-compat alias — the name this was originally introduced under.
  function revealAnchored(el, buildFn) {
    return reveal(el, buildFn, { source: 'anchor' });
  }

  // detectDisplayGamut() -> 'srgb' | 'p3' | 'rec2020', cached after first
  // call. The platform's own approximate display-gamut signal — real,
  // standardized, and confirmed via direct spec/CSSWG research to be
  // permanently, deliberately approximate (a coarse category, not a
  // precise per-monitor reading, and that gap is a platform design
  // choice, not a current limitation waiting on a better API). Relevant
  // only to the GENERATION path (seed-hue, contrast correction) — never
  // to plain sampling, since a sampled-and-reproduced color already
  // inherits whatever the real screen does to it identically on both
  // the site's own rendering and ours.
  let cachedGamut = null;
  function detectDisplayGamut() {
    if (cachedGamut) return cachedGamut;
    if (typeof window === 'undefined' || !window.matchMedia) {
      cachedGamut = 'srgb';
      return cachedGamut;
    }
    if (window.matchMedia('(color-gamut: rec2020)').matches) cachedGamut = 'rec2020';
    else if (window.matchMedia('(color-gamut: p3)').matches) cachedGamut = 'p3';
    else cachedGamut = 'srgb';
    return cachedGamut;
  }

  return {
    // math, exposed for consumers that need it directly (theme.js does)
    rgbToOklch,
    oklchToRgb,
    perceptualDistance,
    hueDistance,
    relativeLuminance,
    contrastRatio,
    ensureContrast,
    parseRgb,
    isOpaqueColor,
    toCssRgb,
    toCssRgba,
    SEED_HUE_OVERRIDE_THRESHOLD_DEG,
    detectDisplayGamut,
    // palette contract
    DEFAULT_PALETTE,
    validate,
    deriveShade,
    // sampling
    resolveAnchorBoundary,
    getGlobalPalette,
    getPalette,
    // manual control / debugging
    invalidate,
    invalidateAll,
    preview,
    // animation
    transitionPalette,
    reveal,
    revealAnchored,
    applyPaletteAsVars,
  };
})();
