/*
 * elements.js — reusable visual primitives: buttons, form rows (toggle/
 * dropdown/number/text), the modal/overlay shell, tab navigation, and search.
 * Depends on services.js (JLib.dom, JLib.utils) being @required first.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/button.js
// ============================================================================
/*
 * Button — plain button, no row/label wrapper. Split out of
 * elements/inputs.js into its own file since it's used standalone far
 * more often than the row builders (toolbar actions, cog controls,
 * dismiss buttons) rather than always being part of a settings row.
 *
 * Depends on: JLib.dom
 */


JLib.elements.button = (function () {
  const { el } = JLib.dom;

  // button(label, onClick, opts?) -> HTMLButtonElement
  // opts.className: extra class(es) appended to the base style
  // opts.disabled: renders disabled, no click handler attached
  // opts.variant: 'default' | 'danger' | 'ghost' — visual weight only
  function button(label, onClick, opts) {
    opts = opts || {};
    const variantClass = opts.variant && opts.variant !== 'default' ? ' jlib-btn-' + opts.variant : '';
    const btn = el('button', { className: 'jlib-btn' + variantClass + (opts.className ? ' ' + opts.className : '') }, [label]);
    btn.disabled = !!opts.disabled;
    if (!opts.disabled && onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  const BUTTON_CSS = `
    .jlib-btn { background: var(--jsp-hover); color: var(--jsp-muted); border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:12px; }
    .jlib-btn:hover { color: var(--jsp-text); }
    .jlib-btn-danger:hover { background: rgba(231,76,60,.15); color: var(--jsp-danger); }
    .jlib-btn-ghost { background: transparent; }
    .jlib-btn:disabled { opacity:.4; cursor:default; pointer-events:none; }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = BUTTON_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { button };
})();

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
        if (h2) h2.textContent = title;
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
      position: fixed; color: var(--jsp-text); background: var(--jsp-bg); border-radius:16px; z-index:999999;
      width:700px; height:640px; max-width:94vw; max-height:82vh; box-shadow: var(--jsp-shadow); display:none; overflow:hidden; flex-direction:column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      box-sizing: border-box;
    }
    .jlib-modal-panel.active { display:flex; }
    .jlib-modal-panel[data-position="center"] { top:50%; left:50%; transform: translate(-50%,-50%); }
    .jlib-modal-panel[data-position="topLeft"] { top:24px; left:24px; }
    .jlib-modal-panel[data-position="topRight"] { top:24px; right:24px; }
    .jlib-modal-panel[data-position="bottomLeft"] { bottom:24px; left:24px; }
    .jlib-modal-panel[data-position="bottomRight"] { bottom:24px; right:24px; }
    .jlib-modal-header { padding:18px 24px; border-bottom:1px solid var(--jsp-border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
    .jlib-modal-header h2 { margin:0; color: var(--jsp-accent); font-size:18px; font-weight:600; }
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

// ============================================================================
// elements/inputs.js
// ============================================================================
/*
 * Inputs — toggle, dropdown, number, and text row builders. button() was
 * split out into elements/button.js; actionRow() here delegates to it.
 *
 * Depends on: JLib.dom, JLib.elements.button
 */


JLib.elements.inputs = (function () {
  const { el } = JLib.dom;

  function makeKeyboardActivatable(elm) {
    elm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        elm.click();
      }
    });
  }

  function rowWrapper(info, control, opts) {
    let cls = 'jlib-row';
    if (opts.child) cls += ' jlib-row-child';
    if (opts.interactive === false) cls += ' jlib-row-disabled';
    return el('div', { className: cls }, [info, control]);
  }

  function infoBlock(label, desc) {
    return el('div', { className: 'jlib-row-info' }, [el('div', { className: 'jlib-row-label' }, [label]), el('div', { className: 'jlib-row-desc' }, [desc])]);
  }

  function toggleRow(label, desc, checked, onChange, opts) {
    opts = opts || {};
    const interactive = opts.interactive !== false;
    const slider = el('div', { className: 'jlib-toggle-slider' });
    const toggle = el(
      'div',
      {
        className: 'jlib-toggle' + (checked ? ' active' : ''),
        attrs: interactive ? { tabindex: '0', role: 'switch', 'aria-checked': String(checked) } : {},
      },
      [slider]
    );
    if (interactive) {
      toggle.addEventListener('click', () => onChange(!checked));
      makeKeyboardActivatable(toggle);
    }
    return rowWrapper(infoBlock(label, desc), toggle, opts);
  }

  function dropdownRow(label, desc, options, value, onChange, opts) {
    opts = opts || {};
    const select = el(
      'select',
      { className: 'jlib-select' },
      options.map((o) => el('option', { attrs: o.value === value ? { value: o.value, selected: 'selected' } : { value: o.value } }, [o.label]))
    );
    select.value = value;
    select.disabled = opts.interactive === false;
    select.addEventListener('change', () => onChange(select.value));
    return rowWrapper(infoBlock(label, desc), select, opts);
  }

  function numberRow(label, desc, feature, value, onChange, opts) {
    opts = opts || {};
    const attrs = { type: 'number' };
    if (feature.min !== undefined) attrs.min = feature.min;
    if (feature.max !== undefined) attrs.max = feature.max;
    if (feature.step !== undefined) attrs.step = feature.step;
    const input = el('input', { className: 'jlib-number-input', attrs });
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
    return rowWrapper(infoBlock(label, desc), input, opts);
  }

  function textRow(label, desc, feature, value, onChange, opts) {
    opts = opts || {};
    const attrs = { type: 'text' };
    if (feature.maxLength !== undefined) attrs.maxlength = feature.maxLength;
    const input = el('input', { className: 'jlib-text-input', attrs });
    input.value = value || '';
    input.disabled = opts.interactive === false;
    input.addEventListener('change', () => {
      if (feature.pattern && !new RegExp(feature.pattern).test(input.value)) {
        input.value = value || '';
        return;
      }
      onChange(input.value);
    });
    return rowWrapper(infoBlock(label, desc), input, opts);
  }

  function actionRow(label, desc, onClick, opts) {
    opts = opts || {};
    const btn = JLib.elements.button.button(opts.buttonLabel || label, opts.interactive === false ? null : onClick, { disabled: opts.interactive === false });
    return rowWrapper(infoBlock(label, desc), btn, opts);
  }

  const INPUTS_CSS = `
    .jlib-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--jsp-border); gap:16px; }
    .jlib-row-info { flex:1; min-width:0; padding-right:12px; }
    .jlib-row-label { font-size:13px; font-weight:500; }
    .jlib-row-desc { font-size:11px; color: var(--jsp-muted); margin-top:2px; line-height:1.4; }
    .jlib-row-child { margin-left:16px; padding-left:12px; border-left:2px solid var(--jsp-accent-bg); }
    .jlib-row-disabled { opacity:.4; }
    .jlib-row-disabled .jlib-toggle, .jlib-row-disabled select, .jlib-row-disabled input, .jlib-row-disabled button { pointer-events:none; }
    .jlib-toggle { position:relative; width:42px; height:23px; background: var(--jsp-toggle-off); border-radius:12px; cursor:pointer; flex-shrink:0; }
    .jlib-toggle.active { background: var(--jsp-accent); }
    .jlib-toggle-slider { position:absolute; top:2px; left:2px; width:19px; height:19px; background:#fff; border-radius:50%; transition: transform .2s; }
    .jlib-toggle.active .jlib-toggle-slider { transform: translateX(19px); }
    .jlib-select, .jlib-number-input, .jlib-text-input { background: var(--jsp-hover); color: var(--jsp-text); border:1px solid var(--jsp-border); border-radius:6px; padding:6px 8px; font-size:12px; min-width:120px; }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = INPUTS_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { toggleRow, dropdownRow, numberRow, textRow, actionRow, makeKeyboardActivatable };
})();

// ============================================================================
// elements/tabs.js
// ============================================================================
/*
 * Tabs — generic vertical nav list, extracted from settings-panel.js v1's
 * buildNavItem()/renderSidebar(). v1's version was settings-specific
 * (scopes + "Panel Settings" + extraSections hardcoded); this version is
 * a plain { items, activeId, onSelect } list so both Settings Panel and
 * the dashboard's module-switcher can use the same element instead of
 * each hand-rolling nav markup.
 *
 * Depends on: JLib.dom
 */


JLib.elements.tabs = (function () {
  const { el } = JLib.dom;
  const { makeKeyboardActivatable } = JLib.elements.inputs;

  // items: [{ id, label, badge? (DOM node), groupLabel? }]
  // groupLabel on an item starts a new labeled section before it (matches
  // v1's "Scopes" / "Settings" sidebar-label divider behavior).
  function render(container, items, activeId, onSelect) {
    while (container.firstChild) container.removeChild(container.firstChild);
    let lastGroup = null;
    items.forEach((item) => {
      if (item.groupLabel && item.groupLabel !== lastGroup) {
        if (lastGroup !== null) container.appendChild(el('div', { className: 'jlib-tabs-divider' }));
        container.appendChild(el('div', { className: 'jlib-tabs-label' }, [item.groupLabel]));
        lastGroup = item.groupLabel;
      }
      const children = [el('span', {}, [item.label])];
      if (item.badge) children.push(item.badge);
      const node = el(
        'div',
        { className: 'jlib-tab-item' + (item.id === activeId ? ' active' : ''), attrs: { tabindex: '0', role: 'button' } },
        children
      );
      node.addEventListener('click', () => onSelect(item.id));
      makeKeyboardActivatable(node);
      container.appendChild(node);
    });
  }

  const TABS_CSS = `
    .jlib-tabs-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color: var(--jsp-muted); padding:6px 10px 4px; }
    .jlib-tabs-divider { height:1px; background: var(--jsp-border); margin:8px 6px; }
    .jlib-tab-item { display:flex; justify-content:space-between; align-items:center; padding:7px 10px; margin:1px 0; border-radius:6px; border-left:2px solid transparent; cursor:pointer; font-size:13px; }
    .jlib-tab-item:hover { background: var(--jsp-hover); }
    .jlib-tab-item.active { background: var(--jsp-accent-bg); border-left-color: var(--jsp-accent); color: var(--jsp-accent); font-weight:600; }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = TABS_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { render };
})();

// ============================================================================
// elements/search-input.js
// ============================================================================
/*
 * Search — tokenized "smart-enough" fuzzy search. The matching engine
 * (normalize/tokenize/editDistance/fuzzyTolerance/scoreToken/matchScore)
 * is ported verbatim from the settings-panel.js branch this was built in
 * — stop-word filtering, diacritic folding, tiered exact/prefix/substring
 * scoring, and length-scaled fuzzy tolerance (under 4 chars: exact/
 * substring only, 4-6: 1 edit, 7+: 2 edits). Deliberately does NOT do
 * stemming (collides with i18n — stemming rules are per-language) or
 * phonetic matching (wrong tool for UI label text, that's for matching
 * misspelled names).
 *
 * inputField() adds the UI half — a debounced text input, since running
 * matchScore() against every candidate on every keystroke with no
 * debounce is real, avoidable CPU work.
 *
 * Depends on: JLib.dom, JLib.utils (debounce)
 */


JLib.elements.search = (function () {
  const { el } = JLib.dom;
  const { debounce } = JLib.utils;

  // ---------- matching engine ----------
  const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'is', 'are']);

  function foldDiacritics(s) {
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }
  function normalizeText(s) {
    return foldDiacritics(String(s).toLowerCase())
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokenize(s) {
    return normalizeText(s)
      .split(' ')
      .filter((tok) => tok && !STOP_WORDS.has(tok));
  }
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return Infinity;
    const dp = [];
    for (let i = 0; i <= a.length; i++) dp.push([i]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        rowMin = Math.min(rowMin, dp[i][j]);
      }
      if (rowMin > max) return Infinity;
    }
    return dp[a.length][b.length];
  }
  function fuzzyTolerance(len) {
    if (len < 4) return 0;
    if (len <= 6) return 1;
    return 2;
  }
  function scoreToken(qTok, cTok) {
    if (qTok === cTok) return 100;
    if (cTok.indexOf(qTok) === 0) return 70;
    if (cTok.indexOf(qTok) !== -1) return 50;
    const tol = fuzzyTolerance(Math.max(qTok.length, cTok.length));
    if (tol > 0) {
      const d = editDistance(qTok, cTok, tol);
      if (d <= tol) return 30 - d * 5;
    }
    return 0;
  }
  // Every query token must match something in the candidate (AND across
  // query tokens, best-match OR within candidate tokens) or the whole
  // thing scores 0.
  function matchScore(queryTokensOrString, candidateText) {
    const qTokens = Array.isArray(queryTokensOrString) ? queryTokensOrString : tokenize(queryTokensOrString);
    if (!qTokens.length) return 0;
    const candidateTokens = tokenize(candidateText);
    let total = 0;
    for (const qTok of qTokens) {
      let best = 0;
      for (const cTok of candidateTokens) best = Math.max(best, scoreToken(qTok, cTok));
      if (best === 0) return 0;
      total += best;
    }
    return total;
  }

  // search(items, query, getText) -> items sorted by score desc, score-0
  // items excluded. getText(item) -> string to match against; defaults
  // to String(item) for plain string arrays.
  function search(items, query, getText) {
    getText = getText || ((x) => String(x));
    const qTokens = tokenize(query);
    if (!qTokens.length) return items.slice();
    return items
      .map((item) => ({ item, score: matchScore(qTokens, getText(item)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }

  // ---------- UI: debounced search input ----------
  // inputField({ placeholder, debounceMs, onQuery }) -> HTMLInputElement
  // onQuery(rawQueryString) fires debounceMs after the user stops typing,
  // not on every keystroke.
  function inputField(opts) {
    opts = opts || {};
    const debounceMs = opts.debounceMs !== undefined ? opts.debounceMs : 200;
    const input = el('input', { className: 'jlib-search-input', attrs: { type: 'text', placeholder: opts.placeholder || 'Search...' } });
    const fireQuery = debounce(() => opts.onQuery && opts.onQuery(input.value), debounceMs);
    input.addEventListener('input', fireQuery);
    return input;
  }

  const SEARCH_CSS = `
    .jlib-search-input { width:100%; background: var(--jsp-hover); color: var(--jsp-text); border:1px solid var(--jsp-border); border-radius:8px; padding:8px 12px; font-size:13px; box-sizing:border-box; }
    .jlib-search-input:focus { outline:none; border-color: var(--jsp-accent); }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = SEARCH_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { normalize: normalizeText, foldDiacritics, tokenize, editDistance, fuzzyTolerance, matchScore, search, inputField };
})();
