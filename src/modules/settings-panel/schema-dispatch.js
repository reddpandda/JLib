// ============================================================================
// modules/settings-panel/schema-dispatch.js
// ============================================================================
/*
 * Feature-type dispatch — given a feature definition, the current scope,
 * and the live settings object, render the right row (boolean/enum/
 * number/text/action/custom). Was a function nested inside buildVariant's
 * closure; converted to a standalone function taking S (the per-instance
 * state object every settings-panel.js file now shares) explicitly,
 * since concatenation across files can only combine top-level code, not
 * inject one file's content into the middle of another file's function
 * body — see the design discussion this refactor came out of.
 *
 * Depends on: JLib.dom, JLib.elements.inputs
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib._sp = JLib._sp || {};

JLib._sp.resolveDependsOn = function resolveDependsOn(feature) {
  if (feature.dependsOn) return feature.dependsOn;
  if (feature.parent) return (s) => !!s[feature.parent];
  return null;
};

// buildFeatureRow(S, feature, scopeId, settingsObj, rerender) -> HTMLElement
JLib._sp.buildFeatureRow = function buildFeatureRow(S, feature, scopeId, settingsObj, rerender) {
  const { el } = JLib.dom;
  const { toggleRow, dropdownRow, numberRow, textRow, actionRow } = JLib.elements.inputs;
  const resolveDependsOn = JLib._sp.resolveDependsOn;

  const applies = S.featureStore.appliesTo(feature, scopeId);
  const dep = resolveDependsOn(feature);
  const depOk = !dep || dep(settingsObj);
  const interactive = applies && depOk;
  const labelSuffix = !applies ? ' (not available)' : '';
  const ctx = {
    scope: scopeId,
    isLive: JLib._sp.isLiveScope(S, scopeId),
    settings: settingsObj,
    // Narrow, one-directional channel for an author who wants one
    // central stylesheet instead of a <style> tag co-located with their
    // own content (which already works unmodified, no shadow-DOM
    // awareness needed — this is purely a convenience for a different
    // authoring preference, never exposes the real root reference).
    addStyle: (cssText) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      JLib.shadow.adoptStylesheet(sheet, JLib.shadow.getRoot());
    },
  };

  function commit(newValue) {
    settingsObj[feature.id] = newValue;
    JLib._sp.saveScopeSettings(S, scopeId, settingsObj);
    JLib._sp.enforceDependsOn(S, settingsObj, scopeId);
    if (feature.onChange) feature.onChange(newValue, settingsObj, ctx);
    if (S.onFeatureChange) S.onFeatureChange(feature.id, newValue, scopeId, ctx);
    rerender();
  }

  let row;
  switch (feature.type) {
    case 'enum':
      row = dropdownRow(feature.label + labelSuffix, feature.description, feature.options, settingsObj[feature.id], commit, { interactive, child: !!feature.parent });
      break;
    case 'number':
      row = numberRow(feature.label + labelSuffix, feature.description, feature, settingsObj[feature.id], commit, { interactive, child: !!feature.parent });
      break;
    case 'text':
      row = textRow(feature.label + labelSuffix, feature.description, feature, settingsObj[feature.id], commit, { interactive, child: !!feature.parent });
      break;
    case 'action':
      row = actionRow(feature.label + labelSuffix, feature.description, () => feature.onClick(ctx), { interactive, buttonLabel: feature.buttonLabel });
      break;
    case 'custom':
      row = el('div', { className: 'jlib-row jlib-row-custom' + (!interactive ? ' jlib-row-disabled' : '') }, [feature.render(settingsObj[feature.id], commit, ctx)]);
      break;
    case 'boolean':
    default:
      row = toggleRow(feature.label + labelSuffix, feature.description, applies && !!settingsObj[feature.id], commit, { interactive, child: !!feature.parent });
  }
  row.dataset.featureId = feature.id;
  return row;
};
