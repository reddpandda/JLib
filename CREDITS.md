# Credits

JLib is MIT-licensed (see [LICENSE](LICENSE)).  
The following third-party code and algorithms are included or used as the foundation for specific parts of the library.

## Vendored code

### idb-keyval
- **Author:** Jake Archibald  
- **Source:** [https://github.com/jakearchibald/idb-keyval](https://github.com/jakearchibald/idb-keyval)  
- **License:** Apache-2.0  
- **Used in:** `src/services/cache.js` (and the corresponding bundle)

A minimal subset of idb-keyval (`promisifyRequest`, `createStore`, `get`, `set`, `del`, `entries`) was converted from TypeScript to plain JavaScript and embedded inside the `JLib.cache` IIFE. Only the functions actually needed by the cache layer are present. This replaced an earlier hand-rolled IndexedDB wrapper.

Copyright 2016, Jake Archibald.  
Licensed under the Apache License, Version 2.0.  
See the original repository for the full license text.

### OKLab / OKLCH color conversion formulas
- **Author:** Björn Ottosson  
- **Source:** [A perceptual color space for image processing](https://bottosson.github.io/posts/oklab/)  
- **License:** Public domain (also dual-licensed MIT by the author)  
- **Used in:** `src/providers/color-provider.js` (and the corresponding bundle)

The linear sRGB ↔ OKLab matrices and the OKLab ↔ OKLCH conversion are taken from Ottosson’s published formulas. They form the core of `colorProvider`’s perceptually uniform color math, gamut mapping, contrast correction, and Display-P3 enrichment.

The additional linear Display-P3 ↔ LMS matrices used for optional P3 output are derived from the same trusted sRGB matrices composed with standard CIE XYZ D65 primaries (cross-checked against independent reference implementations).

## Algorithms

### BM25 (Best Matching 25)
- **Origin:** Standard information-retrieval ranking function (Robertson, Walker, et al.)  
- **Used in:** `src/services/heuristics.js` → `JLib.heuristics.rank` / `captureAndRank`

A textbook implementation of BM25 is used to rank DOM elements against keyword queries for the provider family (color, radius, etc.). Constants are the conventional values (`k1 = 1.5`, `b = 0.75`). Stop-word filtering is derived dynamically from the page’s own term frequencies rather than a fixed list.

No third-party BM25 library is vendored; the formula is implemented directly.

## Other notes

- The settings-panel / `JLib.elements.search` matching engine is an original tokenized fuzzy matcher (stop-word filtering, diacritic folding, tiered exact/prefix/substring scoring, length-scaled edit-distance tolerance). It is **not** BM25.
- Gamut-mapping for OKLCH follows the binary-search-on-chroma approach recommended by the CSS Color Level 4 specification.
- All other code in this repository is original work by reddpandda unless explicitly noted above.

If you spot any additional vendored or derived material that should be listed, open an issue or PR.
