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

// ---------------------------------------------------------------------------
// shadow — the one shared shadow root all of JLib's own chrome renders
// into. 'closed' mode: CSS isolation is unconditional regardless of
// mode (confirmed — mode only gates whether outside JS can reach
// element.shadowRoot at all), closed costs nothing extra and matches
// "we're here but not reachable."
// ---------------------------------------------------------------------------
JLib.shadow = (function () {
  let hostEl = null;
  let root = null;
  const onRootCreatedCallbacks = [];

  // getRoot() -> our shared ShadowRoot, created lazily on first use —
  // nothing exists until something actually needs it.
  function getRoot() {
    if (root) return root;
    hostEl = document.createElement('div');
    hostEl.id = 'jlib-shadow-host';
    hostEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;';
    document.documentElement.appendChild(hostEl);
    root = hostEl.attachShadow({ mode: 'closed' });
    onRootCreatedCallbacks.forEach((cb) => cb(root));
    return root;
  }

  // onRootCreated(cb) — fires the instant our shared root is actually
  // created (or immediately, if it already exists). Exists so
  // discovery.js can attach its own MutationObserver to the shadow root
  // the moment it's real, without dom.js needing to know discovery.js
  // exists at all, and without forcing the root to exist any earlier
  // than something genuinely needs it — MutationObserver targeting
  // `document` does NOT see mutations happening inside a shadow tree at
  // all (confirmed — shadow trees aren't part of the light-DOM
  // descendant tree `subtree: true` traverses), so watching the shadow
  // root itself always needs its own, separate observer target.
  function onRootCreated(cb) {
    if (root) cb(root);
    else onRootCreatedCallbacks.push(cb);
  }

  // isOurRoot(rootNode) -> true only if rootNode is literally our own
  // shared shadow root (reference equality) — the exact test the
  // color provider's sampling-fidelity buckets need: is this element
  // one of our own floating chrome pieces, or does it belong to the
  // real page (or some other shadow root entirely)?
  function isOurRoot(rootNode) {
    return root !== null && rootNode === root;
  }

  // Which (sheet, root) pairs have already been adopted — permanent
  // membership, not a time-windowed cache, which is why this is a
  // direct WeakMap rather than routed through JLib.dedupe.memoSync:
  // memoSync is shaped for collapsing repeated calls within a window
  // (its cache only persists at all when given a ttlMs > 0), not for
  // "has this ever happened, permanently" — the actual question here,
  // same shape as the original per-context stylesInjected flag this
  // replaces, just tracked per (sheet, root) pair instead of globally.
  const adoptedPairs = new WeakMap(); // root -> Set<sheet>

  // adoptStylesheet(sheet, rootNode) — pushes a constructable stylesheet
  // onto a specific root's adoptedStyleSheets, skipping the redundant
  // push if this exact pair has already been adopted. Parsing itself
  // only ever happens once regardless (that's the whole point of
  // constructable stylesheets) — this only saves the trivial array
  // work of re-adopting something already adopted.
  function adoptStylesheet(sheet, rootNode) {
    let seen = adoptedPairs.get(rootNode);
    if (!seen) {
      seen = new Set();
      adoptedPairs.set(rootNode, seen);
    }
    if (seen.has(sheet)) return;
    seen.add(sheet);
    rootNode.adoptedStyleSheets = rootNode.adoptedStyleSheets.concat([sheet]);
  }

  return { getRoot, isOurRoot, adoptStylesheet, onRootCreated };
})();
