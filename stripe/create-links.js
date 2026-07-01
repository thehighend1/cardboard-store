#!/usr/bin/env node
'use strict';
/*
 * Creates a Stripe Product + Price + Payment Link for every paid item in catalog.json.
 * No SDK: raw HTTPS against Stripe's REST API. Idempotent (Idempotency-Key per slug).
 *
 * Requires:  STRIPE_SECRET_KEY   (sk_live_... or sk_test_...)   in the environment,
 *            OR a key on the first line of ~/.stripe-key
 * Optional:  DELIVERY_BASE       e.g. https://tatumandkash.com/thanks
 *            (buyer is redirected to  DELIVERY_BASE/<slug>  after paying)
 *
 * Writes:    stripe/links.json   { slug: { product, price, url }, ... }
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = __dirname;
const catalog = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));

let KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  try { KEY = fs.readFileSync(path.join(os.homedir(), '.stripe-key'), 'utf8').trim().split('\n')[0].trim(); } catch {}
}
if (!KEY || !/^sk_(live|test)_/.test(KEY)) {
  console.error('❌ No Stripe secret key. Set STRIPE_SECRET_KEY=sk_live_... (or put it in ~/.stripe-key).');
  process.exit(1);
}
const MODE = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';
const DELIVERY_BASE = (process.env.DELIVERY_BASE || '').replace(/\/+$/, '');

function api(method, endpoint, form, idemKey) {
  const body = new URLSearchParams(form).toString();
  const opts = {
    method,
    hostname: 'api.stripe.com',
    path: '/v1/' + endpoint,
    headers: {
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  if (idemKey) opts.headers['Idempotency-Key'] = idemKey;
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { return reject(new Error('Bad JSON from Stripe: ' + data.slice(0, 200))); }
        if (res.statusCode >= 400) return reject(new Error(`Stripe ${res.statusCode}: ${json.error && json.error.message}`));
        resolve(json);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`\n🔑 Stripe key detected — ${MODE} mode`);
  if (MODE === 'TEST') console.log('   (test key: links will NOT take real money — use for a dry run)');
  if (!DELIVERY_BASE) console.log('⚠️  DELIVERY_BASE not set — payment links will have NO post-payment redirect (buyer sees Stripe\'s default confirmation, gets no file). Set DELIVERY_BASE before going live.');

  const out = {};
  const paid = catalog.products.filter((p) => p.price_cents > 0);
  for (const p of paid) {
    process.stdout.write(`\n• ${p.slug.padEnd(11)} `);
    // 1) Product
    const product = await api('POST', 'products', {
      name: p.name, description: p.desc, 'metadata[slug]': p.slug,
    }, `prod_${p.slug}`);
    process.stdout.write(`product✓ `);
    // 2) Price
    const price = await api('POST', 'prices', {
      product: product.id, unit_amount: String(p.price_cents), currency: catalog.currency,
    }, `price_${p.slug}_${p.price_cents}`);
    process.stdout.write(`price✓ `);
    // 3) Payment Link
    const linkForm = {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'metadata[slug]': p.slug,
    };
    if (DELIVERY_BASE) {
      linkForm['after_completion[type]'] = 'redirect';
      linkForm['after_completion[redirect][url]'] = `${DELIVERY_BASE}/${p.slug}`;
    }
    const link = await api('POST', 'payment_links', linkForm, `link_${p.slug}_${p.price_cents}`);
    process.stdout.write(`link✓  ${link.url}`);
    out[p.slug] = { product: product.id, price: price.id, url: link.url };
  }
  fs.writeFileSync(path.join(DIR, 'links.json'), JSON.stringify(out, null, 2));
  console.log(`\n\n✅ Wrote stripe/links.json — ${Object.keys(out).length} payment links (${MODE}).`);
  console.log('   Next:  node stripe/rewire-store.js');
})().catch((e) => { console.error('\n❌ ' + e.message); process.exit(1); });
