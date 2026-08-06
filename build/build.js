#!/usr/bin/env node
'use strict';

/**
 * JLib docs builder.
 *
 * Reads docs/*.md and readme/*.readme.md from this branch, resolves
 * {{link:id}} tokens, injects the live "Built:" stamp line and the
 * shared footer (note + hidden span + style block), validates
 * structure, and writes fully-resolved output into built/ — a
 * staging area on THIS branch, not a push to main. Pushing built/
 * onto main is a deliberately separate, manual step (see the repo's
 * AGENTS.md for why).
 *
 * Zero npm dependencies, same spirit as bundles/build.js elsewhere in
 * this project: small, inspectable, nothing to audit.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const README_DIR = path.join(ROOT, 'readme');
const OUT_DIR = path.join(ROOT, 'built');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

const errors = [];

// ---------------------------------------------------------------------------
// The one canonical footer. Injected identically into every doc that
// doesn't already carry one. Nothing else in this repo should hand-author
// this block — that duplication is exactly what this builder exists to
// remove.
// ---------------------------------------------------------------------------
const FOOTER = `
---

<span id="local-viewer-note">If you're reading this on GitHub, you're done — nothing below matters to you. What follows is a CSS block for local markdown viewers (VS Code, Obsidian, Typora) that actually respect embedded styling. GitHub's renderer doesn't, and it's about to prove that by dumping the whole thing on your screen as plain text. That's not a bug that was missed; it's a platform limitation.</span>

<style>
:root {
  --jlib-accent: #6c5ce7;
  --jlib-accent-soft: #6c5ce71a;
  --jlib-code-bg: #00000008;
  --jlib-border: #00000022;
}
@media (prefers-color-scheme: dark) {
  :root {
    --jlib-accent: #a29bfe;
    --jlib-accent-soft: #a29bfe26;
    --jlib-code-bg: #ffffff10;
    --jlib-border: #ffffff22;
  }
}
body { max-width: 850px; margin: 0 auto; padding: 0 1.5em 4em;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
  Arial, sans-serif; line-height: 1.7; }
h1 { font-size: 1.9em; color: var(--jlib-accent);
  border-bottom: 2px solid var(--jlib-accent); padding-bottom: 0.3em; }
h2 { font-size: 1.4em; border-bottom: 1px solid var(--jlib-accent-soft);
  padding-bottom: 0.25em; margin-top: 2em; }
h3 { font-size: 1.15em; border-left: 4px solid var(--jlib-accent-soft);
  padding-left: 0.6em; margin-top: 1.8em; }
code { background: var(--jlib-code-bg); padding: 0.15em 0.4em; border-radius: 4px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone; }
pre { background: var(--jlib-code-bg); border-radius: 8px; padding: 1.1em;
  border: 1px solid var(--jlib-border); }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th { background: var(--jlib-accent-soft); text-align: left; padding: 0.5em 0.7em; }
td { padding: 0.45em 0.7em; border-bottom: 1px solid var(--jlib-border); vertical-align: top; }
dt { margin-top: 1.4em; }
dt code { font-size: 1.02em; font-weight: 600; }
dd { margin-left: 1.2em; border-left: 2px solid var(--jlib-accent-soft);
  padding-left: 1em; margin-bottom: 0.6em; }
details { margin: 0.6em 0; border: 1px solid var(--jlib-border); border-radius: 6px; padding: 0.5em 1em; }
summary { cursor: pointer; font-weight: 600; color: var(--jlib-accent); }
#local-viewer-note { display: none; }
</style>
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

/** Relative path from one real (main-branch) path to another, POSIX style. */
function relativeLink(fromRealPath, toRealPath) {
  const fromDir = path.posix.dirname(fromRealPath);
  let rel = path.posix.relative(fromDir, toRealPath);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

/** Resolves every {{link:id}} token against manifest.targets, relative to fromRealPath. */
function resolveLinks(content, fromRealPath, sourceLabel) {
  return content.replace(/\{\{link:([a-zA-Z0-9_-]+)\}\}/g, (whole, id) => {
    const target = !id.startsWith('$') ? manifest.targets[id] : undefined;
    if (!target) {
      errors.push(`${sourceLabel}: {{link:${id}}} has no matching entry in manifest.targets`);
      return whole;
    }
    return relativeLink(fromRealPath, target);
  });
}

/** Injects a mechanical "Built:" line right after the existing stamp block, if not already present. */
function injectBuiltLine(content, sha, date) {
  if (/^> Built:/m.test(content)) return content; // don't double-inject on a re-run
  const builtLine = `> Built: ${date} from docs @ \`${sha}\``;
  // Insert after the stamp's last leading "> ..." line (the blockquote block
  // directly under the H1), before the first blank line that follows it.
  const lines = content.split('\n');
  let i = 0;
  // skip H1
  while (i < lines.length && !lines[i].startsWith('> ')) i++;
  // walk through the blockquote stamp block
  while (i < lines.length && lines[i].startsWith('>')) i++;
  lines.splice(i, 0, '>', builtLine);
  return lines.join('\n');
}

function hasFooter(content) {
  return content.includes('id="local-viewer-note"');
}

function appendFooter(content) {
  return content.replace(/\n+$/, '\n') + FOOTER;
}

// ---------------------------------------------------------------------------
// Minimal structural validation — the checks that have, by hand, caught
// real bugs earlier in this project (missing blank lines, orphaned
// anchors). Not a full shape-schema interpreter; a schema-driven version
// is a reasonable future upgrade once more shapes exist, not required
// for this to be useful now.
// ---------------------------------------------------------------------------

function validateBlankLineRule(content, label) {
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/^<dd>$/.test(line.trim()) || /^<summary>/.test(line.trim())) {
      const next = lines[idx + 1];
      if (next !== undefined && next.trim() !== '') {
        errors.push(`${label}: line ${idx + 2} — missing blank line after ${line.trim()}`);
      }
    }
  });
}

function validateAnchorPairs(content, label, prefix) {
  const defined = new Set(
    [...content.matchAll(new RegExp(`<a id="${prefix}-[a-z0-9-]+">`, 'g'))]
      .map((m) => m[0].match(/id="([^"]+)"/)[1])
  );
  const rowDefined = new Set(
    [...content.matchAll(new RegExp(`<a id="row-${prefix}-[a-z0-9-]+">`, 'g'))]
      .map((m) => m[0].match(/id="([^"]+)"/)[1])
  );
  const used = new Set(
    [...content.matchAll(new RegExp(`#${prefix}-[a-z0-9-]+\\)`, 'g'))]
      .map((m) => m[0].slice(1, -1))
  );
  const rowUsed = new Set(
    [...content.matchAll(new RegExp(`#row-${prefix}-[a-z0-9-]+\\)`, 'g'))]
      .map((m) => m[0].slice(1, -1))
  );
  for (const id of defined) if (!used.has(id)) errors.push(`${label}: anchor #${id} defined but never linked to`);
  for (const id of used) if (!defined.has(id)) errors.push(`${label}: link to #${id} has no matching anchor`);
  for (const id of rowDefined) if (!rowUsed.has(id)) errors.push(`${label}: row anchor #${id} defined but no back-link uses it`);
  for (const id of rowUsed) if (!rowDefined.has(id)) errors.push(`${label}: back-link to #${id} has no matching row anchor`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
  const date = new Date().toISOString().slice(0, 10);

  // Topic docs — flat on both branches, so no link-path resolution needed,
  // only stamp + footer injection + validation.
  const topicFiles = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  for (const file of topicFiles) {
    const srcPath = path.join(DOCS_DIR, file);
    let content = readFile(srcPath);
    const label = `docs/${file}`;
    const realPath = `docs/${file}`;

    content = injectBuiltLine(content, sha, date);
    if (!hasFooter(content)) content = appendFooter(content);

    validateBlankLineRule(content, label);
    if (file === 'API.md') validateAnchorPairs(content, label, 'ref');
    if (file === 'Glossary.md') validateAnchorPairs(content, label, 'g');

    writeFile(path.join(OUT_DIR, realPath), content);
  }

  // Readme family — real path changes between source and destination, so
  // {{link:...}} tokens actually do work here.
  for (const [srcRel, realPath] of Object.entries(manifest.readmeOutputs)) {
    if (srcRel.startsWith('$')) continue;
    const srcPath = path.join(ROOT, srcRel);
    if (!fs.existsSync(srcPath)) {
      errors.push(`${srcRel}: listed in manifest.readmeOutputs but file does not exist`);
      continue;
    }
    let content = readFile(srcPath);
    const label = srcRel;

    content = resolveLinks(content, realPath, label);
    content = injectBuiltLine(content, sha, date);
    if (!hasFooter(content)) content = appendFooter(content);

    validateBlankLineRule(content, label);

    writeFile(path.join(OUT_DIR, realPath), content);
  }

  if (errors.length) {
    console.error(`Build failed — ${errors.length} error(s), nothing written to built/:\n`);
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  console.log(`Build succeeded — output written to built/. Review the diff there before copying onto main.`);
}

build();
