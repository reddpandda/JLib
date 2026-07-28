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
