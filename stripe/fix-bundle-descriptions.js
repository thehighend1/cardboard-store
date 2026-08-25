#!/usr/bin/env node
'use strict';
/* The store delivers SPLIT per-language PDFs (print only your language);
 * Etsy delivers one MERGED all-language PDF. They have different page counts —
 * castle is 9 pages split vs 30 merged. The first descriptions carried the Etsy
 * numbers, which overstate what a store buyer prints. Measured, not assumed. */
const https=require('https'), fs=require('fs'), path=require('path'), os=require('os');
let KEY=process.env.STRIPE_SECRET_KEY;
if(!KEY){ try{ KEY=fs.readFileSync(path.join(os.homedir(),'.stripe-key'),'utf8').trim().split('\n')[0].trim(); }catch{} }
const links=JSON.parse(fs.readFileSync(path.join(__dirname,'links.json'),'utf8'));
const D={
 'complete-collection':'Every Cardboard Creations build in one download: 13 life-size builds, 147 printable pages in your language, 78 PDFs covering English, Spanish, French, German, Dutch and Portuguese.',
 'wearables-collection':'Knight armour, robot suit, monster mask, wings and a full creature suit — 5 wearable builds, 65 printable pages in your language, 30 PDFs across six languages.',
 'vehicles-collection':'Fire truck, race car cockpit, rocket ship and interstellar cockpit — 4 builds, 44 printable pages in your language, 24 PDFs across six languages.',
 'dens-collection':'Castle, playhouse, dinosaur egg and pirate ship — 4 builds a child climbs inside, 38 printable pages in your language, 24 PDFs across six languages.',
 'weekend-builds':'Four showpiece builds — pirate ship, playhouse, castle and creature suit. 51 printable pages in your language, 24 PDFs across six languages.',
 'quick-builds':'Three builds you can finish in an afternoon: fire truck, monster mask and wings. 36 printable pages in your language, 18 PDFs across six languages.',
 'party-pack':'Knight armour, monster mask and wings — the party activity and the decor in one. 33 printable pages in your language, 18 PDFs across six languages.',
 'space-pack':'Rocket ship, interstellar cockpit and a wearable robot suit. 30 printable pages in your language, 18 PDFs across six languages.',
 'bundle':'Monster Mask, Wings and the full Beast Suit together — 3 costume builds, 42 printable pages in your language, 18 PDFs across six languages.',
};
function post(ep,form){return new Promise((res,rej)=>{
  const body=new URLSearchParams(form).toString();
  const r=https.request({method:'POST',hostname:'api.stripe.com',path:'/v1/'+ep,headers:{
    'Authorization':'Bearer '+KEY,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},s=>{
    let d='';s.on('data',c=>d+=c);s.on('end',()=>{const j=JSON.parse(d); j.error?rej(new Error(j.error.message)):res(j);});});
  r.on('error',rej); r.write(body); r.end();});}
(async()=>{
  for(const [slug,desc] of Object.entries(D)){
    const e=links[slug];
    if(!e){ console.log('⏭  no link entry for '+slug); continue; }
    const p=await post('products/'+e.product,{description:desc});
    console.log((p.description===desc?'✅ ':'❌ ')+slug.padEnd(22)+p.description.slice(0,58)+'…');
  }
})().catch(e=>{console.error('❌ '+e.message);process.exit(1)});
