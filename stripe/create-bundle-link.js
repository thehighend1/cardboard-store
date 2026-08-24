#!/usr/bin/env node
'use strict';
/* Creates the Stripe Product + Price + Payment Link for the HALLOWEEN BUNDLE only.
 * Same reasoning as create-rocket-link.js: create-links.js walks every product and
 * relies on 24h idempotency keys that expired long ago, so re-running it would mint
 * duplicate live products and repoint every existing checkout. This touches the
 * bundle and nothing else. Idempotent by slug — refuses if it is already recorded.
 *   --dry   print what it would create, call nothing */
const https = require('https'), fs = require('fs'), path = require('path'), os = require('os');
const DIR = __dirname;
const DRY = process.argv.includes('--dry');
let KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) { try { KEY = fs.readFileSync(path.join(os.homedir(), '.stripe-key'), 'utf8').trim().split('\n')[0].trim(); } catch {} }
if (!KEY || !/^sk_(live|test)_/.test(KEY)) { console.error('❌ no stripe key'); process.exit(1); }
const MODE = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';

const P = {
  slug: 'bundle',
  name: 'Halloween Costume Bundle — 3 Blueprints',
  desc: 'All three wearable Halloween builds: Cardboard Monster Mask, Cardboard Wings and Cardboard Beast Suit. 120 pages across 6 languages.',
  price_cents: 2499,
};
const REDIRECT = 'https://shop.highendmusiconline.com/thanks/bundle';
const STAMP = '20260824';

function api(method, ep, form, idem) {
  return new Promise((res, rej) => {
    const body = new URLSearchParams(form).toString();
    const r = https.request({ method, hostname: 'api.stripe.com', path: '/v1/' + ep, headers: {
      'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body), ...(idem ? { 'Idempotency-Key': idem } : {}) } }, s => {
      let d = ''; s.on('data', c => d += c);
      s.on('end', () => { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j); });
    });
    r.on('error', rej); r.write(body); r.end();
  });
}

(async () => {
  console.log(`🔑 Stripe ${MODE} mode — creating ONLY "${P.slug}" at $${(P.price_cents / 100).toFixed(2)}`);
  const linksPath = path.join(DIR, 'links.json');
  const existing = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
  if (existing[P.slug]) { console.log('⏭  bundle already in links.json:', existing[P.slug].url); return; }
  if (DRY) { console.log('DRY RUN — would create product/price/link and redirect →', REDIRECT); return; }

  const product = await api('POST', 'products', { name: P.name, description: P.desc, 'metadata[slug]': P.slug }, `prod_${P.slug}_${STAMP}`);
  console.log('  product ✓', product.id);
  const price = await api('POST', 'prices', { product: product.id, unit_amount: String(P.price_cents), currency: 'usd' }, `price_${P.slug}_${P.price_cents}_${STAMP}`);
  console.log('  price   ✓', price.id, `$${(P.price_cents / 100).toFixed(2)}`);
  const link = await api('POST', 'payment_links', {
    'line_items[0][price]': price.id, 'line_items[0][quantity]': '1', 'metadata[slug]': P.slug,
    'after_completion[type]': 'redirect', 'after_completion[redirect][url]': REDIRECT }, `link_${P.slug}_${P.price_cents}_${STAMP}`);
  console.log('  link    ✓', link.url);
  console.log('  redirect→', REDIRECT);

  existing[P.slug] = { product: product.id, price: price.id, url: link.url };
  fs.writeFileSync(linksPath, JSON.stringify(existing, null, 2));
  console.log(`✅ links.json now has ${Object.keys(existing).length} entries`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
