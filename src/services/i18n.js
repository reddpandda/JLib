// ============================================================================
// services/i18n.js
// ============================================================================
/*
 * i18n — registration-based localization, same "registration is existence"
 * principle as modules and themes. English isn't a special-cased fallback
 * living outside the system — it's a normal registered dictionary that
 * happens to register first (below) and start out flagged default.
 *
 * registerDictionary() itself and its state (the dictionary table, the
 * current default language) live in registration.js, alongside every
 * other registerX function — this file only adds the lookup/consumer
 * side (setDefault, t, listDictionaries) onto that same JLib.i18n object.
 *
 * Two-tier lookup per dictionary:
 *   Tier 1 — bare string -> itself/translation. Covers the common case:
 *     "Save": "Guardar"
 *   Tier 2 — same table, but a string can also carry a disambiguating
 *     qualifier when English itself would already phrase it differently
 *     by role: "Save (verb)": "Salvar". Authors only reach for this at
 *     the specific call site that needs it — most strings never do.
 * There's no structural separation between "tier 1 file" and "tier 2
 * file" here — one flat `strings` table per dictionary covers both; a
 * plain key is tier-1-shaped, a qualified key is tier-2-shaped, same
 * table, same lookup.
 *
 * All console.warn text here is permanently English — this is developer-
 * facing diagnostic output, not end-user-facing UI, and that boundary is
 * absolute throughout this codebase.
 *
 * Depends on: JLib.console, registration.js (JLib.i18n.registerDictionary,
 * JLib._i18nDictionaries, JLib._i18nDefaultLang must already exist)
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

(function () {
  const dictionaries = JLib._i18nDictionaries;

  // setDefault(lang) — explicit, user-driven switch (e.g. from the
  // Settings Panel language dropdown). No conflict possible here since
  // it's a deliberate single choice, not two registrations racing.
  function setDefault(lang) {
    if (!dictionaries[lang]) {
      JLib.console.warn('i18n.unknownLanguage', lang);
      return false;
    }
    if (JLib._i18nDefaultLang && dictionaries[JLib._i18nDefaultLang]) dictionaries[JLib._i18nDefaultLang].isDefault = false;
    dictionaries[lang].isDefault = true;
    JLib._i18nDefaultLang = lang;
    return true;
  }

  function getDefaultDictionary() {
    return dictionaries[JLib._i18nDefaultLang] || dictionaries.en;
  }

  // listDictionaries() — every registered dictionary, alphabetized by
  // each one's own self-name (not English's name for that language).
  // Consumed directly by the Settings Panel language dropdown.
  function listDictionaries() {
    return Object.values(dictionaries).sort((a, b) => a.selfName.localeCompare(b.selfName));
  }

  // t(str) — the lookup. Checks the active default dictionary's table
  // (which covers both tier-1 plain keys and tier-2 qualified keys, same
  // table); falls back to the literal string itself if no entry exists.
  // Missing keys are a fully normal, unremarkable state (an incomplete
  // translation) — not an error, nothing warned here.
  function t(str) {
    const dict = getDefaultDictionary();
    if (dict && dict.strings && Object.prototype.hasOwnProperty.call(dict.strings, str)) {
      return dict.strings[str];
    }
    return str;
  }

  // ---------- built-in English dictionary ----------
  // Hand-authored (no standing extraction tool), walked from the actual
  // UI copy used across the codebase as of this build. Not exhaustive of
  // every string that could ever be added later; a reasonable-effort
  // pass covering the real chrome copy that exists today. "Default" is
  // included deliberately — the language-dropdown's pinned top entry
  // renders this word through the SAME lookup as everything else, so it
  // translates correctly the moment a non-English dictionary is made
  // default, rather than being hardcoded English wearing another
  // language's name.
  const EN_STRINGS = {
    Default: 'Default',
    English: 'English',
    Language: 'Language',
    'Panel Settings': 'Panel Settings',
    Appearance: 'Appearance',
    Behavior: 'Behavior',
    Shortcut: 'Shortcut',
    Backup: 'Backup',
    About: 'About',
    Theme: 'Theme',
    Position: 'Position',
    'Show Animations': 'Show Animations',
    'Keyboard Shortcut': 'Keyboard Shortcut',
    'Re-sample site colors': 'Re-sample site colors',
    'Export All Settings': 'Export All Settings',
    'Import Settings': 'Import Settings',
    'Reset Panel Settings to Default': 'Reset Panel Settings to Default',
    'Back to Dashboard': 'Back to Dashboard',
    'Back (navigation)': 'Back',
    Dashboard: 'Dashboard',
    Notifications: 'Notifications',
    Active: 'Active',
    History: 'History',
    Dismiss: 'Dismiss',
    'Nothing active.': 'Nothing active.',
    'Nothing yet.': 'Nothing yet.',
    'Follow Website': 'Follow Website',
    System: 'System',
    'Smart System': 'Smart System',
    Dark: 'Dark',
    Light: 'Light',
    'Smart Dark': 'Smart Dark',
    'Smart Light': 'Smart Light',
    Center: 'Center',
    'Top Left': 'Top Left',
    'Top Right': 'Top Right',
    'Bottom Left': 'Bottom Left',
    'Bottom Right': 'Bottom Right',
    'Save (verb)': 'Save',
    'Save (noun)': 'Save',
  };

  JLib.i18n.registerDictionary({ lang: 'en', selfName: 'English', strings: EN_STRINGS, isDefault: true });

  Object.assign(JLib.i18n, { setDefault, getDefaultDictionary, listDictionaries, t });
})();
