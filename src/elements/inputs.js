var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/inputs.js
// ============================================================================
/*
 * Inputs — toggle, dropdown, number, and text row builders. button() was
 * split out into elements/button.js; actionRow() here delegates to it.
 *
 * Style delivery: one constructable stylesheet, adopted via discovery
 * the instant a row's wrapper element actually connects — registered
 * once, in rowWrapper(), since every row builder returns through it.
 *
 * Depends on: JLib.dom, JLib.elements.button, JLib.elements.discovery
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
    const wrapper = el('div', { className: cls }, [info, control]);
    JLib.elements.discovery.registerPending(wrapper, (root) => {
      JLib.shadow.adoptStylesheet(INPUTS_SHEET, root);
    });
    return wrapper;
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
  const INPUTS_SHEET = new CSSStyleSheet();
  INPUTS_SHEET.replaceSync(INPUTS_CSS);

  return { toggleRow, dropdownRow, numberRow, textRow, actionRow, makeKeyboardActivatable };
})();
