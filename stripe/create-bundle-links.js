#!/usr/bin/env node
'use strict';
/* Creates Stripe Product + Price + Payment Link for the 8 bundles.
 * ⛔ NEVER use create-links.js to add products — it walks EVERY product and
 * relies on 24h idempotency keys that expired long ago, so a re-run mints
 * duplicate live products and repoints every existing checkout URL.
 * This is the one-slug pattern, repeated: it skips any slug already recorded in
 * links.json and merges results without touching the rest. */
const https=require('https'), fs=require('fs'), path=require('path'), os=require('os');
const DIR=__dirname;
let KEY=process.env.STRIPE_SECRET_KEY;
if(!KEY){ try{ KEY=fs.readFileSync(path.join(os.homedir(),'.stripe-key'),'utf8').trim().split('\n')[0].trim(); }catch{} }
if(!KEY||!/^sk_(live|test)_/.test(KEY)){ console.error('❌ no stripe key'); process.exit(1); }
const MODE=KEY.startsWith('sk_live_')?'LIVE':'TEST';
const STAMP='20260825';
const BUNDLES=[
 {slug:'complete-collection', name:'The Complete Collection — 13 Cardboard Build Plans', cents:7792,
  desc:'Every Cardboard Creations build in one download: 13 life-size build plans, 440 pages, six languages.'},
 {slug:'wearables-collection', name:'Wearable Costume Collection — 5 Cardboard Build Plans', cents:3996,
  desc:'Knight armour, robot suit, monster mask, wings and a full creature suit. 185 pages, six languages.'},
 {slug:'vehicles-collection', name:'Things That Go Collection — 4 Cardboard Build Plans', cents:3730,
  desc:'Fire truck, race car cockpit, rocket ship and interstellar cockpit. 133 pages, six languages.'},
 {slug:'dens-collection', name:'Dens & Hideouts Collection — 4 Cardboard Build Plans', cents:3730,
  desc:'Castle, playhouse, dino egg and pirate ship — four builds a child climbs inside. 122 pages.'},
 {slug:'weekend-builds', name:'Big Weekend Builds — 4 Cardboard Build Plans', cents:3730,
  desc:'Four showpiece builds: pirate ship, playhouse, castle and creature suit. 145 pages, six languages.'},
 {slug:'quick-builds', name:'Quick Builds Under 90 Minutes — 3 Cardboard Build Plans', cents:2797,
  desc:'Three builds you can finish in an afternoon: fire truck, monster mask and wings. 109 pages.'},
 {slug:'party-pack', name:'Birthday Party Pack — 3 Cardboard Build Plans', cents:2797,
  desc:'Knight armour, monster mask and wings — a party activity and the decor in one. 101 pages.'},
 {slug:'space-pack', name:'Space Mission Pack — 3 Cardboard Build Plans', cents:2797,
  desc:'Rocket ship, interstellar cockpit and a wearable robot suit. 93 pages, six languages.'},
];
function api(method,ep,form,idem){return new Promise((res,rej)=>{
  const body=new URLSearchParams(form).toString();
  const r=https.request({method,hostname:'api.stripe.com',path:'/v1/'+ep,headers:{
    'Authorization':'Bearer '+KEY,'Content-Type':'application/x-www-form-urlencoded',
    'Content-Length':Buffer.byteLength(body),...(idem?{'Idempotency-Key':idem}:{})}},s=>{
    let d='';s.on('data',c=>d+=c);s.on('end',()=>{const j=JSON.parse(d); j.error?rej(new Error(j.error.message)):res(j);});});
  r.on('error',rej); r.write(body); r.end();});}
(async()=>{
  const dry=process.argv.includes('--dry');
  const lp=path.join(DIR,'links.json');
  const links=JSON.parse(fs.readFileSync(lp,'utf8'));
  console.log(`🔑 Stripe ${MODE} — ${BUNDLES.length} bundles`);
  let made=0;
  for(const b of BUNDLES){
    if(links[b.slug]){ console.log(`⏭  ${b.slug} already in links.json: ${links[b.slug].url}`); continue; }
    console.log(`\n── ${b.slug}  $${(b.cents/100).toFixed(2)}`);
    if(dry){ console.log('   dry run'); continue; }
    const product=await api('POST','products',{name:b.name,description:b.desc,'metadata[slug]':b.slug},`prod_${b.slug}_${STAMP}`);
    const price=await api('POST','prices',{product:product.id,unit_amount:String(b.cents),currency:'usd'},`price_${b.slug}_${b.cents}_${STAMP}`);
    const link=await api('POST','payment_links',{'line_items[0][price]':price.id,'line_items[0][quantity]':'1',
      'metadata[slug]':b.slug,'after_completion[type]':'redirect',
      'after_completion[redirect][url]':`https://shop.highendmusiconline.com/thanks/${b.slug}`},`link_${b.slug}_${b.cents}_${STAMP}`);
    console.log('   product ✓',product.id); console.log('   price   ✓',price.id);
    console.log('   link    ✓',link.url);
    links[b.slug]={product:product.id,price:price.id,url:link.url};
    fs.writeFileSync(lp,JSON.stringify(links,null,2)+'\n');
    made++;
  }
  console.log(`\n✅ ${made} new link(s); links.json now has ${Object.keys(links).length} entries`);
})().catch(e=>{console.error('❌ '+e.message);process.exit(1)});
