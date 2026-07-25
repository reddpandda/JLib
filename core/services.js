/*
 * services.js — foundational, non-visual building blocks: DOM construction,
 * event delegation, small utils, storage, theming, notifications, and the
 * shared module-registration scaffold. One file per the services/elements/
 * modules split — nothing here is a visual widget (that's elements.js) and
 * nothing here is a full feature (that's modules/).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ============================================================================
// services/dom.js
// ============================================================================
/*
 * DOM — el()/h() builder, $/$$ selector shortcuts. Pure DOM construction,
 * no privileged APIs.
 *
 * toast() lived here in v1 (dom-toolkit.js) — moved to services/notifications.js
 * in this rewrite, since it grew into a real staling-engine-backed service
 * and doesn't belong bundled with plain DOM construction anymore.
 */

JLib.dom = (function () {
  function el(tag, opts, children) {
    opts = opts || {};
    children = children || [];
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.id) node.id = opts.id;
    if (opts.dataset) {
      for (const k in opts.dataset) node.dataset[k] = opts.dataset[k];
    }
    if (opts.attrs) {
      for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
    }
    children.forEach((child) => {
      if (child === null || child === undefined) return;
      if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    });
    return node;
  }

  const h = el;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  return { el, h, $, $$ };
})();

// ============================================================================
// services/events.js
// ============================================================================
/*
 * Event Delegation Helper — one listener on a stable container, matched
 * against dynamically-added descendants via closest(). No privileged APIs.
 *
 * Note on provenance, unlike dom-toolkit/settings-schema: the userscript
 * that dom-toolkit and settings-schema were ported from didn't actually
 * have a delegation pattern to port — it binds handlers directly to
 * elements it builds itself, and finds/clicks page elements via fresh
 * querySelectorAll passes rather than delegated listening. This is
 * instead generalized from a different project's closest()-based tile
 * click correlation (`e.target.closest('[data-item-id]')` inside a raw
 * capture-phase listener) — the same shape, formalized so you're not
 * hand-rolling it per script.
 */

JLib.events = (function () {
  // container: element to attach the single real listener to (defaults to
  //   document — use a narrower, stable ancestor when one exists, since
  //   it's cheaper and avoids matching unrelated parts of the page).
  // eventType: 'click', 'mouseover', etc.
  // selector: CSS selector matched via closest() against e.target.
  // handler: called as handler(event, matchedElement) — matchedElement is
  //   the closest() result, not e.target, so you don't have to re-derive
  //   it inside every handler.
  // options: passed through to addEventListener (e.g. { capture: true }
  //   if you need to observe before the site's own handlers run).
  //
  // Returns an off() function that removes the listener — call it on
  // script teardown, SPA navigation cleanup, or when a feature toggles off,
  // per the "every listener/timer gets an exit path" convention already
  // established in your other scripts.
  function on(container, eventType, selector, handler, options) {
    container = container || document;

    function listener(e) {
      const matched = e.target.closest ? e.target.closest(selector) : null;
      if (matched && container.contains(matched)) {
        handler(e, matched);
      }
    }

    container.addEventListener(eventType, listener, options);
    return function off() {
      container.removeEventListener(eventType, listener, options);
    };
  }

  // Convenience for the common "delegate on document, capture phase"
  // shape — same as on(document, eventType, selector, handler, { capture:
  // true }), just named for the common case.
  function onCapture(eventType, selector, handler) {
    return on(document, eventType, selector, handler, true);
  }

  return { on, onCapture };
})();

// ============================================================================
// services/utils.js
// ============================================================================
/*
 * Small shared utilities: debounce, throttle, makeLogger. No DOM, no
 * privileged APIs — safe in any context (extension background page or
 * userscript sandbox).
 *
 * debounce() is the formalized version of a clearTimeout/setTimeout
 * pattern an existing userscript hand-rolls inline for its
 * MutationObserver callback (`clearTimeout(observerTimeout);
 * observerTimeout = setTimeout(processPage, 100)`) — same behavior,
 * reusable instead of retyped per script. throttle() is new, same family.
 * makeLogger() formalizes a `[ScriptName vX.Y.Z]` console-prefix
 * convention used throughout that same script.
 */

JLib.utils = (function () {
  // Trailing-edge debounce: fn runs `wait`ms after the last call, not the
  // first. Matches the MutationObserver pattern exactly — a burst of
  // mutations resets the timer each time, and processPage() only actually
  // runs once the burst settles.
  function debounce(fn, wait) {
    let timer = null;
    function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, wait);
    }
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }

  // Leading-edge throttle: fn runs immediately on the first call, then at
  // most once per `wait`ms while calls keep coming. Different tradeoff
  // than debounce on purpose — use throttle when you want the FIRST event
  // in a burst handled right away (e.g. a scroll/resize handler that
  // should react immediately, then rate-limit), debounce when you want to
  // wait for the burst to end (e.g. "the DOM has stopped changing, now
  // scan it").
  function throttle(fn, wait) {
    let lastCall = 0;
    let timer = null;
    function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - lastCall);
      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        lastCall = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    }
    throttled.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return throttled;
  }

  // makeLogger('MyScript', '2.3.0') -> { log, warn, error }, each
  // prefixed with '[MyScript v2.3.0]'. version is optional — omit it for
  // a plain '[MyScript]' prefix.
  function makeLogger(name, version) {
    const prefix = version ? `[${name} v${version}]` : `[${name}]`;
    return {
      log: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
    };
  }

  return { debounce, throttle, makeLogger };
})();

// ============================================================================
// services/storage.js
// ============================================================================
/*
 * Storage — schema-driven GM_setValue/GM_getValue settings with per-scope
 * storage, parent/child dependency enforcement, and migration support.
 * Requires @grant GM_setValue / @grant GM_getValue.
 *
 * Ported as-is from settings-schema.js (v1). No changes in this rewrite —
 * this piece is being left alone on purpose (it's not done yet, but that's
 * a separate task from the dashboard/module rewrite).
 */

JLib.storage = (function () {
  function createStore(features, options) {
    options = options || {};
    if (!options.storageKeyPrefix) {
      throw new Error('JLib.storage.createStore requires options.storageKeyPrefix');
    }
    const byId = {};
    features.forEach((f) => {
      byId[f.id] = f;
    });

    function appliesTo(feature, scope) {
      if (!feature.scopes) return true;
      return feature.scopes.indexOf(scope) !== -1;
    }

    function storageKey(scope) {
      return scope !== undefined && scope !== null ? `${options.storageKeyPrefix}_${scope}` : options.storageKeyPrefix;
    }

    function getDefaults(scope) {
      const defaults = {};
      features.forEach((f) => {
        if (appliesTo(f, scope)) defaults[f.id] = f.default;
      });
      return defaults;
    }

    function enforceDependencies(settingsObj) {
      features.forEach((f) => {
        if (f.parent && !settingsObj[f.parent]) settingsObj[f.id] = false;
      });
    }

    function load(scope) {
      const defaults = getDefaults(scope);
      const saved = GM_getValue(storageKey(scope));
      let loaded = {};
      if (saved) {
        try {
          loaded = JSON.parse(saved);
        } catch (e) {
          loaded = {};
        }
      }
      if (options.migrate) options.migrate(loaded);
      const merged = Object.assign({}, defaults);
      for (const key in loaded) {
        if (key in defaults) merged[key] = loaded[key];
      }
      enforceDependencies(merged);
      return merged;
    }

    function save(scope, settingsObj) {
      GM_setValue(storageKey(scope), JSON.stringify(settingsObj));
    }

    function toggle(settingsObj, id) {
      const feature = byId[id];
      if (feature && feature.parent && !settingsObj[feature.parent]) {
        return false;
      }
      settingsObj[id] = !settingsObj[id];
      if (!settingsObj[id]) enforceDependencies(settingsObj);
      return true;
    }

    return {
      appliesTo,
      storageKey,
      getDefaults,
      enforceDependencies,
      load,
      save,
      toggle,
      featuresById: byId,
      features,
    };
  }

  return { createStore };
})();
// ============================================================================
// services/script-registry.js
// ============================================================================
/*
 * Script registration — "registration is existence" extended to the
 * userscript itself, not just modules/dictionaries/themes. Any
 * namespace-scoped system (the cache/broadcast/lock layer below, and the
 * settings store) refuses to operate — console.warn, no silent default —
 * until JLib.registerScript() has been called. No exceptions: a
 * namespace is never invented on a caller's behalf.
 *
 * Composition, not replacement: something that needs its own sub-identity
 * under the script (multiple Settings Panel instances, a named cache)
 * supplies only its LOCAL piece; JLib composes it against the registered
 * script namespace via composeNamespace(). This preserves real
 * multi-instance capability (two panels, two local names, both scoped
 * under one script) while still making registration a hard prerequisite
 * — composeNamespace() has nothing to compose with until a script has
 * registered.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib._scriptRegistry = JLib._scriptRegistry || null; // { namespace } | null

// Web Locks names starting with '-' are reserved and throw (verified
// against the Web Locks API explainer) — validated here since a composed
// namespace is used directly as a lock name downstream.
function _jlibValidNamespaceSegment(seg) {
  return typeof seg === 'string' && seg.length > 0 && seg[0] !== '-';
}

JLib.registerScript = function registerScript(config) {
  config = config || {};
  if (!_jlibValidNamespaceSegment(config.namespace)) {
    console.warn('[JLib.registerScript] refused — requires a non-empty namespace not starting with "-". This script does not exist as far as JLib is concerned; namespace-scoped features will refuse to operate.', config);
    return false;
  }
  if (JLib._scriptRegistry) {
    console.warn(`[JLib.registerScript] A script is already registered under namespace "${JLib._scriptRegistry.namespace}" — ignoring the duplicate registration.`);
    return false;
  }
  JLib._scriptRegistry = { namespace: config.namespace };
  return true;
};

// composeNamespace(localPiece?) -> the full, composed identity string used
// by anything namespace-scoped. Returns null (and warns) if no script is
// registered — callers must treat a null return as "refuse to operate,"
// same as every other registration-gated feature in this codebase.
JLib.composeNamespace = function composeNamespace(localPiece) {
  if (!JLib._scriptRegistry) {
    console.warn('[JLib.composeNamespace] No script registered — call JLib.registerScript({ namespace }) first. Refusing to invent a namespace.');
    return null;
  }
  if (localPiece === undefined || localPiece === null || localPiece === '') {
    return JLib._scriptRegistry.namespace;
  }
  if (!_jlibValidNamespaceSegment(localPiece)) {
    console.warn('[JLib.composeNamespace] Local namespace segment must be a non-empty string not starting with "-".', localPiece);
    return null;
  }
  return JLib._scriptRegistry.namespace + '.' + localPiece;
};

// ============================================================================
// services/dedupe.js
// ============================================================================
/*
 * dedupe — if several callers ask for the same expensive operation in a
 * short window, do the work once and share the result, instead of each
 * caller redoing it independently. General-purpose, not tied to any one
 * subsystem; its first real consumer is superProvider.css, which was
 * independently re-resolving the same anchor boundary once per
 * mini-provider it called — the actual bug this was built to fix.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.dedupe = (function () {
  const inFlight = new Map(); // key -> Promise
  const memoCache = new Map(); // key -> { value, expiresAt }

  // once(key, fn) — if a call for `key` is already in flight, returns the
  // SAME promise rather than calling fn again. fn may be sync or return a
  // promise either way; the result is normalized to a promise.
  function once(key, fn) {
    if (inFlight.has(key)) return inFlight.get(key);
    const p = Promise.resolve().then(fn);
    inFlight.set(key, p);
    p.finally(() => inFlight.delete(key));
    return p;
  }

  // memo(key, fn, ttlMs?) — like once(), but also caches the resolved
  // value for ttlMs (default 0 — no caching beyond in-flight dedup,
  // just collapses simultaneous callers). Synchronous convenience for
  // the common "run this sync function, but only once per key per
  // window" case (e.g. superProvider.css's anchor resolution, which is
  // synchronous DOM work, not async).
  function memoSync(key, fn, ttlMs) {
    ttlMs = ttlMs || 0;
    const cached = memoCache.get(key);
    if (cached && (ttlMs === 0 || Date.now() < cached.expiresAt)) {
      return cached.value;
    }
    const value = fn();
    if (ttlMs > 0) {
      memoCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    return value;
  }

  function clear(key) {
    if (key) {
      inFlight.delete(key);
      memoCache.delete(key);
    } else {
      inFlight.clear();
      memoCache.clear();
    }
  }

  return { once, memoSync, clear };
})();


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
  function linearToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
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
  function oklchToRgb(oklch) {
    return oklabToRgb(oklchToOklab(oklch));
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
  function resolveAnchorBoundaryUncached(el) {
    let node = el;
    let hops = 0;
    while (node && node !== document.documentElement && hops < 8) {
      const cs = getComputedStyle(node);
      if (isOpaqueColor(cs.backgroundColor) || cs.position === 'fixed' || cs.position === 'sticky') return node;
      node = node.parentElement;
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
  function sampleAnchor(boundaryEl) {
    const boundaryStyles = getComputedStyle(boundaryEl);
    const base = isOpaqueColor(boundaryStyles.backgroundColor) ? parseRgb(boundaryStyles.backgroundColor) : DEFAULT_PALETTE.base;
    const ink = isOpaqueColor(boundaryStyles.color) ? parseRgb(boundaryStyles.color) : relativeLuminance(base) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

    const candidates = Array.prototype.slice.call(boundaryEl.querySelectorAll('button, a, [role="button"]')).slice(0, 30);
    const buckets = new Map(); // rounded-hue-bucket -> { count, sample }
    candidates.forEach((node) => {
      const styles = getComputedStyle(node);
      [styles.backgroundColor, styles.borderColor, styles.color].forEach((str) => {
        if (!isOpaqueColor(str)) return;
        const rgb = parseRgb(str);
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
      palette = applySeedHue(palette, opts.seedHue, opts.seedHueOverrideThresholdDeg);
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
  function applySeedHue(palette, seedHueDeg, thresholdOverride) {
    const threshold = thresholdOverride !== undefined ? thresholdOverride : SEED_HUE_OVERRIDE_THRESHOLD_DEG;
    const accentOklch = rgbToOklch(palette.accent);
    if (accentOklch.C < 0.04) {
      palette.accent = oklchToRgb({ L: accentOklch.L, C: 0.15, H: seedHueDeg });
    } else {
      const dist = hueDistance(accentOklch.H, seedHueDeg);
      if (dist >= threshold) {
        palette.accent = oklchToRgb({ L: accentOklch.L, C: accentOklch.C, H: seedHueDeg });
      } else {
        const weight = dist / threshold;
        const blendedH = circularLerp(accentOklch.H, seedHueDeg, weight);
        palette.accent = oklchToRgb({ L: accentOklch.L, C: accentOklch.C, H: blendedH });
      }
    }
    palette.accent = ensureContrast(palette.accent, palette.base, 3);
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
// ============================================================================
// services/i18n.js
// ============================================================================
/*
 * i18n — registration-based localization, same "registration is existence"
 * principle as modules and themes. English isn't a special-cased fallback
 * living outside the system — it's a normal registered dictionary that
 * happens to register first (below) and start out flagged default.
 *
 * Two-tier lookup per dictionary:
 *   Tier 1 — bare string -> itself/translation. Covers the common case:
 *     "Save": "Guardar"
 *   Tier 2 — same table, but a string can also carry a disambiguating
 *     qualifier when English itself would already phrase it differently
 *     by role: "Save (verb)": "Salvar". Authors only reach for this at
 *     the specific call site that needs it — most strings never do.
 * There's no structural separation between "tier 1 file" and "tier 2
 * file" here — one flat `strings` table per dictionary covers both; a
 * plain key is tier-1-shaped, a qualified key is tier-2-shaped, same
 * table, same lookup.
 *
 * Registration conflict rule: if two dictionaries both register with
 * isDefault:true, BOTH lose default status (not "second one loses" —
 * that would make the outcome depend on @require load order, which
 * nothing else in this system tolerates either). English becomes/stays
 * default, and the conflict is reported via console.warn, naming both
 * dictionaries. A dictionary missing required fields (selfName) is
 * refused registration entirely and warned about — same "if it fails to
 * register, it doesn't exist" rule module registration already uses.
 *
 * All console.warn text here is permanently English — this is developer-
 * facing diagnostic output, not end-user-facing UI, and that boundary is
 * absolute throughout this codebase (see comments elsewhere for the same
 * rule applied to code comments and internal error messages).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.i18n = (function () {
  const dictionaries = {}; // lang -> { lang, selfName, strings, isDefault }
  let defaultLang = null;

  // registerDictionary({ lang, selfName, strings, isDefault? }) — strings:
  // { "Plain string": "Translation", "Plain string (qualifier)": "..." }.
  // Returns true if registered, false if refused (and warns why).
  function registerDictionary(config) {
    config = config || {};
    if (!config.lang || !config.selfName || !config.strings) {
      console.warn('[JLib.i18n] registerDictionary() refused — requires { lang, selfName, strings }. Registration failed, this dictionary does not exist.', config);
      return false;
    }
    if (dictionaries[config.lang]) {
      console.warn(`[JLib.i18n] A dictionary for "${config.lang}" is already registered — ignoring the duplicate registration.`);
      return false;
    }

    dictionaries[config.lang] = {
      lang: config.lang,
      selfName: config.selfName,
      strings: config.strings,
      isDefault: false, // resolved below, never trust the caller's flag directly
    };

    if (config.isDefault) {
      if (defaultLang === null) {
        dictionaries[config.lang].isDefault = true;
        defaultLang = config.lang;
      } else {
        // Conflict: both the already-default dictionary and this new one
        // wanted default status. Deny BOTH, fall back to English — never
        // resolve on load order.
        console.warn(
          `[JLib.i18n] Both "${defaultLang}" and "${config.lang}" registered as default — denying default status to both and falling back to English.`
        );
        if (dictionaries[defaultLang]) dictionaries[defaultLang].isDefault = false;
        dictionaries[config.lang].isDefault = false;
        defaultLang = 'en';
        if (dictionaries.en) dictionaries.en.isDefault = true;
      }
    }
    return true;
  }

  // setDefault(lang) — explicit, user-driven switch (e.g. from the
  // Settings Panel language dropdown). No conflict possible here since
  // it's a deliberate single choice, not two registrations racing.
  function setDefault(lang) {
    if (!dictionaries[lang]) {
      console.warn(`[JLib.i18n] setDefault("${lang}") — no dictionary registered for that language.`);
      return false;
    }
    if (defaultLang && dictionaries[defaultLang]) dictionaries[defaultLang].isDefault = false;
    dictionaries[lang].isDefault = true;
    defaultLang = lang;
    return true;
  }

  function getDefaultDictionary() {
    return dictionaries[defaultLang] || dictionaries.en;
  }

  // listDictionaries() — every registered dictionary, alphabetized by
  // each one's own self-name (not English's name for that language).
  // Consumed directly by the Settings Panel language dropdown.
  function listDictionaries() {
    return Object.values(dictionaries).sort((a, b) => a.selfName.localeCompare(b.selfName));
  }

  // t(str) — the lookup. Checks the active default dictionary's table
  // (which covers both tier-1 plain keys and tier-2 qualified keys, same
  // table); falls back to the literal string itself if no entry exists.
  // Missing keys are a fully normal, unremarkable state (an incomplete
  // translation) — not an error, nothing warned here.
  function t(str) {
    const dict = getDefaultDictionary();
    if (dict && dict.strings && Object.prototype.hasOwnProperty.call(dict.strings, str)) {
      return dict.strings[str];
    }
    return str;
  }

  // ---------- built-in English dictionary ----------
  // Hand-authored (no standing extraction tool — see design discussion),
  // walked from the actual UI copy used across core/elements.js,
  // core/services.js, and modules/*.js as of this build. Not exhaustive
  // of every string that could ever be added later; a reasonable-effort
  // pass covering the real chrome copy that exists today. "Default" is
  // included deliberately — the language-dropdown's pinned top entry
  // renders this word through the SAME lookup as everything else, so it
  // translates correctly the moment a non-English dictionary is made
  // default, rather than being hardcoded English wearing another
  // language's name.
  const EN_STRINGS = {
    Default: 'Default',
    English: 'English',
    Language: 'Language',
    'Panel Settings': 'Panel Settings',
    Appearance: 'Appearance',
    Behavior: 'Behavior',
    Shortcut: 'Shortcut',
    Backup: 'Backup',
    About: 'About',
    Theme: 'Theme',
    Position: 'Position',
    'Show Animations': 'Show Animations',
    'Keyboard Shortcut': 'Keyboard Shortcut',
    'Re-sample site colors': 'Re-sample site colors',
    'Export All Settings': 'Export All Settings',
    'Import Settings': 'Import Settings',
    'Reset Panel Settings to Default': 'Reset Panel Settings to Default',
    'Back to Dashboard': 'Back to Dashboard',
    'Back (navigation)': 'Back',
    Dashboard: 'Dashboard',
    Notifications: 'Notifications',
    Active: 'Active',
    History: 'History',
    Dismiss: 'Dismiss',
    'Nothing active.': 'Nothing active.',
    'Nothing yet.': 'Nothing yet.',
    'Follow Website': 'Follow Website',
    System: 'System',
    'Smart System': 'Smart System',
    Dark: 'Dark',
    Light: 'Light',
    'Smart Dark': 'Smart Dark',
    'Smart Light': 'Smart Light',
    Center: 'Center',
    'Top Left': 'Top Left',
    'Top Right': 'Top Right',
    'Bottom Left': 'Bottom Left',
    'Bottom Right': 'Bottom Right',
    'Save (verb)': 'Save',
    'Save (noun)': 'Save',
  };

  registerDictionary({ lang: 'en', selfName: 'English', strings: EN_STRINGS, isDefault: true });

  return { registerDictionary, setDefault, getDefaultDictionary, listDictionaries, t };
})();

// ============================================================================
// services/structure-providers.js (radius / shadow / border / font / super)
// ============================================================================
/*
 * radiusProvider / shadowProvider / borderProvider — same shape as
 * colorProvider's sampling half, much smaller: sample a few structural
 * CSS values off the resolved anchor boundary, fall back to a sane
 * authored default if nothing usable is found. "Providers must provide"
 * is a hard rule here, same as colorProvider — none of these three ever
 * return an empty/undefined result to a caller. No caller-facing
 * "nothing found" state exists; the fallback tier IS the answer when
 * sampling comes up empty, not a separate failure the caller has to
 * handle.
 *
 * fontProvider — detection only, no fit-testing of its own. Resolves an
 * ordered, ALWAYS-length-3 list of font-family candidates (sampled top
 * pick, a secondary candidate, and JLib's own authored font as the
 * guaranteed final slot — "must provide" applied to a ranked list means
 * every rank always resolves to something, never undefined).
 *
 * fontProvider.layout — the only place actual text-fitting logic lives.
 * Fixed order, no deviation, no permutation search (see design
 * discussion): shrink (down to a legibility floor) -> wrap (allow
 * multi-line) -> truncate-with-ellipsis (last resort, since an ellipsis
 * alone almost always fits). If even a bare ellipsis doesn't fit the
 * container, that's a caller configuration problem, not something this
 * system can rescue — it's reported via console.warn and the container
 * is left at its best-effort truncated state rather than looping
 * indefinitely.
 *
 * superProvider — thin facade, no logic of its own beyond composition.
 * Resolves the anchor boundary ONCE and hands it to whichever of the
 * five providers below are being asked for, merging their results into
 * one flat bundle. Three-state per-provider options: omitted key -> that
 * provider runs at its own default; a real value -> instructs the
 * provider (currently meaningful for font, as a rank 1-3; other
 * providers accept the key as "run me" with no finer instruction shape
 * yet — real per-provider instruction semantics beyond on/off is
 * future work, flagged honestly rather than faked); `false` -> excluded
 * entirely, key absent from the returned bundle, caller's own CSS is
 * never touched for that property.
 *
 * Depends on: JLib.colorProvider (anchor resolution + sampling
 * primitives, reused rather than duplicated), JLib.dom, JLib.utils
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ---------------------------------------------------------------------------
// shared sampling helper — used by radius/shadow/border, avoids tripling
// the same "scan a few candidates, pick the most common non-trivial
// value, fall back if nothing usable" logic three times
// ---------------------------------------------------------------------------
function _jlibSampleStructuralValue(boundaryEl, readValue, isUsable) {
  const candidates = Array.prototype.slice.call(boundaryEl.querySelectorAll('button, [role="button"], .card, [class*="card"], [class*="panel"], [class*="modal"]')).slice(0, 20);
  candidates.unshift(boundaryEl);
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  candidates.forEach((node) => {
    const val = readValue(node);
    if (!isUsable(val)) return;
    const count = (counts.get(val) || 0) + 1;
    counts.set(val, count);
    if (count > bestCount) {
      bestCount = count;
      best = val;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// radiusProvider
// ---------------------------------------------------------------------------
JLib.radiusProvider = (function () {
  const cp = JLib.colorProvider;
  const DEFAULT_RADIUS = '8px';
  const cache = new WeakMap();

  function sampleRadius(boundaryEl) {
    const found = _jlibSampleStructuralValue(
      boundaryEl,
      (node) => getComputedStyle(node).borderRadius,
      (val) => val && val !== '0px' && val !== '0px 0px 0px 0px'
    );
    return found || DEFAULT_RADIUS; // must provide — never returns nothing
  }

  function get(el) {
    const boundary = cp.resolveAnchorBoundary(el);
    if (cache.has(boundary)) return cache.get(boundary);
    const radius = sampleRadius(boundary);
    cache.set(boundary, radius);
    return radius;
  }

  function getGlobal() {
    return get(document.body);
  }

  return { get, getGlobal, DEFAULT_RADIUS };
})();

// ---------------------------------------------------------------------------
// shadowProvider
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// borderProvider
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// fontProvider — detection + ranked list only. No fit-testing here.
// ---------------------------------------------------------------------------
JLib.fontProvider = (function () {
  const cp = JLib.colorProvider;
  const JLIB_AUTHORED_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  const cache = new WeakMap();

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
        console.warn('[JLib.fontProvider.layout] Container is too small to render even a single ellipsis character — this is a container-sizing issue, not something layout fitting can fix.', container);
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

  return { getRanked, fontType, layout, JLIB_AUTHORED_FONT };
})();

// ---------------------------------------------------------------------------
// superProvider — namespace, not a singleton. .css is the composition
// layer for the five visual mini-providers; other domains (.a11y, .motion)
// were named during design but explicitly not built — no evidence of
// need yet, same bar as everything else in this system.
// ---------------------------------------------------------------------------
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
  // color/radius/shadow/border).
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
      bundle.border = JLib.borderProvider.get(el);
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

  return { resolve, apply, reveal, transition, fitText };
})();

// ============================================================================
// services/theme.js
// ============================================================================
/*
 * Theme — registration-based, same "registration is existence" principle
 * as modules, dictionaries, and everything else in this codebase.
 * JLib.registerTheme(name, resolve) registers a theme; `resolve(targetEl)`
 * returns a `--jsp-*` CSS-var object. Seven built-ins are registered
 * below, at load, using this exact same public mechanism — nothing about
 * them is special-cased internally beyond registering first.
 *
 *   dark, light        — fully authored, fully static. No providers
 *                        touched at all, ever.
 *   system             — OS-preference selector between dark/light.
 *                        Not a third palette, just a chooser.
 *   followWebsite      — fully dogfooded: colorProvider for the palette,
 *                        superProvider for radius/shadow/border/font.
 *                        Everything the provider family can contribute,
 *                        it does.
 *   smart-dark,
 *   smart-light        — authored PALETTE (same fixed colors as static
 *                        dark/light), but structural values (radius,
 *                        shadow, border, font) sourced from providers.
 *                        Color is deliberate design intent; structure
 *                        adapts to the host page.
 *   smartSystem        — OS-preference selector between smart-dark and
 *                        smart-light, same mechanism as `system`.
 *
 * theme.js itself still does zero color/structure math — it only maps
 * whatever a registered theme's resolver returns onto `--jsp-*`
 * variables and applies them. Any consumer (a standalone Settings Panel,
 * or the dashboard) creates one instance via JLib.theme.create() and
 * owns it.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib._themeRegistry = JLib._themeRegistry || {};

// registerTheme(name, resolve) — resolve(targetEl) -> { '--jsp-*': value, ... }.
// Re-registering an existing name is refused and warned, same "if it
// fails to register, it doesn't exist" rule used everywhere else.
JLib.registerTheme = function registerTheme(name, resolve) {
  if (!name || typeof resolve !== 'function') {
    console.warn('[JLib.registerTheme] refused — requires (name, resolveFn). Registration failed, this theme does not exist.', name);
    return false;
  }
  if (JLib._themeRegistry[name]) {
    console.warn(`[JLib.registerTheme] A theme named "${name}" is already registered — ignoring the duplicate registration.`);
    return false;
  }
  JLib._themeRegistry[name] = resolve;
  return true;
};

JLib.theme = (function () {
  const { debounce } = JLib.utils;
  const cp = JLib.colorProvider;

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------- authored static palettes (used by dark/light/smart-*) ----------
  const STATIC_PALETTE = {
    dark: {
      '--jsp-bg': 'linear-gradient(145deg, #14141c 0%, #0a0a0e 100%)',
      '--jsp-sidebar-bg': 'rgba(255, 255, 255, 0.03)',
      '--jsp-text': '#e8e8e8',
      '--jsp-muted': '#6a6a7a',
      '--jsp-accent': '#8b5cf6',
      '--jsp-accent-hover': '#9d75f7',
      '--jsp-accent-bg': 'rgba(139, 92, 246, 0.15)',
      '--jsp-border': 'rgba(255, 255, 255, 0.06)',
      '--jsp-hover': 'rgba(255, 255, 255, 0.05)',
      '--jsp-toggle-off': '#2a2a3e',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      '--jsp-radius': '16px',
      '--jsp-font': JLib.fontProvider.JLIB_AUTHORED_FONT,
    },
    light: {
      '--jsp-bg': 'linear-gradient(145deg, #ffffff 0%, #f2f1f6 100%)',
      '--jsp-sidebar-bg': 'rgba(0, 0, 0, 0.03)',
      '--jsp-text': '#17171f',
      '--jsp-muted': '#6b6b78',
      '--jsp-accent': '#7c3aed',
      '--jsp-accent-hover': '#6d28d9',
      '--jsp-accent-bg': 'rgba(124, 58, 237, 0.1)',
      '--jsp-border': 'rgba(0, 0, 0, 0.08)',
      '--jsp-hover': 'rgba(0, 0, 0, 0.04)',
      '--jsp-toggle-off': '#d9d9e3',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      '--jsp-radius': '16px',
      '--jsp-font': JLib.fontProvider.JLIB_AUTHORED_FONT,
    },
  };

  // Maps a colorProvider palette onto `--jsp-*` color variables. Pure
  // translation, no math — same role this function has always had.
  function paletteToColorVars(palette) {
    const isDark = cp.relativeLuminance(palette.base) < 0.5;
    return {
      '--jsp-bg': cp.toCssRgb(palette.base),
      '--jsp-sidebar-bg': isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      '--jsp-text': cp.toCssRgb(palette.ink),
      '--jsp-muted': cp.toCssRgb(palette.muted),
      '--jsp-accent': cp.toCssRgb(palette.accent),
      '--jsp-accent-hover': cp.toCssRgb(palette['accent-hover']),
      '--jsp-accent-bg': cp.toCssRgba(palette.accent, 0.15),
      '--jsp-border': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      '--jsp-hover': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      '--jsp-toggle-off': isDark ? '#2a2a3e' : '#d9d9e3',
      '--jsp-danger': cp.toCssRgb(palette.danger),
      '--jsp-shadow': isDark
        ? '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        : '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
    };
  }

  // ---------- built-in theme registrations ----------
  JLib.registerTheme('dark', () => STATIC_PALETTE.dark);
  JLib.registerTheme('light', () => STATIC_PALETTE.light);
  JLib.registerTheme('system', (targetEl) => JLib._themeRegistry[prefersDark() ? 'dark' : 'light'](targetEl));

  JLib.registerTheme('followWebsite', (targetEl) => {
    const vars = paletteToColorVars(cp.getGlobalPalette());
    // Fully dogfooded — structural values from the provider family too,
    // not just color.
    const bundle = JLib.superProvider.css.resolve(targetEl || document.body, { color: false });
    vars['--jsp-radius'] = bundle.radius;
    vars['--jsp-shadow'] = bundle.shadow;
    vars['--jsp-font'] = bundle.font;
    return vars;
  });

  function smartVariant(staticKey) {
    return (targetEl) => {
      const vars = Object.assign({}, STATIC_PALETTE[staticKey]); // authored color, deliberate
      const bundle = JLib.superProvider.css.resolve(targetEl || document.body, { color: false });
      vars['--jsp-radius'] = bundle.radius; // structure adapts
      vars['--jsp-shadow'] = bundle.shadow;
      vars['--jsp-font'] = bundle.font;
      return vars;
    };
  }
  JLib.registerTheme('smart-dark', smartVariant('dark'));
  JLib.registerTheme('smart-light', smartVariant('light'));
  JLib.registerTheme('smartSystem', (targetEl) => JLib._themeRegistry[prefersDark() ? 'smart-dark' : 'smart-light'](targetEl));

  // ---------- background crossfade (unchanged) ----------
  function crossfadeBackground(hostEl, oldBgValue, opts) {
    opts = opts || {};
    const duration = opts.duration !== undefined ? opts.duration : 300;
    if (!oldBgValue) return;
    const overlay = document.createElement('div');
    overlay.setAttribute(
      'style',
      `position:absolute;inset:0;pointer-events:none;background:${oldBgValue};opacity:1;transition:opacity ${duration}ms ease;border-radius:inherit;z-index:0;`
    );
    hostEl.insertBefore(overlay, hostEl.firstChild);
    requestAnimationFrame(() => {
      overlay.style.opacity = '0';
    });
    setTimeout(() => overlay.remove(), duration + 40);
  }

  // ---------- public instance ----------
  function create(opts) {
    opts = opts || {};
    let mode = opts.defaultMode || 'followWebsite'; // any registered theme name
    let animationsEnabled = opts.animationsEnabled !== false;
    let lastTargetEl = null;

    function resolveVars(targetEl) {
      const resolver = JLib._themeRegistry[mode] || JLib._themeRegistry.dark;
      return resolver(targetEl);
    }

    function apply(targetEl, applyOpts) {
      applyOpts = applyOpts || {};
      lastTargetEl = targetEl;
      const shouldAnimate = applyOpts.skipAnimation !== undefined ? !applyOpts.skipAnimation : animationsEnabled;
      const vars = resolveVars(targetEl);
      if (shouldAnimate) {
        const oldBg = window.getComputedStyle(targetEl).getPropertyValue('--jsp-bg');
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
        crossfadeBackground(targetEl, oldBg);
      } else {
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
      }
    }

    function reExtract(targetEl) {
      cp.invalidateAll();
      apply(targetEl || lastTargetEl);
    }

    let observer = null;
    let mqListener = null;
    const watcher = debounce((targetEl) => {
      reExtract(targetEl); // any provider-backed theme benefits from re-sampling on host changes
    }, 200);

    function startWatching(targetEl) {
      observer = new MutationObserver(() => watcher(targetEl));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      mqListener = () => watcher(targetEl);
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mqListener);
    }
    function stopWatching() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (window.matchMedia && mqListener) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListener);
      mqListener = null;
    }

    return {
      get themes() {
        return JLib._themeRegistry; // name -> resolver, for anything enumerating available themes
      },
      getMode: () => mode,
      setMode: (m, targetEl) => {
        mode = m;
        if (targetEl) apply(targetEl);
      },
      apply,
      setAnimationsEnabled: (v) => {
        animationsEnabled = !!v;
      },
      startWatching,
      stopWatching,
      forceReExtract: reExtract,
    };
  }

  return { create, contrastRatio: cp.contrastRatio, relativeLuminance: cp.relativeLuminance };
})();

// ============================================================================
// services/notifications.js
// ============================================================================
/*
 * Notifications — a headless core (queue + staling engine + dismissal
 * memory) that any presenter renders through. v1's dom-toolkit.js had a
 * single hardcoded toast() with a timed fade; this replaces it with a
 * real service, and toast becomes one of three presenters (toast/banner/
 * modal) driven by the same core.
 *
 * Depends on: JLib.dom (rendering), optionally JLib.storage (for
 * persist + "do not show again", which needs a stable notification id
 * and a place to remember it was dismissed).
 *
 * Staling strategies, set per-notification via `staleAfter`:
 *   { type: 'time', ms }          — auto-dismiss after ms
 *   { type: 'interaction' }       — dismiss on next click/keydown anywhere
 *                                    (or pass `target` to scope it to one element)
 *   { type: 'other', shouldStale: (notification, ctx) => bool } — caller-defined
 *   { type: 'default' }           — same as { type: 'time', ms: 4000 }
 *   omitted entirely              — persist: never auto-stales, only
 *                                    dismissed by the user or by code
 *
 * notify() returns { id, dismiss() }. The core doesn't render anything
 * itself — call JLib.notifications.presenters.toast(core) (etc.) once per
 * page to wire a presenter to a core instance; multiple presenters can
 * watch the same core (e.g. a toast stack AND a Notification Center
 * history view, both subscribed to the same stream).
 */

JLib.notifications = (function () {
  const { el } = JLib.dom;

  function create(opts) {
    opts = opts || {};
    const store = opts.store || null; // optional JLib.storage instance, for "do not show again"
    let seq = 0;
    const active = new Map(); // id -> notification record
    const history = []; // append-only, for a Notification Center to read
    const subscribers = new Set(); // fn(eventType, notification)
    const HISTORY_CACHE_KEY = 'notifications.history';
    const HISTORY_CACHE_CAP = 50;

    // Real JLib.cache consumer — notification history didn't survive a
    // reload before this; now it does. Purely additive: nothing about
    // notify()/dismiss()'s existing synchronous contract changes, this
    // just restores prior history once the async read resolves, and
    // persists in the background afterward. Silently does nothing if no
    // script is registered (JLib.cache refuses without one) — history
    // just behaves exactly as it did before in that case.
    if (JLib.cache) {
      JLib.cache
        .get(HISTORY_CACHE_KEY)
        .then((restored) => {
          if (Array.isArray(restored) && restored.length) {
            history.unshift(...restored.filter((r) => !history.some((h) => h.id === r.id)));
            emit('history-restored', null);
          }
        })
        .catch(() => {}); // no script registered, or IndexedDB unavailable — degrade silently to session-only history, same as before this integration existed
    }
    const persistHistory = JLib.utils.debounce(() => {
      if (JLib.cache) JLib.cache.set(HISTORY_CACHE_KEY, history.slice(-HISTORY_CACHE_CAP)).catch(() => {});
    }, 400);

    function emit(eventType, notification) {
      subscribers.forEach((fn) => fn(eventType, notification));
    }

    function isSuppressed(dismissKey) {
      if (!dismissKey || !store) return false;
      const all = store.load();
      return !!(all.dismissedNotifications && all.dismissedNotifications[dismissKey]);
    }
    function suppressForever(dismissKey) {
      if (!dismissKey || !store) return;
      const all = store.load();
      all.dismissedNotifications = all.dismissedNotifications || {};
      all.dismissedNotifications[dismissKey] = true;
      store.save(undefined, all);
    }

    function scheduleStaling(record) {
      const stale = record.staleAfter;
      if (!stale) return; // persist: no auto-staling
      if (stale.type === 'time' || stale.type === 'default') {
        const ms = stale.type === 'default' ? 4000 : stale.ms;
        record._timer = setTimeout(() => dismiss(record.id), ms);
      } else if (stale.type === 'interaction') {
        const target = stale.target || document;
        const handler = () => dismiss(record.id);
        record._interactionHandler = handler;
        record._interactionTarget = target;
        target.addEventListener('click', handler, { once: true, capture: true });
        target.addEventListener('keydown', handler, { once: true, capture: true });
      } else if (stale.type === 'other' && typeof stale.shouldStale === 'function') {
        record._pollTimer = setInterval(() => {
          if (stale.shouldStale(record, { active: active.get(record.id) })) dismiss(record.id);
        }, 500);
      }
    }

    function clearStaling(record) {
      if (record._timer) clearTimeout(record._timer);
      if (record._pollTimer) clearInterval(record._pollTimer);
      if (record._interactionHandler) {
        record._interactionTarget.removeEventListener('click', record._interactionHandler, { capture: true });
        record._interactionTarget.removeEventListener('keydown', record._interactionHandler, { capture: true });
      }
    }

    // notify(message, opts) -> { id, dismiss() } | null (null if suppressed
    // by a prior "do not show again" for this dismissKey)
    function notify(message, notifyOpts) {
      notifyOpts = notifyOpts || {};
      if (isSuppressed(notifyOpts.dismissKey)) return null;

      seq += 1;
      const record = {
        id: 'n' + seq,
        message,
        level: notifyOpts.level || 'info', // info | success | warning | error
        staleAfter: notifyOpts.staleAfter, // undefined = persist
        dismissKey: notifyOpts.dismissKey || null,
        allowDoNotShowAgain: !!notifyOpts.allowDoNotShowAgain,
        presenter: notifyOpts.presenter || 'toast', // toast | banner | modal — hint for whichever presenter is wired up
        createdAt: Date.now(),
      };
      active.set(record.id, record);
      history.push(record);
      persistHistory();
      scheduleStaling(record);
      emit('show', record);

      return {
        id: record.id,
        dismiss: () => dismiss(record.id),
      };
    }

    function dismiss(id, opts) {
      opts = opts || {};
      const record = active.get(id);
      if (!record) return;
      clearStaling(record);
      active.delete(id);
      if (opts.doNotShowAgain && record.dismissKey) suppressForever(record.dismissKey);
      emit('dismiss', record);
    }

    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    return {
      notify,
      dismiss,
      subscribe,
      getActive: () => Array.from(active.values()),
      getHistory: () => history.slice(),
    };
  }

  // ---------- presenters ----------
  // Each presenter subscribes to a core instance and renders whatever's
  // active using JLib.dom + elements/*. Presenters are opt-in and
  // stackable — wiring the toast presenter doesn't preclude also wiring
  // banner for a different subset of notifications (driven by
  // notifyOpts.presenter).

  const LEVEL_COLOR = { info: '#8b5cf6', success: '#2ecc71', warning: '#f1c40f', error: '#e74c3c' };

  function toastPresenter(core) {
    let container = null;
    function ensureContainer() {
      if (container) return container;
      container = el('div', {
        attrs: {
          style: 'position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;',
        },
      });
      document.body.appendChild(container);
      return container;
    }
    return core.subscribe((event, record) => {
      if (record.presenter !== 'toast') return;
      if (event === 'show') {
        const node = el(
          'div',
          {
            attrs: {
              style: `background:var(--jlib-color-base);color:var(--jlib-color-ink);padding:10px 16px;border-radius:8px;border-left:3px solid ${LEVEL_COLOR[record.level]};box-shadow:0 8px 24px rgba(0,0,0,0.4);transition:opacity .2s ease,transform .2s ease;transform:translateY(8px);max-width:320px;pointer-events:auto;position:relative;`,
            },
            dataset: { notifyId: record.id },
          },
          [record.message]
        );
        ensureContainer().appendChild(node);
        // Anchored, not global — a toast lives in one fixed screen
        // corner, not spread across the whole page, so it should sample
        // its own local surroundings (colorProvider.getPalette) rather
        // than the document-wide palette. reveal() means it's never
        // painted with a fallback color even briefly — built hidden,
        // themed, then faded in once, same "no pop-in" treatment
        // designed for exactly this "brand-new element mounting" case.
        JLib.superProvider.css.reveal(node, () => {
          node.style.fontFamily = 'var(--jlib-color-font)';
        });
        requestAnimationFrame(() => {
          node.style.transform = 'translateY(0)';
        });
        record._toastNode = node;
      } else if (event === 'dismiss' && record._toastNode) {
        const node = record._toastNode;
        node.style.opacity = '0';
        node.style.transform = 'translateY(8px)';
        setTimeout(() => node.remove(), 220);
      }
    });
  }

  function bannerPresenter(core) {
    let container = null;
    function ensureContainer() {
      if (container) return container;
      container = el('div', {
        attrs: { style: 'position:fixed;top:0;left:0;right:0;z-index:999999;display:flex;flex-direction:column;' },
      });
      document.body.appendChild(container);
      return container;
    }
    return core.subscribe((event, record) => {
      if (record.presenter !== 'banner') return;
      if (event === 'show') {
        const bar = el(
          'div',
          {
            attrs: {
              style: `background:${LEVEL_COLOR[record.level]};color:#0a0a0e;padding:10px 20px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;`,
            },
            dataset: { notifyId: record.id },
          },
          [record.message]
        );
        ensureContainer().appendChild(bar);
        record._bannerNode = bar;
      } else if (event === 'dismiss' && record._bannerNode) {
        record._bannerNode.remove();
      }
    });
  }

  // Blocking, click-okay style — uses elements/modal.js's minimal overlay
  // if present, otherwise a plain fixed-center box so this presenter
  // still works if someone only @requires notifications.js standalone.
  function modalPresenter(core) {
    return core.subscribe((event, record) => {
      if (record.presenter !== 'modal') return;
      if (event !== 'show') return;

      const okBtn = JLib.elements.button.button('OK', () => {
        core.dismiss(record.id);
        modalInstance.destroy();
      });
      const dontShowBtn = record.allowDoNotShowAgain
        ? JLib.elements.button.button("Don't show again", () => {
            core.dismiss(record.id, { doNotShowAgain: true });
            modalInstance.destroy();
          }, { variant: 'ghost' })
        : null;

      const modalInstance = JLib.elements.modal.create({
        id: 'jlib-notify-' + record.id,
        title: record.level.charAt(0).toUpperCase() + record.level.slice(1),
        content: (bodyEl) => {
          bodyEl.appendChild(el('div', {}, [record.message]));
          bodyEl.appendChild(el('div', { attrs: { style: 'display:flex;gap:8px;margin-top:14px;' } }, dontShowBtn ? [okBtn, dontShowBtn] : [okBtn]));
        },
        onClose: () => core.dismiss(record.id),
      });
      modalInstance.open();
    });
  }

  return {
    create,
    presenters: { toast: toastPresenter, banner: bannerPresenter, modal: modalPresenter },
  };
})();

// ============================================================================
// core/module-base.js
// ============================================================================
/*
 * Module base — the shared scaffold every module is built through, so
 * module authors don't each reinvent header markup, section markup, or
 * the mount/unmount lifecycle shape. A module built via this always has
 * the same three things: a header (title + optional right-side controls),
 * one or more sections (matching the .jlib-category header/body pattern),
 * and the same { id, label, order, mount, unmount } shape the dashboard
 * expects.
 *
 * Usage:
 *   const mod = JLib.moduleBase.create({
 *     id: 'myModule', label: 'My Module', order: 5,
 *     onMount(view, services) {
 *       view.header('My Module');
 *       view.section('General', (body) => { body.appendChild(...) });
 *     },
 *     onUnmount() {},
 *   });
 *   JLib.registerModule(mod);
 *
 * `view` passed to onMount is a small builder scoped to that module's
 * container — header()/section() are the only two shapes a module's
 * top-level layout should need. Anything below a section body is the
 * module's own business (built with JLib.elements.* as needed).
 *
 * Depends on: JLib.dom
 */

JLib.moduleBase = (function () {
  const { el } = JLib.dom;

  function makeView(container) {
    return {
      header(title, rightControls) {
        const children = [el('h2', {}, [title])];
        if (rightControls) children.push(rightControls);
        container.appendChild(el('div', { className: 'jlib-content-header' }, children));
      },
      // section(label, renderBody, opts?) — renderBody receives the empty
      // body container to fill. opts.icon prefixes the label, same
      // convention every module's sections use.
      section(label, renderBody, opts) {
        opts = opts || {};
        const header = el('div', { className: 'jlib-cat-header' }, [el('span', {}, [(opts.icon ? opts.icon + ' ' : '') + label])]);
        const body = el('div', { className: 'jlib-cat-body' });
        renderBody(body);
        container.appendChild(el('div', { className: 'jlib-category' }, [header, body]));
        return body;
      },
      clear() {
        while (container.firstChild) container.removeChild(container.firstChild);
      },
      raw() {
        return container;
      },
    };
  }

  // create(config) -> module def. config: { id, label, order?, onMount(view,
  // services, container), onUnmount() }. `container` is also passed
  // raw to onMount for cases that need it directly (e.g. a module that
  // wants its own two-pane layout instead of a flat section list) —
  // most modules only need `view`.
  function create(config) {
    if (!config || !config.id || !config.onMount) {
      throw new Error('JLib.moduleBase.create requires { id, onMount }');
    }
    let mountedContainer = null;

    function mount(container, services) {
      mountedContainer = container;
      const view = makeView(container);
      config.onMount(view, services, container);
    }
    function unmount() {
      if (config.onUnmount) config.onUnmount();
      mountedContainer = null;
    }

    return {
      id: config.id,
      label: config.label || config.id,
      order: config.order !== undefined ? config.order : 5,
      mount,
      unmount,
    };
  }

  return { create, makeView };
})();

// ============================================================================
// module registration + render lifecycle (formerly core/dashboard.js)
// ============================================================================
/*
 * Registration + render — modules self-register via JLib.registerModule()
 * at their own file's top level, whether they arrived via @require or were
 * typed inline by the userscript author. Registration IS existence.
 * JLib.render() (or JLib.scheduleRender(), which defers it to a microtask
 * so it's the LAST thing to run for that page load) is called once; at
 * that point module count is exact, not guessed.
 *
 * Depends on: JLib.dom, JLib.theme, JLib.storage, JLib.elements.modal
 * (elements.js @required before this runs — note this is the one place
 * services.js reaches into elements.js, since the shell IS a modal).
 *
 * Unified shell: there is always exactly ONE modal built, whether 1 or 2+
 * modules are registered. What changes with count is what's inside it:
 *   - count === 1 (and no forceDashboard): no menu, no cog. If the single
 *     registered module is Settings Panel, its `full` variant mounts —
 *     Panel Settings and About live inline as tabs alongside the
 *     userscript's own settings, since there's no dashboard to keep them
 *     apart. Any other kind of solo module (no .full/.lite pair) just
 *     mounts itself directly.
 *   - count >= 2: a menu screen lists every module (click one to open it
 *     full-screen with a "Back to Dashboard" control). Settings Panel, if
 *     registered, opens via its `lite` variant here — userscript settings
 *     only, no chrome mixed in. Cog (next to the close button) opens a
 *     *different*, unregistered module entirely — the shared chrome
 *     module (theme/position/shortcut/backup/about), built via
 *     JLib.modules.settingsPanel.getSharedChromeModule() under a sentinel
 *     id that never appears in `modules` and never counts toward module
 *     count. Two separate settings surfaces, reached two different ways.
 *
 * Theme mode, animations-enabled, panel position, and keyboard shortcut
 * are all chrome-module-owned regardless of count — read back via
 * getChromeShellDefaults() before the theme instance or first paint
 * exist, so a saved preference actually survives a reload instead of
 * resetting until Panel Settings happens to be opened again.
 *
 * A module never owns its own modal — `services.shell` (setPosition/
 * setKeyboardShortcut/setTitle/panelEl) is how a module reaches the one
 * shell that always exists, regardless of count.
 */
JLib._modules = JLib._modules || [];
JLib._rendered = false;

JLib.registerModule = function registerModule(moduleDef) {
  if (!moduleDef || !moduleDef.id) throw new Error('JLib.registerModule requires { id, ... }');
  if (JLib._rendered) {
    console.warn('[JLib] registerModule("' + moduleDef.id + '") called after render() — registration is closed, this module will not appear.');
    return;
  }
  JLib._modules.push(moduleDef);
};

JLib.scheduleRender = function scheduleRender(opts) {
  Promise.resolve().then(() => JLib.render(opts));
};

JLib.render = function render(opts) {
  opts = opts || {};
  if (JLib._rendered) return;
  JLib._rendered = true;
  const { el } = JLib.dom;

  const modules = JLib._modules.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!modules.length) return;

  const single = modules.length === 1 && !opts.forceDashboard;

  // Theme mode/animations and shell position/shortcut are ALWAYS chrome-
  // module-owned now (never per-userscript) — both `full`'s nested Panel
  // Settings tab and the cog mount the exact same shared chrome module
  // instance, so reading its persisted values here (before the theme
  // instance or first paint exist) is what makes a saved preference
  // actually survive a page reload instead of silently resetting to
  // defaults until Panel Settings happens to be opened again.
  const shellDefaults = JLib.modules.settingsPanel.getChromeShellDefaults();
  const themeStore = JLib.storage.createStore([], { storageKeyPrefix: 'jlib_shell_theme' });
  const themeService = JLib.theme.create({
    store: themeStore,
    defaultMode: shellDefaults.themeMode,
    animationsEnabled: shellDefaults.showAnimations,
  });

  const services = {
    dashboardMode: !single,
    theme: themeService,
    storage: JLib.storage,
    notifications: opts.notifications || null,
    shell: null, // filled in once `modal` exists, see below
  };

  let modal = null;

  modal = JLib.elements.modal.create({
    id: 'jlib-shell',
    title: opts.title || (single ? modules[0].label : 'Dashboard'),
    position: opts.position || 'center',
    keyboardShortcut: opts.keyboardShortcut || (single ? undefined : 'Ctrl+Shift+D'),
    content: (bodyEl) => {
      services.shell = {
        setPosition: modal.setPosition,
        setKeyboardShortcut: modal.setKeyboardShortcut,
        setTitle: modal.setTitle,
        get panelEl() {
          return modal.panelEl;
        },
      };

      // Position/shortcut are chrome-module-owned regardless of single vs.
      // dashboard mode (see shellDefaults above) — apply them here so the
      // very first paint already reflects whatever was last saved.
      if (shellDefaults.position) modal.setPosition(shellDefaults.position);
      if (shellDefaults.keyboardShortcut !== undefined) modal.setKeyboardShortcut(shellDefaults.keyboardShortcut);

      if (single) {
        // Standalone: the settings module (if that's what's registered)
        // mounts its `full` variant — Panel Settings and About live
        // inline as tabs alongside the userscript's own settings, since
        // there's no dashboard to keep them apart. Any other kind of
        // solo module (no .full/.lite pair) just mounts itself.
        const mod = modules[0];
        const target = mod.full || mod;
        target.mount(bodyEl, services);
      } else {
        const CHROME_ID = '__chromeSettings__'; // sentinel — never in `modules`, never counts toward module count
        let currentModuleId = null; // null = menu showing

        function targetFor(id) {
          if (id === CHROME_ID) return JLib.modules.settingsPanel.getSharedChromeModule(services);
          const mod = modules.find((m) => m.id === id);
          if (!mod) return null;
          // Dashboard-menu-opened modules use `lite` where present (no
          // chrome tab mixed in — that's what the cog is for instead);
          // anything without a lite/full pair just mounts as itself.
          return mod.lite || mod;
        }

        function showMenu() {
          if (currentModuleId) {
            const target = targetFor(currentModuleId);
            if (target && target.unmount) target.unmount();
            currentModuleId = null;
          }
          renderShell();
        }

        function openModule(id, afterMount) {
          currentModuleId = id;
          renderShell();
          if (afterMount) afterMount();
        }

        function renderMenu() {
          const list = el('div', { className: 'jlib-dashboard-menu' });
          modules.forEach((m) => {
            const btn = JLib.elements.button.button(m.label, () => openModule(m.id), { className: 'jlib-dashboard-menu-item' });
            list.appendChild(btn);
          });
          return el('div', { className: 'jlib-dashboard-menu-wrap' }, [
            el('div', { className: 'jlib-dashboard-menu-title' }, [opts.title || JLib.i18n.t('Dashboard')]),
            list,
          ]);
        }

        // Real width-constrained button zone (max-width:420px menu,
        // author-supplied module labels) — unlike most buttons in this
        // codebase (short, fixed English action words like "Export"),
        // this one has a genuine overflow risk once localized or given
        // a long author-chosen label. Shrink+truncate only, wrap
        // skipped deliberately (a menu item growing tall looks broken)
        // — calling the independently-exposed strategies directly
        // rather than fitText()'s full fixed pipeline, exactly the
        // "genuine reason to deviate" escape hatch the design allows.
        function fitMenuButtons(container) {
          container.querySelectorAll('.jlib-dashboard-menu-item').forEach((btn) => {
            const label = btn.textContent;
            const font = JLib.fontProvider.fontType(btn, 1);
            const size = JLib.fontProvider.layout.shrink(btn, label, font, { minSize: 11 });
            btn.style.fontSize = size + 'px';
            btn.style.whiteSpace = 'nowrap';
            btn.style.overflow = 'hidden';
            if (!JLib.fontProvider.layout.fits(btn, label, font, size)) {
              btn.textContent = JLib.fontProvider.layout.truncate(btn, label, font, size);
            }
          });
        }

        function renderShell() {
          while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
          if (!currentModuleId) {
            bodyEl.appendChild(renderMenu());
            fitMenuButtons(bodyEl);
            return;
          }
          const target = targetFor(currentModuleId);
          const backBtn = JLib.elements.button.button('\u2190 ' + JLib.i18n.t('Back (navigation)'), showMenu, { className: 'jlib-dashboard-back' });
          const moduleContainer = el('div', { className: 'jlib-dashboard-module-container' });
          bodyEl.appendChild(el('div', { className: 'jlib-dashboard-module-wrap' }, [backBtn, moduleContainer]));
          if (target) target.mount(moduleContainer, services);
        }

        // Cog doesn't call into the userscript's own settings module at
        // all — it opens the shared chrome module directly (theme/
        // position/shortcut/backup/about), full-screen, same as any menu
        // item. That module is never registered and never counts toward
        // module count; the userscript's own "Settings" menu entry still
        // opens the real settings module's `lite` variant, unaffected.
        const cogBtn = JLib.elements.button.button('\u2699', () => openModule(CHROME_ID), { className: 'jlib-dashboard-cog' });
        if (modal.headerActionsEl) modal.headerActionsEl.appendChild(cogBtn);

        renderShell();
      }

      themeService.apply(modal.panelEl, { skipAnimation: true });
      themeService.startWatching(modal.panelEl);
    },
    onClose: () => themeService.stopWatching(),
  });

  const DASHBOARD_CSS = `
    .jlib-dashboard-cog { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; }
    .jlib-dashboard-menu-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:10px 4px 4px; }
    .jlib-dashboard-menu-title {
      text-align:center; font-size:20px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;
      color: var(--jsp-accent); margin:10px 0 24px; flex-shrink:0;
    }
    .jlib-dashboard-menu { display:flex; flex-direction:column; gap:10px; max-width:420px; margin:0 auto; width:100%; }
    .jlib-dashboard-menu-item {
      padding:16px 20px; border-radius:8px; background: var(--jsp-hover); border:1px solid var(--jsp-border);
      font-size:14px; font-weight:600; letter-spacing:0.04em; text-align:center; text-transform:uppercase;
      transition: background .15s ease, border-color .15s ease, color .15s ease;
    }
    .jlib-dashboard-menu-item:hover { background: var(--jsp-accent-bg); border-color: var(--jsp-accent); color: var(--jsp-accent); }
    .jlib-dashboard-module-wrap { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .jlib-dashboard-back {
      align-self:flex-start; margin:0 0 12px; padding:7px 14px; border-radius:6px; background: var(--jsp-hover);
      color: var(--jsp-muted); font-size:12px; font-weight:600; flex-shrink:0;
    }
    .jlib-dashboard-back:hover { color: var(--jsp-text); }
    .jlib-dashboard-module-container { flex:1; min-height:0; overflow-y:auto; }
  `;
  const style = document.createElement('style');
  style.textContent = DASHBOARD_CSS;
  document.head.appendChild(style);

  JLib.dashboard = {
    open: modal.open,
    close: modal.close,
    toggle: modal.toggle,
    destroy: modal.destroy,
    get panelEl() {
      return modal.panelEl;
    },
  };
};
// ============================================================================
// services/cache.js
// ============================================================================
/*
 * cache — non-settings persistent storage. Settings keep using
 * JLib.storage (GM storage, unconditional, cross-site by nature).
 * Everything else — arbitrary cached/derived, single-origin data — goes
 * through here: browser-native IndexedDB as the only physical backend,
 * an in-memory layer on top for synchronous-feeling reads, debounced
 * writes, BroadcastChannel for live cross-tab sync, a per-key logical
 * clock to resolve out-of-order message arrival, and Web Locks for
 * cheap tab-presence gating so broadcasts/requests don't fire into the
 * void.
 *
 * Namespace-scoped, and registration-gated — same "registration is
 * existence" rule as everything else. JLib.registerScript() must have
 * been called; every operation here refuses (console.warn, no silent
 * default) without it.
 *
 * KNOWN GAP, stated honestly rather than silently assumed solved: Web
 * Locks' real API only supports (a) point-in-time query() snapshots and
 * (b) a callback that fires when YOUR OWN request is granted — there is
 * no native "notify me when a different tab joins" event. Earlier
 * design discussion floated using the request callback to close the
 * open/check race; that isn't actually a capability the platform
 * provides. What's implemented here is query()-before-every-broadcast-
 * decision, which is correct and matches what Web Locks can actually
 * do, but the race (a second tab opening in the exact gap between a
 * check and the action taken on it) is not fully closed — a real,
 * narrow, low-consequence gap (worst case: one missed broadcast,
 * recovered by the next write or the next tab's startup handshake) —
 * not a fabricated fix.
 *
 * Depends on: JLib.utils (debounce), JLib.composeNamespace
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.cache = (function () {
  const { debounce } = JLib.utils;

  const EAGER_LOAD_KEY_THRESHOLD = 500; // hybrid gate: eager-load below this many keys, lazy above it

  let namespace = null;
  let db = null;
  let channel = null;
  let memory = new Map(); // key -> { value, clock }
  let eager = true;
  let readyPromise = null;
  let lockHeld = false;
  let localSeq = 0; // this tab's own monotonic counter, per key handled via memory's stored clock

  function dbName() {
    return 'jlib-cache-' + namespace;
  }
  function channelName() {
    return 'jlib-sync-' + namespace;
  }
  function lockName() {
    return 'jlib-presence-' + namespace + '-' + location.origin;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName(), 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const entries = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          entries.push([cursor.key, cursor.value]);
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  function idbCount() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(key, entry) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function idbDelete(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- tab presence (Web Locks) ----------
  function holdPresenceLock() {
    if (!navigator.locks) return; // API unavailable — degrade to "always broadcast," never worse than not having this optimization
    navigator.locks.request(lockName(), { mode: 'shared' }, () => new Promise(() => {})); // held until tab closes
    lockHeld = true;
  }

  async function otherTabsLikelyPresent() {
    if (!navigator.locks || !navigator.locks.query) return true; // can't check — assume yes, safe default (may broadcast unnecessarily, never silently drops a needed one)
    try {
      const snapshot = await navigator.locks.query();
      const holders = (snapshot.held || []).filter((l) => l.name === lockName());
      return holders.length > 1; // more than just this tab's own hold
    } catch (e) {
      return true;
    }
  }

  // ---------- cross-tab sync ----------
  function broadcastUpdate(key, entry) {
    if (!channel) return;
    otherTabsLikelyPresent().then((present) => {
      if (present) channel.postMessage({ type: 'update', key, entry });
    });
  }

  function handleChannelMessage(msg) {
    if (!msg || !msg.data) return;
    const data = msg.data;
    if (data.type === 'update') {
      const existing = memory.get(data.key);
      if (!existing || data.entry.clock > existing.clock) {
        memory.set(data.key, data.entry);
      }
    } else if (data.type === 'sync-request') {
      // Reply only with entries we have that are newer than what the
      // requester already knows about — always sourced from our
      // in-memory cache, never disk, so debounce timing on our own
      // pending writes never matters to the accuracy of this reply.
      const newer = [];
      memory.forEach((entry, key) => {
        if (!data.knownClocks || (data.knownClocks[key] || -1) < entry.clock) {
          newer.push([key, entry]);
        }
      });
      if (newer.length && channel) {
        channel.postMessage({ type: 'sync-reply', entries: newer, replyTo: data.requestId });
      }
    } else if (data.type === 'sync-reply') {
      data.entries.forEach(([key, entry]) => {
        const existing = memory.get(key);
        if (!existing || entry.clock > existing.clock) {
          memory.set(key, entry);
        }
      });
    }
  }

  function requestSync() {
    otherTabsLikelyPresent().then((present) => {
      if (!present || !channel) return;
      const knownClocks = {};
      memory.forEach((entry, key) => {
        knownClocks[key] = entry.clock;
      });
      channel.postMessage({ type: 'sync-request', knownClocks, requestId: Date.now() + '-' + Math.random() });
    });
  }

  // ---------- resume handling ----------
  // pageshow/persisted is the real bfcache-restore signal (verified —
  // visibilitychange is NOT the same thing and doesn't reliably fire
  // for this specific case). visibilitychange still covers ordinary
  // tab-refocus. Both feed one shared debounced trigger so a resume
  // that fires both can't double-request.
  const debouncedResumeSync = debounce(() => requestSync(), 300);
  function setupResumeHandlers() {
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) debouncedResumeSync();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') debouncedResumeSync();
    });
  }

  // ---------- init ----------
  function ensureInit() {
    if (readyPromise) return readyPromise;
    namespace = JLib.composeNamespace();
    if (!namespace) {
      readyPromise = Promise.reject(new Error('[JLib.cache] refused — no script registered. Call JLib.registerScript({ namespace }) first.'));
      readyPromise.catch(() => {}); // avoid an unhandled-rejection warning for a deliberately-refused init
      return readyPromise;
    }
    readyPromise = openDb()
      .then((database) => {
        db = database;
        return idbCount();
      })
      .then((count) => {
        eager = count <= EAGER_LOAD_KEY_THRESHOLD;
        if (eager) return idbGetAll().then((entries) => entries.forEach(([k, v]) => memory.set(k, v)));
        return null; // lazy — memory stays empty, individual get()s load on demand
      })
      .then(() => {
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(channelName());
          channel.addEventListener('message', handleChannelMessage);
        }
        holdPresenceLock();
        setupResumeHandlers();
        requestSync(); // startup reconciliation
      });
    return readyPromise;
  }

  const debouncedFlush = debounce((key, entry) => {
    idbPut(key, entry).catch((err) => console.warn('[JLib.cache] Failed to persist key to IndexedDB:', key, err));
  }, 250);

  // ---------- public API ----------
  // set(key, value) — updates the in-memory cache immediately (so
  // subsequent reads in the same tick see it instantly), debounces the
  // actual IndexedDB write, and broadcasts to other tabs if any are
  // likely present.
  function set(key, value) {
    return ensureInit().then(() => {
      const existing = memory.get(key);
      const clock = (existing ? existing.clock : 0) + 1;
      const entry = { value, clock };
      memory.set(key, entry);
      debouncedFlush(key, entry);
      broadcastUpdate(key, entry);
    });
  }

  // get(key) — synchronous-feeling once warm. Eager mode: always
  // in-memory already. Lazy mode: first read of a given key is a real
  // async IndexedDB read; every read after that is instant.
  async function get(key) {
    await ensureInit();
    if (memory.has(key)) return memory.get(key).value;
    if (eager) return undefined; // eager mode already loaded everything that exists
    const stored = await idbGet(key);
    if (stored) {
      memory.set(key, stored);
      return stored.value;
    }
    return undefined;
  }

  function deleteKey(key) {
    return ensureInit().then(() => {
      memory.delete(key);
      return idbDelete(key);
    });
  }

  return { set, get, delete: deleteKey, ensureInit };
})();
