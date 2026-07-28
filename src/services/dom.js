// ============================================================================
// services/dom.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
/*
 * DOM — el()/h() builder, $/$$ selector shortcuts. Pure DOM construction,
 * no privileged APIs.
 *
 * toast() lived here in v1 (dom-toolkit.js) — moved to services/notifications.js
 * in this rewrite, since it grew into a real staling-engine-backed service
 * and doesn't belong bundled with plain DOM construction anymore.
 */

JLib.dom = (function () {
  function el(tag, opts, children) {
    opts = opts || {};
    children = children || [];
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.id) node.id = opts.id;
    if (opts.dataset) {
      for (const k in opts.dataset) node.dataset[k] = opts.dataset[k];
    }
    if (opts.attrs) {
      for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
    }
    children.forEach((child) => {
      if (child === null || child === undefined) return;
      if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    });
    return node;
  }

  const h = el;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  return { el, h, $, $$ };
})();
