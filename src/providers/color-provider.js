// ============================================================================
// providers/color-provider.js
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

  // ==========================================================================
  // Display-P3 output — generation-only, our-chrome-only enrichment
  // ==========================================================================
  // A freshly synthesized OKLCH color (a seed-hue accent, in practice —
  // see applySeedHue below) can carry chroma sRGB genuinely can't hold;
  // gamutMapOklch() above clips it back to whatever sRGB allows, which
  // is correct and mandatory for the rgb() value every consumer needs
  // as a universal fallback, but throws away real headroom on a P3
  // display. This section adds a SECOND, optional CSS output —
  // color(display-p3 ...) — carrying the same ideal color mapped
  // against P3's wider gamut instead. It is never a replacement for the
  // sRGB value, only an addition a supporting browser can choose to
  // render instead (a browser that doesn't understand color(display-p3
  // ...) silently fails to apply it via CSSOM and keeps whatever was
  // set immediately before it — see applyPaletteAsVars below, which
  // relies on exactly this instead of feature-testing).
  //
  // Scoped deliberately narrow, per the our-chrome-vs-page-content line
  // this codebase already draws for a different reason (see
  // resolveSampledColor's isOurRoot check above): content living in
  // JLib's own shared shadow root has nothing else on screen it needs
  // to visually match, so it's free to use the display's real range.
  // Content an author injects directly into the native page stays
  // sRGB-bound even on a P3 display — using more range than the
  // surrounding page content can display would look exactly like NOT
  // respecting its elder, a control that visually doesn't belong to
  // the page it's sitting in. This is why P3 is wired in only where an
  // element and its root are already known (applySeedHue, which
  // receives el from getPalette), never inside the general-purpose,
  // DOM-unaware math functions (ensureContrast, deriveHover,
  // deriveShade) that stay usable with no element context at all, same
  // as they always have been — those only ever move L, and L is what
  // carries a WCAG target, not what P3's extra range would help with.
  //
  // The linear-P3 <-> LMS matrices below are NOT independently
  // published by Ottosson — his public matrices target sRGB
  // specifically. They're derived by composing this file's own
  // vendored, already-trusted linear-sRGB->LMS matrix (above) with the
  // standard CIE XYZ D65 primary matrices for sRGB and Display-P3
  // (XYZ_to_LMS = srgbToLmsMatrix * inverse(srgbToXyzMatrix), then
  // p3ToLmsMatrix = XYZ_to_LMS * p3ToXyzMatrix), then numerically
  // cross-checked against an independent reference implementation
  // (culori) across six test colors including the three P3 primaries
  // and white/mid-gray — max observed deviation ~5e-5 in OKLab L,
  // well below anything perceptible.
  const LMS_TO_LINEAR_P3 = [
    [3.1283077753, -2.2575793943, 0.1293984215],
    [-1.0909591413, 2.4132560739, -0.3223138337],
    [-0.0259966231, -0.5079011305, 1.533680273],
  ];
  const LINEAR_P3_TO_LMS = [
    [0.4812987251, 0.4621450221, 0.0565153246],
    [0.2287894483, 0.6532387085, 0.1179795308],
    [0.0839252895, 0.2241633374, 0.6920550282],
  ];
  // Same OKLab -> LMS' -> cube -> matrix pipeline as oklabToRgbRaw
  // above, targeting linear Display-P3 instead of linear sRGB. Raw,
  // unclamped (0-1 range, not clamped) — same reasoning as
  // oklabToRgbRaw: the gamut test needs to see whether a value is
  // ALREADY in-gamut before anything clips it.
  function oklabToLinearP3Raw({ L, a, b }) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const mtx = LMS_TO_LINEAR_P3;
    return {
      r: mtx[0][0] * l + mtx[0][1] * m + mtx[0][2] * s,
      g: mtx[1][0] * l + mtx[1][1] * m + mtx[1][2] * s,
      b: mtx[2][0] * l + mtx[2][1] * m + mtx[2][2] * s,
    };
  }
  function isInGamutUnit(rgb) {
    return rgb.r >= 0 && rgb.r <= 1 && rgb.g >= 0 && rgb.g <= 1 && rgb.b >= 0 && rgb.b <= 1;
  }
  // Same CSS Color 4 binary-search-on-chroma algorithm as
  // gamutMapOklch above, tested against the P3 boundary instead of
  // sRGB's — deliberately duplicated rather than parameterized, since
  // the two in-gamut tests operate on different unit ranges (0-255 vs
  // 0-1) and forcing one shared function through both would obscure
  // that rather than simplify anything.
  function gamutMapOklchP3(oklch) {
    const raw = oklabToLinearP3Raw(oklchToOklab(oklch));
    if (isInGamutUnit(raw)) return oklch;
    let lo = 0, hi = oklch.C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (isInGamutUnit(oklabToLinearP3Raw(oklchToOklab({ L: oklch.L, C: mid, H: oklch.H })))) lo = mid;
      else hi = mid;
    }
    return { L: oklch.L, C: lo, H: oklch.H };
  }
  function p3LinearToGamma(c) {
    const v = Math.max(0, Math.min(1, c));
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }
  // toCssP3(oklch) -> "color(display-p3 r g b)" string, gamut-mapped
  // and gamma-encoded. Takes the IDEAL (pre-sRGB-clip) OKLCH triple —
  // calling this on an already-sRGB-gamut-mapped value would just
  // reproduce the sRGB result in P3 coordinates, since the chroma
  // sRGB's own gamutMapOklch already threw away can't be recovered
  // from its output.
  function toCssP3(oklch) {
    const mapped = gamutMapOklchP3(oklch);
    const lin = oklabToLinearP3Raw(oklchToOklab(mapped));
    const r = p3LinearToGamma(lin.r), g = p3LinearToGamma(lin.g), b = p3LinearToGamma(lin.b);
    return `color(display-p3 ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)})`;
  }
  // isOurChrome(el) — the one gate every P3 decision goes through: is
  // this element part of JLib's own floating chrome (free to use the
  // display's real range) or does it live somewhere else (native page,
  // some other shadow root)? Same JLib.shadow.isOurRoot check
  // resolveSampledColor already uses for the equivalent input-side
  // decision, just applied here to output.
  function isOurChrome(el) {
    return !!(el && JLib.shadow && JLib.shadow.isOurRoot(el.getRootNode()) && detectDisplayGamut() !== 'srgb');
  }
  // maybeP3Override(idealOklch, srgbGamutMappedRgb) -> css string | null.
  // Compares how much chroma P3 actually preserves against how much
  // sRGB had to clip away at the same L/H — a seed-hue request that
  // never exceeded sRGB gamut in the first place gets no override at
  // all, so this never adds a redundant second declaration for an
  // ordinary in-gamut color.
  const P3_CHROMA_GAIN_FLOOR = 0.01;
  function maybeP3Override(idealOklch) {
    const srgbMapped = gamutMapOklch(idealOklch);
    const p3Mapped = gamutMapOklchP3(idealOklch);
    if (p3Mapped.C - srgbMapped.C < P3_CHROMA_GAIN_FLOOR) return null;
    return toCssP3(idealOklch);
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
  //
  // Resets to '' before every assignment, then checks the raw
  // (specified, not computed) style value immediately after — setting
  // an unparseable CSS color value is a silent no-op at the platform
  // level (confirmed: both real browsers and jsdom simply refuse to
  // apply it), so without the reset, an invalid `val` would silently
  // leave whatever the PREVIOUS successful resolution left on this
  // shared probe, and getComputedStyle would report that stale value
  // as if it were a valid resolution of the current, actually-invalid
  // input. Checking the raw specified value (not computed) after
  // assignment is what makes this detectable at all — computed style
  // always reports SOME value (inherited/default) even when the
  // specified value was rejected.
  let colorProbe = null;
  function resolveColorValue(val) {
    if (!colorProbe) {
      colorProbe = document.createElement('div');
      colorProbe.style.display = 'none';
      document.body.appendChild(colorProbe);
    }
    colorProbe.style.color = '';
    colorProbe.style.color = val;
    if (colorProbe.style.color === '') return null; // platform refused to parse val at all
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

  // ==========================================================================
  // Accent discovery — BM25-ranked candidate scan
  // ==========================================================================
  // Upgrades the accent-detection half of sampleAnchor's job specifically
  // (base/ink stay direct boundary reads, unaffected — they were never
  // candidate-scan-based to begin with). Steps 1-4 of the full sampling
  // pipeline design, applied to accent: capture+rank via JLib.heuristics
  // (real BM25 against a color-relevant keyword query), then a second
  // capture (getComputedStyle on survivors only) + validity filter, all
  // inside ONE JLib.heuristics.withScrollLock() call spanning the whole
  // sequence — heuristics.js's capture()/rank() don't lock internally
  // specifically so a caller chaining further reads can protect the
  // whole span in one call; this is that caller.
  //
  // Graceful degrade, not a hard dependency: if JLib.heuristics isn't
  // loaded (an older bundle, or an author who only @requires the parts
  // they need), discoverAccent() returns null and sampleAnchor falls
  // back to the original hue-bucket-only scan below — same "shortcut,
  // never a requirement" principle this codebase already holds
  // everywhere else.
  const ACCENT_QUERY_KEYWORDS = ['accent', 'brand', 'primary', 'secondary', 'nav', 'header', 'logo', 'masthead', 'toolbar', 'cta'];

  // Lightness-extreme floor/ceiling for the validity gate below — no
  // existing shipped threshold to inherit for this specifically
  // (ensureContrast steps TOWARD a contrast target, it doesn't reject
  // extremes outright on its own), so these are new values, same shape
  // as the chroma floor already trusted elsewhere in this file (0.03,
  // reused unchanged below) but not yet empirically tuned the way that
  // one has been through real-site testing.
  const ACCENT_LIGHTNESS_FLOOR = 0.08;
  const ACCENT_LIGHTNESS_CEILING = 0.95;
  const ACCENT_MIN_VISIBLE_SIZE_PX = 4;

  // isElementVisible(el) — a real rendering check, not just "exists in
  // the DOM." A candidate can have perfect semantic naming and still be
  // display:none, zero-size, or fully transparent; its color shouldn't
  // count toward the vote if nothing actually renders it.
  function isElementVisible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= ACCENT_MIN_VISIBLE_SIZE_PX && rect.height >= ACCENT_MIN_VISIBLE_SIZE_PX;
  }

  // isAccentColorValid(rgb) — same chroma floor sampleAnchor's original
  // scan already used (0.03), plus the new lightness-extreme gate.
  function isAccentColorValid(rgb) {
    const oklch = rgbToOklch(rgb);
    if (oklch.C < 0.03) return false;
    if (oklch.L < ACCENT_LIGHTNESS_FLOOR || oklch.L > ACCENT_LIGHTNESS_CEILING) return false;
    return true;
  }

  // accentColorStrength(rgb, base) — continuous score for a color that
  // already passed isAccentColorValid: how much real headroom it has,
  // not just whether it clears the floor. Chroma (already floor-gated,
  // so raw value is a fine proxy for "how vivid") plus contrast against
  // the anchor's own base (more contrast against the real background
  // suggests a deliberately visible UI element, not incidental text
  // color). Deliberately NOT BM25 — this is continuous numeric math
  // over color properties, a different problem shape than text
  // relevance, not a rerun of the same algorithm for a different input.
  function accentColorStrength(rgb, base) {
    const oklch = rgbToOklch(rgb);
    const contrast = base ? contrastRatio(rgb, base) : 1;
    return oklch.C * 2 + Math.log(1 + contrast);
  }

  // normalize(values) -> same-length array, each entry rescaled to
  // 0-1 (min-max). BM25 scores and accentColorStrength scores live on
  // completely different scales — this is what makes combining them
  // into one weighted sum meaningful instead of one silently dominating
  // purely because its raw numbers happen to be bigger.
  function normalize(values) {
    if (values.length === 0) return [];
    const max = Math.max(...values), min = Math.min(...values);
    if (max === min) return values.map(() => 1);
    return values.map((v) => (v - min) / (max - min));
  }

  // buildAccentVoteBuckets(boundaryEl, base) -> Map<hueBucket, entry> |
  // null. Shared internal helper — the actual capture+rank+vote work,
  // used by both discoverAccent (picks a single winning color, the
  // original external contract) and discoverAccentCandidates (needs
  // the full winner+runner-up list with their source elements and
  // which property won, for Step 6's shortlist). Extracted rather than
  // duplicated so both stay exactly in sync with the same underlying
  // vote.
  function buildAccentVoteBuckets(boundaryEl, base) {
    if (!JLib.heuristics) return null;

    return JLib.heuristics.withScrollLock(() => {
      const ranked = JLib.heuristics.captureAndRank(ACCENT_QUERY_KEYWORDS, boundaryEl);
      if (ranked.length === 0) return null;

      const propNames = ['backgroundColor', 'borderColor', 'color', 'caretColor'];
      const votes = []; // { rgb, bm25, strength, el, property }
      for (const candidate of ranked) {
        if (!isElementVisible(candidate.el)) continue;
        const cs = getComputedStyle(candidate.el);
        const propStrings = [cs.backgroundColor, cs.borderColor, cs.color, cs.caretColor];
        for (let p = 0; p < propStrings.length; p++) {
          const str = propStrings[p];
          if (!isOpaqueColor(str)) continue;
          const rgb = resolveSampledColor(str, candidate.el);
          if (!rgb || !isAccentColorValid(rgb)) continue;
          votes.push({ rgb, bm25: candidate.score, strength: accentColorStrength(rgb, base), el: candidate.el, property: propNames[p] });
        }
      }
      if (votes.length === 0) return null;

      const bm25Norm = normalize(votes.map((v) => v.bm25));
      const strengthNorm = normalize(votes.map((v) => v.strength));
      votes.forEach((v, i) => {
        v.weight = bm25Norm[i] * BM25_WEIGHT + strengthNorm[i] * COLOR_STRENGTH_WEIGHT;
      });

      // Hue-bucket grouping — repeated agreement across multiple
      // candidates/properties on the same real hue reinforces
      // confidence, same principle as legacyAccentScan below, just
      // weighted by the richer combined score now.
      const buckets = new Map();
      votes.forEach((v) => {
        const oklch = rgbToOklch(v.rgb);
        const bucket = Math.round(oklch.H / 15) * 15;
        const entry = buckets.get(bucket) || { totalWeight: 0, sample: v.rgb, bestWeight: 0, el: v.el, property: v.property };
        entry.totalWeight += v.weight;
        if (v.weight > entry.bestWeight) {
          entry.bestWeight = v.weight;
          entry.sample = v.rgb;
          entry.el = v.el;
          entry.property = v.property;
        }
        buckets.set(bucket, entry);
      });

      return buckets;
    });
  }

  // discoverAccent(boundaryEl, base) -> rgb | null. See file section
  // comment above for the full design. Combined weighting (BM25
  // relevance 50% / color strength 50%) is a reasonable, defensible
  // starting point, NOT an empirically-tuned value — flagged here
  // explicitly rather than presented as settled, same honesty standard
  // as the lightness-extreme thresholds above.
  const BM25_WEIGHT = 0.5;
  const COLOR_STRENGTH_WEIGHT = 0.5;

  function discoverAccent(boundaryEl, base) {
    const buckets = buildAccentVoteBuckets(boundaryEl, base);
    if (!buckets) return null;
    let best = null;
    let bestScore = 0;
    buckets.forEach((entry) => {
      if (entry.totalWeight > bestScore) {
        bestScore = entry.totalWeight;
        best = entry.sample;
      }
    });
    return best;
  }

  // discoverAccentCandidates(boundaryEl, base) -> [{ rgb, el, property
  // }], sorted by totalWeight descending — winner first, then runner-
  // ups. The richer form Step 6's shortlist needs: which real element
  // (and which of its color properties) actually produced each
  // candidate, not just the color value alone.
  function discoverAccentCandidates(boundaryEl, base) {
    const buckets = buildAccentVoteBuckets(boundaryEl, base);
    if (!buckets) return [];
    return Array.from(buckets.values())
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .map((entry) => ({ rgb: entry.sample, el: entry.el, property: entry.property }));
  }

  // legacyAccentScan(boundaryEl) -> rgb | null. The original hue-bucket-
  // only scan, unchanged — kept as the fallback path for when
  // JLib.heuristics isn't loaded (an older bundle, or an author who
  // only @requires the parts they need) or discoverAccent() found
  // nothing usable.
  function legacyAccentScan(boundaryEl) {
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
    return accent;
  }

  function sampleAnchor(boundaryEl) {
    const boundaryStyles = getComputedStyle(boundaryEl);
    const base = isOpaqueColor(boundaryStyles.backgroundColor) ? resolveSampledColor(boundaryStyles.backgroundColor, boundaryEl) : DEFAULT_PALETTE.base;
    const ink = isOpaqueColor(boundaryStyles.color) ? resolveSampledColor(boundaryStyles.color, boundaryEl) : relativeLuminance(base) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

    // discoverAccent (BM25 + color-strength, via JLib.heuristics) is the
    // preferred path; legacyAccentScan is the fallback if heuristics.js
    // isn't loaded or discovery found nothing usable. Never nothing —
    // ink is the last-resort floor, same "must provide" guarantee this
    // slot has always had.
    const accent = discoverAccent(boundaryEl, base) || legacyAccentScan(boundaryEl) || ink;

    return { base, ink, accent, muted: mixTowardBg(ink, base, 0.4), surface: mixTowardBg(base, ink, 0.06), elevated: mixTowardBg(base, ink, 0.12) };
  }
  // Perceptually-uniform mix in OKLCH space — same reasoning as
  // everywhere else in this file (see the file header): equal steps in
  // OKLCH actually look like equal steps, raw RGB-channel lerp doesn't
  // (the classic muddy/desaturated-midpoint problem). This is what
  // derives surface/elevated/muted from base/ink, so it runs on every
  // real sample, not just the seed-hue/animation paths that already
  // used OKLCH mixing.
  //
  // Hue interpolation is skipped (falls back to a chroma/lightness-only
  // mix, hue borrowed from whichever endpoint is more saturated) when
  // either endpoint is too desaturated for hue to mean anything — hue
  // on a near-neutral color is numerically present but visually
  // arbitrary, and interpolating toward/away from it produces a swing
  // with no real visual basis. base/ink are frequently close to
  // neutral, so this isn't a rare edge case here, it's close to the
  // common case.
  const MIX_HUE_CHROMA_FLOOR = 0.02;
  function mixTowardBg(fg, bg, amount) {
    const a = rgbToOklch(fg), b = rgbToOklch(bg);
    const hueMeaningful = a.C >= MIX_HUE_CHROMA_FLOOR && b.C >= MIX_HUE_CHROMA_FLOOR;
    const mixed = {
      L: lerp(a.L, b.L, amount),
      C: lerp(a.C, b.C, amount),
      H: hueMeaningful ? circularLerp(a.H, b.H, amount) : a.C >= b.C ? a.H : b.H,
    };
    return oklchToRgb(mixed);
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
      palette = applySeedHue(palette, opts.seedHue, opts.seedHueOverrideThresholdDeg, { seedLightness: opts.seedLightness, seedChroma: opts.seedChroma }, el);
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

  // applySeedHue's own contrast-correction step — deliberately NOT
  // routed through the general ensureContrast() above. ensureContrast
  // holds whatever chroma its INPUT rgb already has fixed while
  // stepping L; applySeedHue's candidateRgb has already been through
  // one sRGB gamut-map (oklchToRgb -> gamutMapOklch) by the time
  // contrast is even checked, so its chroma is already whatever sRGB
  // could hold at the ORIGINAL L, not the true seed request. Stepping
  // L from there while holding that post-clip chroma fixed either
  // wastes real available chroma (when the new L has more sRGB
  // headroom than the original did) or is a no-op (when it has less,
  // since chroma only ever shrinks going into oklchToRgb, never grows
  // back). This instead re-gamut-maps idealOklch's REAL requested
  // chroma/hue fresh at every stepped L — strictly better-or-equal at
  // each step than reusing the stale post-clip value, same 24-step
  // budget and step size as ensureContrast, same direction logic.
  function resolveContrastedAccent(idealOklch, bg, minRatio) {
    const first = oklchToRgb(idealOklch);
    if (contrastRatio(first, bg) >= minRatio) return first;
    const bgIsDark = relativeLuminance(bg) < 0.5;
    const step = bgIsDark ? 0.035 : -0.035;
    let L = idealOklch.L;
    let candidate = first;
    for (let i = 0; i < 24; i++) {
      L = Math.max(0, Math.min(1, L + step));
      candidate = oklchToRgb({ L, C: idealOklch.C, H: idealOklch.H });
      if (contrastRatio(candidate, bg) >= minRatio) return candidate;
      if (L === 0 || L === 1) break;
    }
    return candidate;
  }

  // applySeedHue(palette, seedHueDeg, thresholdOverride, opts?) — opts
  // may include seedLightness/seedChroma (0-1 OKLCH values) for full
  // L/C/H harmonization, not just hue. Omitting them preserves the
  // original hue-only behavior exactly (targets default to the site's
  // own sampled L/C, so nothing changes for a caller only ever passing
  // seedHue).
  function applySeedHue(palette, seedHueDeg, thresholdOverride, opts, el) {
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
    let idealOklch = resultOklch; // pre-sRGB-clip ideal, kept alongside candidateRgb for the P3 path below
    if (drift > MAX_SEED_HUE_DRIFT) {
      const scaleBack = MAX_SEED_HUE_DRIFT / drift;
      idealOklch = {
        L: lerp(accentOklch.L, resultOklch.L, scaleBack),
        C: lerp(accentOklch.C, resultOklch.C, scaleBack),
        H: circularLerp(accentOklch.H, resultOklch.H, scaleBack),
      };
      candidateRgb = oklchToRgb(idealOklch);
    }

    const correctedAccent = resolveContrastedAccent(idealOklch, palette.base, 3);
    const correctedHover = deriveHover(correctedAccent);
    palette.accent = correctedAccent;
    palette['accent-hover'] = correctedHover;

    // P3 enrichment — see the "Display-P3 output" section above for the
    // full reasoning. ensureContrast/deriveHover only ever move L (hue
    // and chroma held fixed by design), so the L each one settled on is
    // read back off its RGB result and paired with idealOklch's own C/H
    // — the real requested chroma, not whatever sRGB's gamutMapOklch
    // already clipped it down to.
    if (isOurChrome(el)) {
      const accentIdeal = { L: rgbToOklch(correctedAccent).L, C: idealOklch.C, H: idealOklch.H };
      const accentP3 = maybeP3Override(accentIdeal);
      if (accentP3) {
        palette.accent = Object.assign({}, correctedAccent, { p3: accentP3 });
        const hoverIdeal = { L: rgbToOklch(correctedHover).L, C: idealOklch.C, H: idealOklch.H };
        const hoverP3 = maybeP3Override(hoverIdeal);
        if (hoverP3) palette['accent-hover'] = Object.assign({}, correctedHover, { p3: hoverP3 });
      }
    }
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
      const value = palette[slot];
      el.style.setProperty(prefix + slot, toCssRgb(value));
      // Set again with the P3 value when this slot carries one (only
      // ever true for an isOurChrome, seed-hue-generated accent/
      // accent-hover — see applySeedHue). A browser that doesn't
      // understand color(display-p3 ...) rejects the second
      // setProperty() call as an invalid value and silently keeps the
      // rgb() value already set immediately above — no CSS.supports()
      // check needed, the fallback is the platform's own behavior.
      if (value && value.p3) el.style.setProperty(prefix + slot, value.p3);
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

    // Cleanup shared by both the normal completion path and the
    // disconnected-element bailout below — an inserted overlay and a
    // temporarily-forced position:relative both need to be undone
    // exactly once, regardless of which path gets there.
    function cleanup() {
      if (overlay) overlay.remove();
      if (restorePosition) restorePosition();
    }

    function frame(now) {
      // requestAnimationFrame is fully SUSPENDED (not just throttled)
      // for hidden/backgrounded tabs. If `el` gets removed from the
      // document by the page's own re-render mid-transition, and the
      // tab is backgrounded before this naturally reaches t>=1, this
      // closure (plus any inserted overlay) would otherwise sit alive
      // in memory for as long as the tab stays backgrounded, since
      // nothing would call frame() again to reach the normal cleanup
      // path. Checking on every frame means the very next time frame()
      // DOES run — even much later, whenever the tab is foregrounded
      // again — it tears down immediately instead of waiting out
      // whatever's left of `duration`.
      if (!document.contains(el)) {
        cleanup();
        return;
      }
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
      } else {
        cleanup();
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

  // ==========================================================================
  // External sources — manifest theme_color, favicon extraction, meta
  // theme-color
  // ==========================================================================
  // Deliberately NOT part of getPalette()'s synchronous pipeline.
  // Manifest/favicon lookups are real network requests; getPalette()
  // has always returned synchronously and every existing consumer
  // (superProvider, theme.js, reveal()) depends on that. Turning
  // getPalette() itself async would be a breaking change with no
  // evidence it's needed. Instead this is a separate, explicit,
  // opt-in layer — a caller awaits enrichWithExternalSources()
  // themselves, after already having a real, usable, synchronously-
  // obtained palette. "Shortcut, never a requirement," same as
  // everywhere else in this file.

  // resolveExternalColorString(str) -> rgb | null. manifest.json's
  // theme_color and <meta name="theme-color">'s content are both
  // author-supplied strings with zero format guarantee — the field
  // EXISTING is not the same claim as it CONTAINING a valid color.
  // Routed through the same resolveColorValue() probe already built
  // for CSS custom property values, not a second hand-rolled parser.
  function resolveExternalColorString(str) {
    if (!str) return null;
    const resolved = resolveColorValue(str);
    return isOpaqueColor(resolved) ? parseRgb(resolved) : null;
  }

  // fetchManifestThemeColor() -> Promise<rgb|null>.
  async function fetchManifestThemeColor() {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    try {
      const resp = await fetch(link.href);
      const json = await resp.json();
      return resolveExternalColorString(json.theme_color);
    } catch (e) {
      return null; // network failure, invalid JSON, CORS — fail closed, never fatal to the rest of the pipeline
    }
  }

  // readMetaThemeColor() -> rgb | null. Synchronous (no network), but
  // shaped to fit the same Promise.all batch as the other two sources
  // in enrichWithExternalSources below.
  function readMetaThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    return meta ? resolveExternalColorString(meta.getAttribute('content')) : null;
  }

  // hueBucketDominantColor(pixels) -> rgb | null. Same hue-bucketed
  // grouping already used for real DOM-sampled colors elsewhere in
  // this file, applied to image pixel data instead — NOT a naive
  // full-image average, which produces a washed-out, unrepresentative
  // "muddy midpoint" on any multi-color logo (confirmed real, not
  // hypothetical, on a real multi-color brand mark). Returns null when
  // every pixel is near-neutral — a genuinely achromatic icon (a
  // black/white/gray logo) correctly yields no color rather than a
  // forced, meaningless one.
  function hueBucketDominantColor(pixels) {
    const buckets = new Map();
    for (let i = 0; i < pixels.length; i++) {
      const rgb = { r: pixels[i][0], g: pixels[i][1], b: pixels[i][2] };
      const oklch = rgbToOklch(rgb);
      if (oklch.C < 0.03) continue;
      const bucket = Math.round(oklch.H / 15) * 15;
      const entry = buckets.get(bucket) || { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      entry.count += 1;
      entry.sumR += rgb.r;
      entry.sumG += rgb.g;
      entry.sumB += rgb.b;
      buckets.set(bucket, entry);
    }
    let best = null;
    let bestCount = 0;
    buckets.forEach((entry) => {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        best = { r: Math.round(entry.sumR / entry.count), g: Math.round(entry.sumG / entry.count), b: Math.round(entry.sumB / entry.count) };
      }
    });
    return best;
  }

  // loadImagePixels(url) -> Promise<[[r,g,b],...] | null>. Fails
  // closed on any real-world failure mode: load timeout, onerror, or a
  // CORS-tainted canvas throwing on getImageData — all resolve to
  // null rather than rejecting, so Promise.all in
  // enrichWithExternalSources below never needs a .catch per source.
  function loadImagePixels(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 32, 32);
          const data = ctx.getImageData(0, 0, 32, 32).data;
          const pixels = [];
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 50) continue; // skip near-transparent pixels
            pixels.push([data[i], data[i + 1], data[i + 2]]);
          }
          resolve(pixels);
        } catch (e) {
          resolve(null); // CORS-tainted canvas or other failure
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
      img.src = url;
    });
  }

  // fetchFaviconColor() -> Promise<rgb|null>. Tries the best declared
  // icon first (apple-touch-icon preferred — confirmed higher fidelity
  // than a plain .ico in real testing), then falls back to the
  // implicit same-origin /favicon.ico convention if that fails —
  // confirmed empirically this rescues sites where the DECLARED icon
  // is CORS-blocked but the implicit same-origin one isn't, since it
  // never crosses an origin boundary.
  async function fetchFaviconColor() {
    const declaredLink =
      document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
    const declaredUrl = declaredLink ? declaredLink.href : null;
    const implicitUrl = location.origin + '/favicon.ico';

    let pixels = await loadImagePixels(declaredUrl);
    if (!pixels || pixels.length === 0) pixels = await loadImagePixels(implicitUrl);
    if (!pixels || pixels.length === 0) return null;

    const dominant = hueBucketDominantColor(pixels);
    if (!dominant || !isAccentColorValid(dominant)) return null;
    return dominant;
  }

  // Perceptual-distance threshold below which an external color is
  // treated as confirming/reinforcing a specific palette slot, rather
  // than being unrelated to it. Not yet empirically tuned — same
  // honesty flag as the accent-discovery thresholds above.
  const EXTERNAL_SLOT_AGREEMENT_THRESHOLD = 0.15;

  // reconcileExternalSlot(externalRgb, base, accent) -> 'base' |
  // 'accent' | null. Never assumes a fixed slot — a manifest/favicon
  // color genuinely isn't always "the accent" (confirmed on a real
  // site: Spotify's manifest theme_color is its near-black background,
  // not its green). Decided purely by which of the DOM pipeline's own
  // results it's actually closer to.
  function reconcileExternalSlot(externalRgb, base, accent) {
    const distToBase = perceptualDistance(externalRgb, base);
    const distToAccent = perceptualDistance(externalRgb, accent);
    if (distToBase <= EXTERNAL_SLOT_AGREEMENT_THRESHOLD && distToBase <= distToAccent) return 'base';
    if (distToAccent <= EXTERNAL_SLOT_AGREEMENT_THRESHOLD) return 'accent';
    return null; // doesn't clearly agree with either — genuine new information, not blended in without stronger evidence
  }

  // Chroma below which the DOM-derived accent counts as weak evidence
  // (the discovery pipeline found nothing genuinely vivid — including
  // the "fell all the way back to ink" case, which this also covers
  // without needing to specifically detect that exact fallback path).
  // A real, deliberately-styled UI accent typically clears this by a
  // real margin.
  const DOM_ACCENT_WEAK_CHROMA = 0.05;

  // enrichWithExternalSources(palette, boundaryEl) -> Promise<palette>.
  // Fetches all three sources in parallel (independent network
  // operations, no reason to serialize), reconciles each against the
  // ALREADY-VALIDATED palette's own base/accent, and either:
  //   - modestly nudges the matching slot toward it (agreement — the
  //     DOM-derived value already passed BM25 relevance + visibility +
  //     validity gates, real multi-stage evidence an external source
  //     hasn't been checked against, so this reinforces rather than
  //     replaces it),
  //   - leaves the palette untouched (no clear agreement with either
  //     slot — genuine new information the DOM pipeline didn't
  //     confirm, deliberately not forced in), or
  //   - adopts the external color outright ONLY when the DOM pipeline
  //     itself found essentially nothing (weak/near-floor accent
  //     chroma) — validated external evidence beats no real signal.
  // High-trust sources (manifest, favicon) are always considered
  // first; the low-trust meta tag is only considered at all if BOTH
  // high-trust sources found nothing, given it was confirmed
  // misleading (browser-chrome background, not brand color) on real
  // sites during testing, not merely silent.
  async function enrichWithExternalSources(palette, boundaryEl) {
    boundaryEl = boundaryEl || document.body;
    const [manifestColor, faviconColor, metaColor] = await Promise.all([fetchManifestThemeColor(), fetchFaviconColor(), Promise.resolve(readMetaThemeColor())]);

    const highTrust = [manifestColor, faviconColor].filter(Boolean);
    const candidates = highTrust.length > 0 ? highTrust : [metaColor].filter(Boolean);
    if (candidates.length === 0) return palette;

    const enriched = Object.assign({}, palette);
    let accentReinforced = false;

    candidates.forEach((externalRgb) => {
      const slot = reconcileExternalSlot(externalRgb, enriched.base, enriched.accent);
      if (slot === 'accent' && !accentReinforced) {
        enriched.accent = mixTowardBg(enriched.accent, externalRgb, 0.3);
        accentReinforced = true;
      } else if (slot === 'base') {
        enriched.base = mixTowardBg(enriched.base, externalRgb, 0.2); // lighter nudge — base already came from a direct, reliable boundary read
      }
    });

    const domAccentChroma = rgbToOklch(palette.accent).C;
    if (domAccentChroma < DOM_ACCENT_WEAK_CHROMA) {
      enriched.accent = candidates[0];
    }

    return validate(enriched); // re-run through the one door — contrast correction and hover derivation still apply to the enriched result
  }

  // ==========================================================================
  // Shortlist — persistent cache + drift-based revalidation
  // ==========================================================================
  // Deliberately NOT part of getPalette()'s synchronous pipeline, same
  // reasoning as enrichWithExternalSources above — JLib.cache reads are
  // real (if fast, IndexedDB-backed) async operations. A caller wanting
  // this awaits it explicitly.
  //
  // Scoped to per-hostname, matching getGlobalPalette()'s existing
  // granularity, not per-arbitrary-anchor — an arbitrary boundary
  // element has no stable identity across a reload for THIS cache to
  // key on either (that's exactly the problem the shortlist mechanism
  // exists to solve for candidate ELEMENTS, not boundaries), so this
  // is scoped to the same page-wide case getGlobalPalette already
  // handles, not every getPalette(el) call.

  // REBIND_ATTR_CANDIDATES — the real, confirmed conventions found
  // across actual sites during this whole investigation (not a guess):
  // Walmart's data-automation-id/data-testid, Netflix's data-uia,
  // Hulu's data-automationid, Spotify's data-encore-id, LinkedIn's
  // data-test-id. A candidate with none of these (and no id) has
  // nothing reliable to rebind to after a reload and is deliberately
  // not cached — a shaky selector match is worse than no cache entry
  // at all.
  const REBIND_ATTR_CANDIDATES = ['data-testid', 'data-test-id', 'data-qa', 'data-cy', 'data-uia', 'data-automation-id', 'data-automationid', 'data-encore-id'];

  // deriveRebindSelector(el) -> selector string | null.
  function deriveRebindSelector(el) {
    if (el.id) return '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
    for (const attr of REBIND_ATTR_CANDIDATES) {
      const val = el.getAttribute(attr);
      if (val) {
        const escaped = window.CSS && CSS.escape ? CSS.escape(val) : val.replace(/"/g, '\\"');
        return `[${attr}="${escaped}"]`;
      }
    }
    return null;
  }

  const SHORTLIST_CACHE_KEY_PREFIX = 'color-shortlist:';
  const SHORTLIST_RUNNER_UP_COUNT = 2;

  function shortlistCacheKey() {
    return SHORTLIST_CACHE_KEY_PREFIX + location.hostname;
  }

  // readCandidateColor(el, property) -> rgb | null. Re-reads the SAME
  // property that originally won for this candidate — not always
  // backgroundColor, since the real winning property varies (border,
  // text, caret) depending on what the site actually styled.
  function readCandidateColor(el, property) {
    const cs = getComputedStyle(el);
    const str = cs[property];
    if (!isOpaqueColor(str)) return null;
    return resolveSampledColor(str, el);
  }

  // saveAccentShortlist(candidates) -> Promise. candidates: the return
  // shape of discoverAccentCandidates, winner first. Only candidates
  // with a real rebind selector are stored; others are silently
  // skipped, not an error. Fails silently and completely if
  // JLib.cache isn't loaded, or refuses (no script registered) — pure
  // enhancement, never a requirement, same pattern as every other
  // optional-dependency check in this file.
  async function saveAccentShortlist(candidates) {
    if (!JLib.cache) return;
    const entries = candidates
      .slice(0, 1 + SHORTLIST_RUNNER_UP_COUNT)
      .map((c) => ({ selector: deriveRebindSelector(c.el), property: c.property, rgb: c.rgb }))
      .filter((e) => e.selector);
    if (entries.length === 0) return;
    try {
      await JLib.cache.set(shortlistCacheKey(), entries);
    } catch (e) {
      // JLib.cache.ensureInit() refuses without a registered script —
      // that's a real, deliberate refusal elsewhere in this codebase,
      // not something this optional enhancement should surface as an
      // error of its own.
    }
  }

  async function loadAccentShortlist() {
    if (!JLib.cache) return null;
    try {
      const entries = await JLib.cache.get(shortlistCacheKey());
      return entries || null;
    } catch (e) {
      return null;
    }
  }

  // Perceptual-distance threshold for trusting the cache at all —
  // deliberately tighter than MAX_SEED_HUE_DRIFT (0.35) above, which
  // answers a different question ("how far can a stated PREFERENCE
  // reasonably pull from reality," a generous budget by design). This
  // answers "is the real underlying color still approximately the
  // same" — normal noise (a redeploy's hashed class names changing,
  // minor anti-aliasing differences) should stay well under this,
  // while a genuine site redesign blows past it. Not yet empirically
  // tuned — same honesty flag as the other new thresholds this pass.
  const CACHE_TRUST_DRIFT_THRESHOLD = 0.12;

  // revalidateAccentShortlist(entries) -> { trusted, rgb }. Two
  // separate questions, deliberately kept separate rather than
  // conflated into one check:
  //   - do we trust the cache AT ALL: only the PREVIOUS WINNER's
  //     (entries[0]) drift matters here. A runner-up moving around
  //     isn't evidence the site changed — it was never what was
  //     actually shown, so its drift says nothing about whether the
  //     cache as a whole is still trustworthy.
  //   - which candidate wins TODAY: once trusted, compares EVERY
  //     entry (winner and runner-ups) against its OWN prior cached
  //     value, using TOTAL perceptual drift (perceptualDistance's
  //     single combined OKLab number, not separate per-channel
  //     checks) — least-drifted wins. Can genuinely promote a runner-
  //     up over the old winner.
  function revalidateAccentShortlist(entries) {
    if (!entries || entries.length === 0) return { trusted: false, rgb: null };

    const previousWinner = entries[0];
    const winnerEl = document.querySelector(previousWinner.selector);
    if (!winnerEl) return { trusted: false, rgb: null }; // selector no longer matches anything -- real structural change
    const liveWinnerRgb = readCandidateColor(winnerEl, previousWinner.property);
    if (!liveWinnerRgb) return { trusted: false, rgb: null };

    const winnerDrift = perceptualDistance(liveWinnerRgb, previousWinner.rgb);
    if (winnerDrift > CACHE_TRUST_DRIFT_THRESHOLD) return { trusted: false, rgb: null };

    // Cache trusted as a whole — now decide which entry actually wins
    // THIS session, checking every entry's own drift, not just the
    // winner's.
    let bestRgb = liveWinnerRgb;
    let bestDrift = winnerDrift;
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i];
      const el = document.querySelector(entry.selector);
      if (!el) continue;
      const liveRgb = readCandidateColor(el, entry.property);
      if (!liveRgb) continue;
      const drift = perceptualDistance(liveRgb, entry.rgb);
      if (drift < bestDrift) {
        bestDrift = drift;
        bestRgb = liveRgb;
      }
    }
    return { trusted: true, rgb: bestRgb };
  }

  // getAccentViaShortlist(boundaryEl, base) -> Promise<rgb | null>. The
  // full Step 6 flow: try the cached shortlist first — cheap, a
  // handful of querySelector + getComputedStyle reads on a short list,
  // nowhere near the cost of a full rediscovery. Falls back to a real
  // discoverAccentCandidates() rediscovery (re-saving a fresh
  // shortlist for next time) when the cache doesn't exist, doesn't
  // pass trust-checking, or JLib.cache isn't available at all.
  async function getAccentViaShortlist(boundaryEl, base) {
    const cached = await loadAccentShortlist();
    if (cached) {
      const { trusted, rgb } = revalidateAccentShortlist(cached);
      if (trusted && rgb) return rgb;
    }
    const candidates = discoverAccentCandidates(boundaryEl, base);
    if (candidates.length > 0) {
      saveAccentShortlist(candidates); // fire-and-forget -- doesn't block the return, a failed save is never fatal to getting a real answer now
      return candidates[0].rgb;
    }
    return null;
  }

  return {
    // Public API surface, deliberately narrower than the full set of
    // functions this module defines internally. rgbToOklch, oklchToRgb,
    // perceptualDistance, hueDistance, parseRgb, and isOpaqueColor all
    // used to be exported under a comment claiming "theme.js does" need
    // direct access to them — checked against theme.js's actual calls
    // and every other consumer in this codebase; none of them do. Kept
    // as internal-only (still reachable via closure by everything in
    // this file that needs them) rather than continuing to leak as
    // public API with no real caller.
    relativeLuminance,
    contrastRatio,
    ensureContrast,
    toCssRgb,
    toCssRgba,
    resolveSampledColor,
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
    // external sources (optional async enrichment layer)
    enrichWithExternalSources,
    // shortlist (persistent cache + drift-based revalidation, optional async layer)
    getAccentViaShortlist,
  };
})();
