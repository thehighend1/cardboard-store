#!/usr/bin/env node
'use strict';
/* Rewrites every go/<slug>/index.html (and the inert _redirects file) from
 * links.json, so the store's checkout URLs always match live Stripe.
 *
 * WHY THE STUBS ARE THE REAL REDIRECT: shop.highendmusiconline.com is served by
 * GitHub Pages, which does NOT honour a Netlify-style `_redirects` file —
 * verified 2026-08-25 (`curl -I /go/castle/` → 200 from server: GitHub.com, no
 * Location header). The meta-refresh + location.replace stub is what moves the
 * buyer. `_redirects` is kept in sync only so it can't mislead a later session.
 *
 * Run this after ANY change that mints new payment links (e.g. a reprice).
 */
const fs = require('fs'), path = require('path');
const DIR = __dirname, ROOT = path.join(DIR, '..');
const links = JSON.parse(fs.readFileSync(path.join(DIR, 'links.json'), 'utf8'));

// Non-Stripe destinations that live in go/ but are not purchases.
const STATIC = {};   // nothing is free right now — Rashard's call 2026-09-17

const stub = url => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Taking you to secure checkout…</title><meta http-equiv="refresh" content="0;url=${url}"><link rel="canonical" href="${url}"><script>location.replace("${url}")</script><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#1A237E}</style></head><body>Taking you to secure checkout… <a href="${url}">Click here</a> if it doesn't load.</body></html>`;

let written = 0;
for (const [slug, rec] of Object.entries(links)) {
  const dir = path.join(ROOT, 'go', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  const next = stub(rec.url);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (prev !== next) { fs.writeFileSync(file, next); console.log(`✏️  go/${slug}/`); written++; }
}

// The STATIC (non-purchase) slugs need a real stub too. They were only ever
// written into _redirects, which GitHub Pages IGNORES — so when the free build
// changed, go/starter/ kept redirecting to a page that no longer exists.
for (const [slug, dest] of Object.entries(STATIC)) {
  const dir = path.join(ROOT, 'go', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  const next = stub(dest);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (prev !== next) { fs.writeFileSync(file, next); console.log(`✏️  go/${slug}/ (static → ${dest})`); written++; }
}

// Keep the (inert) _redirects honest rather than stale.
const lines = [
  '# NOTE: GitHub Pages IGNORES this file — verified 2026-08-25. The real',
  '# redirect is the meta-refresh stub in each go/<slug>/index.html.',
  '# Regenerate both with: node stripe/rebuild-go-stubs.js',
];
for (const [slug, rec] of Object.entries(links)) lines.push(`/go/${slug}  ${rec.url}  302`);
for (const [slug, dest] of Object.entries(STATIC)) lines.push(`/go/${slug}  ${dest}  302`);
fs.writeFileSync(path.join(ROOT, '_redirects'), lines.join('\n') + '\n');

console.log(`\n✅ ${written} stub(s) rewritten; _redirects regenerated (${Object.keys(links).length} paid + ${Object.keys(STATIC).length} static).`);
