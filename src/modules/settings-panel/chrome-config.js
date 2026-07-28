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
