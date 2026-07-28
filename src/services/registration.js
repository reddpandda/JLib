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
