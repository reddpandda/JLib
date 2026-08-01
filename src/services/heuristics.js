// ============================================================================
// services/heuristics.js
// ============================================================================
/*
 * heuristics — provider-agnostic discovery engine. Two jobs, meant to
 * run together as one uninterrupted synchronous call from a caller's
 * point of view (see capture()'s own comment for why that matters):
 *
 *   capture(rootEl?) -> raw per-element data (tag, class list, every
 *     attribute name/value) for every element under rootEl (default
 *     document). No getComputedStyle, no color reads — this step only
 *     knows about markup, not rendering.
 *
 *   rank(captured, keywords) -> the same list, scored against a keyword
 *     query via real BM25 (the ranking algorithm behind most real
 *     search engines — properly tokenized, corpus-derived stopwords,
 *     length-normalized), sorted descending, zero-score entries
 *     dropped.
 *
 * Nothing here knows what the keywords MEAN — a provider supplies its
 * own query (colorProvider's is accent/brand/primary/nav/..., a
 * structural provider's might be rounded/corner/pill/...) and gets
 * back a ranked candidate list in the same shape regardless. This is
 * the shared foundation every provider's own domain-specific steps
 * build on top of, not color-specific despite colorProvider being the
 * first real consumer.
 *
 * Depends on: nothing beyond core DOM/JS APIs.
 */
var JLib = typeof JLib !== 'undefined' ? JLib : {};

JLib.heuristics = (function () {
  // tokenize(str) -> array of lowercase words. Splits on camelCase,
  // hyphen, and underscore boundaries — "buttonPrimary" becomes
  // ["button", "primary"], not one opaque blob, so BM25 can match real
  // words instead of needing substring hacks.
  function tokenize(str) {
    if (!str) return [];
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[-_\s]+/)
      .map((s) => s.toLowerCase())
      .filter(Boolean);
  }

  // capture(rootEl?) -> [{ el, tag, raw }], one entry per element under
  // rootEl (default document). `raw` is every class name plus every
  // attribute name and value, as plain strings — tokenization happens
  // in rank(), not here, so capture() stays reusable for anything that
  // wants the raw strings without paying tokenization cost it doesn't
  // need.
  //
  // Deliberately no getComputedStyle and no scroll-lock mechanism here.
  // The DOM-identity danger a scroll-lock would guard against (a
  // virtualized list recycling an element reference between when we
  // capture its identity and when a later step reads its rendered
  // state) only exists if there's a real async gap for a scroll-
  // triggered re-render to land in. capture() itself is one
  // synchronous loop — nothing else can execute mid-loop, by the
  // platform's own single-threaded guarantee — and callers are
  // expected to keep whatever reads the captured elements' live state
  // (computed style, geometry) in the SAME uninterrupted synchronous
  // call, not deferred behind an await. Kept that way, there's no gap
  // for the danger to occur in at all, without needing to lock
  // anything.
  function capture(rootEl) {
    rootEl = rootEl || document;
    const out = [];
    const els = rootEl.querySelectorAll('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const raw = [];
      const classList = el.classList;
      for (let c = 0; c < classList.length; c++) raw.push(classList[c]);
      const attrs = el.attributes;
      for (let a = 0; a < attrs.length; a++) {
        raw.push(attrs[a].name);
        raw.push(attrs[a].value);
      }
      out.push({ el, tag: el.tagName, raw });
    }
    return out;
  }

  // BM25 constants — textbook standard values (k1: term-frequency
  // saturation rate; b: how strongly document length is normalized
  // against the corpus average), not tuned per-site.
  const BM25_K1 = 1.5;
  const BM25_B = 0.75;

  // A token appearing on this fraction of the page's own elements or
  // more is a same-page stopword — same-page term-frequency ubiquity
  // means it was always going to contribute near-zero to any score, so
  // skipping it is a pure speed optimization (fewer terms scored per
  // document), never an accuracy change. Self-discovered from this
  // page's own data every time, not a hardcoded word list.
  const SAME_PAGE_STOPWORD_DOC_FREQ_RATIO = 0.9;

  // rank(captured, keywords) -> [{ el, tag, score }], sorted descending,
  // zero-score entries dropped. keywords: array of lowercase single
  // words — already the shape every provider's query is written in, so
  // tokenize() isn't run on the query itself.
  function rank(captured, keywords) {
    const N = captured.length;
    if (N === 0) return [];

    const docs = new Array(N);
    let totalLen = 0;
    const docFreq = new Map();
    for (let i = 0; i < N; i++) {
      const entry = captured[i];
      const terms = [];
      for (let j = 0; j < entry.raw.length; j++) {
        const t = tokenize(entry.raw[j]);
        for (let k = 0; k < t.length; k++) terms.push(t[k]);
      }
      docs[i] = { entry, terms };
      totalLen += terms.length;
      const seen = new Set(terms);
      seen.forEach((t) => docFreq.set(t, (docFreq.get(t) || 0) + 1));
    }
    const avgLen = totalLen / N;
    const stopwordCutoff = N * SAME_PAGE_STOPWORD_DOC_FREQ_RATIO;

    const idfCache = new Map();
    for (const q of keywords) {
      const n = docFreq.get(q) || 0;
      idfCache.set(q, Math.log((N - n + 0.5) / (n + 0.5) + 1));
    }

    const scored = new Array(N);
    for (let i = 0; i < N; i++) {
      const d = docs[i];
      const termFreq = new Map();
      for (let j = 0; j < d.terms.length; j++) {
        const t = d.terms[j];
        if ((docFreq.get(t) || 0) > stopwordCutoff) continue; // same-page stopword — speed only, score contribution was already ~0
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
      }
      let score = 0;
      for (const q of keywords) {
        const f = termFreq.get(q) || 0;
        if (f === 0) continue;
        const num = f * (BM25_K1 + 1);
        const den = f + BM25_K1 * (1 - BM25_B + BM25_B * (d.terms.length / avgLen));
        score += idfCache.get(q) * (num / den);
      }
      scored[i] = { el: d.entry.el, tag: d.entry.tag, score };
    }

    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  }

  // captureAndRank(keywords, rootEl?) — Steps 1+2 in one call, the
  // common case for a provider that just wants a ranked shortlist.
  function captureAndRank(keywords, rootEl) {
    return rank(capture(rootEl), keywords);
  }

  return { tokenize, capture, rank, captureAndRank };
})();
