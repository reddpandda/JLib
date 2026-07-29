var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/modal.js
// ============================================================================
/*
 * Modal — native <dialog> + showModal(), styled directly as the real
 * panel (no invisible wrapper, no hand-built overlay div). Real,
 * borrowed behavior instead of owned code wherever the platform already
 * does the job correctly: native top-layer promotion (structural
 * z-fighting win — no z-index management needed against a hostile host
 * page), native ::backdrop, native focus-trap on open.
 *
 * One deliberate override: native Tab-cycling escapes to the browser's
 * own chrome once it reaches the last focusable element (a real,
 * documented W3C APA decision, not a bug) — kept as an owned piece
 * because a fully-looping trap is the behavior this library wants.
 * Everything else about the native focus-trap — correct even through
 * shadow DOM boundaries, confirmed — is left alone.
 *
 * Scroll-lock and click-outside-close both needed zero changes from the
 * pre-<dialog> version — scroll-lock only ever touched document.body,
 * and click-outside-close is a direct listener on the dialog element
 * itself (clicking the ::backdrop area lands the click event's target
 * on the dialog, not on any of its content), neither of which depends
 * on the overlay div this version removes.
 *
 * config.appendTo — defaults to JLib.shadow.getRoot(), since both real
 * call sites in this codebase (the dashboard/standalone shell, the
 * notification modal presenter) are JLib's own internal chrome and
 * belong there. An author calling this directly for their own separate
 * modal can pass document.body (or anywhere else) explicitly — shortcut,
 * never a requirement, in the direction that matters here: nothing
 * forces an author's own modal into our shadow root against their will.
 *
 * Depends on: JLib.dom, JLib.shadow, JLib.fontProvider
 */

JLib.elements.modal = (function () {
  const { el } = JLib.dom;

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

  // Real focusable elements inside a live root — used only for our own
  // kept Tab-loop, not for native focus-trapping (the browser already
  // does that correctly on showModal(), including through shadow
  // boundaries).
  function getFocusableElements(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll('button, [tabindex], input, select, a[href]'))
      .filter((elm) => !elm.disabled && elm.offsetParent !== null);
  }

  // create({ id, title, position, content: (bodyEl) => void, footerText,
  //   keyboardShortcut, onOpen, onClose, appendTo }) -> { open, close,
  //   toggle, destroy, panelEl, bodyEl }
  function create(config) {
    config = config || {};
    if (!config.id) throw new Error('JLib.elements.modal.create requires config.id');

    let built = false;
    let panel, bodyEl, shortcutListener, rightGroup;

    function build() {
      if (built) return;
      built = true;

      const closeBtn = el('button', { className: 'jlib-modal-close' }, ['\u00d7']);
      rightGroup = el('div', { className: 'jlib-modal-header-actions' }, [closeBtn]);
      const header = el('div', { className: 'jlib-modal-header' }, [el('h2', {}, [config.title || '']), rightGroup]);
      bodyEl = el('div', { className: 'jlib-modal-body' });
      const footer = config.footerText ? el('div', { className: 'jlib-modal-footer' }, [config.footerText]) : null;

      // The dialog IS the panel — styled directly, no separate wrapper.
      panel = el(
        'dialog',
        { className: 'jlib-modal-panel', id: config.id, attrs: { 'data-position': config.position || 'center' } },
        [header, bodyEl].concat(footer ? [footer] : [])
      );

      const appendTarget = config.appendTo || JLib.shadow.getRoot();
      appendTarget.appendChild(panel);
      JLib.shadow.adoptStylesheet(MODAL_SHEET, panel.getRootNode());

      if (config.content) config.content(bodyEl);

      closeBtn.addEventListener('click', close);
      // Click-outside-close: a click that lands on the dialog element
      // itself (not any of its content) means it landed on the
      // ::backdrop area — clicking real content inside the dialog never
      // reaches this listener as `e.target === panel`, since the click
      // target is whatever specific element was actually clicked.
      panel.addEventListener('click', (e) => {
        if (e.target === panel) close();
      });
      panel.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        // The one deliberate override: native Tab-cycling escapes to
        // browser chrome once it passes the last focusable element —
        // real W3C APA decision, not a bug, but this library wants a
        // fully-looping trap instead. Intercepting here means the
        // native fallback-to-chrome behavior never gets a chance to
        // fire, since we've already claimed the keydown.
        const focusable = getFocusableElements(panel);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        // panel.getRootNode().activeElement, not document.activeElement
        // — confirmed spec behavior: document.activeElement retargets to
        // the shadow HOST when the real focused element is inside a
        // shadow tree, so a direct comparison against document.activeElement
        // would silently never match once this panel lives in our shadow
        // root. getRootNode() on an element inside a shadow tree returns
        // that tree's own root, which carries the real, non-retargeted
        // activeElement.
        const activeEl = panel.getRootNode().activeElement;
        if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
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

    function open() {
      build();
      panel.showModal(); // native top-layer, native ::backdrop, native
                          // inert-ification of everything outside — all
                          // borrowed, none of it owned code
      lockBodyScroll();
      if (config.onOpen) config.onOpen();
    }
    function close() {
      if (panel && panel.open) panel.close();
      unlockBodyScroll();
      if (config.onClose) config.onClose();
    }
    function toggle() {
      if (panel && panel.open) close();
      else open();
    }
    function destroy() {
      if (shortcutListener) document.removeEventListener('keydown', shortcutListener);
      unlockBodyScroll();
      if (panel) panel.remove();
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
    .jlib-modal-panel {
      color: var(--jsp-text); background: var(--jsp-bg); border-radius: var(--jsp-radius, 16px); border: none; padding: 0;
      width:700px; height:640px; max-width:94vw; max-height:82vh; box-shadow: var(--jsp-shadow); overflow:hidden; flex-direction:column;
      font-family: var(--jsp-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif);
      box-sizing: border-box;
    }
    .jlib-modal-panel::backdrop { background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .jlib-modal-panel[open] { display:flex; }
    .jlib-modal-panel[data-position="center"] { margin: auto; }
    .jlib-modal-panel[data-position="topLeft"] { margin: 24px auto auto 24px; }
    .jlib-modal-panel[data-position="topRight"] { margin: 24px 24px auto auto; }
    .jlib-modal-panel[data-position="bottomLeft"] { margin: auto auto 24px 24px; }
    .jlib-modal-panel[data-position="bottomRight"] { margin: auto 24px 24px auto; }
    .jlib-modal-header { padding:18px 24px; border-bottom:1px solid var(--jsp-border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
    .jlib-modal-header h2 { margin:0; color: var(--jsp-accent); font-size:18px; font-weight:600; flex:1; min-width:0; overflow:hidden; white-space:nowrap; }
    .jlib-modal-header-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .jlib-modal-close { background: var(--jsp-hover); border:none; border-radius:50%; color: var(--jsp-muted); width:30px; height:30px; font-size:17px; cursor:pointer; }
    .jlib-modal-body { flex:1; min-height:0; overflow-y:auto; padding:20px 26px 24px; }
    .jlib-modal-footer { padding:10px 24px; border-top:1px solid var(--jsp-border); font-size:11px; color: var(--jsp-muted); flex-shrink:0; }

    .jlib-modal-panel, .jlib-modal-panel * {
      scrollbar-width: thin;
      scrollbar-color: var(--jsp-accent) transparent;
    }
    .jlib-modal-panel *::-webkit-scrollbar { width: 8px; height: 8px; }
    .jlib-modal-panel *::-webkit-scrollbar-track { background: transparent; }
    .jlib-modal-panel *::-webkit-scrollbar-thumb { background: var(--jsp-accent); border-radius: 8px; }
    .jlib-modal-panel *::-webkit-scrollbar-thumb:hover { background: var(--jsp-accent-hover); }

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
  const MODAL_SHEET = new CSSStyleSheet();
  MODAL_SHEET.replaceSync(MODAL_CSS);

  return { create, getFocusableElements };
})();
