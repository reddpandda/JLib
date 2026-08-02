// ============================================================================
// services/module-lifecycle.js
// ============================================================================
/*
 * Module base — the shared scaffold every module is built through, so
 * module authors don't each reinvent header markup, section markup, or
 * the mount/unmount lifecycle shape. A module built via this always has
 * the same three things: a header (title + optional right-side controls),
 * one or more sections (matching the .jlib-category header/body pattern),
 * and the same { id, label, order, mount, unmount } shape the dashboard
 * expects.
 *
 * Usage:
 *   const mod = JLib.moduleBase.create({
 *     id: 'myModule', label: 'My Module', order: 5,
 *     onMount(view, services) {
 *       view.header('My Module');
 *       view.section('General', (body) => { body.appendChild(...) });
 *     },
 *     onUnmount() {},
 *   });
 *   JLib.registerModule(mod);
 *
 * `view` passed to onMount is a small builder scoped to that module's
 * container — header()/section() are the only two shapes a module's
 * top-level layout should need. Anything below a section body is the
 * module's own business (built with JLib.elements.* as needed).
 *
 * Depends on: JLib.dom
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.moduleBase = (function () {
  const { el } = JLib.dom;

  function makeView(container) {
    return {
      header(title, rightControls) {
        const children = [el('h2', {}, [title])];
        if (rightControls) children.push(rightControls);
        container.appendChild(el('div', { className: 'jlib-content-header' }, children));
      },
      // section(label, renderBody, opts?) — renderBody receives the empty
      // body container to fill. opts.icon prefixes the label, same
      // convention every module's sections use.
      section(label, renderBody, opts) {
        opts = opts || {};
        const header = el('div', { className: 'jlib-cat-header' }, [el('span', {}, [(opts.icon ? opts.icon + ' ' : '') + label])]);
        const body = el('div', { className: 'jlib-cat-body' });
        renderBody(body);
        container.appendChild(el('div', { className: 'jlib-category' }, [header, body]));
        return body;
      },
      clear() {
        while (container.firstChild) container.removeChild(container.firstChild);
      },
      raw() {
        return container;
      },
    };
  }

  // create(config) -> module def. config: { id, label, order?, onMount(view,
  // services, container), onUnmount() }. `container` is also passed
  // raw to onMount for cases that need it directly (e.g. a module that
  // wants its own two-pane layout instead of a flat section list) —
  // most modules only need `view`.
  function create(config) {
    if (!config || !config.id || !config.onMount) {
      throw new Error('JLib.moduleBase.create requires { id, onMount }');
    }
    let mountedContainer = null;

    function mount(container, services) {
      mountedContainer = container;
      const view = makeView(container);
      config.onMount(view, services, container);
    }
    function unmount() {
      if (config.onUnmount) config.onUnmount();
      mountedContainer = null;
    }

    return {
      id: config.id,
      label: config.label || config.id,
      order: config.order !== undefined ? config.order : 5,
      mount,
      unmount,
    };
  }

  return { create, makeView };
})();


// ============================================================================
// module registration + render lifecycle
// ============================================================================
/*
 * Registration + render — modules self-register via JLib.registerModule()
 * at their own file's top level, whether they arrived via @require or were
 * typed inline by the userscript author. Registration IS existence.
 * JLib.render() (or JLib.scheduleRender(), which defers it to a microtask
 * so it's the LAST thing to run for that page load) is called once; at
 * that point module count is exact, not guessed.
 *
 * Depends on: JLib.dom, JLib.theme, JLib.storage, JLib.elements.modal
 * (elements.js @required before this runs — note this is the one place
 * services.js reaches into elements.js, since the shell IS a modal).
 *
 * Unified shell: there is always exactly ONE modal built, whether 1 or 2+
 * modules are registered. What changes with count is what's inside it:
 *   - count === 1 (and no forceDashboard): no menu, no cog. If the single
 *     registered module is Settings Panel, its `full` variant mounts —
 *     Panel Settings and About live inline as tabs alongside the
 *     userscript's own settings, since there's no dashboard to keep them
 *     apart. Any other kind of solo module (no .full/.lite pair) just
 *     mounts itself directly.
 *   - count >= 2: a menu screen lists every module (click one to open it
 *     full-screen with a "Back to Dashboard" control). Settings Panel, if
 *     registered, opens via its `lite` variant here — userscript settings
 *     only, no chrome mixed in. Cog (next to the close button) opens a
 *     *different*, unregistered module entirely — the shared chrome
 *     module (theme/position/shortcut/backup/about), built via
 *     JLib.modules.settingsPanel.getSharedChromeModule() under a sentinel
 *     id that never appears in `modules` and never counts toward module
 *     count. Two separate settings surfaces, reached two different ways.
 *
 * Theme mode, animations-enabled, panel position, and keyboard shortcut
 * are all chrome-module-owned regardless of count — read back via
 * getChromeShellDefaults() before the theme instance or first paint
 * exist, so a saved preference actually survives a reload instead of
 * resetting until Panel Settings happens to be opened again.
 *
 * A module never owns its own modal — `services.shell` (setPosition/
 * setKeyboardShortcut/setTitle/panelEl) is how a module reaches the one
 * shell that always exists, regardless of count.
 */
// registerModule() itself, and the state it governs (_modules, _rendered),
// live in registration.js alongside every other registerX function — this
// file consumes that same state for the render lifecycle below.

JLib.scheduleRender = function scheduleRender(opts) {
  Promise.resolve().then(() => JLib.render(opts));
};

JLib.render = function render(opts) {
  opts = opts || {};
  if (JLib._rendered) return;
  JLib._rendered = true;
  const { el } = JLib.dom;

  const modules = JLib._modules.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!modules.length) return;

  const single = modules.length === 1 && !opts.forceDashboard;

  // Theme mode/animations and shell position/shortcut are ALWAYS chrome-
  // module-owned now (never per-userscript) — both `full`'s nested Panel
  // Settings tab and the cog mount the exact same shared chrome module
  // instance, so reading its persisted values here (before the theme
  // instance or first paint exist) is what makes a saved preference
  // actually survive a page reload instead of silently resetting to
  // defaults until Panel Settings happens to be opened again.
  const shellDefaults = JLib.modules.settingsPanel.getChromeShellDefaults();
  const themeService = JLib.theme.create({
    defaultMode: shellDefaults.themeMode,
    animationsEnabled: shellDefaults.showAnimations,
  });

  const services = {
    dashboardMode: !single,
    theme: themeService,
    storage: JLib.storage,
    notifications: opts.notifications || null,
    shell: null, // filled in once `modal` exists, see below
  };

  let modal = null;

  modal = JLib.elements.modal.create({
    id: 'jlib-shell',
    title: opts.title || (single ? modules[0].label : 'Dashboard'),
    position: opts.position || 'center',
    keyboardShortcut: opts.keyboardShortcut || (single ? undefined : 'Ctrl+Shift+D'),
    content: (bodyEl) => {
      services.shell = {
        setPosition: modal.setPosition,
        setKeyboardShortcut: modal.setKeyboardShortcut,
        setTitle: modal.setTitle,
        get panelEl() {
          return modal.panelEl;
        },
      };

      // Position/shortcut are chrome-module-owned regardless of single vs.
      // dashboard mode (see shellDefaults above) — apply them here so the
      // very first paint already reflects whatever was last saved.
      if (shellDefaults.position) modal.setPosition(shellDefaults.position);
      if (shellDefaults.keyboardShortcut !== undefined) modal.setKeyboardShortcut(shellDefaults.keyboardShortcut);

      if (single) {
        // Standalone: the settings module (if that's what's registered)
        // mounts its `full` variant — Panel Settings and About live
        // inline as tabs alongside the userscript's own settings, since
        // there's no dashboard to keep them apart. Any other kind of
        // solo module (no .full/.lite pair) just mounts itself.
        const mod = modules[0];
        const target = mod.full || mod;
        target.mount(bodyEl, services);
      } else {
        const CHROME_ID = '__chromeSettings__'; // sentinel — never in `modules`, never counts toward module count
        let currentModuleId = null; // null = menu showing

        function targetFor(id) {
          if (id === CHROME_ID) return JLib.modules.settingsPanel.getSharedChromeModule(services);
          const mod = modules.find((m) => m.id === id);
          if (!mod) return null;
          // Dashboard-menu-opened modules use `lite` where present (no
          // chrome tab mixed in — that's what the cog is for instead);
          // anything without a lite/full pair just mounts as itself.
          return mod.lite || mod;
        }

        function showMenu() {
          if (currentModuleId) {
            const target = targetFor(currentModuleId);
            if (target && target.unmount) target.unmount();
            currentModuleId = null;
          }
          renderShell();
        }

        function openModule(id, afterMount) {
          currentModuleId = id;
          renderShell();
          if (afterMount) afterMount();
        }

        function renderMenu() {
          const list = el('div', { className: 'jlib-dashboard-menu' });
          modules.forEach((m) => {
            const btn = JLib.elements.button.button(m.label, () => openModule(m.id), { className: 'jlib-dashboard-menu-item' });
            list.appendChild(btn);
          });
          return el('div', { className: 'jlib-dashboard-menu-wrap' }, [
            el('div', { className: 'jlib-dashboard-menu-title' }, [opts.title || JLib.i18n.t('Dashboard')]),
            list,
          ]);
        }

        // Real width-constrained button zone (max-width:420px menu,
        // author-supplied module labels) — unlike most buttons in this
        // codebase (short, fixed English action words like "Export"),
        // this one has a genuine overflow risk once localized or given
        // a long author-chosen label. Shrink+truncate only, wrap
        // skipped deliberately (a menu item growing tall looks broken)
        // — calling the independently-exposed strategies directly
        // rather than fitText()'s full fixed pipeline, exactly the
        // "genuine reason to deviate" escape hatch the design allows.
        function fitMenuButtons(container) {
          container.querySelectorAll('.jlib-dashboard-menu-item').forEach((btn) => {
            const label = btn.textContent;
            const font = JLib.fontProvider.fontType(btn, 1);
            const size = JLib.fontProvider.layout.shrink(btn, label, font, { minSize: 11 });
            btn.style.fontSize = size + 'px';
            btn.style.whiteSpace = 'nowrap';
            btn.style.overflow = 'hidden';
            if (!JLib.fontProvider.layout.fits(btn, label, font, size)) {
              btn.textContent = JLib.fontProvider.layout.truncate(btn, label, font, size);
            }
          });
        }

        function renderShell() {
          while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
          if (!currentModuleId) {
            bodyEl.appendChild(renderMenu());
            fitMenuButtons(bodyEl);
            return;
          }
          const target = targetFor(currentModuleId);
          const backBtn = JLib.elements.button.button('\u2190 ' + JLib.i18n.t('Back (navigation)'), showMenu, { className: 'jlib-dashboard-back' });
          const moduleContainer = el('div', { className: 'jlib-dashboard-module-container' });
          bodyEl.appendChild(el('div', { className: 'jlib-dashboard-module-wrap' }, [backBtn, moduleContainer]));
          if (target) target.mount(moduleContainer, services);
        }

        // Cog doesn't call into the userscript's own settings module at
        // all — it opens the shared chrome module directly (theme/
        // position/shortcut/backup/about), full-screen, same as any menu
        // item. That module is never registered and never counts toward
        // module count; the userscript's own "Settings" menu entry still
        // opens the real settings module's `lite` variant, unaffected.
        const cogBtn = JLib.elements.button.button('\u2699', () => openModule(CHROME_ID), { className: 'jlib-dashboard-cog' });
        if (modal.headerActionsEl) modal.headerActionsEl.appendChild(cogBtn);

        renderShell();
      }

      themeService.apply(modal.panelEl, { skipAnimation: true });
      themeService.startWatching(modal.panelEl);
    },
    onClose: () => themeService.stopWatching(),
  });

  const DASHBOARD_CSS = `
    .jlib-dashboard-cog { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; }
    .jlib-dashboard-menu-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:10px 4px 4px; }
    .jlib-dashboard-menu-title {
      text-align:center; font-size:20px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;
      color: var(--jsp-accent); margin:10px 0 24px; flex-shrink:0;
    }
    .jlib-dashboard-menu { display:flex; flex-direction:column; gap:10px; max-width:420px; margin:0 auto; width:100%; }
    .jlib-dashboard-menu-item {
      padding:16px 20px; border-radius:8px; background: var(--jsp-hover); border:1px solid var(--jsp-border);
      font-size:14px; font-weight:600; letter-spacing:0.04em; text-align:center; text-transform:uppercase;
      transition: background .15s ease, border-color .15s ease, color .15s ease;
    }
    .jlib-dashboard-menu-item:hover { background: var(--jsp-accent-bg); border-color: var(--jsp-accent); color: var(--jsp-accent); }
    .jlib-dashboard-module-wrap { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .jlib-dashboard-back {
      align-self:flex-start; margin:0 0 12px; padding:7px 14px; border-radius:6px; background: var(--jsp-hover);
      color: var(--jsp-muted); font-size:12px; font-weight:600; flex-shrink:0;
    }
    .jlib-dashboard-back:hover { color: var(--jsp-text); }
    .jlib-dashboard-module-container { flex:1; min-height:0; overflow-y:auto; }
  `;
  const dashboardSheet = new CSSStyleSheet();
  dashboardSheet.replaceSync(DASHBOARD_CSS);
  JLib.shadow.adoptStylesheet(dashboardSheet, JLib.shadow.getRoot());

  JLib.dashboard = {
    open: modal.open,
    close: modal.close,
    toggle: modal.toggle,
    destroy: modal.destroy,
    get panelEl() {
      return modal.panelEl;
    },
  };
};
