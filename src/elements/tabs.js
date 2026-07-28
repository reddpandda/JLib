var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

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
      // Real overflow risk zone (flagged during design, not hypothetical):
      // this sidebar is fixed-width, and a localized label can genuinely
      // be longer than the English original. fitText runs shrink -> wrap
      // -> truncate against the label's own real bounding box, which only
      // exists because it's flex:1;min-width:0 below — without that, a
      // flex child never shrinks past its own content's intrinsic width
      // and this check would trivially always "fit."
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
