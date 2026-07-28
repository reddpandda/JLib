// ============================================================================
// services/dedupe.js
// ============================================================================
/*
 * dedupe — if several callers ask for the same expensive operation in a
 * short window, do the work once and share the result, instead of each
 * caller redoing it independently. General-purpose, not tied to any one
 * subsystem; its first real consumer is superProvider.css, which was
 * independently re-resolving the same anchor boundary once per
 * mini-provider it called — the actual bug this was built to fix.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.dedupe = (function () {
  const inFlight = new Map(); // key -> Promise
  const memoCache = new Map(); // key -> { value, expiresAt }

  // once(key, fn) — if a call for `key` is already in flight, returns the
  // SAME promise rather than calling fn again. fn may be sync or return a
  // promise either way; the result is normalized to a promise.
  function once(key, fn) {
    if (inFlight.has(key)) return inFlight.get(key);
    const p = Promise.resolve().then(fn);
    inFlight.set(key, p);
    p.finally(() => inFlight.delete(key));
    return p;
  }

  // memo(key, fn, ttlMs?) — like once(), but also caches the resolved
  // value for ttlMs (default 0 — no caching beyond in-flight dedup,
  // just collapses simultaneous callers). Synchronous convenience for
  // the common "run this sync function, but only once per key per
  // window" case (e.g. superProvider.css's anchor resolution, which is
  // synchronous DOM work, not async).
  function memoSync(key, fn, ttlMs) {
    ttlMs = ttlMs || 0;
    const cached = memoCache.get(key);
    if (cached && (ttlMs === 0 || Date.now() < cached.expiresAt)) {
      return cached.value;
    }
    const value = fn();
    if (ttlMs > 0) {
      memoCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    return value;
  }

  function clear(key) {
    if (key) {
      inFlight.delete(key);
      memoCache.delete(key);
    } else {
      inFlight.clear();
      memoCache.clear();
    }
  }

  return { once, memoSync, clear };
})();
