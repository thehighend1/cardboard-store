#!/usr/bin/env node
'use strict';
/* Raise the single-build prices to Etsy parity (2026-08-25, Rashard approved).
 *   12 builds  $9.99  -> $12.99      beast suit  $14.99 -> $19.99
 * Bundle prices are NOT touched.
 *
 * ⛔ NEVER use create-links.js — it walks EVERY product on expired idempotency
 *    keys and mints duplicate live products. This is the one-slug pattern.
 *
 * THE THING THAT IS NOT OBVIOUS, verified against the live API on 2026-08-25:
 *   A payment link's price CANNOT be repointed. `POST /v1/payment_links/:id`
 *   with line_items[0][price] returns:
 *       "Received unknown parameter: line_items[0][price]"
 *   Stripe prices are immutable AND so is a link's line item. So a price change
 *   is a THREE-step move per slug:
 *       1. new Price on the SAME Product  (keeps reporting on one product)
 *       2. NEW payment link at that price (reusing the old link's redirect)
 *       3. DEACTIVATE the old link        (else it keeps selling at $9.99)
 *   ...then the /go/<slug>/ stub has to be rewritten, because the checkout URL
 *   changes. `_redirects` is INERT here — the site is GitHub Pages, which
 *   ignores it; the meta-refresh stubs in go/ are what actually redirect.
 *
 * Idempotent: a slug already at the target amount is skipped, so a re-run after
 * a crash resumes rather than duplicating. links.json is written after EACH
 * slug for the same reason.
 */
const https = require('https'), fs = require('fs'), path = require('path'), os = require('os');
const DIR = __dirname;
const STAMP = '20260825b';

let KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) { try { KEY = fs.readFileSync(path.join(os.homedir(), '.stripe-key'), 'utf8').trim().split('\n')[0].trim(); } catch {} }
if (!KEY || !/^sk_(live|test)_/.test(KEY)) { console.error('❌ no stripe key'); process.exit(1); }
const MODE = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';

// slug -> [expected old cents, new cents]
const SINGLES = {
  'castle':     [999, 1299],
  'cockpit':    [999, 1299],
  'pirate':     [999, 1299],
  'robot':      [999, 1299],
  'race-car':   [999, 1299],
  'fire-truck': [999, 1299],
  'playhouse':  [999, 1299],
  'dino':       [999, 1299],
  'knight':     [999, 1299],
  'rocket':     [999, 1299],
  'mask':       [999, 1299],
  'wings':      [999, 1299],
  'beast':     [1499, 1999],
};

function api(method, ep, form, idem) {
  return new Promise((res, rej) => {
    const body = form ? new URLSearchParams(form).toString() : '';
    const r = https.request({
      method, hostname: 'api.stripe.com', path: '/v1/' + ep,
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...(idem ? { 'Idempotency-Key': idem } : {})
      }
    }, s => {
      let d = ''; s.on('data', c => d += c);
      s.on('end', () => { const j = JSON.parse(d); j.error ? rej(new Error(j.error.message)) : res(j); });
    });
    r.on('error', rej); r.write(body); r.end();
  });
}

(async () => {
  const dry = process.argv.includes('--dry');
  const lp = path.join(DIR, 'links.json');
  const links = JSON.parse(fs.readFileSync(lp, 'utf8'));

  if (!dry) {
    const bak = lp + '.bak-reprice-2026-08-25';
    if (!fs.existsSync(bak)) { fs.copyFileSync(lp, bak); console.log('💾 backup ->', path.basename(bak)); }
  }

  console.log(`🔑 Stripe ${MODE} — repricing ${Object.keys(SINGLES).length} single builds${dry ? '  (DRY RUN)' : ''}\n`);

  // One listing call; we need each slug's existing link object for its redirect URL.
  const all = await api('GET', 'payment_links?limit=100');
  const byUrl = new Map(all.data.map(p => [p.url, p]));

  let changed = 0, skipped = 0;
  for (const [slug, [oldCents, newCents]] of Object.entries(SINGLES)) {
    const rec = links[slug];
    if (!rec) { console.log(`⚠️  ${slug}: not in links.json — SKIPPED`); skipped++; continue; }

    // Guard: read the CURRENT live price rather than trusting links.json.
    const cur = await api('GET', `prices/${rec.price}`);
    if (cur.unit_amount === newCents) { console.log(`⏭  ${slug}: already $${(newCents / 100).toFixed(2)}`); skipped++; continue; }
    if (cur.unit_amount !== oldCents) {
      console.log(`⚠️  ${slug}: live price is $${(cur.unit_amount / 100).toFixed(2)}, expected $${(oldCents / 100).toFixed(2)} — SKIPPED, look at this by hand`);
      skipped++; continue;
    }

    const oldLink = byUrl.get(rec.url);
    if (!oldLink) { console.log(`⚠️  ${slug}: live payment link not found for ${rec.url} — SKIPPED`); skipped++; continue; }
    const redirect = oldLink.after_completion?.redirect?.url;
    if (!redirect) { console.log(`⚠️  ${slug}: old link has no redirect — SKIPPED`); skipped++; continue; }

    console.log(`── ${slug}  $${(oldCents / 100).toFixed(2)} → $${(newCents / 100).toFixed(2)}`);
    if (dry) { console.log(`   would: new price on ${rec.product}, new link → ${redirect}, deactivate ${oldLink.id}`); continue; }

    const price = await api('POST', 'prices',
      { product: rec.product, unit_amount: String(newCents), currency: 'usd' },
      `price_${slug}_${newCents}_${STAMP}`);

    const link = await api('POST', 'payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'metadata[slug]': slug,
      'after_completion[type]': 'redirect',
      'after_completion[redirect][url]': redirect,
    }, `link_${slug}_${newCents}_${STAMP}`);

    await api('POST', `payment_links/${oldLink.id}`, { active: 'false' });

    console.log(`   price ✓ ${price.id}`);
    console.log(`   link  ✓ ${link.url}`);
    console.log(`   old   ✓ ${oldLink.id} deactivated`);

    links[slug] = { product: rec.product, price: price.id, url: link.url };
    fs.writeFileSync(lp, JSON.stringify(links, null, 2) + '\n');   // after each slug, on purpose
    changed++;
  }

  console.log(`\n${dry ? '(dry) ' : '✅ '}${changed} repriced, ${skipped} skipped.`);
  if (changed && !dry) console.log('➡️  NEXT: node stripe/rebuild-go-stubs.js   (checkout URLs changed)');
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
