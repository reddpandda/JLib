// ============================================================================
// services/heuristics.js
// ============================================================================
/*
 * heuristics — provider-agnostic discovery engine.
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
 *   withScrollLock(fn) -> runs fn() while a real, native, invisible
 *     modal dialog blocks all input to the page. See its own comment
 *     for exactly what this protects against and why it's a separate
 *     exposed utility rather than something capture()/rank() apply
 *     internally.
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

  // withScrollLock(fn) — runs fn() while scroll/click/keyboard input to
  // the real page is genuinely blocked at the platform level, via a
  // real, invisible, native <dialog> opened with showModal().
  //
  // The specific danger this exists for: on plenty of real SPAs, a
  // scroll doesn't just move the native viewport — it drives a custom
  // scrollbar/virtualized-list implementation that reacts to wheel/
  // touch input in its own JS handler and swaps out DOM nodes
  // (recycling element references for entirely different content) as
  // part of that reaction. If that happens between when a candidate
  // element's identity is captured and when its live state (computed
  // style, geometry) is read later, the color/value read back can get
  // silently misattributed to the wrong logical content — a real,
  // serious correctness bug, not just visual jank.
  //
  // Keeping the whole capture-through-read span synchronous (no
  // `await`, no requestAnimationFrame yield in between) is NOT a
  // sufficient fix on its own, even though it blocks the equivalent
  // danger from *native* browser scroll (native scroll dispatch
  // genuinely cannot interleave with synchronous JS execution). A
  // custom scroll library isn't bound by that same guarantee — it can
  // react to input in the same handler, same tick, the instant a wheel
  // event arrives, with no dependency on our own execution reaching a
  // yield point at all. And relying on "nothing in this span ever
  // yields" as the actual safety mechanism is fragile forever, not just
  // today — a single future change anywhere in a caller's chain that
  // innocently introduces an await would silently reopen the exact
  // hole, with nothing to catch the regression. A real native modal
  // backdrop blocking input before it reaches ANY JS handler — custom
  // or native — doesn't depend on that invariant being maintained.
  //
  // Deliberately does NOT set pointer-events:none on the dialog itself
  // — confirmed via direct testing (document.elementFromPoint against
  // a real page, before/during/after the dialog) that doing so defeats
  // the dialog's own input-blocking behavior: a naive first version
  // with pointer-events:none set resolved elementFromPoint straight
  // through to the underlying page's own content even while the
  // "modal" was open. The corrected version (full-viewport sizing,
  // opacity:0 for invisibility only, no pointer-events override)
  // resolves elementFromPoint to the dialog itself for as long as it's
  // open, confirmed the same way.
  //
  // Not applied automatically inside capture()/rank() — this file only
  // owns Steps 1-2 of a larger pipeline; the real span that needs
  // protecting extends through whatever later reads (getComputedStyle,
  // geometry) a provider's own Steps 3+ perform, which this file has no
  // visibility into. A caller chaining further reads after rank()
  // should wrap its ENTIRE capture-through-read sequence in one
  // withScrollLock() call, not rely on something inside capture()
  // that can't see past its own two steps.
  function withScrollLock(fn) {
    const dialog = document.createElement('dialog');
    dialog.setAttribute(
      'style',
      'opacity:0;position:fixed;inset:0;width:100vw;height:100vh;padding:0;border:none;margin:0;max-width:none;max-height:none;background:transparent;'
    );
    document.body.appendChild(dialog);
    const activeBefore = document.activeElement;
    let result;
    try {
      dialog.showModal();
      result = fn();
    } finally {
      dialog.close();
      dialog.remove();
      if (activeBefore && typeof activeBefore.focus === 'function') activeBefore.focus();
    }
    return result;
  }

  // capture(rootEl?) -> [{ el, tag, raw }], one entry per element under
  // rootEl (default document). `raw` is every class name plus every
  // attribute name and value, as plain strings — tokenization happens
  // in rank(), not here, so capture() stays reusable for anything that
  // wants the raw strings without paying tokenization cost it doesn't
  // need.
  //
  // No lock applied internally — see withScrollLock's own comment for
  // why that responsibility belongs to whoever owns the full span
  // being protected, not to this function alone.
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
  // Does NOT include a scroll lock. If a caller stops here, wrap this
  // call in withScrollLock() directly; if a caller chains further
  // reads (getComputedStyle, geometry) afterward, wrap the WHOLE chain
  // — this call plus those later reads — in one withScrollLock() call
  // instead, since the real span needing protection extends past what
  // this function alone can see.
  function captureAndRank(keywords, rootEl) {
    return rank(capture(rootEl), keywords);
  }

  return { tokenize, capture, rank, captureAndRank, withScrollLock };
})();
