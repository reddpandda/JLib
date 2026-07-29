// ============================================================================
// elements/discovery.js
// ============================================================================
/*
 * Discovery — the mechanism every element factory (button, modal, inputs,
 * tabs, search) routes through instead of guessing at creation time where
 * an element will end up. An element's real destination — our own shared
 * shadow root, or the page's real light DOM — genuinely doesn't exist
 * yet at the moment a factory creates it; this watches for the instant
 * it actually connects somewhere, and resolves from there.
 *
 * Loaded first within the elements bundle — every other element file
 * calls JLib.elements.discovery.registerPending() right before returning
 * a newly-created element to its caller.
 *
 * Depends on: JLib.shadow (dom.js), JLib.console
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

JLib.elements.discovery = (function () {
  const pending = new WeakSet(); // elements created by our factories, awaiting real connection
  const pendingCallbacks = new WeakMap(); // el -> onResolved(root)
  const notedScripts = new Set(); // which scripts' namespaces already got the one-time info note

  function checkNode(node) {
    if (!pending.has(node)) return;
    pending.delete(node);
    const cb = pendingCallbacks.get(node);
    pendingCallbacks.delete(node);
    const root = node.getRootNode();
    if (cb) cb(root);

    // One-time per-script note — fires the first time ANY content from
    // this script resolves into our own shared shadow root, not once
    // per element. Informational (console.info, not warn) — this isn't
    // a problem, it's orientation: document.head styling won't reach
    // content sealed in here, use a co-located <style> or ctx.addStyle()
    // instead.
    if (JLib.shadow.isOurRoot(root) && JLib._scriptRegistry && !notedScripts.has(JLib._scriptRegistry.namespace)) {
      notedScripts.add(JLib._scriptRegistry.namespace);
      JLib.console.info('shadow.contentInIsolatedContext');
    }
  }

  function scanAdded(node) {
    if (node.nodeType !== 1) return; // elements only
    checkNode(node);
    if (node.querySelectorAll) {
      node.querySelectorAll('*').forEach(checkNode);
    }
  }

  let observer = null;
  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach(scanAdded);
      });
    });
    // Covers ordinary light-DOM connection — the common case (an
    // author's own page, or anything appended directly to document).
    observer.observe(document, { childList: true, subtree: true });
    // Shadow trees are NOT part of what `subtree: true` on `document`
    // traverses — a separate observer target is required for content
    // that connects specifically inside our own shared shadow root.
    // Attached lazily, only once that root is actually created (see
    // JLib.shadow.onRootCreated in dom.js), so watching for this case
    // never forces the shadow root to exist before something genuinely
    // needs it.
    JLib.shadow.onRootCreated((root) => {
      observer.observe(root, { childList: true, subtree: true });
    });
  }

  // registerPending(el, onResolved) — called by an element factory right
  // after creating el, before returning it to its caller. onResolved(root)
  // fires the instant el actually connects somewhere real, with the real
  // root it resolved into (JLib.shadow's shared root, or `document`).
  function registerPending(el, onResolved) {
    ensureObserver();
    pending.add(el);
    pendingCallbacks.set(el, onResolved);
  }

  return { registerPending };
})();
