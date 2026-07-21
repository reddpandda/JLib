/*
 * DOM Toolkit — el()/h() builder, $/$$ selector shortcuts, toast().
 * Pure DOM construction, no privileged APIs. @require this directly into
 * any userscript.
 *
 * el()/h() is ported near-verbatim from the Streaming Suite script
 * (opts: className/id/dataset/attrs, children: array) rather than
 * reinvented — that's the version with actual mileage on it across a real,
 * shipped settings panel.  $/$$ and toast() are new, built to match its
 * conventions.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

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

  // Event listeners aren't part of opts (same convention as the source
  // script) — attach with .addEventListener on the returned node, same as
  // every call site in Streaming Suite does today. Keeping it that way
  // rather than adding onClick-style magic keeps this a drop-in match for
  // code you already know how to read.
  const h = el;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // Transient inline notification — no CSS class dependency (no @grant
  // GM_addStyle assumed), everything styled via the attrs.style string so
  // this works in any script regardless of what it's granted. Auto-removes
  // after `duration`ms; returns a dismiss() you can call early.
  const TOAST_BASE_STYLE =
    'position:fixed;bottom:24px;right:24px;z-index:999999;' +
    'background:#14141c;color:#e8e8e8;padding:10px 16px;border-radius:8px;' +
    'font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;' +
    'transition:opacity 0.2s ease,transform 0.2s ease;transform:translateY(8px);' +
    'pointer-events:none;max-width:320px;';

  function toast(message, opts) {
    opts = opts || {};
    const duration = opts.duration !== undefined ? opts.duration : 3000;
    const extraStyle = opts.style || '';

    const node = el('div', { attrs: { style: TOAST_BASE_STYLE + extraStyle } }, [message]);
    document.body.appendChild(node);

    // Next frame, so the initial opacity:0/translateY(8px) actually
    // transitions instead of the node appearing in its final state.
    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    });

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => node.remove(), 220);
    }

    if (duration > 0) setTimeout(dismiss, duration);
    return dismiss;
  }

  return { el, h, $, $$, toast };
})();