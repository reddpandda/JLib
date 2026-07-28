// ============================================================================
// modules/settings-panel/validator.js
// ============================================================================
/*
 * Settings Panel's own wrong-door validation — bounded strictly to config
 * an author's own code directly supplies to settingsPanel.create(). Each
 * check is a real, confirmed silent-misbehavior path: without these, a
 * typo or a mistake here doesn't error, it just quietly produces broken-
 * but-not-obviously-broken output (a permanently invisible feature, a
 * dependency check that always evaluates false, two rows silently
 * overwriting the same storage key).
 *
 * Calls JLib.console.warn(...) directly for each check rather than
 * through a separate generic validator registry — no second consumer
 * currently exists that would justify building one (evidence before
 * infrastructure). If a second, similarly-shaped config-validation need
 * shows up elsewhere, extracting a shared "register a check, run it"
 * mechanism at that point would be the right call, not before.
 *
 * Depends on: JLib.console
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib._sp = JLib._sp || {};

JLib._sp.validateConfig = function validateConfig(categories, allFeatures, scopes, getCurrentScope) {
  const VALID_FEATURE_TYPES = new Set(['boolean', 'enum', 'number', 'text', 'action', 'custom', 'info']);
  const categoryIds = new Set(categories.map((c) => c.id));
  const featureIds = new Set();
  allFeatures.forEach((f) => {
    if (featureIds.has(f.id)) {
      JLib.console.warn('settingsPanel.duplicateFeatureId', f.id);
    }
    featureIds.add(f.id);

    if (!VALID_FEATURE_TYPES.has(f.type || 'boolean')) {
      JLib.console.warn('settingsPanel.unknownFeatureType', f.id, f.type);
    }

    if (f.category && !categoryIds.has(f.category)) {
      JLib.console.warn('settingsPanel.danglingCategory', f.id, f.category);
    }

    const depParent = f.parent || (typeof f.dependsOn === 'string' ? f.dependsOn : null);
    if (depParent && !allFeatures.some((other) => other.id === depParent)) {
      JLib.console.warn('settingsPanel.danglingDependency', f.id, depParent);
    }

    if (f.type === 'enum' && (!f.options || f.options.length === 0)) {
      JLib.console.warn('settingsPanel.emptyEnumOptions', f.id);
    }
  });

  if (scopes) {
    const declaredScopeIds = new Set(scopes.map((s) => s.id));
    const initial = getCurrentScope();
    if (initial !== undefined && !declaredScopeIds.has(initial)) {
      JLib.console.warn('settingsPanel.undeclaredScope', initial);
    }
  }
};
