// ============================================================================
// services/utils.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
/*
 * Small shared utilities: debounce, throttle, makeLogger. No DOM, no
 * privileged APIs — safe in any context (extension background page or
 * userscript sandbox).
 *
 * debounce() is the formalized version of a clearTimeout/setTimeout
 * pattern an existing userscript hand-rolls inline for its
 * MutationObserver callback (`clearTimeout(observerTimeout);
 * observerTimeout = setTimeout(processPage, 100)`) — same behavior,
 * reusable instead of retyped per script. throttle() is new, same family.
 * makeLogger() formalizes a `[ScriptName vX.Y.Z]` console-prefix
 * convention used throughout that same script.
 */

JLib.utils = (function () {
  // Trailing-edge debounce: fn runs `wait`ms after the last call, not the
  // first. Matches the MutationObserver pattern exactly — a burst of
  // mutations resets the timer each time, and processPage() only actually
  // runs once the burst settles.
  function debounce(fn, wait) {
    let timer = null;
    function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, wait);
    }
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }

  // debouncePerKey(fn, wait) — like debounce(), but keyed: each distinct
  // first argument gets its own independent timer instead of all calls
  // sharing one. Fixes a real, confirmed bug — plain debounce() used for
  // a keyed operation (e.g. "flush this specific cache key to disk")
  // silently drops every call except the last one within the window,
  // since clearTimeout() on a shared timer cancels whatever the PREVIOUS
  // call was about to do, regardless of whether it was for a different
  // key. fn's first argument is used as the key; every argument
  // (including that key) is still passed through to fn when it fires.
  function debouncePerKey(fn, wait) {
    const timers = new Map(); // key -> timer id
    function debounced(key, ...rest) {
      if (timers.has(key)) clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn(key, ...rest);
        }, wait)
      );
    }
    debounced.cancel = (key) => {
      if (key === undefined) {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
        return;
      }
      if (timers.has(key)) {
        clearTimeout(timers.get(key));
        timers.delete(key);
      }
    };
    return debounced;
  }

  // Leading-edge throttle: fn runs immediately on the first call, then at
  // most once per `wait`ms while calls keep coming. Different tradeoff
  // than debounce on purpose — use throttle when you want the FIRST event
  // in a burst handled right away (e.g. a scroll/resize handler that
  // should react immediately, then rate-limit), debounce when you want to
  // wait for the burst to end (e.g. "the DOM has stopped changing, now
  // scan it").
  function throttle(fn, wait) {
    let lastCall = 0;
    let timer = null;
    function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - lastCall);
      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        lastCall = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    }
    throttled.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return throttled;
  }

  // makeLogger('MyScript', '2.3.0') -> { log, warn, error }, each
  // prefixed with '[MyScript v2.3.0]'. version is optional — omit it for
  // a plain '[MyScript]' prefix.
  function makeLogger(name, version) {
    const prefix = version ? `[${name} v${version}]` : `[${name}]`;
    return {
      log: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
    };
  }

  // sampleStructuralValue(boundaryEl, readValue, isUsable) — shared
  // scan-and-majority-vote helper, currently used by radius/shadow
  // providers (border-provider.js scans its own candidates directly
  // instead, since it needs to split a color component out from
  // width/style, which this generic string-returning helper can't do).
  // Was previously a bare, un-namespaced module-scope function called
  // directly by name from provider files — moved onto JLib.utils so
  // every call site is explicit about where it comes from, consistent
  // with every other shared helper in this codebase.
  function sampleStructuralValue(boundaryEl, readValue, isUsable) {
    const candidates = Array.prototype.slice.call(boundaryEl.querySelectorAll('button, [role="button"], .card, [class*="card"], [class*="panel"], [class*="modal"]')).slice(0, 20);
    candidates.unshift(boundaryEl);
    const counts = new Map();
    let best = null;
    let bestCount = 0;
    candidates.forEach((node) => {
      const val = readValue(node);
      if (!isUsable(val)) return;
      const count = (counts.get(val) || 0) + 1;
      counts.set(val, count);
      if (count > bestCount) {
        bestCount = count;
        best = val;
      }
    });
    return best;
  }

  return { debounce, throttle, debouncePerKey, makeLogger, sampleStructuralValue };
})();
