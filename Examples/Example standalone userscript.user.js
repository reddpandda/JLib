// ==UserScript==
// @name         JLib Example — Standalone (1 module)
// @namespace    reddpandda
// @version      3.0.0
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/core/services.js
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/core/elements.js
// @require      https://raw.githubusercontent.com/reddpandda/JLib/main/modules/settings-panel.js
// ==/UserScript==

// Only one module registered -> JLib.render() builds a single shell with
// no tab strip and no cog. Settings Panel's `full` variant mounts
// directly, with its own "Panel Settings" tab (theme/position/shortcut/
// about/export-import) rendered inline instead of living behind a cog,
// since there's no dashboard chrome to put a cog on.

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

  GM_registerMenuCommand('\u2699 Example Script Settings', () => JLib.dashboard.toggle());

  JLib.scheduleRender();
})();
