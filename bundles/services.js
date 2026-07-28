// ---- from src/services/dom.js ----
// ============================================================================
// services/dom.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
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



// ---- from src/services/events.js ----
// ============================================================================
// services/events.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
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



// ---- from src/services/dedupe.js ----
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




// ---- from src/services/storage.js ----
// ============================================================================
// services/storage.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
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

    // watch(scope, callback) -> unsubscribe. Fires when this store's key
    // changes from a DIFFERENT tab/script instance (remote: true) —
    // this tab's own writes already update local state synchronously,
    // no need to react to hearing about them a second time. On any
    // remote fire, re-reads the real, current value fresh via load()
    // rather than trusting the listener's own new_value argument — see
    // GMSTORE.md for why: a listener firing with a stale or
    // out-of-order value (e.g. a setting changed and then changed back
    // in quick succession) could otherwise import a value that was
    // already superseded by the time the signal arrived. Re-reading
    // fresh means the imported value is always current at the moment
    // it's used, regardless of what order signals arrived in or what
    // the payload claimed.
    function watch(scope, callback) {
      if (typeof GM_addValueChangeListener === 'undefined') {
        JLib.console.warn('storage.watchUnavailable');
        return () => {};
      }
      const key = storageKey(scope);
      const listenerId = GM_addValueChangeListener(key, (name, oldValue, newValue, remote) => {
        if (!remote) return;
        callback(load(scope));
      });
      return () => {
        if (typeof GM_removeValueChangeListener !== 'undefined') GM_removeValueChangeListener(listenerId);
      };
    }

    return {
      appliesTo,
      storageKey,
      getDefaults,
      enforceDependencies,
      load,
      save,
      toggle,
      watch,
      featuresById: byId,
      features,
    };
  }

  return { createStore };
})();


// ---- from src/services/theme.js ----
// ============================================================================
// services/theme.js
// ============================================================================
/*
 * Theme — registration-based, same "registration is existence" principle
 * as modules, dictionaries, and everything else in this codebase.
 * registerTheme() itself and _themeRegistry live in registration.js,
 * alongside every other registerX function — this file registers the
 * seven built-in themes using that same public mechanism (nothing about
 * them is special-cased internally beyond registering first) and
 * provides the consumer-facing JLib.theme.create() instance.
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
 *
 * Depends on: JLib.console, registration.js (JLib.registerTheme,
 * JLib._themeRegistry must already exist), JLib.colorProvider,
 * JLib.superProvider.css, JLib.utils
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

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



// ---- from src/services/i18n.js ----
// ============================================================================
// services/i18n.js
// ============================================================================
/*
 * i18n — registration-based localization, same "registration is existence"
 * principle as modules and themes. English isn't a special-cased fallback
 * living outside the system — it's a normal registered dictionary that
 * happens to register first (below) and start out flagged default.
 *
 * registerDictionary() itself and its state (the dictionary table, the
 * current default language) live in registration.js, alongside every
 * other registerX function — this file only adds the lookup/consumer
 * side (setDefault, t, listDictionaries) onto that same JLib.i18n object.
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
 * All console.warn text here is permanently English — this is developer-
 * facing diagnostic output, not end-user-facing UI, and that boundary is
 * absolute throughout this codebase.
 *
 * Depends on: JLib.console, registration.js (JLib.i18n.registerDictionary,
 * JLib._i18nDictionaries, JLib._i18nDefaultLang must already exist)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

(function () {
  const dictionaries = JLib._i18nDictionaries;

  // setDefault(lang) — explicit, user-driven switch (e.g. from the
  // Settings Panel language dropdown). No conflict possible here since
  // it's a deliberate single choice, not two registrations racing.
  function setDefault(lang) {
    if (!dictionaries[lang]) {
      JLib.console.warn('i18n.unknownLanguage', lang);
      return false;
    }
    if (JLib._i18nDefaultLang && dictionaries[JLib._i18nDefaultLang]) dictionaries[JLib._i18nDefaultLang].isDefault = false;
    dictionaries[lang].isDefault = true;
    JLib._i18nDefaultLang = lang;
    return true;
  }

  function getDefaultDictionary() {
    return dictionaries[JLib._i18nDefaultLang] || dictionaries.en;
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
  // Hand-authored (no standing extraction tool), walked from the actual
  // UI copy used across the codebase as of this build. Not exhaustive of
  // every string that could ever be added later; a reasonable-effort
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

  JLib.i18n.registerDictionary({ lang: 'en', selfName: 'English', strings: EN_STRINGS, isDefault: true });

  Object.assign(JLib.i18n, { setDefault, getDefaultDictionary, listDictionaries, t });
})();


// ---- from src/services/notifications.js ----
// ============================================================================
// services/notifications.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
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
      if (notifyOpts.allowDoNotShowAgain && !store) {
        JLib.console.warn('notifications.doNotShowAgainNoStore');
      }

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



// ---- from src/services/module-lifecycle.js ----
// ============================================================================
// services/module-lifecycle.js
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
// registerModule() itself, and the state it governs (_modules, _rendered),
// live in registration.js alongside every other registerX function — this
// file consumes that same state for the render lifecycle below.
var JLib = typeof JLib !== 'undefined' ? JLib : {};

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
  const themeService = JLib.theme.create({
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


// ---- from src/services/cache.js ----
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

// ----------------------------------------------------------------------------
// Vendored from idb-keyval (jakearchibald/idb-keyval, Apache-2.0), converted
// from TypeScript to plain JS. Only the functions JLib.cache actually uses
// are included (promisifyRequest, createStore, get, set, del, entries) —
// same "small, stable, don't re-derive it ourselves" reasoning already
// applied to the vendored OKLCH color math elsewhere in this file. This
// replaces our own hand-rolled IndexedDB wrapper, which was correct (no
// classic transaction-lifetime bugs, verified) but not worth continuing to
// carry when a small, well-maintained, permissively-licensed original
// already exists for exactly this problem.
// ----------------------------------------------------------------------------
function _idbPromisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    request.onabort = request.onerror = () => reject(request.error);
  });
}
function _idbCreateStore(dbName, storeName) {
  let dbp;
  function getDB() {
    if (dbp) return dbp;
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    dbp = _idbPromisifyRequest(request);
    dbp.then(
      (db) => {
        // Safari sometimes closes the connection on its own; this lets us
        // reopen on next use instead of silently failing forever after.
        db.onclose = () => (dbp = undefined);
      },
      () => {}
    );
    return dbp;
  }
  return (txMode, callback) => getDB().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}
function _idbGet(key, customStore) {
  return customStore('readonly', (store) => _idbPromisifyRequest(store.get(key)));
}
function _idbSet(key, value, customStore) {
  return customStore('readwrite', (store) => {
    store.put(value, key);
    return _idbPromisifyRequest(store.transaction);
  });
}
function _idbDel(key, customStore) {
  return customStore('readwrite', (store) => {
    store.delete(key);
    return _idbPromisifyRequest(store.transaction);
  });
}
function _idbEntries(customStore) {
  return customStore('readonly', (store) => {
    if (store.getAll && store.getAllKeys) {
      return Promise.all([_idbPromisifyRequest(store.getAllKeys()), _idbPromisifyRequest(store.getAll())]).then(([keys, values]) => keys.map((k, i) => [k, values[i]]));
    }
    const items = [];
    return new Promise((resolve, reject) => {
      store.openCursor().onsuccess = function () {
        if (!this.result) {
          resolve();
          return;
        }
        items.push([this.result.key, this.result.value]);
        this.result.continue();
      };
    }).then(() => items);
  });
}

JLib.cache = (function () {
  const { debounce } = JLib.utils;

  const EAGER_LOAD_KEY_THRESHOLD = 500; // hybrid gate: eager-load below this many keys, lazy above it

  let namespace = null;
  let idbStore = null; // idb-keyval "UseStore" function for this script's own database
  let channel = null;
  let memory = new Map(); // key -> { value, clock }
  let eager = true;
  let readyPromise = null;
  let lockHeld = false;
  let localSeq = 0; // this tab's own monotonic counter, per key handled via memory's stored clock
  const subscribers = new Map(); // key -> Set<callback> — real gap this fixes: previously no way to react to a key changing at all, remote or local

  function dbName() {
    return 'jlib-cache-' + namespace;
  }
  function channelName() {
    return 'jlib-sync-' + namespace;
  }
  function lockName() {
    return 'jlib-presence-' + namespace + '-' + location.origin;
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
        notifySubscribers(data.key, data.entry.value);
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
          notifySubscribers(key, entry.value);
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
    idbStore = _idbCreateStore(dbName(), 'kv');
    readyPromise = _idbEntries(idbStore)
      .then((allEntries) => {
        eager = allEntries.length <= EAGER_LOAD_KEY_THRESHOLD;
        if (eager) allEntries.forEach(([k, v]) => memory.set(k, v));
        // lazy: memory stays empty, individual get()s load on demand
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

  // Per-key debounce — see JLib.utils.debouncePerKey's comment for the
  // exact bug this replaces: a single shared debounce() here would
  // silently drop every write except the most recent one whenever two
  // different keys were set within the same debounce window.
  const debouncedFlush = JLib.utils.debouncePerKey((key, entry) => {
    _idbSet(key, entry, idbStore).catch((err) => JLib.console.warn('cache.persistFailed', key, err));
  }, 250);

  // ---------- public API ----------
  // set(key, value) — updates the in-memory cache immediately (so
  // subsequent reads in the same tick see it instantly), debounces the
  // actual IndexedDB write, and broadcasts to other tabs if any are
  // likely present.
  function notifySubscribers(key, value) {
    const subs = subscribers.get(key);
    if (subs) subs.forEach((cb) => cb(value));
  }

  function commitSet(key, value, priorClock) {
    const entry = { value, clock: priorClock + 1 };
    memory.set(key, entry);
    debouncedFlush(key, entry);
    broadcastUpdate(key, entry);
    notifySubscribers(key, value);
  }

  function set(key, value) {
    return ensureInit().then(() => {
      const existing = memory.get(key);
      if (existing) {
        commitSet(key, value, existing.clock);
        return;
      }
      // In lazy mode, a key that's never been get()'d has no memory
      // entry — computing its clock from scratch (as if it started at 0)
      // could clobber a much higher real clock already recorded in
      // IndexedDB from a prior session or another tab, producing a
      // falsely-low value other tabs would correctly reject as stale. A
      // real fresh read first avoids that regardless of eager/lazy mode.
      return _idbGet(key, idbStore).then((stored) => {
        commitSet(key, value, stored ? stored.clock : 0);
      });
    });
  }

  // get(key) — synchronous-feeling once warm. Eager mode: always
  // in-memory already. Lazy mode: first read of a given key is a real
  // async IndexedDB read; every read after that is instant.
  async function get(key) {
    await ensureInit();
    if (memory.has(key)) return memory.get(key).value;
    if (eager) return undefined; // eager mode already loaded everything that exists
    const stored = await _idbGet(key, idbStore);
    if (stored) {
      memory.set(key, stored);
      return stored.value;
    }
    return undefined;
  }

  function deleteKey(key) {
    return ensureInit().then(() => {
      memory.delete(key);
      debouncedFlush.cancel(key); // a pending debounced write for this key would otherwise resurrect it after deletion
      return _idbDel(key, idbStore);
    });
  }

  // watch(key, callback) -> unsubscribe function. Fires on ANY change to
  // this key — local (this tab's own set()) or remote (another tab's
  // write, arriving via BroadcastChannel). Always passes the real,
  // current value at the moment of the change, never a stale reference —
  // same discipline as GMSTORE.md's watch() for GM storage, applied
  // here to non-settings cached data instead.
  function watch(key, callback) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(callback);
    return () => {
      const subs = subscribers.get(key);
      if (!subs) return;
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(key);
    };
  }

  return { set, get, delete: deleteKey, watch, ensureInit };
})();
