#!/usr/bin/env node
'use strict';
/* READ-ONLY. Lists every live Stripe payment link with its price/product and
 * matches it against the /go/<slug>/ redirect pages actually shipped on the
 * store, so links.json can be rebuilt from what EXISTS rather than from memory.
 * Creates nothing. */
const https = require('https'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
let KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) { try { KEY = fs.readFileSync(path.join(os.homedir(), '.stripe-key'), 'utf8').trim().split('\n')[0].trim(); } catch {} }
if (!KEY || !/^sk_(live|test)_/.test(KEY)) { console.error('❌ no stripe key'); process.exit(1); }

function api(ep) {
  return new Promise((res, rej) => {
    const r = https.request({ method: 'GET', hostname: 'api.stripe.com', path: '/v1/' + ep,
      headers: { 'Authorization': 'Bearer ' + KEY } }, s => {
      let d = ''; s.on('data', c => d += c);
      s.on('end', () => { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j); });
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  console.log('🔑 Stripe ' + (KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST') + ' — read-only audit\n');

  // What the shipped store actually points at.
  const goDir = path.join(ROOT, 'go');
  const shipped = {};
  for (const slug of fs.readdirSync(goDir)) {
    const f = path.join(goDir, slug, 'index.html');
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/);
    if (m) shipped[slug] = m[0];
  }

  const links = await api('payment_links?limit=100&expand[]=data.line_items');
  const byUrl = new Map(links.data.map(l => [l.url, l]));
  console.log(`payment links on the account: ${links.data.length}`);
  console.log(`/go/ pages on the store:      ${Object.keys(shipped).length}\n`);

  const out = {};
  for (const [slug, url] of Object.entries(shipped)) {
    const l = byUrl.get(url);
    if (!l) { console.log(`  ⚠️  ${slug.padEnd(12)} ${url}  — NO matching payment link on the account`); continue; }
    const li = l.line_items && l.line_items.data && l.line_items.data[0];
    const price = li && li.price;
    out[slug] = { product: price ? price.product : null, price: price ? price.id : null, url: l.url };
    const amt = price && price.unit_amount != null ? '$' + (price.unit_amount / 100).toFixed(2) : 'n/a';
    console.log(`  ${l.active ? '✓' : '✗ INACTIVE'} ${slug.padEnd(12)} ${amt.padStart(7)}  ${price ? price.product : '?'}`);
  }

  const orphans = links.data.filter(l => !Object.values(shipped).includes(l.url));
  if (orphans.length) {
    console.log(`\n  ${orphans.length} payment link(s) with no /go/ page pointing at them:`);
    for (const l of orphans) console.log(`    ${l.active ? 'active  ' : 'inactive'} ${l.url}  ${(l.metadata && l.metadata.slug) || ''}`);
  }

  fs.writeFileSync(path.join(__dirname, 'links-audit.json'), JSON.stringify(out, null, 2));
  console.log('\nREAD-ONLY — nothing created. Wrote stripe/links-audit.json');
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
