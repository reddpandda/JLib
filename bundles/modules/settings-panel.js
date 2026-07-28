// ---- from src/modules/settings-panel/validator.js ----
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


// ---- from src/modules/settings-panel/schema-dispatch.js ----
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
  const ctx = { scope: scopeId, isLive: JLib._sp.isLiveScope(S, scopeId), settings: settingsObj };

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


// ---- from src/modules/settings-panel/navigation.js ----
// ============================================================================
// modules/settings-panel/navigation.js
// ============================================================================
/*
 * Core panel behavior — deep linking, breadcrumb/history navigation,
 * content rendering, mount/unmount, and buildVariant()/create() tying
 * everything together. This used to be one ~470-line closure
 * (buildVariant, with mount and mount's own inner functions nested
 * three levels deep inside it) living entirely in one file.
 *
 * Refactored so every piece is a real, standalone, top-level function —
 * required because file concatenation can only combine top-level code
 * across files, it cannot inject one file's content into the middle of
 * a function defined in another file. Every function that used to
 * capture buildVariant's local variables via closure now takes an
 * explicit `S` parameter instead — one plain object, created fresh per
 * buildVariant() call, holding everything that used to be a closure
 * local (config-derived values, the feature store, live navigation
 * state, mount-time DOM references). Passing S by reference preserves
 * the exact same mutation semantics closures had — any function that
 * receives S can read or write its properties and every other function
 * sharing that same S sees the change, identical to how closure capture
 * worked before.
 *
 * Depends on: JLib.dom, JLib.storage, JLib.console, JLib.composeNamespace,
 * JLib.elements.tabs/button/search, JLib._sp.buildFeatureRow (schema-
 * dispatch.js), JLib._sp.validateConfig (validator.js), JLib._sp.JLIB_ABOUT
 * / getSharedChromeModule (chrome-config.js)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib._sp = JLib._sp || {};

const SEARCH_THRESHOLD = 8; // show the search icon only once a scope has more features than this

// ---------- scope/settings helpers ----------
JLib._sp.scopeLabel = function scopeLabel(S, scopeId) {
  if (!S.scopes) return '';
  const found = S.scopes.find((s) => s.id === scopeId);
  return found ? found.label : scopeId;
};
JLib._sp.isLiveScope = function isLiveScope(S, scopeId) {
  return scopeId === S.getCurrentScope();
};
JLib._sp.loadScopeSettings = function loadScopeSettings(S, scopeId) {
  const raw = S.featureStore.load(scopeId);
  JLib._sp.enforceDependsOn(S, raw, scopeId);
  return raw;
};
JLib._sp.saveScopeSettings = function saveScopeSettings(S, scopeId, obj) {
  S.featureStore.save(scopeId, obj);
};
JLib._sp.enforceDependsOn = function enforceDependsOn(S, settingsObj, scopeId) {
  const resolveDependsOn = JLib._sp.resolveDependsOn;
  const maxPasses = S.storableFeatures.length || 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    S.storableFeatures.forEach((f) => {
      if (f.type !== 'boolean') return;
      if (!S.featureStore.appliesTo(f, scopeId)) return;
      const dep = resolveDependsOn(f);
      if (dep && !dep(settingsObj) && settingsObj[f.id] !== false) {
        settingsObj[f.id] = false;
        changed = true;
      }
    });
    if (!changed) break;
  }
};
JLib._sp.getLiveSettings = function getLiveSettings(S) {
  const scope = S.getCurrentScope();
  if (!S.liveSettingsCache[scope]) S.liveSettingsCache[scope] = JLib._sp.loadScopeSettings(S, scope);
  return S.liveSettingsCache[scope];
};
JLib._sp.categoriesForScope = function categoriesForScope(S, scopeId) {
  return S.categories.filter((cat) => S.allFeatures.some((f) => f.category === cat.id && f.type !== 'info' && S.featureStore.appliesTo(f, scopeId)));
};
JLib._sp.featuresForScope = function featuresForScope(S, scopeId) {
  return S.allFeatures.filter((f) => f.type !== 'info' && S.featureStore.appliesTo(f, scopeId));
};

// ---------- history/state snapshots ----------
JLib._sp.snapshotState = function snapshotState(S, scrollTop) {
  return { activeView: S.activeView, expandedCategories: S.expandedCategories ? Array.from(S.expandedCategories) : null, scrollTop: scrollTop || 0, searchOpen: S.searchOpen, searchQuery: S.searchQuery };
};
JLib._sp.pushHistory = function pushHistory(S, scrollTop) {
  S.history.push(JLib._sp.snapshotState(S, scrollTop));
  if (S.history.length > S.MAX_HISTORY) S.history.shift();
};

// ---------- deep links ----------
JLib._sp.buildLink = function buildLink(opts) {
  opts = opts || {};
  const params = new URLSearchParams();
  if (opts.scope !== undefined) params.set('scope', opts.scope);
  if (opts.category) params.set('category', opts.category);
  if (opts.feature) params.set('feature', opts.feature);
  return params.toString();
};
JLib._sp.parseLink = function parseLink(linkStr) {
  const params = new URLSearchParams(linkStr);
  const out = {};
  if (params.has('scope')) out.scope = params.get('scope');
  if (params.has('category')) out.category = params.get('category');
  if (params.has('feature')) out.feature = params.get('feature');
  return out;
};

JLib._sp.navigateTo = function navigateTo(S, opts, rerenderAll) {
  JLib._sp.pushHistory(S, S.contentEl ? S.contentEl.scrollTop : 0);
  const scopeId = opts.scope !== undefined ? opts.scope : S.getCurrentScope();
  S.activeView = S.multiScope ? 'scope:' + scopeId : 'scope:__default__';
  S.expandedCategories = null;
  S.searchOpen = false;
  S.searchQuery = '';

  let targetCategory = opts.category;
  if (!targetCategory && opts.feature && S.idIndex[opts.feature]) targetCategory = S.idIndex[opts.feature].categoryId;

  rerenderAll();

  if (targetCategory) {
    if (!S.expandedCategories) S.expandedCategories = new Set(JLib._sp.categoriesForScope(S, scopeId).map((c) => c.id));
    S.expandedCategories.add(targetCategory);
    S.renderContent();
  }
  if (opts.feature) {
    requestAnimationFrame(() => {
      const row = S.contentEl && S.contentEl.querySelector('[data-feature-id="' + opts.feature + '"]');
      if (row) {
        row.scrollIntoView({ block: 'center' });
        row.classList.add('jlib-hl-flash');
        setTimeout(() => row.classList.remove('jlib-hl-flash'), 1600);
      }
    });
  }
};

JLib._sp.goBack = function goBack(S, rerenderAll) {
  const prev = S.history.pop();
  if (!prev) return;
  S.activeView = prev.activeView;
  S.expandedCategories = prev.expandedCategories ? new Set(prev.expandedCategories) : null;
  S.searchOpen = prev.searchOpen;
  S.searchQuery = prev.searchQuery;
  rerenderAll();
  requestAnimationFrame(() => {
    if (S.contentEl) S.contentEl.scrollTop = prev.scrollTop;
  });
};

// ---------- export / import ----------
JLib._sp.exportAllSettings = function exportAllSettings(S) {
  const { el } = JLib.dom;
  const data = { namespace: S.namespace, version: S.config.exportVersion || 1, exportedAt: new Date().toISOString(), scopes: {} };
  const scopeIds = S.scopes ? S.scopes.map((s) => s.id) : [undefined];
  scopeIds.forEach((sid) => {
    data.scopes[sid === undefined ? '__default__' : sid] = JLib._sp.loadScopeSettings(S, sid);
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { attrs: { href: url, download: S.namespace + '-settings.json', style: 'display:none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
JLib._sp.importAllSettings = function importAllSettings(S, onDone) {
  const { el } = JLib.dom;
  const input = el('input', { attrs: { type: 'file', accept: 'application/json', style: 'display:none' } });
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) {
      input.remove();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.scopes) {
          for (const key in data.scopes) {
            const sid = key === '__default__' ? undefined : key;
            JLib._sp.saveScopeSettings(S, sid, Object.assign(S.featureStore.getDefaults(sid), data.scopes[key]));
            if (JLib._sp.isLiveScope(S, sid)) delete S.liveSettingsCache[sid];
          }
        }
        if (onDone) onDone();
      } catch (e) {
        alert('Import failed: not a valid settings file.');
      }
      input.remove();
    };
    reader.readAsText(file);
  });
  input.click();
};

// ---------- content rendering ----------
JLib._sp.uiConf = function uiConf(S) {
  return S.config.ui || {};
};

JLib._sp.renderBreadcrumb = function renderBreadcrumb(S) {
  const { el } = JLib.dom;
  const { button } = JLib.elements.button;
  const crumbs = [];
  if (S.activeView.indexOf('scope:') === 0) {
    const scopeId = S.activeView.slice(6);
    crumbs.push(S.multiScope ? JLib._sp.scopeLabel(S, scopeId === '__default__' ? undefined : scopeId) : S.title);
  } else if (S.activeView === 'panelSettings') {
    crumbs.push('Panel Settings');
  } else if (S.activeView === 'about') {
    crumbs.push('About');
  } else if (S.activeView.indexOf('info:') === 0) {
    const entry = S.aboutEntries.find((e) => 'info:' + e.id === S.activeView);
    crumbs.push('About', entry ? entry.heading : '');
  } else if (S.activeView.indexOf('extra:') === 0) {
    const sec = S.extraSections.find((s) => 'extra:' + s.id === S.activeView);
    crumbs.push(sec ? sec.label : '');
  }
  const backBtn = button('\u2190 Back', () => JLib._sp.goBack(S, () => {
    S.renderTabs();
    S.renderContent();
  }), { disabled: S.history.length === 0, variant: 'ghost' });
  return el('div', { className: 'jlib-breadcrumb' }, [backBtn, el('span', {}, [crumbs.join(' \u203a ')])]);
};

JLib._sp.renderInfoEntry = function renderInfoEntry(S, entry) {
  const { el } = JLib.dom;
  const { button } = JLib.elements.button;
  const children = [el('div', { className: 'jlib-content-header' }, [el('h2', {}, [entry.heading])]), el('p', { className: 'jlib-info-summary' }, [entry.summary])];
  if (entry.details) {
    children.push(
      button('More Info \u2192', () => {
        JLib._sp.pushHistory(S, S.contentEl.scrollTop);
        S.activeView = 'info:' + entry.id;
        S.renderTabs();
        S.renderContent();
      })
    );
  }
  return el('div', { className: 'jlib-info-block' }, children);
};

JLib._sp.renderAboutView = function renderAboutView(S) {
  const { el } = JLib.dom;
  return el('div', {}, [el('div', { className: 'jlib-content-header' }, [el('h2', {}, ['About'])])].concat(S.aboutEntries.map((e) => JLib._sp.renderInfoEntry(S, e))));
};
JLib._sp.renderInfoDetailView = function renderInfoDetailView(S) {
  const { el } = JLib.dom;
  const entry = S.aboutEntries.find((e) => 'info:' + e.id === S.activeView);
  const wrap = el('div', {}, [el('div', { className: 'jlib-content-header' }, [el('h2', {}, [entry ? entry.heading : 'Not found'])])]);
  if (entry && entry.details) entry.details(wrap);
  return wrap;
};

JLib._sp.renderSearchResults = function renderSearchResults(S, scopeId, query) {
  const { el } = JLib.dom;
  const candidates = JLib._sp.featuresForScope(S, scopeId);
  const matched = JLib.elements.search.search(candidates, query, (f) => [f.label, f.description, (f.keywords || []).join(' ')].join(' '));
  const settingsObj = JLib._sp.isLiveScope(S, scopeId) ? JLib._sp.getLiveSettings(S) : JLib._sp.loadScopeSettings(S, scopeId);
  const rows = matched.map((f) => JLib._sp.buildFeatureRow(S, f, scopeId, settingsObj, S.renderContent));
  return el('div', {}, [
    el('div', { className: 'jlib-content-header' }, [el('h2', {}, ['Search results'])]),
    rows.length ? el('div', {}, rows) : el('div', { className: 'jlib-row-desc' }, ['No matching settings.']),
  ]);
};

JLib._sp.renderScopeView = function renderScopeView(S, scopeId) {
  const { el } = JLib.dom;
  const { button } = JLib.elements.button;
  const { makeKeyboardActivatable } = JLib.elements.inputs;
  const totalFeatures = JLib._sp.featuresForScope(S, scopeId).length;
  const showSearchIcon = totalFeatures > SEARCH_THRESHOLD;

  if (S.expandedCategories === null) S.expandedCategories = new Set(JLib._sp.categoriesForScope(S, scopeId).map((c) => c.id));
  const settingsObj = JLib._sp.isLiveScope(S, scopeId) ? JLib._sp.getLiveSettings(S) : JLib._sp.loadScopeSettings(S, scopeId);
  const headerChildren = [el('h2', {}, [(S.scopes ? JLib._sp.scopeLabel(S, scopeId) : S.title) + ' Settings'])];
  if (S.scopes) headerChildren.push(el('span', { className: 'jlib-scope-badge' }, [JLib._sp.scopeLabel(S, scopeId)]));

  if (showSearchIcon) {
    const searchToggle = button('\ud83d\udd0d', () => {
      S.searchOpen = !S.searchOpen;
      if (!S.searchOpen) S.searchQuery = '';
      S.renderContent();
    }, { className: 'jlib-search-toggle' + (S.searchOpen ? ' active' : '') });
    headerChildren.push(searchToggle);
  }
  const children = [el('div', { className: 'jlib-content-header' }, headerChildren)];

  if (showSearchIcon && S.searchOpen) {
    const searchInput = JLib.elements.search.inputField({
      placeholder: 'Search settings\u2026',
      onQuery: (q) => {
        S.searchQuery = q;
        S.renderContent();
      },
    });
    searchInput.value = S.searchQuery;
    children.push(searchInput);
    if (S.searchQuery.trim()) {
      children.push(JLib._sp.renderSearchResults(S, scopeId, S.searchQuery));
      return el('div', {}, children);
    }
  }

  if (S.scopes && !JLib._sp.isLiveScope(S, scopeId)) {
    children.push(el('div', { className: 'jlib-remote-note' }, [`You're viewing ${JLib._sp.scopeLabel(S, scopeId)}'s settings from elsewhere. Changes save now and take effect next time it's active.`]));
  }

  JLib._sp.categoriesForScope(S, scopeId).forEach((cat) => {
    const expanded = S.expandedCategories.has(cat.id);
    const header = el('div', { className: 'jlib-cat-header', attrs: { tabindex: '0', role: 'button' } }, [
      el('span', { className: 'jlib-cat-arrow' }, [expanded ? '\u25be' : '\u25b8']),
      el('span', {}, [(cat.icon ? cat.icon + ' ' : '') + cat.label]),
    ]);
    header.addEventListener('click', () => {
      if (expanded) S.expandedCategories.delete(cat.id);
      else S.expandedCategories.add(cat.id);
      S.renderContent();
    });
    makeKeyboardActivatable(header);
    const rows = expanded
      ? S.allFeatures.filter((f) => f.category === cat.id && f.type !== 'info' && S.featureStore.appliesTo(f, scopeId)).map((f) => JLib._sp.buildFeatureRow(S, f, scopeId, settingsObj, S.renderContent))
      : [];
    children.push(el('div', { className: 'jlib-category' }, [header, el('div', { className: 'jlib-cat-body' }, rows)]));
  });

  const resetBtn = button(`\u21ba Reset ${S.scopes ? JLib._sp.scopeLabel(S, scopeId) : S.title} to Default`, () => {
    if (!confirm(`Reset ${S.scopes ? JLib._sp.scopeLabel(S, scopeId) : S.title} settings to default?`)) return;
    const defaults = S.featureStore.getDefaults(scopeId);
    JLib._sp.saveScopeSettings(S, scopeId, defaults);
    if (JLib._sp.isLiveScope(S, scopeId)) delete S.liveSettingsCache[scopeId];
    S.renderContent();
  });
  children.push(resetBtn);
  return el('div', {}, children);
};

// ---------- mount ----------
JLib._sp.mount = function mount(S, container, services) {
  const { el } = JLib.dom;
  S.services = services;
  const bodyWrap = el('div', { className: 'jlib-body' });
  const sidebar = el('div', { className: 'jlib-sidebar' });
  const content = el('div', { className: 'jlib-content' });
  bodyWrap.appendChild(sidebar);
  bodyWrap.appendChild(content);
  container.appendChild(bodyWrap);
  S.sidebarEl = sidebar;
  S.contentEl = content;

  if (!S.activeView) S.activeView = S.multiScope ? 'scope:' + S.getCurrentScope() : 'scope:__default__';

  function selectView(id) {
    JLib._sp.pushHistory(S, content.scrollTop);
    S.activeView = id;
    S.expandedCategories = null;
    S.searchOpen = false;
    S.searchQuery = '';
    S.renderTabs();
    S.renderContent();
  }

  S.renderTabs = function () {
    const items = [];
    if (S.multiScope) {
      S.scopes.forEach((s) => {
        const badge = s.id === S.getCurrentScope() ? el('span', { className: 'jlib-current-badge' }, ['\u25cf']) : null;
        items.push({ id: 'scope:' + s.id, label: s.label, badge, groupLabel: JLib._sp.uiConf(S).scopesLabel || 'Scopes' });
      });
    }
    if (S.variantOpts.includeChromeTab) items.push({ id: 'panelSettings', label: 'Panel Settings', groupLabel: 'Settings' });
    S.extraSections.forEach((sec) => items.push({ id: 'extra:' + sec.id, label: sec.label, groupLabel: 'Settings' }));
    if (S.aboutEntries.length) items.push({ id: 'about', label: 'About', groupLabel: 'Settings' });
    JLib.elements.tabs.render(sidebar, items, S.activeView, selectView);
  };

  S.renderContent = function () {
    const scrollTop = content.scrollTop;
    while (content.firstChild) content.removeChild(content.firstChild);
    content.appendChild(JLib._sp.renderBreadcrumb(S));

    let view;
    if (S.activeView === 'panelSettings') {
      view = el('div', { className: 'jlib-nested-chrome' }, []);
      const chromeModule = JLib._sp.getSharedChromeModule(services);
      chromeModule.mount(view, services);
    } else if (S.activeView === 'about') {
      view = JLib._sp.renderAboutView(S);
    } else if (S.activeView.indexOf('info:') === 0) {
      view = JLib._sp.renderInfoDetailView(S);
    } else if (S.activeView.indexOf('extra:') === 0) {
      const sec = S.extraSections.find((s) => 'extra:' + s.id === S.activeView);
      view = sec ? sec.render({ panel: publicApi }) : el('div', {}, ['Not found']);
    } else {
      const scopeId = S.activeView.indexOf('scope:') === 0 ? S.activeView.slice(6) : S.getCurrentScope();
      view = JLib._sp.renderScopeView(S, scopeId === '__default__' ? undefined : scopeId);
    }
    content.appendChild(view);
    content.scrollTop = scrollTop;
  };

  S.applyChrome = function () {};

  const publicApi = {
    getSettings: (scopeId) => (scopeId === undefined || JLib._sp.isLiveScope(S, scopeId) ? JLib._sp.getLiveSettings(S) : JLib._sp.loadScopeSettings(S, scopeId)),
    setSettings: (scopeId, obj) => {
      JLib._sp.saveScopeSettings(S, scopeId, obj);
      if (JLib._sp.isLiveScope(S, scopeId)) delete S.liveSettingsCache[scopeId];
    },
    invalidateCache: (scopeId) => {
      delete S.liveSettingsCache[scopeId === undefined ? S.getCurrentScope() : scopeId];
    },
    buildLink: JLib._sp.buildLink,
    parseLink: JLib._sp.parseLink,
    openLink: (linkStr) => JLib._sp.navigateTo(S, JLib._sp.parseLink(linkStr), () => {
      S.renderTabs();
    }),
    navigateTo: (opts) => JLib._sp.navigateTo(S, opts, () => {
      S.renderTabs();
    }),
    showPanelSettings: () => selectView('panelSettings'),
  };
  S.currentPublicApi = publicApi;

  S.applyChrome();
  S.renderTabs();
  S.renderContent();

  // Live cross-tab sync — the actual fix for settings (including
  // theme/position/animations, now just regular schema features)
  // silently going stale in an already-open tab when changed
  // elsewhere. invalidateCache() ensures the next render reads the
  // fresh value load() just gave us, not a memoized stale one.
  S.unwatchFeatureStore = S.featureStore.watch(S.getCurrentScope(), () => {
    if (JLib._sp.isLiveScope(S, S.getCurrentScope())) delete S.liveSettingsCache[S.getCurrentScope()];
    S.renderContent();
  });
};

JLib._sp.unmount = function unmount(S) {
  if (S.unwatchFeatureStore) {
    S.unwatchFeatureStore();
    S.unwatchFeatureStore = null;
  }
};

// ---------- buildVariant — constructs S, wires everything together ----------
JLib._sp.buildVariant = function buildVariant(config, variantOpts) {
  variantOpts = variantOpts || {};
  // config.namespace is now the LOCAL piece of the identity — the full
  // storage/lock/channel identity is composed against whatever script
  // registered via JLib.registerScript(). Refuses (same as every other
  // registration-gated feature) if no script has registered.
  const namespace = JLib.composeNamespace(config.namespace);
  if (!namespace) {
    JLib.console.warn('settingsPanel.noScriptRegistered');
    return null;
  }

  const S = {}; // per-instance state, replaces every former closure local
  S.config = config;
  S.variantOpts = variantOpts;
  S.namespace = namespace;
  S.title = config.title || config.namespace;
  S.categories = config.categories || [];
  S.allFeatures = config.features || [];
  S.storableFeatures = S.allFeatures.filter((f) => f.type !== 'action' && f.type !== 'info');
  S.scopes = config.scopes || null;
  S.multiScope = !!(S.scopes && S.scopes.length > 1);
  S.getCurrentScope = config.getCurrentScope || (() => (S.scopes && S.scopes[0] ? S.scopes[0].id : undefined));
  S.extraSections = config.extraSections || [];
  S.onFeatureChange = config.onFeatureChange || null;

  JLib._sp.validateConfig(S.categories, S.allFeatures, S.scopes, S.getCurrentScope);

  S.featureStore = JLib.storage.createStore(S.storableFeatures, { storageKeyPrefix: namespace + '_settings', migrate: config.migrate });
  S.liveSettingsCache = {};

  // ---------- About entries for this variant ----------
  S.aboutEntries = [];
  if (variantOpts.includeChromeTab && !config.isChromeModule) S.aboutEntries.push({ id: 'jlib', heading: 'About JLib', ...JLib._sp.JLIB_ABOUT });
  if (config.about) S.aboutEntries.push({ id: 'userscript', heading: 'About ' + S.title, ...config.about });
  if (config.isChromeModule) S.aboutEntries.push({ id: 'jlib', heading: 'About JLib', ...JLib._sp.JLIB_ABOUT });

  // ---------- deep-link index ----------
  S.idIndex = {};
  S.allFeatures.forEach((f) => {
    S.idIndex[f.id] = { feature: f, categoryId: f.category };
  });

  S.activeView = null; // 'scope:<id>' | 'panelSettings' | 'extra:<id>' | 'about' | 'info:<id>'
  S.expandedCategories = null;
  S.searchOpen = false;
  S.searchQuery = '';
  S.history = [];
  S.MAX_HISTORY = 50;

  S.renderTabs = null;
  S.renderContent = null;
  S.applyChrome = null;
  S.contentEl = null;
  S.sidebarEl = null;
  S.currentPublicApi = null;
  S.unwatchFeatureStore = null;

  return {
    id: config.moduleId || 'settings',
    label: config.title || config.namespace,
    order: 0,
    mount: (container, services) => JLib._sp.mount(S, container, services),
    unmount: () => JLib._sp.unmount(S),
    exportAllSettings: () => JLib._sp.exportAllSettings(S),
    importAllSettings: (onDone) => JLib._sp.importAllSettings(S, onDone),
    get api() {
      return S.currentPublicApi;
    },
  };
};

// ---------- public factory ----------
JLib._sp.create = function create(config) {
  if (!config || !config.namespace) throw new Error('JLib.modules.settingsPanel.create requires config.namespace');
  const full = JLib._sp.buildVariant(config, { includeChromeTab: true });
  const lite = JLib._sp.buildVariant(config, { includeChromeTab: false });
  if (!full || !lite) {
    // buildVariant already warned why (no script registered). Return a
    // module-shaped object that mounts nothing rather than throwing —
    // registration failures degrade gracefully everywhere else in this
    // codebase, this stays consistent with that.
    return { id: 'settings', label: config.title || config.namespace, order: 0, mount: () => {}, unmount: () => {} };
  }
  return {
    id: 'settings',
    label: config.title || config.namespace,
    order: 0,
    full,
    lite,
    // Default shape (used if something mounts this wrapper directly
    // instead of picking .full/.lite explicitly).
    mount: lite.mount,
    unmount: lite.unmount,
    get api() {
      return full.api || lite.api;
    },
  };
};


// ---- from src/modules/settings-panel/chrome-config.js ----
// ============================================================================
// modules/settings-panel/chrome-config.js
// ============================================================================
/*
 * The shared chrome module — the "Panel Settings" experience (theme/
 * position/animations/shortcut/export-import) expressed as real schema
 * features (enum/boolean/custom/action), not bespoke hand-built rows.
 * One factory, two mount points: nested inline (full's Panel Settings
 * tab, via getSharedChromeModule) and full-screen (the dashboard cog,
 * via services.js). Same namespace either way, so storage is consistent
 * regardless of which one a person actually opened.
 *
 * Also the final assembly point: JLib.modules.settingsPanel itself is
 * built here, from the pieces registered across all four settings-panel
 * files by JLib._sp.* — this file loads last within the module's file
 * set specifically so everything it references already exists.
 *
 * Depends on: JLib.dom, JLib.storage, JLib.i18n, JLib.elements.inputs,
 * JLib._sp.buildVariant / create (navigation.js)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib._sp = JLib._sp || {};
JLib.modules = JLib.modules || {};

(function () {
  const { el } = JLib.dom;
  const { makeKeyboardActivatable } = JLib.elements.inputs;

  // JLib's own About copy — used in `full` (alongside the userscript's
  // own) and in the standalone chrome module the cog opens.
  JLib._sp.JLIB_ABOUT = {
    summary: 'JLib — a shared settings dashboard for userscripts. Everything stored locally, nothing phoned home.',
    details: (container) => {
      container.appendChild(
        el('div', {}, [
          el('p', {}, [
            'JLib is a small toolkit for building Tampermonkey userscript UIs — settings panels, notifications, and the dashboard shell you\u2019re looking at right now. It\u2019s split into three pieces: ',
            el('strong', {}, ['core']),
            ' (the foundational, non-visual plumbing and reusable UI primitives), ',
            el('strong', {}, ['modules']),
            ' (full features like this settings panel), and whatever a userscript author registers on top.',
          ]),
          el('p', {}, [
            'All settings and preferences are stored locally via Tampermonkey\u2019s own storage \u2014 nothing here makes network requests or reports usage anywhere. Open source, MIT licensed.',
          ]),
          el('p', {}, [el('a', { attrs: { href: 'https://github.com/reddpandda/JLib', target: '_blank', rel: 'noopener' } }, ['github.com/reddpandda/JLib'])]),
        ])
      );
    },
  };

  function formatShortcutFromEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) === -1) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    return parts.join('+');
  }

  function buildLanguageOptions() {
    const current = JLib.i18n.getDefaultDictionary();
    const defaultLabel = `${JLib.i18n.t('Default')} (${current.selfName})`;
    const options = [{ value: '__default__', label: defaultLabel }, { value: 'en', label: 'English' }];
    JLib.i18n.listDictionaries().forEach((d) => {
      if (d.lang === 'en') return; // already has its own explicit row above
      options.push({ value: d.lang, label: d.selfName });
    });
    return options;
  }

  function buildChromeConfig(services) {
    const theme = services.theme;
    const shell = services.shell;
    const t = JLib.i18n.t;
    const THEME_DISPLAY_NAMES = {
      dark: 'Dark',
      light: 'Light',
      system: 'System',
      followWebsite: 'Follow Website',
      'smart-dark': 'Smart Dark',
      'smart-light': 'Smart Light',
      smartSystem: 'Smart System',
    };
    const themeOptions = Object.keys(theme.themes).map((name) => ({
      value: name,
      label: t(THEME_DISPLAY_NAMES[name] || name),
    }));
    const positionOptions = [
      { value: 'center', label: t('Center') },
      { value: 'topLeft', label: t('Top Left') },
      { value: 'topRight', label: t('Top Right') },
      { value: 'bottomLeft', label: t('Bottom Left') },
      { value: 'bottomRight', label: t('Bottom Right') },
    ];
    return {
      categories: [
        { id: 'appearance', label: t('Appearance'), icon: '\ud83c\udfa8' },
        { id: 'behavior', label: t('Behavior'), icon: '\ud83e\udded' },
        { id: 'shortcut', label: t('Shortcut'), icon: '\u2328\ufe0f' },
        { id: 'backup', label: t('Backup'), icon: '\ud83d\udcbe' },
      ],
      features: [
        {
          id: 'theme', type: 'enum', category: 'appearance', label: t('Theme'),
          description: 'Follow Website samples the page and WCAG-corrects the result.',
          options: themeOptions, default: 'followWebsite',
          onChange: (v) => theme.setMode(v, shell.panelEl),
        },
        {
          id: 'refreshTheme', type: 'action', category: 'appearance', label: t('Re-sample site colors'),
          description: 'Force a fresh palette extraction from the current page.', buttonLabel: '\u21bb Refresh',
          onClick: () => theme.forceReExtract(shell.panelEl),
        },
        {
          id: 'language', type: 'enum', category: 'appearance', label: t('Language'),
          description: 'Which registered dictionary this panel displays text in.',
          options: buildLanguageOptions(), default: '__default__',
          onChange: (v) => {
            if (v !== '__default__') JLib.i18n.setDefault(v);
          },
        },
        {
          id: 'showAnimations', type: 'boolean', category: 'appearance', label: t('Show Animations'),
          description: 'Panel transitions and theme crossfade.', default: true,
          onChange: (v) => { if (theme.setAnimationsEnabled) theme.setAnimationsEnabled(v); },
        },
        {
          id: 'panelPosition', type: 'enum', category: 'behavior', label: t('Position'),
          description: 'Where the panel appears on screen.', options: positionOptions, default: 'center',
          onChange: (v) => shell.setPosition(v),
        },
        {
          id: 'keyboardShortcut', type: 'custom', category: 'shortcut', label: t('Keyboard Shortcut'),
          description: 'Click, then press a key combination.', default: 'Ctrl+Shift+D',
          render: (value, onChange) => {
            const display = el('div', { className: 'jlib-shortcut-input', attrs: { tabindex: '0', role: 'button' } }, [value || '(none)']);
            display.addEventListener('click', () => {
              display.textContent = 'Press keys\u2026';
              const onKey = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) !== -1) return;
                if (e.key === 'Escape') {
                  display.textContent = value || '(none)';
                  document.removeEventListener('keydown', onKey, true);
                  return;
                }
                const combo = formatShortcutFromEvent(e);
                display.textContent = combo;
                document.removeEventListener('keydown', onKey, true);
                onChange(combo);
              };
              document.addEventListener('keydown', onKey, true);
            });
            makeKeyboardActivatable(display);
            return display;
          },
          onChange: (v) => shell.setKeyboardShortcut(v),
        },
        {
          id: 'exportSettings', type: 'action', category: 'backup', label: 'Export All Settings',
          buttonLabel: '\u2b07 Export', onClick: () => {},
        },
        {
          id: 'importSettings', type: 'action', category: 'backup', label: 'Import Settings',
          buttonLabel: '\u2b06 Import', onClick: () => {},
        },
      ],
    };
  }

  function getChromeShellDefaults() {
    const store = JLib.storage.createStore(
      [
        { id: 'theme', default: 'followWebsite' },
        { id: 'showAnimations', default: true },
        { id: 'panelPosition', default: 'center' },
        { id: 'keyboardShortcut', default: 'Ctrl+Shift+D' },
      ],
      { storageKeyPrefix: 'jlib_shell_chrome_settings' }
    );
    const loaded = store.load();
    return { themeMode: loaded.theme, showAnimations: loaded.showAnimations, position: loaded.panelPosition, keyboardShortcut: loaded.keyboardShortcut };
  }

  let cachedChromeModule = null;
  function getSharedChromeModule(services) {
    if (cachedChromeModule) return cachedChromeModule;
    cachedChromeModule = buildChromeModule(services);
    return cachedChromeModule;
  }
  function buildChromeModule(services) {
    const cfg = buildChromeConfig(services);
    const mod = JLib._sp.buildVariant(
      {
        namespace: 'jlib_shell_chrome',
        title: 'Panel Settings',
        moduleId: '__chromeSettings__',
        categories: cfg.categories,
        features: cfg.features,
        isChromeModule: true,
      },
      { includeChromeTab: false }
    );
    cfg.features.forEach((f) => {
      if (f.id === 'exportSettings') f.onClick = () => mod.exportAllSettings();
      if (f.id === 'importSettings') f.onClick = () => mod.importAllSettings();
    });
    return mod;
  }
  JLib._sp.getSharedChromeModule = getSharedChromeModule;

  const PANEL_CSS = `
    .jlib-body { display:flex; flex:1; min-height:0; overflow:hidden; height:100%; }
    .jlib-sidebar { width:180px; flex-shrink:0; background: var(--jsp-sidebar-bg); border-right:1px solid var(--jsp-border); padding:14px 10px; overflow-y:auto; }
    .jlib-content { flex:1; min-width:0; overflow-y:auto; padding:20px 26px 24px; }
    .jlib-content-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .jlib-content-header h2 { margin:0; font-size:18px; font-weight:600; }
    .jlib-breadcrumb { display:flex; align-items:center; gap:10px; font-size:11px; color: var(--jsp-muted); margin-bottom:10px; }
    .jlib-scope-badge { font-size:10px; font-weight:600; color: var(--jsp-accent); background: var(--jsp-accent-bg); border-radius:4px; padding:2px 7px; }
    .jlib-remote-note { font-size:12px; color: var(--jsp-muted); background: var(--jsp-hover); border-radius:8px; padding:10px 12px; margin-bottom:16px; }
    .jlib-category { margin-bottom:6px; }
    .jlib-cat-header { display:flex; align-items:center; gap:8px; padding:9px 4px; cursor:pointer; font-size:13px; font-weight:600; border-radius:6px; }
    .jlib-cat-header:hover { background: var(--jsp-hover); }
    .jlib-cat-arrow { display:inline-block; width:10px; color: var(--jsp-muted); font-size:11px; }
    .jlib-cat-body { padding:2px 4px 8px 22px; }
    .jlib-current-badge { font-size:9px; color: var(--jsp-accent); }
    .jlib-shortcut-input { background: var(--jsp-hover); border:1px solid var(--jsp-border); border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; min-width:120px; text-align:center; }
    .jlib-search-toggle { border-radius:50%; width:28px; height:28px; padding:0; margin-left:auto; }
    .jlib-search-toggle.active { color: var(--jsp-accent); background: var(--jsp-accent-bg); }
    .jlib-info-block { margin-bottom:18px; }
    .jlib-info-summary { font-size:13px; color: var(--jsp-muted); line-height:1.5; margin: 0 0 10px; }
    .jlib-nested-chrome { margin: -20px -26px -24px; height: calc(100% + 44px); }
    .jlib-hl-flash { animation: jlib-flash 1.6s ease; }
    @keyframes jlib-flash { 0%, 100% { background: transparent; } 15%, 40% { background: var(--jsp-accent-bg); } }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  // ---------- final assembly ----------
  JLib.modules.settingsPanel = {
    create: JLib._sp.create,
    buildChromeModule,
    getSharedChromeModule,
    getChromeShellDefaults,
    JLIB_ABOUT: JLib._sp.JLIB_ABOUT,
  };
})();
