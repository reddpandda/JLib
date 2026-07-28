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
