var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/modal.js
// ============================================================================
/*
 * Modal — generic overlay + focus-trapped panel shell, extracted from
 * settings-panel.js v1's build()/open()/close()/destroy()/trapFocus()/
 * getFocusableElements(). v1 had this logic private and settings-specific
 * (baked into JLib.settingsPanel's closure); this version knows nothing
 * about settings — it just owns overlay+panel chrome, Esc-to-close,
 * click-outside-to-close, keyboard focus trap, and a keyboard shortcut
 * toggle. Any module (Settings Panel, a future one) builds its own
 * content and hands it to this to get the chrome for free.
 *
 * Depends on: JLib.dom
 */


JLib.elements.modal = (function () {
  const { el, $ } = JLib.dom;

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

  // create({ id, title, position, content: (bodyEl) => void, footerText,
  //   keyboardShortcut, onOpen, onClose }) -> { open, close, toggle,
  //   destroy, panelEl, bodyEl }
  //
  // `content` is called once at build time with the empty body container —
  // caller appends whatever it wants (sidebar+content split, a single
  // form, anything). This element doesn't know or care what's inside.
  function create(config) {
    config = config || {};
    if (!config.id) throw new Error('JLib.elements.modal.create requires config.id');

    let built = false;
    let panel, overlay, bodyEl, shortcutListener, rightGroup;

    function build() {
      if (built) return;
      built = true;

      overlay = el('div', { className: 'jlib-modal-overlay', id: config.id + '-overlay' });
      document.body.appendChild(overlay);

      const closeBtn = el('button', { className: 'jlib-modal-close' }, ['\u00d7']);
      rightGroup = el('div', { className: 'jlib-modal-header-actions' }, [closeBtn]);
      const header = el('div', { className: 'jlib-modal-header' }, [el('h2', {}, [config.title || '']), rightGroup]);
      bodyEl = el('div', { className: 'jlib-modal-body' });
      const footer = config.footerText ? el('div', { className: 'jlib-modal-footer' }, [config.footerText]) : null;

      panel = el(
        'div',
        { className: 'jlib-modal-panel', id: config.id, attrs: { 'data-position': config.position || 'center' } },
        [header, bodyEl].concat(footer ? [footer] : [])
      );
      document.body.appendChild(panel);

      if (config.content) config.content(bodyEl);

      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', close);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          close();
          return;
        }
        if (e.key !== 'Tab') return;
        const focusable = getFocusableElements(panel);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });

      if (config.keyboardShortcut) {
        shortcutListener = (e) => {
          if (formatShortcutFromEvent(e) === config.keyboardShortcut) {
            e.preventDefault();
            toggle();
          }
        };
        document.addEventListener('keydown', shortcutListener);
      }
    }

    let prevBodyOverflow = null;
    function lockBodyScroll() {
      if (prevBodyOverflow !== null) return; // already locked
      prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    function unlockBodyScroll() {
      if (prevBodyOverflow === null) return;
      document.body.style.overflow = prevBodyOverflow;
      prevBodyOverflow = null;
    }
    // Belt-and-suspenders for sites whose own scroll containers keep
    // scrolling under body{overflow:hidden} (scroll-chaining on a nested
    // scroll region isn't stopped by locking the body alone) — block
    // wheel/touch events that land on the overlay itself. Events that
    // land on the panel's own scroll regions (bodyEl, sidebar, etc.)
    // aren't touched, since those need to keep scrolling normally.
    function blockOverlayScroll(e) {
      e.preventDefault();
    }

    function open() {
      build();
      panel.classList.add('active');
      overlay.classList.add('active');
      lockBodyScroll();
      overlay.addEventListener('wheel', blockOverlayScroll, { passive: false });
      overlay.addEventListener('touchmove', blockOverlayScroll, { passive: false });
      const focusable = getFocusableElements(panel);
      if (focusable.length) focusable[0].focus();
      if (config.onOpen) config.onOpen();
    }
    function close() {
      if (panel) panel.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      unlockBodyScroll();
      if (overlay) {
        overlay.removeEventListener('wheel', blockOverlayScroll);
        overlay.removeEventListener('touchmove', blockOverlayScroll);
      }
      if (config.onClose) config.onClose();
    }
    function toggle() {
      if (panel && panel.classList.contains('active')) close();
      else open();
    }
    function destroy() {
      if (shortcutListener) document.removeEventListener('keydown', shortcutListener);
      unlockBodyScroll();
      if (panel) panel.remove();
      if (overlay) overlay.remove();
      built = false;
    }
    function setPosition(pos) {
      if (panel) panel.dataset.position = pos;
    }
    function setKeyboardShortcut(combo) {
      if (shortcutListener) document.removeEventListener('keydown', shortcutListener);
      shortcutListener = null;
      if (combo) {
        shortcutListener = (e) => {
          if (formatShortcutFromEvent(e) === combo) {
            e.preventDefault();
            toggle();
          }
        };
        document.addEventListener('keydown', shortcutListener);
      }
    }
    function setTitle(title) {
      if (panel) {
        const h2 = panel.querySelector('.jlib-modal-header h2');
        if (h2) {
          h2.style.whiteSpace = 'nowrap';
          h2.style.overflow = 'hidden';
          h2.style.minWidth = '0';
          const font = JLib.fontProvider.fontType(h2, 1);
          JLib.fontProvider.layout.fitText(h2, title, font);
        }
      }
    }

    return {
      open,
      close,
      toggle,
      destroy,
      setPosition,
      setKeyboardShortcut,
      setTitle,
      get panelEl() {
        return panel;
      },
      get bodyEl() {
        return bodyEl;
      },
      get headerActionsEl() {
        return rightGroup;
      },
      formatShortcutFromEvent,
    };
  }

  const MODAL_CSS = `
    .jlib-modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 999997; display:none; }
    .jlib-modal-overlay.active { display:block; }
    .jlib-modal-panel {
      position: fixed; color: var(--jsp-text); background: var(--jsp-bg); border-radius: var(--jsp-radius, 16px); z-index:999999;
      width:700px; height:640px; max-width:94vw; max-height:82vh; box-shadow: var(--jsp-shadow); display:none; overflow:hidden; flex-direction:column;
      font-family: var(--jsp-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif);
      box-sizing: border-box;
    }
    .jlib-modal-panel.active { display:flex; }
    .jlib-modal-panel[data-position="center"] { top:50%; left:50%; transform: translate(-50%,-50%); }
    .jlib-modal-panel[data-position="topLeft"] { top:24px; left:24px; }
    .jlib-modal-panel[data-position="topRight"] { top:24px; right:24px; }
    .jlib-modal-panel[data-position="bottomLeft"] { bottom:24px; left:24px; }
    .jlib-modal-panel[data-position="bottomRight"] { bottom:24px; right:24px; }
    .jlib-modal-header { padding:18px 24px; border-bottom:1px solid var(--jsp-border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
    .jlib-modal-header h2 { margin:0; color: var(--jsp-accent); font-size:18px; font-weight:600; flex:1; min-width:0; overflow:hidden; white-space:nowrap; }
    .jlib-modal-header-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .jlib-modal-close { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:30px; height:30px; font-size:17px; cursor:pointer; }
    .jlib-modal-body { flex:1; min-height:0; overflow-y:auto; padding:20px 26px 24px; }
    .jlib-modal-footer { padding:10px 24px; border-top:1px solid var(--jsp-border); font-size:11px; color: var(--jsp-muted); flex-shrink:0; }

    /* Cross-browser scrollbars for every scroll region we create — Firefox
       reads scrollbar-width/scrollbar-color, everything else (Chrome,
       Edge, Safari) reads the ::-webkit-scrollbar-* pseudo-elements.
       Applied broadly via attribute-free class targeting so any current
       or future scroll container inside our chrome picks it up by just
       using overflow-y:auto — no per-element opt-in needed. */
    .jlib-modal-panel, .jlib-modal-panel * {
      scrollbar-width: thin;
      scrollbar-color: var(--jsp-accent) transparent;
    }
    .jlib-modal-panel *::-webkit-scrollbar { width: 8px; height: 8px; }
    .jlib-modal-panel *::-webkit-scrollbar-track { background: transparent; }
    .jlib-modal-panel *::-webkit-scrollbar-thumb { background: var(--jsp-accent); border-radius: 8px; }
    .jlib-modal-panel *::-webkit-scrollbar-thumb:hover { background: var(--jsp-accent-hover); }

    /* Defensive resets — host pages (Twitch among them) sometimes ship
       global rules targeting bare tag selectors (button, input, select)
       that are equal or higher specificity than a same-page stylesheet
       loaded later, which can silently reposition or restyle our controls
       even though the clickable hit-area stays correct (only the paint
       is affected). Resetting to unset and re-establishing only what we
       need means our own class rules below (.jlib-btn, .jlib-toggle, etc,
       already higher specificity than a bare tag selector regardless of
       load order) are what actually paints these elements, not whatever
       the host page declared for <button>/<input>/<select> globally. */
    .jlib-modal-panel button,
    .jlib-modal-panel input,
    .jlib-modal-panel select {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      font-family: inherit;
    }
    .jlib-modal-panel select {
      appearance: menulist;
    }
    .jlib-modal-panel input[type="text"],
    .jlib-modal-panel input[type="number"] {
      cursor: text;
    }
    .jlib-modal-panel *,
    .jlib-modal-panel *::before,
    .jlib-modal-panel *::after {
      box-sizing: border-box;
    }
  `;

  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = MODAL_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { create, getFocusableElements };
})();
