/*
 * Settings Panel — modules/settings-panel.js
 *
 * create(config) builds TWO sibling module objects from the exact same
 * internal factory (buildVariant) — `full` (includes a "Panel Settings"
 * tab: theme/position/shortcut/about/export-import) and `lite` (excludes
 * it — that UI is exposed via renderChromeSettings for the dashboard's
 * cog instead). They are structurally identical; the only difference is
 * one boolean flag passed into the shared factory. JLib.render() decides
 * which one actually mounts based on final module count — see
 * services.js's `mountInto()`. Neither variant owns its own modal or
 * theme instance anymore; both receive `services.shell` and
 * `services.theme` from whichever shared shell JLib.render() built,
 * whether that's a 1-module shell or a 2+-module dashboard.
 *
 * Depends on: JLib.dom, JLib.storage, JLib.utils, JLib.moduleBase (all
 * services.js), JLib.elements.inputs/tabs/button (elements.js)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.modules = JLib.modules || {};

JLib.modules.settingsPanel = (function () {
  const { el } = JLib.dom;
  const { toggleRow, dropdownRow, numberRow, textRow, actionRow, makeKeyboardActivatable } = JLib.elements.inputs;
  const { button } = JLib.elements.button;

  function resolveDependsOn(feature) {
    if (feature.dependsOn) return feature.dependsOn;
    if (feature.parent) return (s) => !!s[feature.parent];
    return null;
  }
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

  // ---------- shared factory ----------
  // variantOpts.includeChromeTab: true for `full`, false for `lite`.
  // Both variants call this same function — see create() at the bottom.
  function buildVariant(config, variantOpts) {
    const namespace = config.namespace;
    const title = config.title || namespace;
    const categories = config.categories || [];
    const allFeatures = config.features || [];
    const storableFeatures = allFeatures.filter((f) => f.type !== 'action');
    const scopes = config.scopes || null;
    const multiScope = !!(scopes && scopes.length > 1);
    const getCurrentScope = config.getCurrentScope || (() => (scopes && scopes[0] ? scopes[0].id : undefined));
    const extraSections = config.extraSections || [];
    const onFeatureChange = config.onFeatureChange || null;

    const uiConf = config.ui || {};
    const keyboardShortcutDefault = uiConf.keyboardShortcutDefault || 'Ctrl+Shift+S';
    const panelPositionDefault = uiConf.panelPositionDefault || 'center';

    const featureStore = JLib.storage.createStore(storableFeatures, { storageKeyPrefix: namespace + '_settings', migrate: config.migrate });
    const uiStore = JLib.storage.createStore(
      [
        { id: 'panelPosition', default: panelPositionDefault },
        { id: 'showAnimations', default: true },
        { id: 'keyboardShortcut', default: keyboardShortcutDefault },
      ],
      { storageKeyPrefix: namespace + '_panelUi' }
    );
    let uiSettings = uiStore.load();
    const liveSettingsCache = {};

    // ---------- deep-link index ----------
    // Flat model (categories are the only grouping level in this data
    // shape) — idIndex maps featureId -> { feature, categoryId }.
    const idIndex = {};
    allFeatures.forEach((f) => {
      idIndex[f.id] = { feature: f, categoryId: f.category };
    });

    function scopeLabel(scopeId) {
      if (!scopes) return '';
      const found = scopes.find((s) => s.id === scopeId);
      return found ? found.label : scopeId;
    }
    function isLiveScope(scopeId) {
      return scopeId === getCurrentScope();
    }
    function loadScopeSettings(scopeId) {
      const raw = featureStore.load(scopeId);
      enforceDependsOn(raw, scopeId);
      return raw;
    }
    function saveScopeSettings(scopeId, obj) {
      featureStore.save(scopeId, obj);
    }
    function enforceDependsOn(settingsObj, scopeId) {
      const maxPasses = storableFeatures.length || 1;
      for (let pass = 0; pass < maxPasses; pass++) {
        let changed = false;
        storableFeatures.forEach((f) => {
          if (f.type !== 'boolean') return;
          if (!featureStore.appliesTo(f, scopeId)) return;
          const dep = resolveDependsOn(f);
          if (dep && !dep(settingsObj) && settingsObj[f.id] !== false) {
            settingsObj[f.id] = false;
            changed = true;
          }
        });
        if (!changed) break;
      }
    }
    function getLiveSettings() {
      const scope = getCurrentScope();
      if (!liveSettingsCache[scope]) liveSettingsCache[scope] = loadScopeSettings(scope);
      return liveSettingsCache[scope];
    }

    // ---------- feature row dispatch ----------
    function buildFeatureRow(feature, scopeId, settingsObj, rerender) {
      const applies = featureStore.appliesTo(feature, scopeId);
      const dep = resolveDependsOn(feature);
      const depOk = !dep || dep(settingsObj);
      const interactive = applies && depOk;
      const labelSuffix = !applies ? ' (not available)' : '';
      const ctx = { scope: scopeId, isLive: isLiveScope(scopeId), settings: settingsObj };

      function commit(newValue) {
        settingsObj[feature.id] = newValue;
        saveScopeSettings(scopeId, settingsObj);
        enforceDependsOn(settingsObj, scopeId);
        if (feature.onChange) feature.onChange(newValue, settingsObj, ctx);
        if (onFeatureChange) onFeatureChange(feature.id, newValue, scopeId, ctx);
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
    }

    // ---------- navigation state ----------
    // Positional (breadcrumb reflects exactly what's in this state, same
    // shape regardless of how you arrived) PLUS a separate linear history
    // stack for the Back button, which restores a full prior snapshot
    // (view + expanded categories + scroll) rather than walking up a tree.
    let activeView = null; // 'scope:<id>' | 'panelSettings' | 'extra:<id>'
    let expandedCategories = null; // Set
    const history = []; // [{ activeView, expandedCategories: [...], scrollTop }]
    const MAX_HISTORY = 50;

    function categoriesForScope(scopeId) {
      return categories.filter((cat) => allFeatures.some((f) => f.category === cat.id && featureStore.appliesTo(f, scopeId)));
    }
    function snapshotState(scrollTop) {
      return { activeView, expandedCategories: expandedCategories ? Array.from(expandedCategories) : null, scrollTop: scrollTop || 0 };
    }
    function pushHistory(scrollTop) {
      history.push(snapshotState(scrollTop));
      if (history.length > MAX_HISTORY) history.shift();
    }

    // ---------- deep links ----------
    // buildLink({scope, category, feature}) -> query-string-shaped token
    // a caller can stash in a URL hash, GM_setValue, wherever. Doesn't
    // touch the actual browser URL itself — that's the caller's choice.
    function buildLink(opts) {
      opts = opts || {};
      const params = new URLSearchParams();
      if (opts.scope !== undefined) params.set('scope', opts.scope);
      if (opts.category) params.set('category', opts.category);
      if (opts.feature) params.set('feature', opts.feature);
      return params.toString();
    }
    function parseLink(linkStr) {
      const params = new URLSearchParams(linkStr);
      const out = {};
      if (params.has('scope')) out.scope = params.get('scope');
      if (params.has('category')) out.category = params.get('category');
      if (params.has('feature')) out.feature = params.get('feature');
      return out;
    }

    // ---------- render (populated once mount() runs, see below) ----------
    let renderTabs, renderContent, applyChrome, contentEl, sidebarEl;
    let currentPublicApi = null;

    function navigateTo(opts, rerenderAll) {
      pushHistory(contentEl ? contentEl.scrollTop : 0);
      const scopeId = opts.scope !== undefined ? opts.scope : getCurrentScope();
      activeView = multiScope ? 'scope:' + scopeId : 'scope:__default__';
      expandedCategories = null;

      let targetCategory = opts.category;
      if (!targetCategory && opts.feature && idIndex[opts.feature]) targetCategory = idIndex[opts.feature].categoryId;

      rerenderAll();

      if (targetCategory) {
        if (!expandedCategories) expandedCategories = new Set(categoriesForScope(scopeId).map((c) => c.id));
        expandedCategories.add(targetCategory);
        renderContent();
      }
      if (opts.feature) {
        requestAnimationFrame(() => {
          const row = contentEl && contentEl.querySelector('[data-feature-id="' + opts.feature + '"]');
          if (row) {
            row.scrollIntoView({ block: 'center' });
            row.classList.add('jlib-hl-flash');
            setTimeout(() => row.classList.remove('jlib-hl-flash'), 1600);
          }
        });
      }
    }

    function goBack(rerenderAll) {
      const prev = history.pop();
      if (!prev) return;
      activeView = prev.activeView;
      expandedCategories = prev.expandedCategories ? new Set(prev.expandedCategories) : null;
      rerenderAll();
      requestAnimationFrame(() => {
        if (contentEl) contentEl.scrollTop = prev.scrollTop;
      });
    }

    // ---------- export / import ----------
    function exportAllSettings() {
      const data = { namespace, version: config.exportVersion || 1, exportedAt: new Date().toISOString(), ui: uiSettings, scopes: {} };
      const scopeIds = scopes ? scopes.map((s) => s.id) : [undefined];
      scopeIds.forEach((sid) => {
        data.scopes[sid === undefined ? '__default__' : sid] = loadScopeSettings(sid);
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { attrs: { href: url, download: namespace + '-settings.json', style: 'display:none' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    function importAllSettings(onDone) {
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
            if (data.ui) {
              uiSettings = Object.assign(uiStore.getDefaults(), data.ui);
              uiStore.save(undefined, uiSettings);
            }
            if (data.scopes) {
              for (const key in data.scopes) {
                const sid = key === '__default__' ? undefined : key;
                saveScopeSettings(sid, Object.assign(featureStore.getDefaults(sid), data.scopes[key]));
                if (isLiveScope(sid)) delete liveSettingsCache[sid];
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
    }

    // ---------- chrome settings (theme/position/shortcut/about) ----------
    // Only ever invoked in two places: inline as a tab (full variant) or
    // from the dashboard cog (lite variant, via renderChromeSettings on
    // the module wrapper) — identical function either way.
    function renderChromeSettings(container, services, rerender) {
      while (container.firstChild) container.removeChild(container.firstChild);
      const theme = services.theme;
      const shell = services.shell;

      const themeOptions = [{ value: 'followWebsite', label: 'Follow Website' }, { value: 'system', label: 'System' }].concat(
        Object.keys(theme.themes).map((name) => ({ value: name, label: name.charAt(0).toUpperCase() + name.slice(1) }))
      );
      const positionOptions = [
        { value: 'center', label: 'Center' },
        { value: 'topLeft', label: 'Top Left' },
        { value: 'topRight', label: 'Top Right' },
        { value: 'bottomLeft', label: 'Bottom Left' },
        { value: 'bottomRight', label: 'Bottom Right' },
      ];
      function saveUi() {
        uiStore.save(undefined, uiSettings);
      }

      const themeRow = dropdownRow('Theme', 'Follow Website samples the page and WCAG-corrects the result', themeOptions, theme.getMode(), (v) => {
        theme.setMode(v, shell.panelEl);
        rerender();
      });
      const refreshBtn = button('\u21bb Re-sample site colors', () => theme.forceReExtract(shell.panelEl));
      const animRow = toggleRow('Show Animations', 'Panel transitions and theme crossfade', uiSettings.showAnimations, (v) => {
        uiSettings.showAnimations = v;
        saveUi();
        if (theme.setAnimationsEnabled) theme.setAnimationsEnabled(v);
        rerender();
      });
      const posRow = dropdownRow('Position', 'Where the panel appears on screen', positionOptions, uiSettings.panelPosition, (v) => {
        uiSettings.panelPosition = v;
        saveUi();
        shell.setPosition(v);
        rerender();
      });

      const shortcutDisplay = el('div', { className: 'jlib-shortcut-input', attrs: { tabindex: '0', role: 'button' } }, [uiSettings.keyboardShortcut || '(none)']);
      shortcutDisplay.addEventListener('click', () => {
        shortcutDisplay.textContent = 'Press keys...';
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) !== -1) return;
          if (e.key === 'Escape') {
            shortcutDisplay.textContent = uiSettings.keyboardShortcut || '(none)';
            document.removeEventListener('keydown', onKey, true);
            return;
          }
          const combo = formatShortcutFromEvent(e);
          uiSettings.keyboardShortcut = combo;
          saveUi();
          shell.setKeyboardShortcut(combo);
          shortcutDisplay.textContent = combo;
          document.removeEventListener('keydown', onKey, true);
        };
        document.addEventListener('keydown', onKey, true);
      });
      makeKeyboardActivatable(shortcutDisplay);

      const exportBtn = button('\u2b07 Export All Settings', exportAllSettings);
      const importBtn = button('\u2b06 Import Settings', () => importAllSettings(rerender));
      const resetBtn = button('\u21ba Reset Panel Settings to Default', () => {
        if (!confirm('Reset panel settings to default?')) return;
        uiSettings = uiStore.getDefaults();
        saveUi();
        shell.setPosition(uiSettings.panelPosition);
        shell.setKeyboardShortcut(uiSettings.keyboardShortcut);
        rerender();
      });

      const aboutBlock = config.about ? el('div', { className: 'jlib-about' }, []) : null;
      if (aboutBlock && config.about) config.about(aboutBlock);

      container.appendChild(
        el(
          'div',
          {},
          [
            el('div', { className: 'jlib-category' }, [el('div', { className: 'jlib-cat-header' }, [el('span', {}, ['\ud83c\udfa8 Appearance'])]), el('div', { className: 'jlib-cat-body' }, [themeRow, refreshBtn, animRow])]),
            el('div', { className: 'jlib-category' }, [el('div', { className: 'jlib-cat-header' }, [el('span', {}, ['\ud83e\udded Behavior'])]), el('div', { className: 'jlib-cat-body' }, [posRow])]),
            el('div', { className: 'jlib-category' }, [
              el('div', { className: 'jlib-cat-header' }, [el('span', {}, ['\u2328\ufe0f Shortcut'])]),
              el('div', { className: 'jlib-cat-body' }, [el('div', { className: 'jlib-row' }, [el('div', { className: 'jlib-row-info' }, [el('div', { className: 'jlib-row-label' }, ['Keyboard Shortcut'])]), shortcutDisplay])]),
            ]),
            el('div', { className: 'jlib-category' }, [el('div', { className: 'jlib-cat-header' }, [el('span', {}, ['\ud83d\udcbe Backup'])]), el('div', { className: 'jlib-cat-body' }, [el('div', { className: 'jlib-about-buttons' }, [exportBtn, importBtn])])]),
          ].concat(aboutBlock ? [el('div', { className: 'jlib-category' }, [el('div', { className: 'jlib-cat-header' }, [el('span', {}, ['\u2139\ufe0f About'])]), el('div', { className: 'jlib-cat-body' }, [aboutBlock])])] : [])
            .concat([resetBtn])
        )
      );
    }

    // ---------- mount (uniform — no dashboardMode branching left) ----------
    function mount(container, services) {
      const view = JLib.moduleBase.makeView(container);
      const bodyWrap = el('div', { className: 'jlib-body' });
      const sidebar = el('div', { className: 'jlib-sidebar' });
      const content = el('div', { className: 'jlib-content' });
      bodyWrap.appendChild(sidebar);
      bodyWrap.appendChild(content);
      container.appendChild(bodyWrap);
      sidebarEl = sidebar;
      contentEl = content;

      if (!activeView) activeView = multiScope ? 'scope:' + getCurrentScope() : 'scope:__default__';

      renderTabs = function () {
        const items = [];
        if (multiScope) {
          scopes.forEach((s) => {
            const badge = s.id === getCurrentScope() ? el('span', { className: 'jlib-current-badge' }, ['\u25cf']) : null;
            items.push({ id: 'scope:' + s.id, label: s.label, badge, groupLabel: uiConf.scopesLabel || 'Scopes' });
          });
        }
        if (variantOpts.includeChromeTab) items.push({ id: 'panelSettings', label: 'Panel Settings', groupLabel: 'Settings' });
        extraSections.forEach((sec) => items.push({ id: 'extra:' + sec.id, label: sec.label, groupLabel: 'Settings' }));
        JLib.elements.tabs.render(sidebar, items, activeView, (id) => {
          pushHistory(content.scrollTop);
          activeView = id;
          expandedCategories = null;
          renderTabs();
          renderContent();
        });
      };

      function renderBreadcrumb() {
        const crumbs = [];
        if (activeView.indexOf('scope:') === 0) {
          const scopeId = activeView.slice(6);
          crumbs.push(multiScope ? scopeLabel(scopeId === '__default__' ? undefined : scopeId) : title);
        } else if (activeView === 'panelSettings') {
          crumbs.push('Panel Settings');
        } else if (activeView.indexOf('extra:') === 0) {
          const sec = extraSections.find((s) => 'extra:' + s.id === activeView);
          crumbs.push(sec ? sec.label : '');
        }
        const backBtn = button('\u2190 Back', () => goBack(() => {
          renderTabs();
          renderContent();
        }), { disabled: history.length === 0, variant: 'ghost' });
        return el('div', { className: 'jlib-breadcrumb' }, [backBtn, el('span', {}, [crumbs.join(' \u203a ')])]);
      }

      function renderScopeView(scopeId) {
        if (expandedCategories === null) expandedCategories = new Set(categoriesForScope(scopeId).map((c) => c.id));
        const settingsObj = isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId);
        const headerChildren = [el('h2', {}, [(scopes ? scopeLabel(scopeId) : title) + ' Settings'])];
        if (scopes) headerChildren.push(el('span', { className: 'jlib-scope-badge' }, [scopeLabel(scopeId)]));
        const children = [el('div', { className: 'jlib-content-header' }, headerChildren)];

        if (scopes && !isLiveScope(scopeId)) {
          children.push(el('div', { className: 'jlib-remote-note' }, [`You're viewing ${scopeLabel(scopeId)}'s settings from elsewhere. Changes save now and take effect next time it's active.`]));
        }

        categoriesForScope(scopeId).forEach((cat) => {
          const expanded = expandedCategories.has(cat.id);
          const header = el('div', { className: 'jlib-cat-header', attrs: { tabindex: '0', role: 'button' } }, [
            el('span', { className: 'jlib-cat-arrow' }, [expanded ? '\u25be' : '\u25b8']),
            el('span', {}, [(cat.icon ? cat.icon + ' ' : '') + cat.label]),
          ]);
          header.addEventListener('click', () => {
            if (expanded) expandedCategories.delete(cat.id);
            else expandedCategories.add(cat.id);
            renderContent();
          });
          makeKeyboardActivatable(header);
          const rows = expanded
            ? allFeatures.filter((f) => f.category === cat.id && featureStore.appliesTo(f, scopeId)).map((f) => buildFeatureRow(f, scopeId, settingsObj, renderContent))
            : [];
          children.push(el('div', { className: 'jlib-category' }, [header, el('div', { className: 'jlib-cat-body' }, rows)]));
        });

        const resetBtn = button(`\u21ba Reset ${scopes ? scopeLabel(scopeId) : title} to Default`, () => {
          if (!confirm(`Reset ${scopes ? scopeLabel(scopeId) : title} settings to default?`)) return;
          const defaults = featureStore.getDefaults(scopeId);
          saveScopeSettings(scopeId, defaults);
          if (isLiveScope(scopeId)) delete liveSettingsCache[scopeId];
          renderContent();
        });
        children.push(resetBtn);
        return el('div', {}, children);
      }

      renderContent = function () {
        const scrollTop = content.scrollTop;
        while (content.firstChild) content.removeChild(content.firstChild);
        content.appendChild(renderBreadcrumb());

        let view;
        if (activeView === 'panelSettings') {
          view = el('div', {}, [el('div', { className: 'jlib-content-header' }, [el('h2', {}, ['Panel Settings'])])]);
          renderChromeSettings(view, services, () => {
            applyChrome();
            renderContent();
          });
        } else if (activeView.indexOf('extra:') === 0) {
          const sec = extraSections.find((s) => 'extra:' + s.id === activeView);
          view = sec ? sec.render({ panel: publicApi }) : el('div', {}, ['Not found']);
        } else {
          const scopeId = activeView.indexOf('scope:') === 0 ? activeView.slice(6) : getCurrentScope();
          view = renderScopeView(scopeId === '__default__' ? undefined : scopeId);
        }
        content.appendChild(view);
        content.scrollTop = scrollTop;
      };

      applyChrome = function () {
        if (services.shell) services.shell.setPosition(uiSettings.panelPosition);
      };

      const publicApi = {
        getSettings: (scopeId) => (scopeId === undefined || isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId)),
        setSettings: (scopeId, obj) => {
          saveScopeSettings(scopeId, obj);
          if (isLiveScope(scopeId)) delete liveSettingsCache[scopeId];
        },
        invalidateCache: (scopeId) => {
          delete liveSettingsCache[scopeId === undefined ? getCurrentScope() : scopeId];
        },
        buildLink,
        parseLink,
        openLink: (linkStr) => navigateTo(parseLink(linkStr), () => {
          renderTabs();
        }),
        navigateTo: (opts) => navigateTo(opts, () => {
          renderTabs();
        }),
      };
      currentPublicApi = publicApi;

      applyChrome();
      renderTabs();
      renderContent();
    }

    function unmount() {
      // Nothing owned to tear down anymore — no modal, no theme instance,
      // no watchers. The shared shell (services.js render()) owns all of
      // that lifecycle now.
    }

    return {
      variantOpts,
      mount,
      unmount,
      renderChromeSettings,
      getShellConfig: () => ({ title, position: uiSettings.panelPosition, keyboardShortcut: uiSettings.keyboardShortcut }),
      get api() {
        return currentPublicApi;
      },
    };
  }

  // ---------- public factory: builds the two true siblings ----------
  function create(config) {
    if (!config || !config.namespace) throw new Error('JLib.modules.settingsPanel.create requires config.namespace');

    const full = buildVariant(config, { includeChromeTab: true });
    const lite = buildVariant(config, { includeChromeTab: false });

    return {
      id: 'settings',
      label: config.title || config.namespace,
      order: 0,
      mount: lite.mount,
      unmount: lite.unmount,
      standaloneVariant: full,
      dashboardVariant: lite,
      // Cog calls this with (container, services) only — wrap with a
      // self-referencing rerender since renderChromeSettings itself
      // expects (container, services, rerender).
      renderChromeSettings: (container, services) => {
        const rerender = () => full.renderChromeSettings(container, services, rerender);
        rerender();
      },
      getShellConfig: full.getShellConfig,
      get api() {
        return full.api || lite.api;
      },
    };
  }

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
    .jlib-about-buttons { display:flex; gap:10px; }
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

  return { create };
})();
