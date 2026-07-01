#!/usr/bin/env node
'use strict';
/*
 * Repoints the store's /go/<slug>/ redirect pages + _redirects from Gumroad → Stripe,
 * using the URLs in stripe/links.json. The free Starter Kit is left on Gumroad.
 * Backs everything up to stripe/backup-<runtag>/ first. Pass a tag as argv[2] (defaults to "run").
 * Re-runnable: always rebuilds each redirect page from a clean template.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..');
const links = JSON.parse(fs.readFileSync(path.join(__dirname, 'links.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
const tag = process.argv[2] || 'run';
const backupDir = path.join(__dirname, `backup-${tag}`);
fs.mkdirSync(backupDir, { recursive: true });

function backup(rel) {
  const src = path.join(STORE, rel);
  if (fs.existsSync(src)) {
    const dst = path.join(backupDir, rel.replace(/\//g, '__'));
    fs.copyFileSync(src, dst);
  }
}

function redirectPage(url) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Taking you to secure checkout…</title><meta http-equiv="refresh" content="0;url=${url}"><link rel="canonical" href="${url}"><script>location.replace(${JSON.stringify(url)})</script><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#1A237E}</style></head><body>Taking you to secure checkout… <a href="${url}">Click here</a> if it doesn't load.</body></html>`;
}

const redirectLines = [];
let switched = 0;

for (const p of catalog.products) {
  const stripe = links[p.slug] && links[p.slug].url;
  const target = stripe || `https://highendmusic.gumroad.com/l/${p.gumroad}`;
  const rel = `go/${p.slug}/index.html`;
  backup(rel);
  fs.mkdirSync(path.join(STORE, 'go', p.slug), { recursive: true });
  fs.writeFileSync(path.join(STORE, rel), redirectPage(target));
  redirectLines.push(`/go/${p.slug}  ${target}  302`);
  if (stripe) { switched++; console.log(`  ✓ ${p.slug.padEnd(11)} → Stripe`); }
  else        { console.log(`  · ${p.slug.padEnd(11)} → Gumroad (no Stripe link — kept as-is)`); }
}

backup('_redirects');
fs.writeFileSync(path.join(STORE, '_redirects'), redirectLines.join('\n') + '\n');

console.log(`\n✅ Rewired ${switched}/${catalog.products.length} products to Stripe. Backup: ${path.relative(STORE, backupDir)}/`);
