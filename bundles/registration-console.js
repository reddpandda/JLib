// ---- from src/services/utils.js ----
// ============================================================================
// services/utils.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
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

  // debouncePerKey(fn, wait) — like debounce(), but keyed: each distinct
  // first argument gets its own independent timer instead of all calls
  // sharing one. Fixes a real, confirmed bug — plain debounce() used for
  // a keyed operation (e.g. "flush this specific cache key to disk")
  // silently drops every call except the last one within the window,
  // since clearTimeout() on a shared timer cancels whatever the PREVIOUS
  // call was about to do, regardless of whether it was for a different
  // key. fn's first argument is used as the key; every argument
  // (including that key) is still passed through to fn when it fires.
  function debouncePerKey(fn, wait) {
    const timers = new Map(); // key -> timer id
    function debounced(key, ...rest) {
      if (timers.has(key)) clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn(key, ...rest);
        }, wait)
      );
    }
    debounced.cancel = (key) => {
      if (key === undefined) {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
        return;
      }
      if (timers.has(key)) {
        clearTimeout(timers.get(key));
        timers.delete(key);
      }
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

  return { debounce, throttle, debouncePerKey, makeLogger };
})();


// ---------------------------------------------------------------------------
// shared sampling helper — used by radius/shadow/border providers, avoids
// tripling the same "scan a few candidates, pick the most common
// non-trivial value, fall back if nothing usable" logic three times
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


// ---- from src/services/console.js ----
// ============================================================================
// services/console.js
// ============================================================================
/*
 * console — a registry for every message JLib emits, not a collection of
 * hand-typed console.warn() strings scattered across the codebase. Built
 * because that's exactly what existed before this: 13 real call sites,
 * each independently retyping its own "[JLib.xxx]" prefix by hand, none
 * of them using the makeLogger() utility already sitting in utils.js
 * built for exactly this. This dogfoods that utility as the actual
 * emission layer, and gives every message a real, findable definition —
 * a template, why it fires, and (new) a hint pointing at the fix — rather
 * than only the inline text visible at the one call site that fires it.
 *
 * Also the delivery mechanism for the "wrong door" convention: JLib
 * doesn't just refuse on a mistake, it names the mistake and points at
 * the fix, every time — see REFERENCE.md.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.console = (function () {
  const logger = JLib.utils.makeLogger('JLib');
  const registry = {}; // id -> { template(...args) -> string, explain, hint? }

  // register(id, def) — def.template is required (a function returning
  // the message body). def.explain and def.hint are optional but should
  // be present for anything that isn't purely internal bookkeeping.
  function register(id, def) {
    if (!def || typeof def.template !== 'function') {
      logger.warn(`console.register("${id}") refused — requires { template: (...) => string }.`);
      return false;
    }
    if (registry[id]) {
      logger.warn(`console.register("${id}") — already registered, ignoring duplicate.`);
      return false;
    }
    registry[id] = def;
    return true;
  }

  function render(id, args) {
    const def = registry[id];
    if (!def) return null;
    const body = def.template(...args);
    return def.hint ? `${body} ${def.hint}` : body;
  }

  // warn(id, ...args) — the normal path: something refused, or something
  // silently would have misbehaved and didn't.
  // warn(id, ...args) — args serve two purposes: interpolated into the
  // registered template AND passed through raw after the rendered
  // message, so a caller passing something like a DOM element still gets
  // it as an inspectable object in devtools, not swallowed by string
  // interpolation.
  function warn(id, ...args) {
    const msg = render(id, args);
    if (msg === null) {
      logger.warn(`Unknown message id "${id}" — this is a JLib internal issue, not something you did wrong.`, ...args);
      return;
    }
    logger.warn(msg, ...args);
  }

  // info(id, ...args) — orientation, not a problem. Used for the
  // one-time per-script shadow-root note and similar non-alarming
  // heads-up messages. Deliberately a different console method than
  // warn(), so it can't train anyone to tune out real warnings.
  function info(id, ...args) {
    const msg = render(id, args);
    console.info(`[JLib]`, msg === null ? `(unregistered info id "${id}")` : msg);
  }

  function explain(id) {
    return registry[id] ? registry[id].explain || null : null;
  }

  return { register, warn, info, explain };
})();

// Every message JLib can currently emit, registered once, in one place —
// this list IS the catalog "no documentation for what a warning means"
// was missing. Call sites elsewhere just reference these ids.
JLib.console.register('script.invalidNamespace', {
  template: () => `registerScript() refused — requires a non-empty namespace not starting with "-". This script does not exist as far as JLib is concerned; namespace-scoped features will refuse to operate.`,
  explain: 'A namespace is the one thing every script-scoped feature (Settings Panel, JLib.cache) needs to exist at all. A leading "-" is refused specifically because it would produce an invalid Web Locks name downstream.',
  hint: 'Call JLib.registerScript({ namespace: "yourScriptName" }) with a real, non-empty namespace before anything else.',
});
JLib.console.register('script.duplicate', {
  template: (ns) => `registerScript() refused — a script is already registered under namespace "${ns}". Ignoring the duplicate registration.`,
  explain: 'Only the first registerScript() call for a given process wins, matching every other registration surface in this codebase.',
  hint: 'Call JLib.registerScript() exactly once per script, near the top of your userscript body.',
});
JLib.console.register('namespace.notRegistered', {
  template: () => `composeNamespace() refused — no script registered. Refusing to invent a namespace.`,
  explain: 'Namespace-scoped features (Settings Panel, JLib.cache) have no identity to operate under until a script registers one.',
  hint: 'Call JLib.registerScript({ namespace }) before creating a Settings Panel or using JLib.cache.',
});
JLib.console.register('namespace.invalidSegment', {
  template: (seg) => `composeNamespace() refused — local namespace segment "${seg}" must be a non-empty string not starting with "-".`,
  explain: 'Local segments (e.g. a Settings Panel instance name) get composed against the registered script namespace, and are validated the same way the root namespace is.',
  hint: "Use a plain, non-empty string that doesn't start with a dash.",
});
JLib.console.register('i18n.invalidDictionary', {
  template: () => `registerDictionary() refused — requires { lang, selfName, strings }. Registration failed, this dictionary does not exist.`,
  explain: "All three fields are required for a dictionary to sort correctly in the language picker and resolve lookups at all.",
  hint: 'Provide lang (e.g. "es"), selfName (the language\u2019s own name for itself, e.g. "Espa\u00f1ol"), and a strings object.',
});
JLib.console.register('i18n.duplicateDictionary', {
  template: (lang) => `registerDictionary() — a dictionary for "${lang}" is already registered. Ignoring the duplicate registration.`,
  explain: 'Only the first registration for a given language code is kept, same "registration is existence" rule as everything else.',
});
JLib.console.register('i18n.defaultConflict', {
  template: (a, b) => `Both "${a}" and "${b}" registered as default — denying default status to both and falling back to English.`,
  explain: "A conflict between two dictionaries both claiming default is never resolved by @require load order — English wins unconditionally so behavior stays predictable regardless of which script loaded first.",
  hint: 'Only one dictionary should ever pass isDefault: true. Use JLib.i18n.setDefault(lang) for a deliberate, single choice instead.',
});
JLib.console.register('i18n.unknownLanguage', {
  template: (lang) => `setDefault("${lang}") — no dictionary registered for that language.`,
  hint: 'Register the dictionary with JLib.i18n.registerDictionary() before setting it as default.',
});
JLib.console.register('font.ellipsisTooSmall', {
  template: () => `Container is too small to render even a single ellipsis character — this is a container-sizing issue, not something layout fitting can fix.`,
  explain: "fontProvider.layout tries shrink, then wrap, then truncate — but if a container can't fit a single ellipsis at the minimum legible size, no text-fitting strategy can rescue it.",
  hint: 'Give the container more room, or reconsider whether it needs to hold text at all at this size.',
});
JLib.console.register('theme.invalidRegistration', {
  template: (name) => `registerTheme() refused — requires (name, resolveFn). Registration failed, "${name}" does not exist as a theme.`,
  hint: 'Call JLib.registerTheme(name, (targetEl) => ({ "--jsp-*": value, ... })).',
});
JLib.console.register('theme.duplicate', {
  template: (name) => `registerTheme() — a theme named "${name}" is already registered. Ignoring the duplicate registration.`,
});
JLib.console.register('module.registeredAfterRender', {
  template: (id) => `registerModule("${id}") called after render() — registration is closed, this module will not appear.`,
  explain: "Module count has to be exact by the time render() runs (it decides standalone-shell vs. dashboard-shell), so registration closes the instant it fires.",
  hint: 'Call registerModule() for everything before calling JLib.scheduleRender() / JLib.render().',
});
JLib.console.register('cache.persistFailed', {
  template: (key, err) => `Failed to persist key "${key}" to IndexedDB: ${err}`,
  explain: "The in-memory copy is already correct and usable for the rest of this session — this only means the debounced write to disk didn't land, so the value may not survive a reload.",
});
JLib.console.register('settingsPanel.noScriptRegistered', {
  template: () => `settingsPanel.create() refused to build — no script registered.`,
  hint: 'Call JLib.registerScript({ namespace }) before creating a Settings Panel.',
});
JLib.console.register('storage.watchUnavailable', {
  template: () => `store.watch() has no effect here — GM_addValueChangeListener is unavailable.`,
  explain: 'This usually means @grant GM_addValueChangeListener wasn\u2019t declared, or the script is running under an older userscript manager that doesn\u2019t support it. The store still reads and writes normally; only live cross-tab updates won\u2019t fire.',
  hint: 'Add "// @grant GM_addValueChangeListener" to your userscript header.',
});
JLib.console.register('module.duplicateId', {
  template: (id) => `registerModule() — a module with id "${id}" is already registered. Ignoring the duplicate registration.`,
  explain: 'Module lookups by id always resolve to whichever registered first; a second module sharing that id would silently become unreachable rather than causing a visible error.',
  hint: 'Give each registered module a unique id.',
});
JLib.console.register('notifications.doNotShowAgainNoStore', {
  template: () => `A notification set allowDoNotShowAgain: true, but no store was passed to JLib.notifications.create().`,
  explain: 'Without a store, "do not show again" silently does nothing — it will appear to work for the rest of this session, then reset on the next reload, since there\u2019s nowhere to persist the dismissal.',
  hint: 'Pass { store: JLib.storage.createStore([], { storageKeyPrefix: \u2018yourScript_notif\u2019 }) } to JLib.notifications.create().',
});
JLib.console.register('settingsPanel.duplicateFeatureId', {
  template: (id) => `Two features share the id "${id}". Feature ids must be unique within one settingsPanel.create() call.`,
  explain: 'Feature ids double as the storage key for that setting — two features sharing one id would silently overwrite each other\u2019s saved value.',
  hint: 'Rename one of them.',
});
JLib.console.register('settingsPanel.unknownFeatureType', {
  template: (id, type) => `Feature "${id}" has type "${type}", which isn\u2019t a recognized feature type.`,
  explain: 'An unrecognized type silently falls through to rendering as a boolean toggle, which usually isn\u2019t what was intended and gives no visible indication anything is wrong.',
  hint: 'Use one of: boolean, enum, number, text, action, custom, info. Check for a typo.',
});
JLib.console.register('settingsPanel.danglingCategory', {
  template: (id, category) => `Feature "${id}" references category "${category}", which isn\u2019t in this panel\u2019s categories list.`,
  explain: 'A feature whose category doesn\u2019t exist never renders anywhere — it will never appear, with nothing telling you why.',
  hint: 'Add a category with that id, or fix the typo.',
});
JLib.console.register('settingsPanel.danglingDependency', {
  template: (id, parentId) => `Feature "${id}" depends on "${parentId}", but no feature with that id was found.`,
  explain: 'A dependency check against a feature that doesn\u2019t exist always evaluates false, permanently disabling this feature with no visible explanation.',
  hint: 'Check for a typo, or that the referenced feature is defined.',
});
JLib.console.register('settingsPanel.emptyEnumOptions', {
  template: (id) => `Feature "${id}" is type "enum" but has no options (or an empty options array).`,
  explain: 'This renders a dropdown with nothing in it — technically working, visibly broken.',
  hint: 'Provide a non-empty options array: [{ value, label }, ...].',
});
JLib.console.register('settingsPanel.undeclaredScope', {
  template: (scopeId) => `getCurrentScope() returned "${scopeId}", which isn\u2019t one of this panel\u2019s declared scopes.`,
  explain: 'Scope label lookups and view rendering both degrade silently when this happens — the panel will appear to work while quietly showing the wrong (or no) scope.',
  hint: 'Make sure getCurrentScope() only ever returns an id that appears in your scopes array.',
});



// ---- from src/services/registration.js ----
// ============================================================================
// services/registration.js
// ============================================================================
/*
 * Registration — the one rule most of the rest of this codebase is built
 * to reflect consistently: if it isn't registered, it doesn't exist. No
 * exceptions, no silent defaults invented on anyone's behalf. A module, a
 * theme, a dictionary, a script itself — any call into a registration-
 * gated system without its prerequisite registered warns and refuses
 * rather than guessing.
 *
 * This file is the one place every registerX function and the state it
 * directly governs actually lives, regardless of which domain (modules,
 * themes, i18n, scripts) that function belongs to conceptually — kept
 * together deliberately so the *pattern* (refuse loudly, name the
 * mistake, point at the fix) is obviously, visibly the same across every
 * one of them, rather than four separate implementations of the same
 * idea drifting apart in four different files over time. Each
 * registration function's own state (module list, theme registry,
 * script registry, dictionary table) stays right next to the function
 * that owns it — this file does NOT centralize that state into one
 * shared shape, since each domain's state has a genuinely different
 * structure (array, keyed object, single slot, keyed object) and no
 * consumer benefits from them being forced into a common one.
 *
 * Depends on: JLib.console (every refusal warns through it — this is
 * why registration+console ship as one combined bundle, not two
 * separately-orderable ones).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ---------------------------------------------------------------------------
// registerScript / composeNamespace
// ---------------------------------------------------------------------------
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
    JLib.console.warn('script.invalidNamespace', config);
    return false;
  }
  if (JLib._scriptRegistry) {
    JLib.console.warn('script.duplicate', JLib._scriptRegistry.namespace);
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
    JLib.console.warn('namespace.notRegistered');
    return null;
  }
  if (localPiece === undefined || localPiece === null || localPiece === '') {
    return JLib._scriptRegistry.namespace;
  }
  if (!_jlibValidNamespaceSegment(localPiece)) {
    JLib.console.warn('namespace.invalidSegment', localPiece);
    return null;
  }
  return JLib._scriptRegistry.namespace + '.' + localPiece;
};

// ---------------------------------------------------------------------------
// registerTheme
// ---------------------------------------------------------------------------
JLib._themeRegistry = JLib._themeRegistry || {};

// registerTheme(name, resolve) — resolve(targetEl) -> { '--jsp-*': value, ... }.
// Re-registering an existing name is refused and warned, same "if it
// fails to register, it doesn't exist" rule used everywhere else.
JLib.registerTheme = function registerTheme(name, resolve) {
  if (!name || typeof resolve !== 'function') {
    JLib.console.warn('theme.invalidRegistration', name);
    return false;
  }
  if (JLib._themeRegistry[name]) {
    JLib.console.warn('theme.duplicate', name);
    return false;
  }
  JLib._themeRegistry[name] = resolve;
  return true;
};

// ---------------------------------------------------------------------------
// registerModule
// ---------------------------------------------------------------------------
JLib._modules = JLib._modules || [];
JLib._rendered = false;

JLib.registerModule = function registerModule(moduleDef) {
  if (!moduleDef || !moduleDef.id) throw new Error('JLib.registerModule requires { id, ... }');
  if (JLib._rendered) {
    JLib.console.warn('module.registeredAfterRender', moduleDef.id);
    return;
  }
  if (JLib._modules.some((m) => m.id === moduleDef.id)) {
    JLib.console.warn('module.duplicateId', moduleDef.id);
    return;
  }
  JLib._modules.push(moduleDef);
};

// ---------------------------------------------------------------------------
// registerDictionary — pre-creates JLib.i18n as a plain object here so the
// function and its state (dictionaries table, current default) live in
// this file like every other registration surface; i18n.js's own IIFE
// merges its remaining methods (setDefault, t, etc.) onto this same
// object rather than redefining it, so the public API
// (JLib.i18n.registerDictionary(...)) is completely unchanged by this
// file split — only where the implementation physically lives moved.
// ---------------------------------------------------------------------------
JLib.i18n = JLib.i18n || {};
JLib._i18nDictionaries = JLib._i18nDictionaries || {}; // lang -> { lang, selfName, strings, isDefault }
JLib._i18nDefaultLang = JLib._i18nDefaultLang || null;

// registerDictionary({ lang, selfName, strings, isDefault? }) — strings:
// { "Plain string": "Translation", "Plain string (qualifier)": "..." }.
// Returns true if registered, false if refused (and warns why).
JLib.i18n.registerDictionary = function registerDictionary(config) {
  config = config || {};
  const dictionaries = JLib._i18nDictionaries;
  if (!config.lang || !config.selfName || !config.strings) {
    JLib.console.warn('i18n.invalidDictionary', config);
    return false;
  }
  if (dictionaries[config.lang]) {
    JLib.console.warn('i18n.duplicateDictionary', config.lang);
    return false;
  }

  dictionaries[config.lang] = {
    lang: config.lang,
    selfName: config.selfName,
    strings: config.strings,
    isDefault: false, // resolved below, never trust the caller's flag directly
  };

  if (config.isDefault) {
    if (JLib._i18nDefaultLang === null) {
      dictionaries[config.lang].isDefault = true;
      JLib._i18nDefaultLang = config.lang;
    } else {
      // Conflict: both the already-default dictionary and this new one
      // wanted default status. Deny BOTH, fall back to English — never
      // resolve on load order.
      JLib.console.warn('i18n.defaultConflict', JLib._i18nDefaultLang, config.lang);
      if (dictionaries[JLib._i18nDefaultLang]) dictionaries[JLib._i18nDefaultLang].isDefault = false;
      dictionaries[config.lang].isDefault = false;
      JLib._i18nDefaultLang = 'en';
      if (dictionaries.en) dictionaries.en.isDefault = true;
    }
  }
  return true;
};
