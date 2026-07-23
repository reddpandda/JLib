// ==UserScript==
// @name         JLib Example — Dashboard (2+ modules)
// @namespace    reddpandda
// @version      3.0.0
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/core/services.js
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/core/elements.js
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/modules/settings-panel.js
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/modules/notification-center.js
// ==/UserScript==

// Two or more modules registered -> JLib.render() builds a menu-style
// dashboard shell: click a module to open it full-screen with a
// "Back to Dashboard" control. Settings opens its `lite` variant here —
// userscript settings only. Cog (next to the close button) opens a
// *different*, unregistered settings module — theme/position/shortcut/
// backup/about — that never counts toward module count. See
// example-standalone-userscript.user.js for the 1-module case, where
// Settings Panel mounts its `full` variant instead: no dashboard, no
// cog, Panel Settings and About both live inline as tabs alongside the
// script's own settings.

(function () {
  'use strict';

  const settingsModule = JLib.modules.settingsPanel.create({
    namespace: 'exampleScript',
    title: 'Example Script',
    categories: [{ id: 'general', label: 'General', icon: '\u2699' }],
    features: [
      { id: 'enabled', type: 'boolean', category: 'general', label: 'Enabled', default: true, description: 'Turn the script on or off.', keywords: ['on', 'off', 'toggle'] },
    ],
    about: {
      summary: 'Example Script v3.0.0 \u2014 a reference userscript demonstrating JLib\u2019s dashboard mode.',
      details: (container) => {
        container.appendChild(
          document.createTextNode(
            'This script exists to demonstrate JLib with two or more modules registered \u2014 Settings and Notifications \u2014 which is what triggers the dashboard menu you opened this from. It doesn\u2019t do anything to the page itself; the one setting it has ("Enabled") is a placeholder to show how a boolean feature renders. See Examples/Example dashboard userscript.user.js in the JLib repo for the full source.'
          )
        );
      },
    },
  });
  JLib.registerModule(settingsModule);

  const notifCore = JLib.notifications.create({ store: JLib.storage.createStore([], { storageKeyPrefix: 'exampleScript_notif' }) });
  JLib.notifications.presenters.toast(notifCore);

  const notifCenterModule = JLib.modules.notificationCenter.create({});
  JLib.registerModule(notifCenterModule);

  GM_registerMenuCommand('\u2699 Example Script Dashboard', () => JLib.dashboard.toggle());

  // Deep-link example, once mounted: settingsModule.api.buildLink({ feature:
  // 'enabled' }) returns a token; settingsModule.api.openLink(token) later
  // navigates straight to it, breadcrumb and all.

  // Registration is closed once render() runs — this is the LAST thing
  // JLib does for this page load, after every @require and this
  // userscript body have finished executing.
  JLib.scheduleRender({ notifications: notifCore });
})();
