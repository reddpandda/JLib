var JLib = typeof JLib !== 'undefined' ? JLib : {};
JLib.elements = JLib.elements || {};

// ============================================================================
// elements/search-input.js
// ============================================================================
/*
 * Search — tokenized "smart-enough" fuzzy search. The matching engine
 * (normalize/tokenize/editDistance/fuzzyTolerance/scoreToken/matchScore)
 * is ported verbatim from the settings-panel.js branch this was built in
 * — stop-word filtering, diacritic folding, tiered exact/prefix/substring
 * scoring, and length-scaled fuzzy tolerance (under 4 chars: exact/
 * substring only, 4-6: 1 edit, 7+: 2 edits). Deliberately does NOT do
 * stemming (collides with i18n — stemming rules are per-language) or
 * phonetic matching (wrong tool for UI label text, that's for matching
 * misspelled names).
 *
 * inputField() adds the UI half — a debounced text input, since running
 * matchScore() against every candidate on every keystroke with no
 * debounce is real, avoidable CPU work.
 *
 * Depends on: JLib.dom, JLib.utils (debounce)
 */


JLib.elements.search = (function () {
  const { el } = JLib.dom;
  const { debounce } = JLib.utils;

  // ---------- matching engine ----------
  const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'is', 'are']);

  function foldDiacritics(s) {
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }
  function normalizeText(s) {
    return foldDiacritics(String(s).toLowerCase())
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokenize(s) {
    return normalizeText(s)
      .split(' ')
      .filter((tok) => tok && !STOP_WORDS.has(tok));
  }
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return Infinity;
    const dp = [];
    for (let i = 0; i <= a.length; i++) dp.push([i]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        rowMin = Math.min(rowMin, dp[i][j]);
      }
      if (rowMin > max) return Infinity;
    }
    return dp[a.length][b.length];
  }
  function fuzzyTolerance(len) {
    if (len < 4) return 0;
    if (len <= 6) return 1;
    return 2;
  }
  function scoreToken(qTok, cTok) {
    if (qTok === cTok) return 100;
    if (cTok.indexOf(qTok) === 0) return 70;
    if (cTok.indexOf(qTok) !== -1) return 50;
    const tol = fuzzyTolerance(Math.max(qTok.length, cTok.length));
    if (tol > 0) {
      const d = editDistance(qTok, cTok, tol);
      if (d <= tol) return 30 - d * 5;
    }
    return 0;
  }
  // Every query token must match something in the candidate (AND across
  // query tokens, best-match OR within candidate tokens) or the whole
  // thing scores 0.
  function matchScore(queryTokensOrString, candidateText) {
    const qTokens = Array.isArray(queryTokensOrString) ? queryTokensOrString : tokenize(queryTokensOrString);
    if (!qTokens.length) return 0;
    const candidateTokens = tokenize(candidateText);
    let total = 0;
    for (const qTok of qTokens) {
      let best = 0;
      for (const cTok of candidateTokens) best = Math.max(best, scoreToken(qTok, cTok));
      if (best === 0) return 0;
      total += best;
    }
    return total;
  }

  // search(items, query, getText) -> items sorted by score desc, score-0
  // items excluded. getText(item) -> string to match against; defaults
  // to String(item) for plain string arrays.
  function search(items, query, getText) {
    getText = getText || ((x) => String(x));
    const qTokens = tokenize(query);
    if (!qTokens.length) return items.slice();
    return items
      .map((item) => ({ item, score: matchScore(qTokens, getText(item)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }

  // ---------- UI: debounced search input ----------
  // inputField({ placeholder, debounceMs, onQuery }) -> HTMLInputElement
  // onQuery(rawQueryString) fires debounceMs after the user stops typing,
  // not on every keystroke.
  function inputField(opts) {
    opts = opts || {};
    const debounceMs = opts.debounceMs !== undefined ? opts.debounceMs : 200;
    const input = el('input', { className: 'jlib-search-input', attrs: { type: 'text', placeholder: opts.placeholder || 'Search...' } });
    const fireQuery = debounce(() => opts.onQuery && opts.onQuery(input.value), debounceMs);
    input.addEventListener('input', fireQuery);
    return input;
  }

  const SEARCH_CSS = `
    .jlib-search-input { width:100%; background: var(--jsp-hover); color: var(--jsp-text); border:1px solid var(--jsp-border); border-radius:8px; padding:8px 12px; font-size:13px; box-sizing:border-box; }
    .jlib-search-input:focus { outline:none; border-color: var(--jsp-accent); }
  `;
  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = SEARCH_CSS;
    document.head.appendChild(style);
  }
  injectStylesOnce();

  return { normalize: normalizeText, foldDiacritics, tokenize, editDistance, fuzzyTolerance, matchScore, search, inputField };
})();
