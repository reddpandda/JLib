// ============================================================================
// services/cache.js
// ============================================================================
/*
 * cache — non-settings persistent storage. Settings keep using
 * JLib.storage (GM storage, unconditional, cross-site by nature).
 * Everything else — arbitrary cached/derived, single-origin data — goes
 * through here: browser-native IndexedDB as the only physical backend,
 * an in-memory layer on top for synchronous-feeling reads, debounced
 * writes, BroadcastChannel for live cross-tab sync, a per-key logical
 * clock to resolve out-of-order message arrival, and Web Locks for
 * cheap tab-presence gating so broadcasts/requests don't fire into the
 * void.
 *
 * Namespace-scoped, and registration-gated — same "registration is
 * existence" rule as everything else. JLib.registerScript() must have
 * been called; every operation here refuses (console.warn, no silent
 * default) without it.
 *
 * KNOWN GAP, stated honestly rather than silently assumed solved: Web
 * Locks' real API only supports (a) point-in-time query() snapshots and
 * (b) a callback that fires when YOUR OWN request is granted — there is
 * no native "notify me when a different tab joins" event. Earlier
 * design discussion floated using the request callback to close the
 * open/check race; that isn't actually a capability the platform
 * provides. What's implemented here is query()-before-every-broadcast-
 * decision, which is correct and matches what Web Locks can actually
 * do, but the race (a second tab opening in the exact gap between a
 * check and the action taken on it) is not fully closed — a real,
 * narrow, low-consequence gap (worst case: one missed broadcast,
 * recovered by the next write or the next tab's startup handshake) —
 * not a fabricated fix.
 *
 * Depends on: JLib.utils (debounce), JLib.composeNamespace
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

// ----------------------------------------------------------------------------
// Vendored from idb-keyval (jakearchibald/idb-keyval, Apache-2.0), converted
// from TypeScript to plain JS. Only the functions JLib.cache actually uses
// are included (promisifyRequest, createStore, get, set, del, entries) —
// same "small, stable, don't re-derive it ourselves" reasoning already
// applied to the vendored OKLCH color math elsewhere in this file. This
// replaces our own hand-rolled IndexedDB wrapper, which was correct (no
// classic transaction-lifetime bugs, verified) but not worth continuing to
// carry when a small, well-maintained, permissively-licensed original
// already exists for exactly this problem.
// ----------------------------------------------------------------------------
function _idbPromisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    request.onabort = request.onerror = () => reject(request.error);
  });
}
function _idbCreateStore(dbName, storeName) {
  let dbp;
  function getDB() {
    if (dbp) return dbp;
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    dbp = _idbPromisifyRequest(request);
    dbp.then(
      (db) => {
        // Safari sometimes closes the connection on its own; this lets us
        // reopen on next use instead of silently failing forever after.
        db.onclose = () => (dbp = undefined);
      },
      () => {}
    );
    return dbp;
  }
  return (txMode, callback) => getDB().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}
function _idbGet(key, customStore) {
  return customStore('readonly', (store) => _idbPromisifyRequest(store.get(key)));
}
function _idbSet(key, value, customStore) {
  return customStore('readwrite', (store) => {
    store.put(value, key);
    return _idbPromisifyRequest(store.transaction);
  });
}
function _idbDel(key, customStore) {
  return customStore('readwrite', (store) => {
    store.delete(key);
    return _idbPromisifyRequest(store.transaction);
  });
}
function _idbEntries(customStore) {
  return customStore('readonly', (store) => {
    if (store.getAll && store.getAllKeys) {
      return Promise.all([_idbPromisifyRequest(store.getAllKeys()), _idbPromisifyRequest(store.getAll())]).then(([keys, values]) => keys.map((k, i) => [k, values[i]]));
    }
    const items = [];
    return new Promise((resolve, reject) => {
      store.openCursor().onsuccess = function () {
        if (!this.result) {
          resolve();
          return;
        }
        items.push([this.result.key, this.result.value]);
        this.result.continue();
      };
    }).then(() => items);
  });
}

JLib.cache = (function () {
  const { debounce } = JLib.utils;

  const EAGER_LOAD_KEY_THRESHOLD = 500; // hybrid gate: eager-load below this many keys, lazy above it

  let namespace = null;
  let idbStore = null; // idb-keyval "UseStore" function for this script's own database
  let channel = null;
  let memory = new Map(); // key -> { value, clock }
  let eager = true;
  let readyPromise = null;
  let lockHeld = false;
  let localSeq = 0; // this tab's own monotonic counter, per key handled via memory's stored clock
  const subscribers = new Map(); // key -> Set<callback> — real gap this fixes: previously no way to react to a key changing at all, remote or local

  function dbName() {
    return 'jlib-cache-' + namespace;
  }
  function channelName() {
    return 'jlib-sync-' + namespace;
  }
  function lockName() {
    return 'jlib-presence-' + namespace + '-' + location.origin;
  }

  // ---------- tab presence (Web Locks) ----------
  function holdPresenceLock() {
    if (!navigator.locks) return; // API unavailable — degrade to "always broadcast," never worse than not having this optimization
    navigator.locks.request(lockName(), { mode: 'shared' }, () => new Promise(() => {})); // held until tab closes
    lockHeld = true;
  }

  async function otherTabsLikelyPresent() {
    if (!navigator.locks || !navigator.locks.query) return true; // can't check — assume yes, safe default (may broadcast unnecessarily, never silently drops a needed one)
    try {
      const snapshot = await navigator.locks.query();
      const holders = (snapshot.held || []).filter((l) => l.name === lockName());
      return holders.length > 1; // more than just this tab's own hold
    } catch (e) {
      return true;
    }
  }

  // ---------- cross-tab sync ----------
  function broadcastUpdate(key, entry) {
    if (!channel) return;
    otherTabsLikelyPresent().then((present) => {
      if (present) channel.postMessage({ type: 'update', key, entry });
    });
  }

  function handleChannelMessage(msg) {
    if (!msg || !msg.data) return;
    const data = msg.data;
    if (data.type === 'update') {
      const existing = memory.get(data.key);
      if (!existing || data.entry.clock > existing.clock) {
        memory.set(data.key, data.entry);
        notifySubscribers(data.key, data.entry.value);
      }
    } else if (data.type === 'sync-request') {
      // Reply only with entries we have that are newer than what the
      // requester already knows about — always sourced from our
      // in-memory cache, never disk, so debounce timing on our own
      // pending writes never matters to the accuracy of this reply.
      const newer = [];
      memory.forEach((entry, key) => {
        if (!data.knownClocks || (data.knownClocks[key] || -1) < entry.clock) {
          newer.push([key, entry]);
        }
      });
      if (newer.length && channel) {
        channel.postMessage({ type: 'sync-reply', entries: newer, replyTo: data.requestId });
      }
    } else if (data.type === 'sync-reply') {
      data.entries.forEach(([key, entry]) => {
        const existing = memory.get(key);
        if (!existing || entry.clock > existing.clock) {
          memory.set(key, entry);
          notifySubscribers(key, entry.value);
        }
      });
    }
  }

  function requestSync() {
    otherTabsLikelyPresent().then((present) => {
      if (!present || !channel) return;
      const knownClocks = {};
      memory.forEach((entry, key) => {
        knownClocks[key] = entry.clock;
      });
      channel.postMessage({ type: 'sync-request', knownClocks, requestId: Date.now() + '-' + Math.random() });
    });
  }

  // ---------- resume handling ----------
  // pageshow/persisted is the real bfcache-restore signal (verified —
  // visibilitychange is NOT the same thing and doesn't reliably fire
  // for this specific case). visibilitychange still covers ordinary
  // tab-refocus. Both feed one shared debounced trigger so a resume
  // that fires both can't double-request.
  const debouncedResumeSync = debounce(() => requestSync(), 300);
  function setupResumeHandlers() {
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) debouncedResumeSync();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') debouncedResumeSync();
    });
  }

  // ---------- init ----------
  // Reserved key for this script's own version bookkeeping — double-
  // underscore-prefixed specifically to make accidental collision with
  // an author's own chosen key names vanishingly unlikely. Lives in the
  // same object store as regular cache data (one extra key, negligible
  // against the eager/lazy threshold) rather than a second IndexedDB
  // object store, since the added schema complexity isn't worth it for
  // one bookkeeping entry.
  const SCRIPT_VERSION_KEY = '__jlib_script_version__';
  let versionChanged = false;

  // checkScriptVersion() — reads GM_info.script.version (a real,
  // standard, cross-manager API — confirmed present in Tampermonkey,
  // Greasemonkey, and Violentmonkey, sourced directly from the
  // userscript's own @version header, no extra @grant needed) and
  // compares it against whatever was recorded here last session.
  // Informational only: this never wipes, migrates, or otherwise acts
  // on a mismatch automatically — versionChanged is just a flag an
  // author can check and decide what (if anything) to do about, same
  // "flag clearly, don't silently discard" posture as everything else
  // in this codebase. A false-positive-driven automatic wipe would risk
  // destroying good data for version bumps that never touched cache
  // shape at all.
  function checkScriptVersion() {
    const currentVersion = typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version;
    if (!currentVersion) return Promise.resolve(); // GM_info unavailable — nothing to compare, stay silent rather than warn about something outside our control
    return _idbGet(SCRIPT_VERSION_KEY, idbStore)
      .then((stored) => {
        const lastVersion = stored ? stored.value : null;
        if (lastVersion !== null && lastVersion !== currentVersion) {
          versionChanged = true;
          JLib.console.info('cache.scriptVersionChanged', lastVersion, currentVersion);
        }
        if (lastVersion !== currentVersion) {
          return _idbSet(SCRIPT_VERSION_KEY, { value: currentVersion, clock: 1 }, idbStore);
        }
      })
      .catch(() => {}); // a version-check failure should never break real init
  }

  function ensureInit() {
    if (readyPromise) return readyPromise;
    namespace = JLib.composeNamespace();
    if (!namespace) {
      readyPromise = Promise.reject(new Error('[JLib.cache] refused — no script registered. Call JLib.registerScript({ namespace }) first.'));
      readyPromise.catch(() => {}); // avoid an unhandled-rejection warning for a deliberately-refused init
      return readyPromise;
    }
    idbStore = _idbCreateStore(dbName(), 'kv');
    readyPromise = _idbEntries(idbStore)
      .then((allEntries) => {
        eager = allEntries.length <= EAGER_LOAD_KEY_THRESHOLD;
        if (eager) allEntries.forEach(([k, v]) => memory.set(k, v));
        // lazy: memory stays empty, individual get()s load on demand
      })
      .then(() => checkScriptVersion())
      .then(() => {
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(channelName());
          channel.addEventListener('message', handleChannelMessage);
        }
        holdPresenceLock();
        setupResumeHandlers();
        requestSync(); // startup reconciliation
      });
    return readyPromise;
  }

  // Per-key debounce — see JLib.utils.debouncePerKey's comment for the
  // exact bug this replaces: a single shared debounce() here would
  // silently drop every write except the most recent one whenever two
  // different keys were set within the same debounce window.
  const debouncedFlush = JLib.utils.debouncePerKey((key, entry) => {
    _idbSet(key, entry, idbStore).catch((err) => JLib.console.warn('cache.persistFailed', key, err));
  }, 250);

  // ---------- public API ----------
  // set(key, value) — updates the in-memory cache immediately (so
  // subsequent reads in the same tick see it instantly), debounces the
  // actual IndexedDB write, and broadcasts to other tabs if any are
  // likely present.
  function notifySubscribers(key, value) {
    const subs = subscribers.get(key);
    if (subs) subs.forEach((cb) => cb(value));
  }

  function commitSet(key, value, priorClock) {
    const entry = { value, clock: priorClock + 1 };
    memory.set(key, entry);
    debouncedFlush(key, entry);
    broadcastUpdate(key, entry);
    notifySubscribers(key, value);
  }

  function set(key, value) {
    return ensureInit().then(() => {
      const existing = memory.get(key);
      if (existing) {
        commitSet(key, value, existing.clock);
        return;
      }
      // In lazy mode, a key that's never been get()'d has no memory
      // entry — computing its clock from scratch (as if it started at 0)
      // could clobber a much higher real clock already recorded in
      // IndexedDB from a prior session or another tab, producing a
      // falsely-low value other tabs would correctly reject as stale. A
      // real fresh read first avoids that regardless of eager/lazy mode.
      return _idbGet(key, idbStore).then((stored) => {
        commitSet(key, value, stored ? stored.clock : 0);
      });
    });
  }

  // get(key) — synchronous-feeling once warm. Eager mode: always
  // in-memory already. Lazy mode: first read of a given key is a real
  // async IndexedDB read; every read after that is instant.
  async function get(key) {
    await ensureInit();
    if (memory.has(key)) return memory.get(key).value;
    if (eager) return undefined; // eager mode already loaded everything that exists
    const stored = await _idbGet(key, idbStore);
    if (stored) {
      memory.set(key, stored);
      return stored.value;
    }
    return undefined;
  }

  function deleteKey(key) {
    return ensureInit().then(() => {
      memory.delete(key);
      debouncedFlush.cancel(key); // a pending debounced write for this key would otherwise resurrect it after deletion
      return _idbDel(key, idbStore);
    });
  }

  // watch(key, callback) -> unsubscribe function. Fires on ANY change to
  // this key — local (this tab's own set()) or remote (another tab's
  // write, arriving via BroadcastChannel). Always passes the real,
  // current value at the moment of the change, never a stale reference —
  // same discipline as GMSTORE.md's watch() for GM storage, applied
  // here to non-settings cached data instead.
  function watch(key, callback) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(callback);
    return () => {
      const subs = subscribers.get(key);
      if (!subs) return;
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(key);
    };
  }

  return {
    set,
    get,
    delete: deleteKey,
    watch,
    ensureInit,
    // versionChanged — only meaningful after ensureInit() (or any other
    // cache operation, which awaits it internally) has actually
    // resolved, since the version check itself happens during that
    // async init. Reading this before awaiting anything will always
    // report false, not because nothing changed, but because the check
    // hasn't run yet.
    get versionChanged() {
      return versionChanged;
    },
  };
})();
