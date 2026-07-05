#!/usr/bin/env node
'use strict';
/*
 * One-off: builds the FREE Starter Kit delivery (Gumroad is gone).
 *   downloads/starter/*.pdf   — 6-language set from ~/Desktop/TK-Blueprints-Upload/Starter Kit (FREE)
 *   thanks/starter/index.html — free-download page (no purchase framing)
 *   go/starter/index.html     — redirect → /thanks/starter/ (replaces dead Gumroad link)
 * Same look as build-downloads.js pages. Re-runnable.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const STORE = path.join(__dirname, '..');
const SETS = path.join(os.homedir(), 'Desktop', 'TK-Blueprints-Upload');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
const p = catalog.products.find((x) => x.slug === 'starter');

const LANG_ORDER = ['English', 'Español', 'Français', 'Deutsch', 'Nederlands', 'Português'];
const langOf = (f) => LANG_ORDER.find((l) => f.includes(l)) || f.replace(/\.pdf$/, '');

const setDir = path.join(SETS, p.pdf_set);
const files = fs.readdirSync(setDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
  .sort((a, b) => LANG_ORDER.indexOf(langOf(a)) - LANG_ORDER.indexOf(langOf(b)));

const dlDir = path.join(STORE, 'downloads', 'starter');
fs.mkdirSync(dlDir, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(setDir, f), path.join(dlDir, f));

const buttons = files.map((f) =>
  `      <a class="dl" href="/downloads/starter/${encodeURIComponent(f)}" download>⬇ ${langOf(f)}</a>`
).join('\n');

const page = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your FREE Starter Kit — Cardboard Creations</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--navy:#1A237E;--blue:#1565C0;--green:#43A047}
  *{box-sizing:border-box}
  body{font-family:'Nunito',system-ui,sans-serif;margin:0;background:#f4f6fb;color:#1a1f36;text-align:center;padding:40px 18px}
  .card{max-width:560px;margin:0 auto;background:#fff;border-radius:22px;padding:38px 30px;box-shadow:0 14px 40px rgba(21,101,192,.14)}
  h1{font-family:'Fredoka';color:var(--navy);font-size:26px;margin:10px 0 6px}
  .sub{color:#5a6478;font-size:15px;margin-bottom:26px}
  .check{font-size:46px}
  .langs{display:flex;flex-direction:column;gap:11px;margin:8px 0 6px}
  .dl{display:block;background:var(--green);color:#fff!important;text-decoration:none;font-family:'Fredoka';font-weight:600;font-size:16px;padding:14px 18px;border-radius:40px;box-shadow:0 6px 14px rgba(67,160,71,.3);transition:transform .15s}
  .dl:hover{transform:translateY(-2px);background:#2e7d32}
  .more{display:inline-block;margin-top:24px;background:var(--blue);color:#fff!important;text-decoration:none;font-family:'Fredoka';font-weight:600;font-size:15px;padding:12px 26px;border-radius:40px}
  .note{font-size:13px;color:#7a839a;margin-top:22px;line-height:1.5}
  .foot{margin-top:20px;font-size:12px;color:#9aa2b8}
</style></head><body>
  <div class="card">
    <div class="check">🎁</div>
    <h1>Here's your FREE Starter Kit!</h1>
    <p class="sub"><strong>${p.name}</strong> — pick your language and download. No signup, no catch. Build something awesome.</p>
    <div class="langs">
${buttons}
    </div>
    <a class="more" href="/">Love it? See all 9 full-size kits — $9.99 each →</a>
    <p class="note">A printable PDF with cut lines, fold guides, a parts list & 3 engineering challenges. Save it to your device — come back anytime.</p>
    <p class="foot">High End Entertainment, LLC · Cardboard Creations</p>
  </div>
</body></html>`;

const thDir = path.join(STORE, 'thanks', 'starter');
fs.mkdirSync(thDir, { recursive: true });
fs.writeFileSync(path.join(thDir, 'index.html'), page);

const target = '/thanks/starter/';
const goPage = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Grabbing your free kit…</title><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="https://shop.highendmusiconline.com${target}"><script>location.replace("${target}")</script><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#1A237E}</style></head><body>Grabbing your free kit… <a href="${target}">Click here</a> if it doesn't load.</body></html>`;
fs.writeFileSync(path.join(STORE, 'go', 'starter', 'index.html'), goPage);

// _redirects: starter line → local thanks page
const rf = path.join(STORE, '_redirects');
let redirects = fs.readFileSync(rf, 'utf8');
redirects = redirects.replace(/^\/go\/starter\s+\S+\s+302$/m, '/go/starter  /thanks/starter/  302');
fs.writeFileSync(rf, redirects);

console.log(`✓ starter: ${files.length} langs → downloads/starter/ + thanks/starter/ + go/starter rewired → ${target}`);
