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

// Two or more modules registered -> JLib.render() builds the dashboard
// shell automatically: tab strip to switch modules, cog (next to the
// close button) for theme/position/shortcut/about, which Settings Panel
// supplies via its `lite` variant + renderChromeSettings. See
// example-standalone-userscript.user.js for the 1-module case, where
// none of that dashboard chrome appears and Settings Panel's `full`
// variant renders its own Panel Settings tab inline instead.

(function () {
  'use strict';

  const settingsModule = JLib.modules.settingsPanel.create({
    namespace: 'exampleScript',
    title: 'Example Script',
    categories: [{ id: 'general', label: 'General', icon: '\u2699' }],
    features: [
      { id: 'enabled', type: 'boolean', category: 'general', label: 'Enabled', default: true, description: 'Turn the script on or off.' },
    ],
    about: (container) => {
      container.appendChild(document.createTextNode('Example Script v3.0.0'));
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
