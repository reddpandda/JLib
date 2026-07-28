// ============================================================================
// services/theme.js
// ============================================================================
/*
 * Theme — registration-based, same "registration is existence" principle
 * as modules, dictionaries, and everything else in this codebase.
 * registerTheme() itself and _themeRegistry live in registration.js,
 * alongside every other registerX function — this file registers the
 * seven built-in themes using that same public mechanism (nothing about
 * them is special-cased internally beyond registering first) and
 * provides the consumer-facing JLib.theme.create() instance.
 *
 *   dark, light        — fully authored, fully static. No providers
 *                        touched at all, ever.
 *   system             — OS-preference selector between dark/light.
 *                        Not a third palette, just a chooser.
 *   followWebsite      — fully dogfooded: colorProvider for the palette,
 *                        superProvider for radius/shadow/border/font.
 *                        Everything the provider family can contribute,
 *                        it does.
 *   smart-dark,
 *   smart-light        — authored PALETTE (same fixed colors as static
 *                        dark/light), but structural values (radius,
 *                        shadow, border, font) sourced from providers.
 *                        Color is deliberate design intent; structure
 *                        adapts to the host page.
 *   smartSystem        — OS-preference selector between smart-dark and
 *                        smart-light, same mechanism as `system`.
 *
 * theme.js itself still does zero color/structure math — it only maps
 * whatever a registered theme's resolver returns onto `--jsp-*`
 * variables and applies them. Any consumer (a standalone Settings Panel,
 * or the dashboard) creates one instance via JLib.theme.create() and
 * owns it.
 *
 * Depends on: JLib.console, registration.js (JLib.registerTheme,
 * JLib._themeRegistry must already exist), JLib.colorProvider,
 * JLib.superProvider.css, JLib.utils
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.theme = (function () {
  const { debounce } = JLib.utils;
  const cp = JLib.colorProvider;

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------- authored static palettes (used by dark/light/smart-*) ----------
  const STATIC_PALETTE = {
    dark: {
      '--jsp-bg': 'linear-gradient(145deg, #14141c 0%, #0a0a0e 100%)',
      '--jsp-sidebar-bg': 'rgba(255, 255, 255, 0.03)',
      '--jsp-text': '#e8e8e8',
      '--jsp-muted': '#6a6a7a',
      '--jsp-accent': '#8b5cf6',
      '--jsp-accent-hover': '#9d75f7',
      '--jsp-accent-bg': 'rgba(139, 92, 246, 0.15)',
      '--jsp-border': 'rgba(255, 255, 255, 0.06)',
      '--jsp-hover': 'rgba(255, 255, 255, 0.05)',
      '--jsp-toggle-off': '#2a2a3e',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      '--jsp-radius': '16px',
      '--jsp-font': JLib.fontProvider.JLIB_AUTHORED_FONT,
    },
    light: {
      '--jsp-bg': 'linear-gradient(145deg, #ffffff 0%, #f2f1f6 100%)',
      '--jsp-sidebar-bg': 'rgba(0, 0, 0, 0.03)',
      '--jsp-text': '#17171f',
      '--jsp-muted': '#6b6b78',
      '--jsp-accent': '#7c3aed',
      '--jsp-accent-hover': '#6d28d9',
      '--jsp-accent-bg': 'rgba(124, 58, 237, 0.1)',
      '--jsp-border': 'rgba(0, 0, 0, 0.08)',
      '--jsp-hover': 'rgba(0, 0, 0, 0.04)',
      '--jsp-toggle-off': '#d9d9e3',
      '--jsp-danger': '#e74c3c',
      '--jsp-shadow': '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      '--jsp-radius': '16px',
      '--jsp-font': JLib.fontProvider.JLIB_AUTHORED_FONT,
    },
  };

  // Maps a colorProvider palette onto `--jsp-*` color variables. Pure
  // translation, no math — same role this function has always had.
  function paletteToColorVars(palette) {
    const isDark = cp.relativeLuminance(palette.base) < 0.5;
    return {
      '--jsp-bg': cp.toCssRgb(palette.base),
      '--jsp-sidebar-bg': isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      '--jsp-text': cp.toCssRgb(palette.ink),
      '--jsp-muted': cp.toCssRgb(palette.muted),
      '--jsp-accent': cp.toCssRgb(palette.accent),
      '--jsp-accent-hover': cp.toCssRgb(palette['accent-hover']),
      '--jsp-accent-bg': cp.toCssRgba(palette.accent, 0.15),
      '--jsp-border': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      '--jsp-hover': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      '--jsp-toggle-off': isDark ? '#2a2a3e' : '#d9d9e3',
      '--jsp-danger': cp.toCssRgb(palette.danger),
      '--jsp-shadow': isDark
        ? '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        : '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
    };
  }

  // ---------- built-in theme registrations ----------
  JLib.registerTheme('dark', () => STATIC_PALETTE.dark);
  JLib.registerTheme('light', () => STATIC_PALETTE.light);
  JLib.registerTheme('system', (targetEl) => JLib._themeRegistry[prefersDark() ? 'dark' : 'light'](targetEl));

  JLib.registerTheme('followWebsite', (targetEl) => {
    const vars = paletteToColorVars(cp.getGlobalPalette());
    // Fully dogfooded — structural values from the provider family too,
    // not just color.
    const bundle = JLib.superProvider.css.resolve(targetEl || document.body, { color: false });
    vars['--jsp-radius'] = bundle.radius;
    vars['--jsp-shadow'] = bundle.shadow;
    vars['--jsp-font'] = bundle.font;
    return vars;
  });

  function smartVariant(staticKey) {
    return (targetEl) => {
      const vars = Object.assign({}, STATIC_PALETTE[staticKey]); // authored color, deliberate
      const bundle = JLib.superProvider.css.resolve(targetEl || document.body, { color: false });
      vars['--jsp-radius'] = bundle.radius; // structure adapts
      vars['--jsp-shadow'] = bundle.shadow;
      vars['--jsp-font'] = bundle.font;
      return vars;
    };
  }
  JLib.registerTheme('smart-dark', smartVariant('dark'));
  JLib.registerTheme('smart-light', smartVariant('light'));
  JLib.registerTheme('smartSystem', (targetEl) => JLib._themeRegistry[prefersDark() ? 'smart-dark' : 'smart-light'](targetEl));

  // ---------- background crossfade (unchanged) ----------
  function crossfadeBackground(hostEl, oldBgValue, opts) {
    opts = opts || {};
    const duration = opts.duration !== undefined ? opts.duration : 300;
    if (!oldBgValue) return;
    const overlay = document.createElement('div');
    overlay.setAttribute(
      'style',
      `position:absolute;inset:0;pointer-events:none;background:${oldBgValue};opacity:1;transition:opacity ${duration}ms ease;border-radius:inherit;z-index:0;`
    );
    hostEl.insertBefore(overlay, hostEl.firstChild);
    requestAnimationFrame(() => {
      overlay.style.opacity = '0';
    });
    setTimeout(() => overlay.remove(), duration + 40);
  }

  // ---------- public instance ----------
  function create(opts) {
    opts = opts || {};
    let mode = opts.defaultMode || 'followWebsite'; // any registered theme name
    let animationsEnabled = opts.animationsEnabled !== false;
    let lastTargetEl = null;

    function resolveVars(targetEl) {
      const resolver = JLib._themeRegistry[mode] || JLib._themeRegistry.dark;
      return resolver(targetEl);
    }

    function apply(targetEl, applyOpts) {
      applyOpts = applyOpts || {};
      lastTargetEl = targetEl;
      const shouldAnimate = applyOpts.skipAnimation !== undefined ? !applyOpts.skipAnimation : animationsEnabled;
      const vars = resolveVars(targetEl);
      if (shouldAnimate) {
        const oldBg = window.getComputedStyle(targetEl).getPropertyValue('--jsp-bg');
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
        crossfadeBackground(targetEl, oldBg);
      } else {
        for (const k in vars) targetEl.style.setProperty(k, vars[k]);
      }
    }

    function reExtract(targetEl) {
      cp.invalidateAll();
      apply(targetEl || lastTargetEl);
    }

    let observer = null;
    let mqListener = null;
    const watcher = debounce((targetEl) => {
      reExtract(targetEl); // any provider-backed theme benefits from re-sampling on host changes
    }, 200);

    function startWatching(targetEl) {
      observer = new MutationObserver(() => watcher(targetEl));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      mqListener = () => watcher(targetEl);
      if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mqListener);
    }
    function stopWatching() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (window.matchMedia && mqListener) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListener);
      mqListener = null;
    }

    return {
      get themes() {
        return JLib._themeRegistry; // name -> resolver, for anything enumerating available themes
      },
      getMode: () => mode,
      setMode: (m, targetEl) => {
        mode = m;
        if (targetEl) apply(targetEl);
      },
      apply,
      setAnimationsEnabled: (v) => {
        animationsEnabled = !!v;
      },
      startWatching,
      stopWatching,
      forceReExtract: reExtract,
    };
  }

  return { create, contrastRatio: cp.contrastRatio, relativeLuminance: cp.relativeLuminance };
})();
