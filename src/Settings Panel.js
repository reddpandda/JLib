/*
 * Settings Panel — one importable, fully generic settings UI. Depends on
 * JLib.dom (el/h), JLib.settingsSchema (storage), JLib.utils (debounce).
 * @require all three before this file.
 *
 * Generalized from the Streaming Suite script's panel — same visual
 * design (sidebar + right pane, scroll-shadow, focus trap, keyboard
 * shortcut, per-scope storage, import/export), but every site-specific
 * name is gone: SITE -> scope, SITE_LABELS -> config.scopes, FEATURES ->
 * config.features, "Websites" nav -> generic scope-switcher, "About" ->
 * an optional extraSection the caller supplies content for instead of
 * baked-in credit text.
 *
 * FEATURE TYPES: boolean, enum, number, text, action, custom.
 *   - boolean/enum are the original two.
 *   - number/text are new — plain validated inputs.
 *   - action is a button with no stored value (feature.onClick(ctx)) —
 *     generalizes what the source script's About-view Export/Import
 *     buttons did as one-off panel code into a real schema-driven type.
 *   - custom is an escape hatch (feature.render(value, onChange, ctx) ->
 *     DOM node) for anything the other five don't cover, e.g. the source
 *     script's keyboard-shortcut-capture row.
 *
 * DEPENDENCIES: feature.parent (sugar, unchanged from source) OR
 * feature.dependsOn(settingsObj) -> boolean, for anything a single
 * parent-is-on check can't express (an enum's specific value, two
 * settings at once, etc). parent is internally just
 * `dependsOn: s => !!s[parent]`.
 *
 * THEME: 'followWebsite' (default) and 'system' are dynamic — resolved
 * to 'light' or 'dark' at apply-time and kept in sync live via a
 * MutationObserver on <html>/<body> (attribute changes) and a
 * prefers-color-scheme listener, both debounced. Themes are plain CSS
 * custom-property objects applied via inline style.setProperty, not
 * static [data-theme] stylesheet rules — that's what lets a caller
 * register brand-new named themes at runtime (config.ui.themes) without
 * this library needing to know their names in advance.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.settingsPanel = (function () {
  const { el, $ } = JLib.dom;
  const { debounce } = JLib.utils;

  const BUILTIN_THEMES = {
    dark: {
      '--jsp-bg': 'linear-gradient(145deg, #14141c 0%, #0a0a0e 100%)',
      '--jsp-sidebar-bg': 'rgba(255, 255, 255, 0.03)',
      '--jsp-text': '#e8e8e8',
      '--jsp-muted': '#6a6a7a',
      '--jsp-accent': '#8b5cf6',
      '--jsp-accent-hover': '#9d75f7',
      '--jsp-accent-bg': 'rgba(139, 92, 246, 0.15)',
      '--jsp-border': 'rgba(255, 255, 255, 0.06)',
      '--jsp-hover': 'rgba(255, 255, 255, 0.05)',
      '--jsp-toggle-off': '#2a2a3e',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)',
    },
    light: {
      '--jsp-bg': 'linear-gradient(145deg, #ffffff 0%, #f2f1f6 100%)',
      '--jsp-sidebar-bg': 'rgba(0, 0, 0, 0.03)',
      '--jsp-text': '#17171f',
      '--jsp-muted': '#6b6b78',
      '--jsp-accent': '#7c3aed',
      '--jsp-accent-hover': '#6d28d9',
      '--jsp-accent-bg': 'rgba(124, 58, 237, 0.1)',
      '--jsp-border': 'rgba(0, 0, 0, 0.08)',
      '--jsp-hover': 'rgba(0, 0, 0, 0.04)',
      '--jsp-toggle-off': '#d9d9e3',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
    },
  };

  // One <style> tag, shared globally across every panel instance on the
  // page — not per-namespace. All structural rules are written against
  // .jsp-* classes and var(--jsp-*), so multiple panels from different
  // scripts coexist fine as long as each uses a distinct `namespace`
  // (which only scopes storage keys and element IDs, not CSS classes).
  // A namespace collision between two scripts would mean two panels
  // fighting over the same #namespace-jsp-panel element ID — that's on
  // the caller to avoid, this library doesn't detect it.
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  // ---------- theme detection ----------
  function defaultDetectWebsiteIsDark() {
    try {
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
      const bg = bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent' ? bodyBg : htmlBg;
      const m = bg && bg.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
      if (m) {
        const r = parseFloat(m[1]);
        const g = parseFloat(m[2]);
        const b = parseFloat(m[3]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }
    } catch (e) {
      // fall through
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------- dependency resolution ----------
  function resolveDependsOn(feature) {
    if (feature.dependsOn) return feature.dependsOn;
    if (feature.parent) return (s) => !!s[feature.parent];
    return null;
  }

  function getFocusableElements(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll('button, [tabindex], input, select, a[href]'))
      .filter((elm) => !elm.disabled && elm.offsetParent !== null);
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

  // ==========================================================================
  function create(config) {
    if (!config || !config.namespace) throw new Error('JLib.settingsPanel.create requires config.namespace');
    injectStylesOnce();

    const namespace = config.namespace;
    const title = config.title || namespace;
    const categories = config.categories || [];
    const allFeatures = config.features || [];
    const storableFeatures = allFeatures.filter((f) => f.type !== 'action');
    const scopes = config.scopes || null; // [{id,label}] or null = single implicit scope
    const multiScope = !!(scopes && scopes.length > 1);
    const getCurrentScope = config.getCurrentScope || (() => (scopes && scopes[0] ? scopes[0].id : undefined));
    const extraSections = config.extraSections || [];
    const onFeatureChange = config.onFeatureChange || null;

    const uiConf = config.ui || {};
    const themes = Object.assign({}, BUILTIN_THEMES, uiConf.themes || {});
    const defaultTheme = uiConf.defaultTheme || 'followWebsite';
    const detectWebsiteIsDark = uiConf.followWebsiteDetector || defaultDetectWebsiteIsDark;
    const keyboardShortcutDefault = uiConf.keyboardShortcutDefault || 'Ctrl+Shift+S';
    const panelPositionDefault = uiConf.panelPositionDefault || 'center';

    // ---------- storage ----------
    const featureStore = JLib.settingsSchema.createStore(storableFeatures, {
      storageKeyPrefix: namespace + '_settings',
      migrate: config.migrate,
    });
    const uiStore = JLib.settingsSchema.createStore(
      [
        { id: 'theme', default: defaultTheme },
        { id: 'panelPosition', default: panelPositionDefault },
        { id: 'showAnimations', default: true },
        { id: 'rememberLastSection', default: true },
        { id: 'keyboardShortcut', default: keyboardShortcutDefault },
        { id: 'lastSection', default: null },
      ],
      { storageKeyPrefix: namespace + '_panelUi' }
    );

    let uiSettings = uiStore.load();
    const liveSettingsCache = {}; // scope -> settingsObj, live scope only has real engine effect

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

    // Single pass is order-dependent for chained dependencies (e.g. a
    // grandchild declared earlier in `features` than the parent it
    // transitively depends on would read a stale, not-yet-updated parent
    // value on that pass). Loop to a fixed point instead — bounded by
    // storableFeatures.length, which is more passes than any real chain
    // could need, so a genuine A<->B mutual dependency still terminates
    // (it stabilizes trivially: forcing only ever sets `false`, so once
    // nothing changes in a pass, further passes are no-ops) rather than
    // needing actual cycle detection.
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

    // ---------- theme ----------
    function resolveActiveThemeName() {
      const t = uiSettings.theme;
      if (t === 'system') return prefersDark() ? 'dark' : 'light';
      if (t === 'followWebsite') return detectWebsiteIsDark() ? 'dark' : 'light';
      if (themes[t]) return t;
      return 'dark';
    }

    function applyTheme() {
      const panel = $('#' + namespace + '-jsp-panel');
      if (!panel) return;
      const vars = themes[resolveActiveThemeName()] || themes.dark;
      for (const k in vars) panel.style.setProperty(k, vars[k]);
    }

    const themeWatcher = debounce(() => {
      if (uiSettings.theme === 'followWebsite' || uiSettings.theme === 'system') applyTheme();
    }, 200);
    let themeObserver = null;
    function startThemeWatching() {
      themeObserver = new MutationObserver(themeWatcher);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeWatcher);
    }
    function stopThemeWatching() {
      if (themeObserver) {
        themeObserver.disconnect();
        themeObserver = null;
      }
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', themeWatcher);
    }

    function applyPanelPosition() {
      const panel = $('#' + namespace + '-jsp-panel');
      if (panel) panel.dataset.position = uiSettings.panelPosition;
    }
    function applyAnimationPref() {
      [$('#' + namespace + '-jsp-panel'), $('#' + namespace + '-jsp-overlay')].forEach((elm) => {
        if (elm) elm.classList.toggle('jsp-no-anim', !uiSettings.showAnimations);
      });
    }

    // ---------- row builders ----------
    function makeKeyboardActivatable(elm) {
      elm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          elm.click();
        }
      });
    }

    function buildToggleRow(label, desc, checked, onChange, opts) {
      opts = opts || {};
      const info = el('div', { className: 'info' }, [el('div', { className: 'label' }, [label]), el('div', { className: 'desc' }, [desc])]);
      const slider = el('div', { className: 'slider' });
      const interactive = opts.interactive !== false;
      const toggle = el(
        'div',
        {
          className: 'jsp-toggle' + (checked ? ' active' : ''),
          attrs: interactive ? { tabindex: '0', role: 'switch', 'aria-checked': String(checked) } : {},
        },
        [slider]
      );
      if (interactive) {
        toggle.addEventListener('click', () => onChange(!checked));
        makeKeyboardActivatable(toggle);
      }
      let cls = 'jsp-setting-item';
      if (opts.child) cls += ' child-setting';
      if (!interactive) cls += ' disabled';
      return el('div', { className: cls }, [info, toggle]);
    }

    function buildDropdownRow(label, desc, options, value, onChange, opts) {
      opts = opts || {};
      const info = el('div', { className: 'info' }, [el('div', { className: 'label' }, [label]), el('div', { className: 'desc' }, [desc])]);
      const select = el(
        'select',
        { className: 'jsp-select' },
        options.map((o) => el('option', { attrs: o.value === value ? { value: o.value, selected: 'selected' } : { value: o.value } }, [o.label]))
      );
      select.value = value;
      select.disabled = opts.interactive === false;
      select.addEventListener('change', () => onChange(select.value));
      let cls = 'jsp-setting-item';
      if (opts.child) cls += ' child-setting';
      if (opts.interactive === false) cls += ' disabled';
      return el('div', { className: cls }, [info, select]);
    }

    function buildNumberRow(label, desc, feature, value, onChange, opts) {
      opts = opts || {};
      const info = el('div', { className: 'info' }, [el('div', { className: 'label' }, [label]), el('div', { className: 'desc' }, [desc])]);
      const attrs = { type: 'number' };
      if (feature.min !== undefined) attrs.min = feature.min;
      if (feature.max !== undefined) attrs.max = feature.max;
      if (feature.step !== undefined) attrs.step = feature.step;
      const input = el('input', { className: 'jsp-number-input', attrs });
      input.value = value;
      input.disabled = opts.interactive === false;
      input.addEventListener('change', () => {
        let v = parseFloat(input.value);
        if (isNaN(v)) v = feature.default;
        if (feature.min !== undefined) v = Math.max(feature.min, v);
        if (feature.max !== undefined) v = Math.min(feature.max, v);
        input.value = v;
        onChange(v);
      });
      let cls = 'jsp-setting-item';
      if (opts.child) cls += ' child-setting';
      if (opts.interactive === false) cls += ' disabled';
      return el('div', { className: cls }, [info, input]);
    }

    function buildTextRow(label, desc, feature, value, onChange, opts) {
      opts = opts || {};
      const info = el('div', { className: 'info' }, [el('div', { className: 'label' }, [label]), el('div', { className: 'desc' }, [desc])]);
      const attrs = { type: 'text' };
      if (feature.maxLength !== undefined) attrs.maxlength = feature.maxLength;
      const input = el('input', { className: 'jsp-text-input', attrs });
      input.value = value || '';
      input.disabled = opts.interactive === false;
      input.addEventListener('change', () => {
        if (feature.pattern && !new RegExp(feature.pattern).test(input.value)) {
          input.value = value || '';
          return;
        }
        onChange(input.value);
      });
      let cls = 'jsp-setting-item';
      if (opts.child) cls += ' child-setting';
      if (opts.interactive === false) cls += ' disabled';
      return el('div', { className: cls }, [info, input]);
    }

    function buildActionRow(label, desc, onClick, opts) {
      opts = opts || {};
      const info = el('div', { className: 'info' }, [el('div', { className: 'label' }, [label]), el('div', { className: 'desc' }, [desc])]);
      const btn = el('button', { className: 'jsp-action-btn' }, [opts.buttonLabel || label]);
      if (opts.interactive === false) btn.disabled = true;
      else btn.addEventListener('click', onClick);
      let cls = 'jsp-setting-item';
      if (opts.interactive === false) cls += ' disabled';
      return el('div', { className: cls }, [info, btn]);
    }

    // ---------- feature row dispatch ----------
    function buildFeatureRow(feature, scopeId, settingsObj) {
      const applies = featureStore.appliesTo(feature, scopeId);
      const dep = resolveDependsOn(feature);
      const depOk = !dep || dep(settingsObj);
      const interactive = applies && depOk;
      const labelSuffix = !applies ? ' (not available)' : '';
      const ctx = { scope: scopeId, isLive: isLiveScope(scopeId), settings: settingsObj, panel: publicApi };

      function commit(newValue) {
        settingsObj[feature.id] = newValue;
        saveScopeSettings(scopeId, settingsObj);
        enforceDependsOn(settingsObj, scopeId);
        if (feature.onChange) feature.onChange(newValue, settingsObj, ctx);
        if (onFeatureChange) onFeatureChange(feature.id, newValue, scopeId, ctx);
        renderContent();
      }

      switch (feature.type) {
        case 'enum':
          return buildDropdownRow(feature.label + labelSuffix, feature.description, feature.options, settingsObj[feature.id], commit, {
            interactive,
            child: !!feature.parent,
          });
        case 'number':
          return buildNumberRow(feature.label + labelSuffix, feature.description, feature, settingsObj[feature.id], commit, {
            interactive,
            child: !!feature.parent,
          });
        case 'text':
          return buildTextRow(feature.label + labelSuffix, feature.description, feature, settingsObj[feature.id], commit, {
            interactive,
            child: !!feature.parent,
          });
        case 'action':
          return buildActionRow(feature.label + labelSuffix, feature.description, () => feature.onClick(ctx), {
            interactive,
            buttonLabel: feature.buttonLabel,
          });
        case 'custom':
          return el('div', { className: 'jsp-setting-item jsp-custom-row' + (!interactive ? ' disabled' : '') }, [
            feature.render(settingsObj[feature.id], commit, ctx),
          ]);
        case 'boolean':
        default:
          return buildToggleRow(feature.label + labelSuffix, feature.description, applies && !!settingsObj[feature.id], commit, {
            interactive,
            child: !!feature.parent,
          });
      }
    }

    // ---------- scope view ----------
    let expandedCategories = null;
    function categoriesForScope(scopeId) {
      return categories.filter((cat) => allFeatures.some((f) => f.category === cat.id && featureStore.appliesTo(f, scopeId)));
    }
    function ensureExpandedInit(scopeId) {
      if (expandedCategories === null) expandedCategories = new Set(categoriesForScope(scopeId).map((c) => c.id));
    }

    function renderScopeView(scopeId) {
      ensureExpandedInit(scopeId);
      const settingsObj = isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId);

      const headerChildren = [el('h2', {}, [(scopes ? scopeLabel(scopeId) : title) + ' Settings'])];
      if (scopes) headerChildren.push(el('span', { className: 'jsp-scope-badge' }, [scopeLabel(scopeId)]));
      const children = [el('div', { className: 'jsp-content-header' }, headerChildren)];

      if (scopes && !isLiveScope(scopeId)) {
        children.push(
          el('div', { className: 'jsp-remote-note' }, [
            `You're viewing ${scopeLabel(scopeId)}'s settings from elsewhere. Changes save now and take effect next time it's active.`,
          ])
        );
      }

      categoriesForScope(scopeId).forEach((cat) => {
        const expanded = expandedCategories.has(cat.id);
        const header = el(
          'div',
          { className: 'jsp-cat-header', attrs: { tabindex: '0', role: 'button' } },
          [el('span', { className: 'jsp-cat-arrow' }, [expanded ? '\u25be' : '\u25b8']), el('span', {}, [(cat.icon ? cat.icon + ' ' : '') + cat.label])]
        );
        header.addEventListener('click', () => {
          if (expanded) expandedCategories.delete(cat.id);
          else expandedCategories.add(cat.id);
          renderContent();
        });
        makeKeyboardActivatable(header);
        const rows = expanded
          ? allFeatures.filter((f) => f.category === cat.id && featureStore.appliesTo(f, scopeId)).map((f) => buildFeatureRow(f, scopeId, settingsObj))
          : [];
        children.push(el('div', { className: 'jsp-category' }, [header, el('div', { className: 'jsp-cat-body' }, rows)]));
      });

      const resetBtn = el('button', { className: 'jsp-reset-btn' }, [`\u21ba Reset ${scopes ? scopeLabel(scopeId) : title} to Default`]);
      resetBtn.addEventListener('click', () => {
        if (!confirm(`Reset ${scopes ? scopeLabel(scopeId) : title} settings to default?`)) return;
        const defaults = featureStore.getDefaults(scopeId);
        saveScopeSettings(scopeId, defaults);
        if (isLiveScope(scopeId)) delete liveSettingsCache[scopeId];
        renderContent();
      });
      children.push(resetBtn);

      return el('div', {}, children);
    }

    // ---------- panel-settings (built-in) view ----------
    function renderPanelSettingsView() {
      const themeOptions = [{ value: 'followWebsite', label: 'Follow Website' }, { value: 'system', label: 'System' }].concat(
        Object.keys(themes).map((name) => ({ value: name, label: name.charAt(0).toUpperCase() + name.slice(1) }))
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

      const themeRow = buildDropdownRow('Theme', 'How the panel itself looks, independent of any feature settings', themeOptions, uiSettings.theme, (v) => {
        uiSettings.theme = v;
        saveUi();
        applyTheme();
        renderContent();
      });
      const animRow = buildToggleRow('Show Animations', 'Panel open/close and toggle transitions', uiSettings.showAnimations, (v) => {
        uiSettings.showAnimations = v;
        saveUi();
        applyAnimationPref();
        renderContent();
      });
      const posRow = buildDropdownRow('Panel Position', 'Where the panel appears on screen', positionOptions, uiSettings.panelPosition, (v) => {
        uiSettings.panelPosition = v;
        saveUi();
        applyPanelPosition();
        renderContent();
      });
      const rememberRow = buildToggleRow(
        'Remember Last Section',
        'Reopen to whatever section you last viewed',
        uiSettings.rememberLastSection,
        (v) => {
          uiSettings.rememberLastSection = v;
          saveUi();
          renderContent();
        }
      );

      const shortcutDisplay = el('div', { className: 'jsp-shortcut-input', attrs: { tabindex: '0', role: 'button' } }, [
        uiSettings.keyboardShortcut || '(none)',
      ]);
      shortcutDisplay.addEventListener('click', () => {
        shortcutDisplay.textContent = 'Press keys...';
        shortcutDisplay.classList.add('listening');
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) !== -1) return;
          if (e.key === 'Escape') {
            shortcutDisplay.textContent = uiSettings.keyboardShortcut || '(none)';
            shortcutDisplay.classList.remove('listening');
            document.removeEventListener('keydown', onKey, true);
            return;
          }
          const combo = formatShortcutFromEvent(e);
          uiSettings.keyboardShortcut = combo;
          saveUi();
          shortcutDisplay.textContent = combo;
          shortcutDisplay.classList.remove('listening');
          document.removeEventListener('keydown', onKey, true);
        };
        document.addEventListener('keydown', onKey, true);
      });
      makeKeyboardActivatable(shortcutDisplay);
      const shortcutRow = el('div', { className: 'jsp-ui-row' }, [
        el('div', { className: 'info' }, [
          el('div', { className: 'label' }, ['Keyboard Shortcut']),
          el('div', { className: 'desc' }, ['Click, then press a key combination to open/close the panel']),
        ]),
        shortcutDisplay,
      ]);

      const exportBtn = el('button', { className: 'jsp-action-btn' }, ['\u2b07 Export All Settings']);
      exportBtn.addEventListener('click', exportAllSettings);
      const importBtn = el('button', { className: 'jsp-action-btn' }, ['\u2b06 Import Settings']);
      importBtn.addEventListener('click', importAllSettings);
      const ioRow = el('div', { className: 'jsp-about-buttons' }, [exportBtn, importBtn]);

      const resetBtn = el('button', { className: 'jsp-reset-btn' }, ['\u21ba Reset Panel Settings to Default']);
      resetBtn.addEventListener('click', () => {
        if (!confirm('Reset panel settings to default?')) return;
        uiSettings = uiStore.getDefaults();
        saveUi();
        applyTheme();
        applyPanelPosition();
        applyAnimationPref();
        renderContent();
      });

      return el('div', {}, [
        el('div', { className: 'jsp-content-header' }, [el('h2', {}, ['Panel Settings'])]),
        el('div', { className: 'jsp-category' }, [
          el('div', { className: 'jsp-cat-header' }, [el('span', {}, ['\ud83c\udfa8 Appearance'])]),
          el('div', { className: 'jsp-cat-body' }, [themeRow, animRow]),
        ]),
        el('div', { className: 'jsp-category' }, [
          el('div', { className: 'jsp-cat-header' }, [el('span', {}, ['\ud83e\udded Behavior'])]),
          el('div', { className: 'jsp-cat-body' }, [posRow, rememberRow]),
        ]),
        el('div', { className: 'jsp-category' }, [
          el('div', { className: 'jsp-cat-header' }, [el('span', {}, ['\u2328\ufe0f Shortcut'])]),
          el('div', { className: 'jsp-cat-body' }, [shortcutRow]),
        ]),
        el('div', { className: 'jsp-category' }, [
          el('div', { className: 'jsp-cat-header' }, [el('span', {}, ['\ud83d\udcbe Backup'])]),
          el('div', { className: 'jsp-cat-body' }, [ioRow]),
        ]),
        resetBtn,
      ]);
    }

    // ---------- export / import ----------
    function exportAllSettings() {
      const data = {
        namespace,
        version: config.exportVersion || 1,
        exportedAt: new Date().toISOString(),
        ui: uiSettings,
        scopes: {},
      };
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

    function importAllSettings() {
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
              applyTheme();
              applyPanelPosition();
              applyAnimationPref();
            }
            if (data.scopes) {
              for (const key in data.scopes) {
                const sid = key === '__default__' ? undefined : key;
                saveScopeSettings(sid, Object.assign(featureStore.getDefaults(sid), data.scopes[key]));
                if (isLiveScope(sid)) delete liveSettingsCache[sid];
              }
            }
            renderContent();
          } catch (e) {
            alert('Import failed: not a valid settings file.');
          }
          input.remove();
        };
        reader.readAsText(file);
      });
      input.click();
    }

    // ---------- nav / view orchestration ----------
    let activeView = null;

    function buildNavItem(labelText, navId, badge) {
      const children = [el('span', {}, [labelText])];
      if (badge) children.push(badge);
      const item = el(
        'div',
        { className: 'jsp-nav-item' + (activeView === navId ? ' active' : ''), attrs: { tabindex: '0', role: 'button' } },
        children
      );
      item.addEventListener('click', () => setActiveView(navId));
      makeKeyboardActivatable(item);
      return item;
    }

    function renderSidebar(container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      if (multiScope) {
        container.appendChild(el('div', { className: 'jsp-sidebar-label' }, ['\ud83c\udf10 ' + (uiConf.scopesLabel || 'Scopes')]));
        scopes.forEach((s) => {
          const badge = s.id === getCurrentScope() ? el('span', { className: 'jsp-current-badge', attrs: { title: 'Currently active' } }, ['\u25cf']) : null;
          container.appendChild(buildNavItem(s.label, 'scope:' + s.id, badge));
        });
        container.appendChild(el('div', { className: 'jsp-sidebar-divider' }));
      }
      container.appendChild(el('div', { className: 'jsp-sidebar-label' }, ['\u2699\ufe0f Settings']));
      container.appendChild(buildNavItem('Panel Settings', 'panelSettings'));
      extraSections.forEach((sec) => container.appendChild(buildNavItem(sec.label, 'extra:' + sec.id)));
    }

    function setActiveView(view) {
      activeView = view;
      expandedCategories = null;
      if (uiSettings.rememberLastSection) {
        uiSettings.lastSection = view;
        uiStore.save(undefined, uiSettings);
      }
      const sidebarEl = $('#' + namespace + '-jsp-sidebar');
      if (sidebarEl) renderSidebar(sidebarEl);
      renderContent();
    }

    function renderContent() {
      const contentEl = $('#' + namespace + '-jsp-content');
      if (!contentEl) return;
      const scrollTop = contentEl.scrollTop;
      while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

      if (!activeView) activeView = multiScope ? 'scope:' + getCurrentScope() : 'scope:__default__';

      let view;
      if (activeView === 'panelSettings') {
        view = renderPanelSettingsView();
      } else if (activeView.indexOf('extra:') === 0) {
        const sec = extraSections.find((s) => 'extra:' + s.id === activeView);
        view = sec ? sec.render({ panel: publicApi }) : el('div', {}, ['Not found']);
      } else {
        const scopeId = activeView.indexOf('scope:') === 0 ? activeView.slice(6) : getCurrentScope();
        view = renderScopeView(scopeId === '__default__' ? undefined : scopeId);
      }
      contentEl.appendChild(view);
      contentEl.scrollTop = scrollTop;
    }

    // ---------- chrome ----------
    function trapFocus(e, panel) {
      if (e.key !== 'Tab') return;
      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    let built = false;
    let globalShortcutListener = null;
    function build() {
      if (built) return;
      built = true;

      if (uiSettings.rememberLastSection && uiSettings.lastSection) activeView = uiSettings.lastSection;

      const overlay = el('div', { className: 'jsp-overlay', id: namespace + '-jsp-overlay' });
      document.body.appendChild(overlay);

      const closeBtn = el('button', { className: 'close-btn' }, ['\u00d7']);
      const header = el('div', { className: 'jsp-header' }, [el('h2', {}, [title]), closeBtn]);
      const sidebar = el('div', { className: 'jsp-sidebar', id: namespace + '-jsp-sidebar' });
      const content = el('div', { className: 'jsp-content', id: namespace + '-jsp-content' });
      const body = el('div', { className: 'jsp-body' }, [sidebar, content]);
      const footer = el('div', { className: 'jsp-footer' }, [config.footerText || '']);
      const panel = el('div', { className: 'jsp-panel', id: namespace + '-jsp-panel' }, [header, body, footer]);
      document.body.appendChild(panel);

      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', close);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          close();
          return;
        }
        trapFocus(e, panel);
      });

      applyTheme();
      applyPanelPosition();
      applyAnimationPref();
      renderSidebar(sidebar);
      renderContent();
      startThemeWatching();

      // Stored so destroy() can actually remove it — without this,
      // destroy() -> open() -> destroy() -> open() stacks a duplicate
      // global listener on every cycle, since build() re-runs each time
      // `built` resets to false.
      globalShortcutListener = (e) => {
        if (!uiSettings.keyboardShortcut) return;
        if (formatShortcutFromEvent(e) === uiSettings.keyboardShortcut) {
          e.preventDefault();
          toggle();
        }
      };
      document.addEventListener('keydown', globalShortcutListener);
    }

    function open() {
      build();
      const panel = $('#' + namespace + '-jsp-panel');
      const overlay = $('#' + namespace + '-jsp-overlay');
      applyTheme();
      panel.classList.add('active');
      overlay.classList.add('active');
      const focusable = getFocusableElements(panel);
      if (focusable.length) focusable[0].focus();
    }
    function close() {
      const panel = $('#' + namespace + '-jsp-panel');
      const overlay = $('#' + namespace + '-jsp-overlay');
      if (panel) panel.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
    }
    function toggle() {
      const panel = $('#' + namespace + '-jsp-panel');
      if (panel && panel.classList.contains('active')) close();
      else open();
    }
    function destroy() {
      stopThemeWatching();
      if (globalShortcutListener) {
        document.removeEventListener('keydown', globalShortcutListener);
        globalShortcutListener = null;
      }
      const panel = $('#' + namespace + '-jsp-panel');
      const overlay = $('#' + namespace + '-jsp-overlay');
      if (panel) panel.remove();
      if (overlay) overlay.remove();
      built = false;
    }

    const publicApi = {
      open,
      close,
      toggle,
      destroy,
      getSettings: (scopeId) => (scopeId === undefined || isLiveScope(scopeId) ? getLiveSettings() : loadScopeSettings(scopeId)),
      setSettings: (scopeId, obj) => {
        saveScopeSettings(scopeId, obj);
        if (isLiveScope(scopeId)) delete liveSettingsCache[scopeId];
      },
      // For when settings change outside the panel's own commit() path —
      // e.g. a script writing to GM_setValue directly, or another tab's
      // instance of the same script. GM storage doesn't fire a 'storage'
      // event the way localStorage does, so there's no way to auto-detect
      // this; call it manually after any out-of-band write.
      invalidateCache: (scopeId) => {
        delete liveSettingsCache[scopeId === undefined ? getCurrentScope() : scopeId];
      },
    };
    return publicApi;
  }

  const PANEL_CSS = `
    .jsp-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 999997; display:none; }
    .jsp-overlay.active { display:block; }
    .jsp-panel {
      position: fixed; color: var(--jsp-text); background: var(--jsp-bg); border-radius:16px; z-index:999999;
      width:700px; max-width:94vw; max-height:82vh; box-shadow: var(--jsp-shadow); display:none; overflow:hidden; flex-direction:column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    .jsp-panel.active { display:flex; }
    .jsp-panel[data-position="center"] { top:50%; left:50%; transform: translate(-50%,-50%); }
    .jsp-panel[data-position="topLeft"] { top:24px; left:24px; }
    .jsp-panel[data-position="topRight"] { top:24px; right:24px; }
    .jsp-panel[data-position="bottomLeft"] { bottom:24px; left:24px; }
    .jsp-panel[data-position="bottomRight"] { bottom:24px; right:24px; }
    .jsp-header { padding:18px 24px; border-bottom:1px solid var(--jsp-border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
    .jsp-header h2 { margin:0; color: var(--jsp-accent); font-size:18px; font-weight:600; }
    .jsp-header .close-btn { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:30px; height:30px; font-size:17px; cursor:pointer; }
    .jsp-body { display:flex; flex:1; min-height:0; overflow:hidden; }
    .jsp-sidebar { width:180px; flex-shrink:0; background: var(--jsp-sidebar-bg); border-right:1px solid var(--jsp-border); padding:14px 10px; overflow-y:auto; }
    .jsp-sidebar-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color: var(--jsp-muted); padding:6px 10px 4px; }
    .jsp-sidebar-divider { height:1px; background: var(--jsp-border); margin:8px 6px; }
    .jsp-nav-item { display:flex; justify-content:space-between; align-items:center; padding:7px 10px; margin:1px 0; border-radius:6px; border-left:2px solid transparent; cursor:pointer; font-size:13px; }
    .jsp-nav-item:hover { background: var(--jsp-hover); }
    .jsp-nav-item.active { background: var(--jsp-accent-bg); border-left-color: var(--jsp-accent); color: var(--jsp-accent); font-weight:600; }
    .jsp-current-badge { font-size:9px; color: var(--jsp-accent); }
    .jsp-content { flex:1; min-width:0; overflow-y:auto; padding:20px 26px 24px; }
    .jsp-sidebar, .jsp-content { scrollbar-width:thin; scrollbar-color: var(--jsp-accent) transparent; }
    .jsp-sidebar::-webkit-scrollbar, .jsp-content::-webkit-scrollbar { width:4px; }
    .jsp-sidebar::-webkit-scrollbar-thumb, .jsp-content::-webkit-scrollbar-thumb { background: var(--jsp-accent); border-radius:4px; }
    .jsp-content-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .jsp-content-header h2 { margin:0; font-size:18px; font-weight:600; }
    .jsp-scope-badge { font-size:10px; font-weight:600; color: var(--jsp-accent); background: var(--jsp-accent-bg); border-radius:4px; padding:2px 7px; }
    .jsp-remote-note { font-size:12px; color: var(--jsp-muted); background: var(--jsp-hover); border-radius:8px; padding:10px 12px; margin-bottom:16px; }
    .jsp-category { margin-bottom:6px; }
    .jsp-cat-header { display:flex; align-items:center; gap:8px; padding:9px 4px; cursor:pointer; font-size:13px; font-weight:600; border-radius:6px; }
    .jsp-cat-header:hover { background: var(--jsp-hover); }
    .jsp-cat-arrow { display:inline-block; width:10px; color: var(--jsp-muted); font-size:11px; }
    .jsp-cat-body { padding:2px 4px 8px 22px; }
    .jsp-setting-item { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--jsp-border); gap:16px; }
    .jsp-setting-item .info { flex:1; min-width:0; padding-right:12px; }
    .jsp-setting-item .label { font-size:13px; font-weight:500; }
    .jsp-setting-item .desc { font-size:11px; color: var(--jsp-muted); margin-top:2px; line-height:1.4; }
    .jsp-setting-item.child-setting { margin-left:16px; padding-left:12px; border-left:2px solid var(--jsp-accent-bg); }
    .jsp-setting-item.disabled { opacity:.4; }
    .jsp-setting-item.disabled .jsp-toggle, .jsp-setting-item.disabled select, .jsp-setting-item.disabled input, .jsp-setting-item.disabled button { pointer-events:none; }
    .jsp-toggle { position:relative; width:42px; height:23px; background: var(--jsp-toggle-off); border-radius:12px; cursor:pointer; flex-shrink:0; }
    .jsp-toggle.active { background: var(--jsp-accent); }
    .jsp-toggle .slider { position:absolute; top:2px; left:2px; width:19px; height:19px; background:#fff; border-radius:50%; transition: transform .2s; }
    .jsp-toggle.active .slider { transform: translateX(19px); }
    .jsp-select, .jsp-number-input, .jsp-text-input { background: var(--jsp-hover); color: var(--jsp-text); border:1px solid var(--jsp-border); border-radius:6px; padding:6px 8px; font-size:12px; min-width:120px; }
    .jsp-ui-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--jsp-border); gap:16px; }
    .jsp-shortcut-input { background: var(--jsp-hover); border:1px solid var(--jsp-border); border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; min-width:120px; text-align:center; }
    .jsp-shortcut-input.listening { border-color: var(--jsp-accent); color: var(--jsp-accent); }
    .jsp-reset-btn, .jsp-action-btn { background: var(--jsp-hover); color: var(--jsp-muted); border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px; margin-top:6px; }
    .jsp-reset-btn:hover { background: rgba(231,76,60,.15); color: var(--jsp-danger); }
    .jsp-about-buttons { display:flex; gap:10px; }
    .jsp-footer { padding:10px 24px; border-top:1px solid var(--jsp-border); font-size:11px; color: var(--jsp-muted); flex-shrink:0; }
    .jsp-panel.jsp-no-anim, .jsp-overlay.jsp-no-anim { animation:none !important; }
  `;

  return { create };
})();