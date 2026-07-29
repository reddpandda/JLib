#!/usr/bin/env node
/*
 * build.js — concatenates src/ into the bundles/ that authors actually
 * @require. Not a real bundler: no minification, no tree-shaking, no
 * dependency resolution.
 *
 * Ordering truth lives in a .order.json file inside EACH source folder
 * (src/services/, src/providers/, src/elements/, and any folder-shaped
 * module under src/modules/) — one uniform convention, everywhere,
 * rather than hardcoded order arrays living separately in this file.
 * This matters specifically because GitHub (like most filesystems) does
 * not guarantee directory listing order matches anything meaningful —
 * relying on that order would be silently fragile. Order lives right
 * next to the files it governs, so anyone editing src/ can see and
 * update it in the same place, not in a separate file elsewhere in the
 * repo.
 *
 * The order recorded here isn't arbitrary — it's the dependency order
 * confirmed correct by actually loading and executing every file in a
 * real (simulated-browser) test, not just syntax-checked. Two real
 * ordering bugs were caught this way that would NOT have been caught by
 * syntax checking alone: console.js needs utils.js's makeLogger loaded
 * first, and theme.js's built-in theme registrations need every
 * structural provider loaded first.
 *
 * Run with: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = __dirname;

// readOrder(folder) -> ordered array of .js filenames, from that
// folder's own .order.json. No fallback to directory listing — order is
// required to be explicit, everywhere, not inferred.
function readOrder(folderPath) {
  const orderFile = path.join(folderPath, '.order.json');
  if (!fs.existsSync(orderFile)) {
    throw new Error(`Missing .order.json in ${folderPath} — every source folder needs one, order is never inferred from directory listing (which GitHub does not guarantee).`);
  }
  return JSON.parse(fs.readFileSync(orderFile, 'utf8'));
}

function joinNamedFiles(folderPath, filenames) {
  return filenames
    .map((name) => `\n// ---- from ${path.relative(SRC, folderPath)}/${name} ----\n` + fs.readFileSync(path.join(folderPath, name), 'utf8'))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Top-level bundles. Each entry names a source folder plus WHICH of that
// folder's files belong to it — the actual order those files concatenate
// in is always read from that folder's own .order.json, never duplicated
// here, so there is exactly one place per folder that can be wrong.
// ---------------------------------------------------------------------------
const BUNDLES = [
  { name: 'registration-console.js', folder: 'services', include: ['utils.js', 'console.js', 'registration.js'] },
  { name: 'providers.js', folder: 'providers', include: null }, // null = every file in this folder's order
  { name: 'services.js', folder: 'services', include: null, exclude: ['utils.js', 'console.js', 'registration.js'] },
  { name: 'elements.js', folder: 'elements', include: null },
];

function buildBundles() {
  BUNDLES.forEach((bundle) => {
    const folderPath = path.join(SRC, bundle.folder);
    const fullOrder = readOrder(folderPath);
    let files = fullOrder;
    if (bundle.include) files = fullOrder.filter((f) => bundle.include.indexOf(f) !== -1);
    if (bundle.exclude) files = fullOrder.filter((f) => bundle.exclude.indexOf(f) === -1);
    const content = joinNamedFiles(folderPath, files);
    fs.writeFileSync(path.join(OUT, bundle.name), content, 'utf8');
    console.log('built', bundle.name, `(${files.length} source files, order from ${bundle.folder}/.order.json)`);
  });
}

// ---------------------------------------------------------------------------
// Modules — each entry in src/modules/ is either a folder (join
// everything inside it, per ITS OWN .order.json) or a bare file (copy
// it as-is — a copy is just a join of one file). Same uniform rule
// either way, no special-casing which kind an entry is.
// ---------------------------------------------------------------------------
const MODULES_SRC = path.join(SRC, 'modules');
const MODULES_OUT = path.join(OUT, 'modules');

function buildModules() {
  if (!fs.existsSync(MODULES_OUT)) fs.mkdirSync(MODULES_OUT, { recursive: true });
  const entries = fs.readdirSync(MODULES_SRC);
  entries.forEach((entry) => {
    const entryPath = path.join(MODULES_SRC, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      const order = readOrder(entryPath);
      const content = joinNamedFiles(entryPath, order);
      fs.writeFileSync(path.join(MODULES_OUT, entry + '.js'), content, 'utf8');
      console.log('built modules/' + entry + '.js', `(joined from ${order.length} files, order from modules/${entry}/.order.json)`);
    } else if (entry.endsWith('.js')) {
      fs.copyFileSync(entryPath, path.join(MODULES_OUT, entry));
      console.log('built modules/' + entry, '(copied, single source file)');
    }
  });
}

buildBundles();
buildModules();
console.log('\nBuild complete.');
