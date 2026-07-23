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
// no menu and no cog. Settings Panel mounts its `full` variant directly:
// "Panel Settings" (theme/position/shortcut/backup) and "About" (JLib's
// own entry plus this script's, since there's no dashboard to keep them
// apart) both render inline as tabs alongside the script's own settings.

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
      summary: 'Example Script v3.0.0 \u2014 a reference userscript demonstrating JLib\u2019s standalone mode.',
      details: (container) => {
        container.appendChild(
          document.createTextNode(
            'This script exists to demonstrate JLib with exactly one module registered, which is what puts you directly into this panel with no dashboard menu and no cog \u2014 Panel Settings and About just live as tabs alongside the script\u2019s own settings. It doesn\u2019t do anything to the page itself; the one setting it has ("Enabled") is a placeholder to show how a boolean feature renders. See Examples/Example standalone userscript.user.js in the JLib repo for the full source.'
          )
        );
      },
    },
  });
  JLib.registerModule(settingsModule);

  GM_registerMenuCommand('\u2699 Example Script Settings', () => JLib.dashboard.toggle());

  JLib.scheduleRender();
})();
