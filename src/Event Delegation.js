/*
 * Event Delegation Helper — one listener on a stable container, matched
 * against dynamically-added descendants via closest(). No privileged APIs.
 *
 * Note on provenance, unlike dom-toolkit/settings-schema: the userscript
 * that dom-toolkit and settings-schema were ported from didn't actually
 * have a delegation pattern to port — it binds handlers directly to
 * elements it builds itself, and finds/clicks page elements via fresh
 * querySelectorAll passes rather than delegated listening. This is
 * instead generalized from a different project's closest()-based tile
 * click correlation (`e.target.closest('[data-item-id]')` inside a raw
 * capture-phase listener) — the same shape, formalized so you're not
 * hand-rolling it per script.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.events = (function () {
  // container: element to attach the single real listener to (defaults to
  //   document — use a narrower, stable ancestor when one exists, since
  //   it's cheaper and avoids matching unrelated parts of the page).
  // eventType: 'click', 'mouseover', etc.
  // selector: CSS selector matched via closest() against e.target.
  // handler: called as handler(event, matchedElement) — matchedElement is
  //   the closest() result, not e.target, so you don't have to re-derive
  //   it inside every handler.
  // options: passed through to addEventListener (e.g. { capture: true }
  //   if you need to observe before the site's own handlers run).
  //
  // Returns an off() function that removes the listener — call it on
  // script teardown, SPA navigation cleanup, or when a feature toggles off,
  // per the "every listener/timer gets an exit path" convention already
  // established in your other scripts.
  function on(container, eventType, selector, handler, options) {
    container = container || document;

    function listener(e) {
      const matched = e.target.closest ? e.target.closest(selector) : null;
      if (matched && container.contains(matched)) {
        handler(e, matched);
      }
    }

    container.addEventListener(eventType, listener, options);
    return function off() {
      container.removeEventListener(eventType, listener, options);
    };
  }

  // Convenience for the common "delegate on document, capture phase"
  // shape — same as on(document, eventType, selector, handler, { capture:
  // true }), just named for the common case.
  function onCapture(eventType, selector, handler) {
    return on(document, eventType, selector, handler, true);
  }

  return { on, onCapture };
})();
