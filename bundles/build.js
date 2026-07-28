#!/usr/bin/env node
/*
 * build.js — concatenates src/ into the bundles/ that authors actually
 * @require. Not a real bundler: no minification, no tree-shaking, no
 * dependency resolution. Just: read these files, in this exact order,
 * join their text, write the result out. The order below isn't
 * arbitrary — it's the dependency order confirmed correct by actually
 * loading and executing every file in a real (simulated-browser) test
 * environment, not just syntax-checked. Two real ordering bugs were
 * caught this way that would NOT have been caught by syntax checking
 * alone: console.js needs utils.js's makeLogger loaded first, and
 * theme.js's built-in theme registrations need every structural
 * provider (color/radius/shadow/border/font/super) loaded first.
 *
 * Run with: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = __dirname;

const BUNDLES = [
  {
    name: 'registration-console.js',
    files: [
      'services/utils.js',
      'services/console.js',
      'services/registration.js',
    ],
  },
  {
    name: 'providers.js',
    files: [
      'providers/color-provider.js',
      'providers/radius-provider.js',
      'providers/shadow-provider.js',
      'providers/border-provider.js',
      'providers/font-provider.js',
      'providers/super-provider.js',
    ],
  },
  {
    name: 'services.js',
    files: [
      'services/dom.js',
      'services/events.js',
      'services/dedupe.js',
      'services/storage.js',
      'services/theme.js',
      'services/i18n.js',
      'services/notifications.js',
      'services/module-lifecycle.js',
      'services/cache.js',
    ],
  },
  {
    name: 'elements.js',
    files: [
      'elements/button.js',
      'elements/modal.js',
      'elements/inputs.js',
      'elements/tabs.js',
      'elements/search-input.js',
    ],
  },
];

const MODULES_SRC = path.join(SRC, 'modules');
const MODULES_OUT = path.join(OUT, 'modules');

function joinFiles(fileList) {
  return fileList
    .map((relPath) => {
      const full = path.join(SRC, relPath);
      const separator = `\n// ---- from src/${relPath} ----\n`;
      return separator + fs.readFileSync(full, 'utf8');
    })
    .join('\n');
}

function buildBundles() {
  BUNDLES.forEach((bundle) => {
    const content = joinFiles(bundle.files);
    fs.writeFileSync(path.join(OUT, bundle.name), content, 'utf8');
    console.log('built', bundle.name, `(${bundle.files.length} source files)`);
  });
}

function buildModules() {
  if (!fs.existsSync(MODULES_OUT)) fs.mkdirSync(MODULES_OUT, { recursive: true });
  const entries = fs.readdirSync(MODULES_SRC);
  entries.forEach((entry) => {
    const entryPath = path.join(MODULES_SRC, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      const orderFile = path.join(entryPath, '.order.json');
      let fileOrder;
      if (fs.existsSync(orderFile)) {
        fileOrder = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
      } else {
        fileOrder = fs.readdirSync(entryPath).filter((f) => f.endsWith('.js'));
      }
      const content = fileOrder
        .map((f) => `\n// ---- from src/modules/${entry}/${f} ----\n` + fs.readFileSync(path.join(entryPath, f), 'utf8'))
        .join('\n');
      fs.writeFileSync(path.join(MODULES_OUT, entry + '.js'), content, 'utf8');
      console.log('built modules/' + entry + '.js', `(joined from ${fileOrder.length} files)`);
    } else if (entry.endsWith('.js')) {
      fs.copyFileSync(entryPath, path.join(MODULES_OUT, entry));
      console.log('built modules/' + entry, '(copied, single source file)');
    }
  });
}

buildBundles();
buildModules();
console.log('\nBuild complete.');
