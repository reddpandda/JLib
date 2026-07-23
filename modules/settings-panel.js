/*
 * Settings Panel — modules/settings-panel.js
 *
 * Two sibling variants built from one shared factory (buildVariant),
 * restored after a brief detour where there was only one:
 *   - full: used standalone (this module is the only one registered).
 *     One panel — the userscript's own scopes/categories, PLUS a
 *     "Panel Settings" tab (a nested nested chrome-settings module — see
 *     buildChromeModule below — mounted inline instead of full-screen),
 *     PLUS an "About" tab with two info entries: JLib's own and the
 *     userscript's own (config.about), since there's no dashboard to
 *     keep them apart.
 *   - lite: used for the dashboard menu's "Settings" entry. Userscript
 *     settings only, no chrome mixed in, PLUS a trailing "About" tab
 *     with just the userscript's own info entry.
 *
 * The dashboard's cog is neither of these — it opens buildChromeModule's
 * output directly, full-screen, same as any dashboard menu item, but
 * that module is never registered via JLib.registerModule() and doesn't
 * count toward module count. See services.js's cog handler. Both `full`'s
 * Panel Settings tab and the cog mount the *same kind* of chrome module
 * (same namespace, same features) — one nested inline, one full-screen.
 *
 * Doesn't own its own modal or theme instance — receives `services.shell`
 * and `services.theme` from whichever shared shell JLib.render() built.
 *
 * Depends on: JLib.dom, JLib.storage, JLib.utils, JLib.moduleBase (all
 * services.js), JLib.elements.inputs/tabs/button/search (elements.js)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.modules = JLib.modules || {};

JLib.modules.settingsPanel = (function () {
  const { el } = JLib.dom;
  const { toggleRow, dropdownRow, numberRow, textRow, actionRow, makeKeyboardActivatable } = JLib.elements.inputs;
  const { button } = JLib.elements.button;

  // JLib's own About copy — used in `full` (alongside the userscript's
  // own) and in the standalone chrome module the cog opens.
  const JLIB_ABOUT = {
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

  const SEARCH_THRESHOLD = 8; // show the search icon only once a scope has more features than this

  function buildVariant(config, variantOpts) {
    variantOpts = variantOpts || {};
    const namespace = config.namespace;
    const title = config.title || namespace;
    const categories = config.categories || [];
    const allFeatures = config.features || [];
    const storableFeatures = allFeatures.filter((f) => f.type !== 'action' && f.type !== 'info');
    const scopes = config.scopes || null;
    const multiScope = !!(scopes && scopes.length > 1);
    const getCurrentScope = config.getCurrentScope || (() => (scopes && scopes[0] ? scopes[0].id : undefined));
    const extraSections = config.extraSections || [];
    const onFeatureChange = config.onFeatureChange || null;

    const featureStore = JLib.storage.createStore(storableFeatures, { storageKeyPrefix: namespace + '_settings', migrate: config.migrate });
    const liveSettingsCache = {};

    // ---------- About entries for this variant ----------
    // full: JLib's + the userscript's. lite: the userscript's only.
    // Chrome module (built with its own tiny config, see buildChromeModule)
    // passes its own `about` and gets just that one entry.
    const aboutEntries = [];
    if (variantOpts.includeChromeTab && !config.isChromeModule) aboutEntries.push({ id: 'jlib', heading: 'About JLib', ...JLIB_ABOUT });
    if (config.about) aboutEntries.push({ id: 'userscript', heading: 'About ' + title, ...config.about });
    if (config.isChromeModule) aboutEntries.push({ id: 'jlib', heading: 'About JLib', ...JLIB_ABOUT });

    // ---------- deep-link index ----------
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
    let activeView = null; // 'scope:<id>' | 'panelSettings' | 'extra:<id>' | 'about' | 'info:<id>'
    let expandedCategories = null;
    let searchOpen = false;
    let searchQuery = '';
    const history = [];
    const MAX_HISTORY = 50;

    function categoriesForScope(scopeId) {
      return categories.filter((cat) => allFeatures.some((f) => f.category === cat.id && f.type !== 'info' && featureStore.appliesTo(f, scopeId)));
    }
    function featuresForScope(scopeId) {
      return allFeatures.filter((f) => f.type !== 'info' && featureStore.appliesTo(f, scopeId));
    }
    function snapshotState(scrollTop) {
      return { activeView, expandedCategories: expandedCategories ? Array.from(expandedCategories) : null, scrollTop: scrollTop || 0, searchOpen, searchQuery };
    }
    function pushHistory(scrollTop) {
      history.push(snapshotState(scrollTop));
      if (history.length > MAX_HISTORY) history.shift();
    }

    // ---------- deep links ----------
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

    let renderTabs, renderContent, applyChrome, contentEl, sidebarEl;
    let currentPublicApi = null;

    function navigateTo(opts, rerenderAll) {
      pushHistory(contentEl ? contentEl.scrollTop : 0);
      const scopeId = opts.scope !== undefined ? opts.scope : getCurrentScope();
      activeView = multiScope ? 'scope:' + scopeId : 'scope:__default__';
      expandedCategories = null;
      searchOpen = false;
      searchQuery = '';

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
      searchOpen = prev.searchOpen;
      searchQuery = prev.searchQuery;
      rerenderAll();
      requestAnimationFrame(() => {
        if (contentEl) contentEl.scrollTop = prev.scrollTop;
      });
    }

    // ---------- export / import ----------
    function exportAllSettings() {
      const data = { namespace, version: config.exportVersion || 1, exportedAt: new Date().toISOString(), scopes: {} };
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

    // ---------- mount ----------
    function mount(container, services) {
      const bodyWrap = el('div', { className: 'jlib-body' });
      const sidebar = el('div', { className: 'jlib-sidebar' });
      const content = el('div', { className: 'jlib-content' });
      bodyWrap.appendChild(sidebar);
      bodyWrap.appendChild(content);
      container.appendChild(bodyWrap);
      sidebarEl = sidebar;
      contentEl = content;

      if (!activeView) activeView = multiScope ? 'scope:' + getCurrentScope() : 'scope:__default__';

      function selectView(id) {
        pushHistory(content.scrollTop);
        activeView = id;
        expandedCategories = null;
        searchOpen = false;
        searchQuery = '';
        renderTabs();
        renderContent();
      }

      renderTabs = function () {
        const items = [];
        if (multiScope) {
          scopes.forEach((s) => {
            const badge = s.id === getCurrentScope() ? el('span', { className: 'jlib-current-badge' }, ['\u25cf']) : null;
            items.push({ id: 'scope:' + s.id, label: s.label, badge, groupLabel: uiConf().scopesLabel || 'Scopes' });
          });
        }
        if (variantOpts.includeChromeTab) items.push({ id: 'panelSettings', label: 'Panel Settings', groupLabel: 'Settings' });
        extraSections.forEach((sec) => items.push({ id: 'extra:' + sec.id, label: sec.label, groupLabel: 'Settings' }));
        if (aboutEntries.length) items.push({ id: 'about', label: 'About', groupLabel: 'Settings' });
        JLib.elements.tabs.render(sidebar, items, activeView, selectView);
      };
      function uiConf() {
        return config.ui || {};
      }

      function renderBreadcrumb() {
        const crumbs = [];
        if (activeView.indexOf('scope:') === 0) {
          const scopeId = activeView.slice(6);
          crumbs.push(multiScope ? scopeLabel(scopeId === '__default__' ? undefined : scopeId) : title);
        } else if (activeView === 'panelSettings') {
          crumbs.push('Panel Settings');
        } else if (activeView === 'about') {
          crumbs.push('About');
        } else if (activeView.indexOf('info:') === 0) {
          const entry = aboutEntries.find((e) => 'info:' + e.id === activeView);
          crumbs.push('About', entry ? entry.heading : '');
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

      function renderInfoEntry(entry) {
        const children = [el('div', { className: 'jlib-content-header' }, [el('h2', {}, [entry.heading])]), el('p', { className: 'jlib-info-summary' }, [entry.summary])];
        if (entry.details) {
          children.push(
            button('More Info \u2192', () => {
              pushHistory(content.scrollTop);
              activeView = 'info:' + entry.id;
              renderTabs();
              renderContent();
            })
          );
        }
        return el('div', { className: 'jlib-info-block' }, children);
      }

      function renderAboutView() {
        return el('div', {}, [el('div', { className: 'jlib-content-header' }, [el('h2', {}, ['About'])])].concat(aboutEntries.map(renderInfoEntry)));
      }
      function renderInfoDetailView() {
        const entry = aboutEntries.find((e) => 'info:' + e.id === activeView);
        const wrap = el('div', {}, [el('div', { className: 'jlib-content-header' }, [el('h2', {}, [entry ? entry.heading : 'Not found'])])]);
        if (entry && entry.details) entry.details(wrap);
        return wrap;
      }

      function renderSearchResults(scopeId, query) {
        const candidates = featuresForScope(scopeId);
        const matched = JLib.elements.search.search(candidates, query, (f) => [f.label, f.description, (f.keywords || []).join(' ')].join(' '));
        const settingsObj = isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId);
        const rows = matched.map((f) => buildFeatureRow(f, scopeId, settingsObj, renderContent));
        return el('div', {}, [
          el('div', { className: 'jlib-content-header' }, [el('h2', {}, ['Search results'])]),
          rows.length ? el('div', {}, rows) : el('div', { className: 'jlib-row-desc' }, ['No matching settings.']),
        ]);
      }

      function renderScopeView(scopeId) {
        const totalFeatures = featuresForScope(scopeId).length;
        const showSearchIcon = totalFeatures > SEARCH_THRESHOLD;

        if (expandedCategories === null) expandedCategories = new Set(categoriesForScope(scopeId).map((c) => c.id));
        const settingsObj = isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId);
        const headerChildren = [el('h2', {}, [(scopes ? scopeLabel(scopeId) : title) + ' Settings'])];
        if (scopes) headerChildren.push(el('span', { className: 'jlib-scope-badge' }, [scopeLabel(scopeId)]));

        if (showSearchIcon) {
          const searchToggle = button('\ud83d\udd0d', () => {
            searchOpen = !searchOpen;
            if (!searchOpen) searchQuery = '';
            renderContent();
          }, { className: 'jlib-search-toggle' + (searchOpen ? ' active' : '') });
          headerChildren.push(searchToggle);
        }
        const children = [el('div', { className: 'jlib-content-header' }, headerChildren)];

        if (showSearchIcon && searchOpen) {
          const searchInput = JLib.elements.search.inputField({
            placeholder: 'Search settings\u2026',
            onQuery: (q) => {
              searchQuery = q;
              renderContent();
            },
          });
          searchInput.value = searchQuery;
          children.push(searchInput);
          if (searchQuery.trim()) {
            children.push(renderSearchResults(scopeId, searchQuery));
            return el('div', {}, children);
          }
        }

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
            ? allFeatures.filter((f) => f.category === cat.id && f.type !== 'info' && featureStore.appliesTo(f, scopeId)).map((f) => buildFeatureRow(f, scopeId, settingsObj, renderContent))
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
          view = el('div', { className: 'jlib-nested-chrome' }, []);
          const chromeModule = getSharedChromeModule(services);
          chromeModule.mount(view, services);
        } else if (activeView === 'about') {
          view = renderAboutView();
        } else if (activeView.indexOf('info:') === 0) {
          view = renderInfoDetailView();
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

      applyChrome = function () {};

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
        showPanelSettings: () => selectView('panelSettings'),
      };
      currentPublicApi = publicApi;

      applyChrome();
      renderTabs();
      renderContent();
    }

    function unmount() {}

    return {
      id: config.moduleId || 'settings',
      label: config.title || config.namespace,
      order: 0,
      mount,
      unmount,
      exportAllSettings,
      importAllSettings,
      get api() {
        return currentPublicApi;
      },
    };
  }

  // ---------- shared chrome module ----------
  // The "Panel Settings" experience — theme/position/animations/shortcut/
  // export-import — expressed as real schema features (enum/boolean/
  // custom/action), not bespoke hand-built rows. One factory, two mount
  // points: nested inline (full's Panel Settings tab, via
  // getSharedChromeModule below) and full-screen (the dashboard cog, via
  // services.js). Same namespace either way, so storage is consistent
  // regardless of which one a person actually opened.
  function buildChromeConfig(services) {
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
    return {
      categories: [
        { id: 'appearance', label: 'Appearance', icon: '\ud83c\udfa8' },
        { id: 'behavior', label: 'Behavior', icon: '\ud83e\udded' },
        { id: 'shortcut', label: 'Shortcut', icon: '\u2328\ufe0f' },
        { id: 'backup', label: 'Backup', icon: '\ud83d\udcbe' },
      ],
      features: [
        {
          id: 'theme', type: 'enum', category: 'appearance', label: 'Theme',
          description: 'Follow Website samples the page and WCAG-corrects the result.',
          options: themeOptions, default: 'followWebsite',
          onChange: (v) => theme.setMode(v, shell.panelEl),
        },
        {
          id: 'refreshTheme', type: 'action', category: 'appearance', label: 'Re-sample site colors',
          description: 'Force a fresh palette extraction from the current page.', buttonLabel: '\u21bb Refresh',
          onClick: () => theme.forceReExtract(shell.panelEl),
        },
        {
          id: 'showAnimations', type: 'boolean', category: 'appearance', label: 'Show Animations',
          description: 'Panel transitions and theme crossfade.', default: true,
          onChange: (v) => { if (theme.setAnimationsEnabled) theme.setAnimationsEnabled(v); },
        },
        {
          id: 'panelPosition', type: 'enum', category: 'behavior', label: 'Position',
          description: 'Where the panel appears on screen.', options: positionOptions, default: 'center',
          onChange: (v) => shell.setPosition(v),
        },
        {
          id: 'keyboardShortcut', type: 'custom', category: 'shortcut', label: 'Keyboard Shortcut',
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

  // Reads just position/shortcut from the chrome module's storage without
  // building or mounting the module itself — the shell needs these to
  // configure its very first paint, which happens before anyone has
  // necessarily opened Panel Settings this session (the chrome module
  // mounts lazily, on first open). Same storageKeyPrefix as the real
  // chrome module's featureStore (namespace + '_settings'), so this is
  // reading the exact same persisted data, not a separate copy.
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
    const mod = buildVariant(
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
    // Wire the two action features to this exact instance's export/import
    // now that `mod` exists (buildChromeConfig runs before buildVariant
    // does, so it can't close over `mod` directly).
    cfg.features.forEach((f) => {
      if (f.id === 'exportSettings') f.onClick = () => mod.exportAllSettings();
      if (f.id === 'importSettings') f.onClick = () => mod.importAllSettings();
    });
    return mod;
  }

  // ---------- public factory ----------
  function create(config) {
    if (!config || !config.namespace) throw new Error('JLib.modules.settingsPanel.create requires config.namespace');
    const full = buildVariant(config, { includeChromeTab: true });
    const lite = buildVariant(config, { includeChromeTab: false });
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

  return { create, buildChromeModule, getSharedChromeModule, getChromeShellDefaults, JLIB_ABOUT };
})();
