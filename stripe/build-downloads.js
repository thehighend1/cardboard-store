#!/usr/bin/env node
'use strict';
/*
 * Builds the post-payment delivery side of the store:
 *   downloads/<slug>/*.pdf        — the 6-language blueprint set, copied from ~/Desktop/TK-Blueprints-Upload
 *   thanks/<slug>/index.html      — branded thank-you page with a download button per language
 * The Stripe payment link's after_completion redirect points at  <DELIVERY_BASE>/<slug>  ==  /thanks/<slug>/.
 * Re-runnable. Paid kits only (Starter stays free on Gumroad).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const STORE = path.join(__dirname, '..');
const SETS = path.join(os.homedir(), 'Desktop', 'TK-Blueprints-Upload');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));

const LANG_ORDER = ['English', 'Español', 'Français', 'Deutsch', 'Nederlands', 'Português'];
const langOf = (f) => LANG_ORDER.find((l) => f.includes(l)) || f.replace(/\.pdf$/, '');

function thanksPage(p, files) {
  const buttons = files.map((f) =>
    `      <a class="dl" href="/downloads/${p.slug}/${encodeURIComponent(f)}" download>⬇ ${langOf(f)}</a>`
  ).join('\n');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Thank you! Your ${p.name} blueprint</title>
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
  .dl{display:block;background:var(--blue);color:#fff!important;text-decoration:none;font-family:'Fredoka';font-weight:600;font-size:16px;padding:14px 18px;border-radius:40px;box-shadow:0 6px 14px rgba(21,101,192,.3);transition:transform .15s}
  .dl:hover{transform:translateY(-2px);background:#0d47a1}
  .note{font-size:13px;color:#7a839a;margin-top:22px;line-height:1.5}
  .foot{margin-top:20px;font-size:12px;color:#9aa2b8}
</style></head><body>
  <div class="card">
    <div class="check">🎉</div>
    <h1>Thank you! Your blueprint is ready.</h1>
    <p class="sub"><strong>${p.name}</strong> — pick your language and download. Buy once, build again and again.</p>
    <div class="langs">
${buttons}
    </div>
    <p class="note">Each file is a printable PDF with cut lines, fold guides & a full parts list. Save it to your device now — you can re-download from this page anytime you have the link. Trouble? Reply to your Stripe receipt email.</p>
    <p class="foot">High End Entertainment, LLC · Cardboard Creations</p>
  </div>
</body></html>`;
}

let built = 0;
for (const p of catalog.products) {
  if (p.price_cents <= 0) { console.log(`  · ${p.slug.padEnd(11)} skipped (free — stays on Gumroad)`); continue; }
  const setDir = path.join(SETS, p.pdf_set);
  if (!fs.existsSync(setDir)) { console.log(`  ✗ ${p.slug.padEnd(11)} NO SET FOLDER: ${p.pdf_set}`); continue; }
  const files = fs.readdirSync(setDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => LANG_ORDER.indexOf(langOf(a)) - LANG_ORDER.indexOf(langOf(b)));
  const dlDir = path.join(STORE, 'downloads', p.slug);
  fs.mkdirSync(dlDir, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(setDir, f), path.join(dlDir, f));
  const thDir = path.join(STORE, 'thanks', p.slug);
  fs.mkdirSync(thDir, { recursive: true });
  fs.writeFileSync(path.join(thDir, 'index.html'), thanksPage(p, files));
  console.log(`  ✓ ${p.slug.padEnd(11)} ${files.length} langs → downloads/${p.slug}/ + thanks/${p.slug}/`);
  built++;
}
console.log(`\n✅ Built delivery for ${built} paid kits. Set DELIVERY_BASE=<your-domain>/thanks when creating links.`);
