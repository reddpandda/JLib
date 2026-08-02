// ============================================================================
// services/notifications.js
// ============================================================================
/*
 * Depends on: JLib namespace guard (see REFERENCE.md — every file in
 * this split starts with this line so it works regardless of what's
 * already loaded, same rule as everywhere else in this codebase).
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};
/*
 * Notifications — a headless core (queue + staling engine + dismissal
 * memory) that any presenter renders through. toast is one of three
 * presenters (toast/banner/modal) driven by the same core.
 *
 * Depends on: JLib.dom (rendering), optionally JLib.storage (for
 * persist + "do not show again", which needs a stable notification id
 * and a place to remember it was dismissed).
 *
 * Staling strategies, set per-notification via `staleAfter`:
 *   { type: 'time', ms }          — auto-dismiss after ms
 *   { type: 'interaction' }       — dismiss on next click/keydown anywhere
 *                                    (or pass `target` to scope it to one element)
 *   { type: 'other', shouldStale: (notification, ctx) => bool } — caller-defined
 *   { type: 'default' }           — same as { type: 'time', ms: 4000 }
 *   omitted entirely              — persist: never auto-stales, only
 *                                    dismissed by the user or by code
 *
 * notify() returns { id, dismiss() }. The core doesn't render anything
 * itself — call JLib.notifications.presenters.toast(core) (etc.) once per
 * page to wire a presenter to a core instance; multiple presenters can
 * watch the same core (e.g. a toast stack AND a Notification Center
 * history view, both subscribed to the same stream).
 */

JLib.notifications = (function () {
  const { el } = JLib.dom;

  function create(opts) {
    opts = opts || {};
    const store = opts.store || null; // optional JLib.storage instance, for "do not show again"
    let seq = 0;
    const active = new Map(); // id -> notification record
    const history = []; // append-only, for a Notification Center to read
    const subscribers = new Set(); // fn(eventType, notification)
    const HISTORY_CACHE_KEY = 'notifications.history';
    const HISTORY_CACHE_CAP = 50;

    // Real JLib.cache consumer — notification history didn't survive a
    // reload before this; now it does. Purely additive: nothing about
    // notify()/dismiss()'s existing synchronous contract changes, this
    // just restores prior history once the async read resolves, and
    // persists in the background afterward. Silently does nothing if no
    // script is registered (JLib.cache refuses without one) — history
    // just behaves exactly as it did before in that case.
    if (JLib.cache) {
      JLib.cache
        .get(HISTORY_CACHE_KEY)
        .then((restored) => {
          if (Array.isArray(restored) && restored.length) {
            history.unshift(...restored.filter((r) => !history.some((h) => h.id === r.id)));
            emit('history-restored', null);
          }
        })
        .catch(() => {}); // no script registered, or IndexedDB unavailable — degrade silently to session-only history, same as before this integration existed
    }
    const persistHistory = JLib.utils.debounce(() => {
      if (JLib.cache) JLib.cache.set(HISTORY_CACHE_KEY, history.slice(-HISTORY_CACHE_CAP)).catch(() => {});
    }, 400);

    function emit(eventType, notification) {
      subscribers.forEach((fn) => fn(eventType, notification));
    }

    function isSuppressed(dismissKey) {
      if (!dismissKey || !store) return false;
      const all = store.load();
      return !!(all.dismissedNotifications && all.dismissedNotifications[dismissKey]);
    }
    function suppressForever(dismissKey) {
      if (!dismissKey || !store) return;
      const all = store.load();
      all.dismissedNotifications = all.dismissedNotifications || {};
      all.dismissedNotifications[dismissKey] = true;
      store.save(undefined, all);
    }

    function scheduleStaling(record) {
      const stale = record.staleAfter;
      if (!stale) return; // persist: no auto-staling
      if (stale.type === 'time' || stale.type === 'default') {
        const ms = stale.type === 'default' ? 4000 : stale.ms;
        record._timer = setTimeout(() => dismiss(record.id), ms);
      } else if (stale.type === 'interaction') {
        const target = stale.target || document;
        const handler = () => dismiss(record.id);
        record._interactionHandler = handler;
        record._interactionTarget = target;
        target.addEventListener('click', handler, { once: true, capture: true });
        target.addEventListener('keydown', handler, { once: true, capture: true });
      } else if (stale.type === 'other' && typeof stale.shouldStale === 'function') {
        record._pollTimer = setInterval(() => {
          if (stale.shouldStale(record, { active: active.get(record.id) })) dismiss(record.id);
        }, 500);
      }
    }

    function clearStaling(record) {
      if (record._timer) clearTimeout(record._timer);
      if (record._pollTimer) clearInterval(record._pollTimer);
      if (record._interactionHandler) {
        record._interactionTarget.removeEventListener('click', record._interactionHandler, { capture: true });
        record._interactionTarget.removeEventListener('keydown', record._interactionHandler, { capture: true });
      }
    }

    // notify(message, opts) -> { id, dismiss() } | null (null if suppressed
    // by a prior "do not show again" for this dismissKey)
    function notify(message, notifyOpts) {
      notifyOpts = notifyOpts || {};
      if (isSuppressed(notifyOpts.dismissKey)) return null;
      if (notifyOpts.allowDoNotShowAgain && !store) {
        JLib.console.warn('notifications.doNotShowAgainNoStore');
      }

      seq += 1;
      const record = {
        id: 'n' + seq,
        message,
        level: notifyOpts.level || 'info', // info | success | warning | error
        staleAfter: notifyOpts.staleAfter, // undefined = persist
        dismissKey: notifyOpts.dismissKey || null,
        allowDoNotShowAgain: !!notifyOpts.allowDoNotShowAgain,
        presenter: notifyOpts.presenter || 'toast', // toast | banner | modal — hint for whichever presenter is wired up
        createdAt: Date.now(),
      };
      active.set(record.id, record);
      history.push(record);
      persistHistory();
      scheduleStaling(record);
      emit('show', record);

      return {
        id: record.id,
        dismiss: () => dismiss(record.id),
      };
    }

    function dismiss(id, opts) {
      opts = opts || {};
      const record = active.get(id);
      if (!record) return;
      clearStaling(record);
      active.delete(id);
      if (opts.doNotShowAgain && record.dismissKey) suppressForever(record.dismissKey);
      emit('dismiss', record);
    }

    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    return {
      notify,
      dismiss,
      subscribe,
      getActive: () => Array.from(active.values()),
      getHistory: () => history.slice(),
    };
  }

  // ---------- presenters ----------
  // Each presenter subscribes to a core instance and renders whatever's
  // active using JLib.dom + elements/*. Presenters are opt-in and
  // stackable — wiring the toast presenter doesn't preclude also wiring
  // banner for a different subset of notifications (driven by
  // notifyOpts.presenter).

  const LEVEL_COLOR = { info: '#8b5cf6', success: '#2ecc71', warning: '#f1c40f', error: '#e74c3c' };

  function toastPresenter(core) {
    let container = null;
    function ensureContainer() {
      if (container) return container;
      container = el('div', {
        attrs: {
          popover: 'manual',
          style: 'position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;margin:0;padding:0;border:none;background:transparent;',
        },
      });
      // popover="manual", deliberately not "auto" — auto-mode popovers
      // form a light-dismiss stack where opening a new one typically
      // closes other open auto popovers, which would silently break
      // multiple simultaneous toasts (already real, tested behavior).
      // Manual mode still gets the real benefit — native top-layer
      // promotion, no z-index management needed against a hostile host
      // page — while our own staling logic stays the sole thing that
      // ever shows or hides it.
      const target = JLib.shadow.getRoot();
      target.appendChild(container);
      container.showPopover();
      return container;
    }
    return core.subscribe((event, record) => {
      if (record.presenter !== 'toast') return;
      if (event === 'show') {
        const node = el(
          'div',
          {
            attrs: {
              style: `background:var(--jlib-color-base);color:var(--jlib-color-ink);padding:10px 16px;border-radius:8px;border-left:3px solid ${LEVEL_COLOR[record.level]};box-shadow:0 8px 24px rgba(0,0,0,0.4);transition:opacity .2s ease,transform .2s ease;transform:translateY(8px);max-width:320px;pointer-events:auto;position:relative;`,
            },
            dataset: { notifyId: record.id },
          },
          [record.message]
        );
        ensureContainer().appendChild(node);
        // Anchored, not global — a toast lives in one fixed screen
        // corner, not spread across the whole page, so it should sample
        // its own local surroundings (colorProvider.getPalette) rather
        // than the document-wide palette. reveal() means it's never
        // painted with a fallback color even briefly — built hidden,
        // themed, then faded in once, same "no pop-in" treatment
        // designed for exactly this "brand-new element mounting" case.
        JLib.superProvider.css.reveal(node, () => {
          node.style.fontFamily = 'var(--jlib-color-font)';
        });
        requestAnimationFrame(() => {
          node.style.transform = 'translateY(0)';
        });
        record._toastNode = node;
      } else if (event === 'dismiss' && record._toastNode) {
        const node = record._toastNode;
        node.style.opacity = '0';
        node.style.transform = 'translateY(8px)';
        setTimeout(() => node.remove(), 220);
      }
    });
  }

  function bannerPresenter(core) {
    let container = null;
    function ensureContainer() {
      if (container) return container;
      container = el('div', {
        attrs: { popover: 'manual', style: 'position:fixed;top:0;left:0;right:0;z-index:999999;display:flex;flex-direction:column;margin:0;padding:0;border:none;background:transparent;' },
      });
      JLib.shadow.getRoot().appendChild(container);
      container.showPopover();
      return container;
    }
    return core.subscribe((event, record) => {
      if (record.presenter !== 'banner') return;
      if (event === 'show') {
        const bar = el(
          'div',
          {
            attrs: {
              style: `background:${LEVEL_COLOR[record.level]};color:#0a0a0e;padding:10px 20px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:flex;justify-content:space-between;align-items:center;`,
            },
            dataset: { notifyId: record.id },
          },
          [record.message]
        );
        ensureContainer().appendChild(bar);
        record._bannerNode = bar;
      } else if (event === 'dismiss' && record._bannerNode) {
        record._bannerNode.remove();
      }
    });
  }

  // Blocking, click-okay style — uses elements/modal.js's minimal overlay
  // if present, otherwise a plain fixed-center box so this presenter
  // still works if someone only @requires notifications.js standalone.
  function modalPresenter(core) {
    return core.subscribe((event, record) => {
      if (record.presenter !== 'modal') return;
      if (event !== 'show') return;

      const okBtn = JLib.elements.button.button('OK', () => {
        core.dismiss(record.id);
        modalInstance.destroy();
      });
      const dontShowBtn = record.allowDoNotShowAgain
        ? JLib.elements.button.button("Don't show again", () => {
            core.dismiss(record.id, { doNotShowAgain: true });
            modalInstance.destroy();
          }, { variant: 'ghost' })
        : null;

      const modalInstance = JLib.elements.modal.create({
        id: 'jlib-notify-' + record.id,
        title: record.level.charAt(0).toUpperCase() + record.level.slice(1),
        content: (bodyEl) => {
          bodyEl.appendChild(el('div', {}, [record.message]));
          bodyEl.appendChild(el('div', { attrs: { style: 'display:flex;gap:8px;margin-top:14px;' } }, dontShowBtn ? [okBtn, dontShowBtn] : [okBtn]));
        },
        onClose: () => core.dismiss(record.id),
      });
      modalInstance.open();
    });
  }

  return {
    create,
    presenters: { toast: toastPresenter, banner: bannerPresenter, modal: modalPresenter },
  };
})();
