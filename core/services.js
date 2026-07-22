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
// services/theme.js
// ============================================================================
/*
 * Theme — named CSS-var themes (dark/light, extracted from settings-panel.js
 * v1 verbatim), system/followWebsite resolution, live watching, PLUS a new
 * palette extractor + WCAG contrast corrector for followWebsite mode.
 *
 * v1's followWebsite was a single luminance check on body/html background
 * (dark vs light, nothing else). This version actually samples the host
 * page's colors and derives a real palette from them, so JLib chrome can
 * visually match the site it's running on instead of using one of two
 * generic dark/light palettes. The luminance check is kept as the last-
 * resort fallback when extraction finds nothing usable (transparent
 * everything, canvas-heavy site, etc.) — nothing from v1 is thrown away.
 *
 * Any consumer (a standalone Settings Panel, or the dashboard when 2+
 * modules are present) creates one instance via JLib.theme.create() and
 * owns it — this service has no global mutable state of its own, unlike
 * v1 where theme lived inside settingsPanel.create()'s closure.
 */

JLib.theme = (function () {
  const { debounce } = JLib.utils;

  // ---------- built-in named themes (verbatim from settings-panel.js v1) ----------
  const BUILTIN_THEMES = {
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
    },
  };

  // ---------- color math ----------
  function parseRgb(str) {
    const m = str && str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  }

  function isOpaqueColor(str) {
    const c = parseRgb(str);
    return !!c && c.a > 0.05 && str !== 'transparent';
  }

  // WCAG relative luminance — not the crude single-pass 0.299/0.587/0.114
  // approximation v1 used for its dark/light check. This is the real sRGB
  // formula so contrast-ratio math against it is actually correct.
  function relativeLuminance({ r, g, b }) {
    const chan = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }

  function contrastRatio(c1, c2) {
    const l1 = relativeLuminance(c1);
    const l2 = relativeLuminance(c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function hslToRgb({ h, s, l }) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    };
  }

  function toCss({ r, g, b }) {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  // Nudges `fg` in lightness (toward black or white, whichever the base
  // already leans toward being contrasted against) in HSL steps until it
  // clears `minRatio` against `bg`, or gives up after 20 steps (~ full
  // range) and returns the best it found. Keeps hue/saturation intact so
  // the corrected color still visually relates to the sampled one instead
  // of collapsing to a generic gray.
  function ensureContrast(fg, bg, minRatio) {
    if (contrastRatio(fg, bg) >= minRatio) return fg;
    const hsl = rgbToHsl(fg);
    const bgIsDark = relativeLuminance(bg) < 0.5;
    const step = bgIsDark ? 0.04 : -0.04; // lighten fg against dark bg, darken against light bg
    let candidate = Object.assign({}, hsl);
    for (let i = 0; i < 20; i++) {
      candidate.l = Math.max(0, Math.min(1, candidate.l + step));
      const rgb = hslToRgb(candidate);
      if (contrastRatio(rgb, bg) >= minRatio) return rgb;
      if (candidate.l === 0 || candidate.l === 1) break;
    }
    return hslToRgb(candidate); // best effort if it never cleared the bar
  }

  // ---------- palette extraction ----------
  // Samples a handful of "likely brand surface" elements' *computed*
  // styles (not stylesheet rules — sites use CSS vars/cascades that only
  // resolve post-layout) to derive base/ink/accent, then WCAG-corrects
  // ink and accent against base before handing back CSS-var-ready colors.
  function extractSitePalette() {
    try {
      const surfaceCandidates = [document.body, document.querySelector('header'), document.querySelector('nav')].filter(Boolean);
      let base = null;
      for (const node of surfaceCandidates) {
        const bg = window.getComputedStyle(node).backgroundColor;
        if (isOpaqueColor(bg)) {
          base = parseRgb(bg);
          break;
        }
      }
      if (!base) {
        const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
        base = isOpaqueColor(htmlBg) ? parseRgb(htmlBg) : { r: 255, g: 255, b: 255, a: 1 };
      }

      const inkCandidates = [document.body, document.querySelector('p'), document.querySelector('h1')].filter(Boolean);
      let ink = null;
      for (const node of inkCandidates) {
        const fg = window.getComputedStyle(node).color;
        const parsed = parseRgb(fg);
        if (parsed) {
          ink = parsed;
          break;
        }
      }
      if (!ink) ink = relativeLuminance(base) < 0.5 ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };

      const accentCandidates = JLib.dom.$$('button, a, [role="button"]').slice(0, 40);
      let bestAccent = null;
      let bestSaturation = 0;
      accentCandidates.forEach((node) => {
        const styles = window.getComputedStyle(node);
        [styles.backgroundColor, styles.borderColor, styles.color].forEach((str) => {
          const parsed = parseRgb(str);
          if (!parsed || !isOpaqueColor(str)) return;
          const { s } = rgbToHsl(parsed);
          if (s > bestSaturation) {
            bestSaturation = s;
            bestAccent = parsed;
          }
        });
      });
      // Require some real saturation before trusting it as an accent —
      // a near-gray "most saturated" candidate isn't a brand color, it's
      // noise, and using it would make chrome look muddy rather than on-brand.
      const accent = bestSaturation > 0.15 ? bestAccent : ink;

      const correctedInk = ensureContrast(ink, base, 4.5);
      const correctedAccent = ensureContrast(accent, base, 3);

      return {
        ok: true,
        vars: {
          '--jsp-bg': toCss(base),
          '--jsp-sidebar-bg': relativeLuminance(base) < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          '--jsp-text': toCss(correctedInk),
          '--jsp-muted': toCss(ensureContrast(mixTowardBg(ink, base, 0.4), base, 3)),
          '--jsp-accent': toCss(correctedAccent),
          '--jsp-accent-hover': toCss(correctedAccent),
          '--jsp-accent-bg': cssAlpha(correctedAccent, 0.15),
          '--jsp-border': relativeLuminance(base) < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
          '--jsp-hover': relativeLuminance(base) < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          '--jsp-toggle-off': relativeLuminance(base) < 0.5 ? '#2a2a3e' : '#d9d9e3',
          '--jsp-danger': '#e74c3c',
          '--jsp-shadow':
            relativeLuminance(base) < 0.5
              ? '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)'
              : '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
        },
      };
    } catch (e) {
      return { ok: false };
    }
  }

  function mixTowardBg(fg, bg, amount) {
    return {
      r: fg.r + (bg.r - fg.r) * amount,
      g: fg.g + (bg.g - fg.g) * amount,
      b: fg.b + (bg.b - fg.b) * amount,
    };
  }

  function cssAlpha(rgb, a) {
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
  }

  // ---------- fallback: v1's luminance-only dark/light check ----------
  function defaultDetectWebsiteIsDark() {
    try {
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
      const bg = isOpaqueColor(bodyBg) ? bodyBg : htmlBg;
      const parsed = parseRgb(bg);
      if (parsed) return relativeLuminance(parsed) < 0.5;
    } catch (e) {
      // fall through
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------- background crossfade ----------
  // Snapshots `oldBgValue` into a transparent overlay, lets the caller's
  // real background already be updated underneath, then fades the
  // overlay out — works for solid colors, gradients, or anything else,
  // since it never parses the value at all. Requirements on the caller:
  // hostEl needs its own positioning context (relative/absolute/fixed —
  // every panel/modal in this library already has this), and any content
  // siblings that should stay visually on top need position:relative +
  // z-index >= 1 (positioned elements paint above static ones by default
  // regardless of DOM order, so without this the overlay can end up on
  // top instead of behind).
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
  // create(opts) -> a theme instance a Settings Panel or the dashboard
  // owns. opts.themes lets a caller register extra named themes at
  // runtime, same as config.ui.themes did in v1.
  function create(opts) {
    opts = opts || {};
    const themes = Object.assign({}, BUILTIN_THEMES, opts.themes || {});
    let mode = opts.defaultMode || 'followWebsite'; // 'followWebsite' | 'system' | a named theme key
    let cachedExtraction = null; // { ok, vars } | null, per-hostname via storage if `store` provided
    const store = opts.store || null; // optional JLib.storage instance for caching extraction per-origin

    function loadCachedExtraction() {
      if (!store) return null;
      const all = store.load();
      return all.paletteCache && all.paletteCache.hostname === location.hostname ? all.paletteCache : null;
    }
    function saveCachedExtraction(result) {
      if (!store) return;
      const all = store.load();
      all.paletteCache = Object.assign({ hostname: location.hostname }, result);
      store.save(undefined, all);
    }

    function resolveVars() {
      if (mode === 'system') return themes[prefersDark() ? 'dark' : 'light'];
      if (mode === 'followWebsite') {
        if (!cachedExtraction) cachedExtraction = loadCachedExtraction() || extractSitePalette();
        if (cachedExtraction && cachedExtraction.ok) return cachedExtraction.vars;
        // Tier 3 fallback: extraction found nothing usable, fall back to
        // v1's binary dark/light luminance check.
        return themes[defaultDetectWebsiteIsDark() ? 'dark' : 'light'];
      }
      return themes[mode] || themes.dark;
    }

    let animationsEnabled = opts.animationsEnabled !== false;

    function apply(targetEl, applyOpts) {
      applyOpts = applyOpts || {};
      const shouldAnimate = applyOpts.skipAnimation !== undefined ? !applyOpts.skipAnimation : animationsEnabled;
      const vars = resolveVars();
      if (shouldAnimate) {
        const oldBg = window.getComputedStyle(targetEl).getPropertyValue('--jsp-bg');
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
        crossfadeBackground(targetEl, oldBg);
      } else {
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
      }
    }

    function reExtract(targetEl) {
      cachedExtraction = extractSitePalette();
      saveCachedExtraction(cachedExtraction);
      if (mode === 'followWebsite') apply(targetEl);
    }

    let observer = null;
    let mqListener = null;
    const watcher = debounce((targetEl) => {
      if (mode === 'followWebsite') reExtract(targetEl);
      else if (mode === 'system') apply(targetEl);
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
      themes,
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

  return { create, contrastRatio, relativeLuminance };
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
              style: `background:#14141c;color:#e8e8e8;padding:10px 16px;border-radius:8px;border-left:3px solid ${LEVEL_COLOR[record.level]};font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;transition:opacity .2s ease,transform .2s ease;transform:translateY(8px);max-width:320px;pointer-events:auto;`,
            },
            dataset: { notifyId: record.id },
          },
          [record.message]
        );
        ensureContainer().appendChild(node);
        requestAnimationFrame(() => {
          node.style.opacity = '1';
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
      const overlay = el('div', {
        attrs: { style: 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999998;display:flex;align-items:center;justify-content:center;' },
      });
      const okBtn = el('button', { attrs: { style: 'margin-top:12px;padding:6px 16px;border-radius:6px;border:none;cursor:pointer;' } }, ['OK']);
      const dontShowBtn = record.allowDoNotShowAgain
        ? el('button', { attrs: { style: 'margin-top:12px;margin-left:8px;padding:6px 16px;border-radius:6px;border:none;cursor:pointer;background:transparent;color:inherit;' } }, [
            "Don't show again",
          ])
        : null;
      const box = el(
        'div',
        { attrs: { style: 'background:#14141c;color:#e8e8e8;padding:20px 24px;border-radius:12px;max-width:360px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;' } },
        [el('div', {}, [record.message]), okBtn].concat(dontShowBtn ? [dontShowBtn] : [])
      );
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      okBtn.addEventListener('click', () => {
        core.dismiss(record.id);
        overlay.remove();
      });
      if (dontShowBtn) {
        dontShowBtn.addEventListener('click', () => {
          core.dismiss(record.id, { doNotShowAgain: true });
          overlay.remove();
        });
      }
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
 * modules are registered. What changes with count is only whether a tab
 * strip + cog get built around it:
 *   - count === 1 (and no forceDashboard): no tabs, no cog. The single
 *     module's `standaloneVariant` (if it has one) mounts directly into
 *     the shell body; otherwise the module itself mounts. The module can
 *     configure the shell (title/position/keyboard shortcut) via an
 *     optional getShellConfig() on whichever variant is mounted.
 *   - count >= 2: tab strip switches between modules' `dashboardVariant`
 *     (if present) or the module itself; cog (next to the close button)
 *     calls whichever registered module exposes renderChromeSettings.
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
  const themeStore = JLib.storage.createStore([], { storageKeyPrefix: 'jlib_shell_theme' });
  const themeService = JLib.theme.create({ store: themeStore });

  const services = {
    dashboardMode: !single,
    theme: themeService,
    storage: JLib.storage,
    notifications: opts.notifications || null,
    shell: null, // filled in once `modal` exists, see below
  };

  let modal = null;
  let activeId = modules[0].id;

  function mountInto(mod, container) {
    const variant = single ? mod.standaloneVariant : mod.dashboardVariant;
    (variant || mod).mount(container, services);
  }
  function unmountFrom(mod) {
    const variant = single ? mod.standaloneVariant : mod.dashboardVariant;
    if ((variant || mod).unmount) (variant || mod).unmount();
  }

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

      // A module can request shell-level config (title/position/shortcut)
      // once, at first mount — used by Settings Panel's standalone variant
      // to apply whatever it last had saved.
      const firstMod = single ? modules[0] : null;
      const firstVariant = firstMod && (firstMod.standaloneVariant || firstMod);
      if (firstVariant && firstVariant.getShellConfig) {
        const cfg = firstVariant.getShellConfig();
        if (cfg.title) modal.setTitle(cfg.title);
        if (cfg.position) modal.setPosition(cfg.position);
        if (cfg.keyboardShortcut !== undefined) modal.setKeyboardShortcut(cfg.keyboardShortcut);
      }

      if (single) {
        mountInto(modules[0], bodyEl);
      } else {
        const cogBtn = el('button', { className: 'jlib-dashboard-cog', attrs: { title: 'Dashboard settings' } }, ['\u2699']);
        const sidebar = el('div', { className: 'jlib-dashboard-sidebar' });
        const content = el('div', { className: 'jlib-dashboard-content' });
        bodyEl.appendChild(el('div', { className: 'jlib-dashboard-body' }, [sidebar, content]));

        const header = modal.panelEl.querySelector('.jlib-modal-header');
        if (header) header.insertBefore(cogBtn, header.lastChild);

        function renderTabs() {
          JLib.elements.tabs.render(sidebar, modules.map((m) => ({ id: m.id, label: m.label })), activeId, selectModule);
        }
        function selectModule(id) {
          const prevMod = modules.find((m) => m.id === activeId);
          if (prevMod) unmountFrom(prevMod);
          activeId = id;
          renderTabs();
          renderActive();
        }
        function renderActive() {
          while (content.firstChild) content.removeChild(content.firstChild);
          const mod = modules.find((m) => m.id === activeId);
          if (mod) mountInto(mod, content);
        }

        let cogPopover = null;
        function renderCogPopover() {
          if (cogPopover) {
            cogPopover.remove();
            cogPopover = null;
            return;
          }
          cogPopover = el('div', { className: 'jlib-dashboard-cog-popover' });
          const chromeOwner = modules.find((m) => m.renderChromeSettings);
          if (chromeOwner) chromeOwner.renderChromeSettings(cogPopover, services);
          else cogPopover.appendChild(el('div', {}, ['(No module exposes chrome settings.)']));
          modal.panelEl.appendChild(cogPopover);
        }
        cogBtn.addEventListener('click', renderCogPopover);

        renderTabs();
        renderActive();
      }

      themeService.apply(modal.panelEl, { skipAnimation: true });
      themeService.startWatching(modal.panelEl);
    },
    onClose: () => themeService.stopWatching(),
  });

  const DASHBOARD_CSS = `
    .jlib-dashboard-cog { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:28px; height:28px; font-size:14px; cursor:pointer; margin-right:6px; }
    .jlib-dashboard-body { display:flex; flex:1; min-height:0; overflow:hidden; height:100%; }
    .jlib-dashboard-sidebar { width:180px; flex-shrink:0; background: var(--jsp-sidebar-bg); border-right:1px solid var(--jsp-border); padding:14px 10px; overflow-y:auto; }
    .jlib-dashboard-content { flex:1; min-width:0; overflow-y:auto; padding:20px 26px 24px; }
    .jlib-dashboard-cog-popover { position:absolute; top:56px; right:16px; background: var(--jsp-bg); border:1px solid var(--jsp-border); border-radius:12px; box-shadow: var(--jsp-shadow); padding:14px; width:280px; z-index:1000000; }
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
