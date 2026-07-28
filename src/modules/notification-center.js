/*
 * Notification Center module — a UI over services/notifications.js's
 * history. Doesn't emit notifications itself, just lists what the core
 * has already shown/dismissed. Built on JLib.moduleBase so its header
 * and section markup are identical to every other module rather than
 * hand-rolled — see core/module-base.js.
 *
 * Depends on: JLib.dom, JLib.moduleBase, JLib.elements.button
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.modules = JLib.modules || {};

JLib.modules.notificationCenter = (function () {
  const { el } = JLib.dom;
  const { button } = JLib.elements.button;

  function levelDot(level) {
    const color = { info: '#8b5cf6', success: '#2ecc71', warning: '#f1c40f', error: '#e74c3c' }[level] || '#8b5cf6';
    return el('span', { attrs: { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;` } });
  }

  function create(config) {
    config = config || {};
    let unsubscribe = null;

    function render(view, core) {
      view.clear();
      view.header('Notifications');

      const active = core.getActive();
      view.section('Active', (body) => {
        if (!active.length) {
          body.appendChild(el('div', { className: 'jlib-row-desc' }, ['Nothing active.']));
          return;
        }
        active.forEach((n) => {
          body.appendChild(
            el('div', { className: 'jlib-row' }, [
              el('div', { className: 'jlib-row-info' }, [el('div', { className: 'jlib-row-label' }, [levelDot(n.level), n.message])]),
              button('Dismiss', () => core.dismiss(n.id)),
            ])
          );
        });
      });

      view.section('History', (body) => {
        const history = core.getHistory().slice(-50).reverse();
        if (!history.length) {
          body.appendChild(el('div', { className: 'jlib-row-desc' }, ['Nothing yet.']));
          return;
        }
        history.forEach((n) => {
          const when = new Date(n.createdAt).toLocaleTimeString();
          body.appendChild(
            el('div', { className: 'jlib-row' }, [
              el('div', { className: 'jlib-row-info' }, [el('div', { className: 'jlib-row-label' }, [levelDot(n.level), n.message]), el('div', { className: 'jlib-row-desc' }, [when])]),
            ])
          );
        });
      });
    }

    return JLib.moduleBase.create({
      id: config.id || 'notificationCenter',
      label: config.label || 'Notifications',
      order: config.order !== undefined ? config.order : 10,
      onMount(view, services) {
        const core = services.notifications;
        if (!core) {
          view.header('Notifications');
          view.section('Not available', (body) => {
            body.appendChild(el('div', {}, ['No notifications service was passed in — see JLib.render({ notifications: core }).']));
          });
          return;
        }
        render(view, core);
        unsubscribe = core.subscribe(() => render(view, core));
      },
      onUnmount() {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
      },
    });
  }

  return { create };
})();
