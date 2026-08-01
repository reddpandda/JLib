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
JLib.console.register('shadow.contentInIsolatedContext', {
  template: () => `Content from this script now lives in an isolated context — document.head styles won't reach it.`,
  explain: 'JLib\u2019s own chrome (Settings Panel, notifications) renders inside a closed shadow root, protecting it from — and protecting the host page from — CSS collisions. A stylesheet added to document.head has no effect on anything sealed inside a shadow tree.',
  hint: 'Use a <style> tag as a child of your own content (works unmodified, no shadow-DOM awareness needed), or ctx.addStyle(cssText) if you specifically want one central stylesheet.',
});
JLib.console.register('cache.scriptVersionChanged', {
  template: (from, to) => `This script's version changed since last session (${from} -> ${to}) — JLib.cache.versionChanged is now true.`,
  explain: 'Purely informational — nothing was wiped, migrated, or otherwise touched automatically. Some version bumps change what a cached value means or how it should be shaped; many don\u2019t. This flag exists so an author can decide, rather than JLib guessing and risking a false-positive wipe of good data.',
  hint: 'Check JLib.cache.versionChanged (after awaiting any cache operation) if your script needs to react to its own version changing.',
});
JLib.console.register('triggers.duplicateKey', {
  template: (key) => `JLib.triggers.watch("${key}", ...) refused — a watch is already active under this key. Ignoring the duplicate registration.`,
  explain: 'Only the first watch() call for a given key stays active, same "registration is existence" rule as everything else. Note this only applies while the original watch is still active — a once:true watch that already fired and auto-stopped has already freed its key, so re-registering the same key after that point is not a conflict and will not warn.',
  hint: 'Use a different key, or call the stop() function returned by the original watch() before registering a new one under the same key.',
});
