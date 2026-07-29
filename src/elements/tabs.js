var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/tabs.js
// ============================================================================
/*
 * Tabs — generic vertical nav list. render(container, ...) always
 * receives an already-connected container (the sidebar, appended to the
 * shell earlier by its caller) — unlike a factory that returns a
 * freshly-created, not-yet-inserted element, there's nothing to wait
 * for here: container.getRootNode() is already meaningful the instant
 * render() runs, so stylesheet adoption happens directly, synchronously,
 * with no need for elements/discovery.js's pending-connection mechanism.
 *
 * Depends on: JLib.dom, JLib.elements.inputs, JLib.fontProvider
 */

JLib.elements.tabs = (function () {
  const { el } = JLib.dom;
  const { makeKeyboardActivatable } = JLib.elements.inputs;

  // items: [{ id, label, badge? (DOM node), groupLabel? }]
  function render(container, items, activeId, onSelect) {
    JLib.shadow.adoptStylesheet(TABS_SHEET, container.getRootNode());
    while (container.firstChild) container.removeChild(container.firstChild);
    let lastGroup = null;
    items.forEach((item) => {
      if (item.groupLabel && item.groupLabel !== lastGroup) {
        if (lastGroup !== null) container.appendChild(el('div', { className: 'jlib-tabs-divider' }));
        container.appendChild(el('div', { className: 'jlib-tabs-label' }, [item.groupLabel]));
        lastGroup = item.groupLabel;
      }
      const labelSpan = el('span', { className: 'jlib-tab-item-label' }, [item.label]);
      const children = [labelSpan];
      if (item.badge) children.push(item.badge);
      const node = el(
        'div',
        { className: 'jlib-tab-item' + (item.id === activeId ? ' active' : ''), attrs: { tabindex: '0', role: 'button' } },
        children
      );
      node.addEventListener('click', () => onSelect(item.id));
      makeKeyboardActivatable(node);
      container.appendChild(node);
      const font = JLib.fontProvider.fontType(node, 1);
      JLib.fontProvider.layout.fitText(labelSpan, item.label, font);
    });
  }

  const TABS_CSS = `
    .jlib-tabs-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color: var(--jsp-muted); padding:6px 10px 4px; }
    .jlib-tabs-divider { height:1px; background: var(--jsp-border); margin:8px 6px; }
    .jlib-tab-item { display:flex; justify-content:space-between; align-items:center; padding:7px 10px; margin:1px 0; border-radius:6px; border-left:2px solid transparent; cursor:pointer; font-size:13px; }
    .jlib-tab-item-label { flex:1; min-width:0; overflow:hidden; }
    .jlib-tab-item:hover { background: var(--jsp-hover); }
    .jlib-tab-item.active { background: var(--jsp-accent-bg); border-left-color: var(--jsp-accent); color: var(--jsp-accent); font-weight:600; }
  `;
  const TABS_SHEET = new CSSStyleSheet();
  TABS_SHEET.replaceSync(TABS_CSS);

  return { render };
})();
