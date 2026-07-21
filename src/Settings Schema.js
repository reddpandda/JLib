/*
 * Settings Schema — schema-driven GM_setValue/GM_getValue settings with
 * per-scope storage, parent/child dependency enforcement, and migration
 * support. Requires @grant GM_setValue / @grant GM_getValue.
 *
 * Generalized directly from an existing, already-shipped userscript's
 * FEATURES array + loadSiteSettings/saveSiteSettings/
 * enforceFeatureDependencies/migrateAutoplaySettings — that pattern had
 * real mileage across three
 * settings-storage bugs already found and fixed (shared-storage-across-
 * sites, parent-gating, stale-key migration), so this ports the shape
 * rather than redesigning it. What's generalized: "site" becomes "scope"
 * (a script with only one context — e.g. a single-site userscript — just
 * never passes one), and the schema itself carries whatever extra fields
 * a given script wants (label, description, category, icon...) — this
 * library only cares about `id`, `default`, `parent`, and `scopes`.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.settingsSchema = (function () {
  // features: [{ id, default, parent?, scopes? }, ...any other fields you
  //   want are carried through untouched for your own UI code to read.
  //   `scopes`, if present, is an array of scope names this feature
  //   applies to — omit it (or leave undefined) for a feature that applies
  //   everywhere. A feature with `parent: 'otherId'` is force-set to
  //   `false` whenever its parent is false (enforceDependencies).
  // options.storageKeyPrefix: required. Storage key is
  //   `${prefix}` with no scope, or `${prefix}_${scope}` with one — same
  //   shape as the source script's `'<name>Settings_' + SITE` pattern.
  // options.migrate: optional `(rawParsedObj) => rawParsedObj`, run on the
  //   raw parsed blob BEFORE the defaults-filtered merge — same ordering
  //   requirement as migrateAutoplaySettings, since the merge only copies
  //   keys that already exist in the current schema's defaults, and a
  //   renamed/retired key won't be one of them by the time the merge runs.
  function createStore(features, options) {
    options = options || {};
    if (!options.storageKeyPrefix) {
      throw new Error('JLib.settingsSchema.createStore requires options.storageKeyPrefix');
    }
    const byId = {};
    features.forEach((f) => {
      byId[f.id] = f;
    });

    function appliesTo(feature, scope) {
      if (!feature.scopes) return true; // no scopes list = applies everywhere
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

    // Mutates settingsObj in place, same as the source's
    // enforceFeatureDependencies — force a child off whenever its parent
    // is off. Doesn't touch anything without a `parent`.
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

    // Flips a boolean setting, rejecting the flip if it's a child whose
    // parent is currently off — mirrors toggleSetting()'s "return
    // false if rejected" contract so callers can log/no-op the same way.
    // Does NOT save — caller decides when (matches the source script's
    // pattern of toggle-then-save-then-side-effects being separate steps
    // the caller sequences, e.g. resumeIfScriptPaused() only running after
    // a successful toggle).
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
