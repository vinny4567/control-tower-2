// DOES A CHECK ACTUALLY SCREAM? — the test for the tests.
//
//     node tools/mutate-checks.mjs
//
// A check that stays green while the invariant it names is destroyed is worse than no
// check, because it is read as proof. Everything in tools/ is a regex over index.html,
// and a regex is only ever evidence about a SPELLING. So this breaks the page on purpose,
// twenty-four ways, and demands the right colour each time: the invariant-breaking edits
// must turn a check RED, and the harmless renames and reformats must leave it GREEN.
//
// That second half matters as much as the first. A check that goes red for a rename
// teaches whoever meets it to trim clauses until it passes, and that is how an invariant
// gets deleted by somebody being helpful. Every mutation below is a world somebody
// actually proposed as plausible.
//
// NOT part of check-all.mjs — it spawns node two dozen times. Run it after changing an
// assertion in tools/, which is exactly when a check is at risk of being weakened.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO=dirname(dirname(fileURLToPath(import.meta.url)));
const TMP=join(tmpdir(),'ct2-mutate-checks');
const SRC=readFileSync(join(REPO,'index.html'),'utf8');

const run=(which,html)=>{
  rmSync(TMP,{recursive:true,force:true}); mkdirSync(join(TMP,'tools'),{recursive:true});
  writeFileSync(join(TMP,'index.html'),html);
  cpSync(join(REPO,'tools',which),join(TMP,'tools',which));
  if(/^check-(printclasses|categories|specials)\.mjs$/.test(which)) cpSync(join(REPO,'pos-catalog.json'),join(TMP,'pos-catalog.json'));
  try{ execFileSync('node',[join(TMP,'tools',which)],{encoding:'utf8'}); return {red:false,out:''} }
  catch(e){ return {red:true,out:String(e.stdout||'')} }
};

const sub=(a,b)=>{ if(!SRC.includes(a)) throw new Error('anchor missing: '+a.slice(0,60)); return SRC.replace(a,b) };
const GOOD_TAKE='const take=(got,cur,empty)=>(!got||kvFailed(got))?cur:(got.v==null?empty:got.v);';

// [name, which check, mutated html, mustGoRed]
const M=[
  ['BASELINE — the real file', 'check-stations.mjs', SRC, false],

  // ── the holes the adversarial pass found in the FIRST draft of these checks ──
  ['HOLE 1 · delete the empty-name guard → the device names itself again','check-stations.mjs',
    sub("  if(!name){posStationsS.note='Give it a name first","  if(false){posStationsS.note='Give it a name first"),true],
  ['HOLE 2a · prefill the name box from a claim, via querySelector, elsewhere in the file','check-stations.mjs',
    sub("async function posApproveStation(){",
        "function posUseClaimName(i){document.querySelector('#station-name').value=(posStationsS.pending[i]||{}).name||''}\nasync function posApproveStation(){"),true],
  ['HOLE 2b · seed the name box with a VALUE= attribute (upper case)','check-stations.mjs',
    sub('<input id="station-name" maxlength="40"','<input id="station-name" VALUE="${esc((S.pending[0]||{}).name||\'\')}" maxlength="40"'),true],
  ['HOLE 2c · same, spelled value&nbsp;=&nbsp;"…"','check-stations.mjs',
    sub('<input id="station-name" maxlength="40"','<input id="station-name" value = "x" maxlength="40"'),true],
  ['HOLE 3 · a SECOND approve path wired to a waiting row','check-stations.mjs',
    sub("async function posApproveStation(){",
        "async function posEnrolThis(i){const c=posStationsS.pending[i];await posSrv('/api/stations/claim/approve',{method:'POST',body:JSON.stringify({code:c.code,name:c.name})})}\nasync function posApproveStation(){"),true],
  ['PIN · append a DOM scrape of the waiting list after the typed name','check-stations.mjs',
    sub("const name=String((nameEl&&nameEl.value)||'').trim();",
        "const name=String((nameEl&&nameEl.value)||'').trim()||String((document.querySelector('#wait-rows span')||{}).textContent||'').trim();"),true],
  ['ROW · give the waiting rows an onclick','check-stations.mjs',
    sub('${S.pending.map(c=>`<div style="display:flex;gap:10px;align-items:baseline;padding:6px 0',
        '${S.pending.map((c,i)=>`<div onclick="posUseClaim(${i})" style="display:flex;gap:10px;align-items:baseline;padding:6px 0'),true],
  ['ANCHOR · rename POS_SECTIONS so the page slice loses its far end','check-stations.mjs',
    sub('const POS_SECTIONS=','const POS_SECTIONS_V2='),true],

  // ── the "August corpse" worlds every proposed regex stayed green on ──
  ['B1 · a never-seen register short-circuits to live','check-stations.mjs',
    sub("  if(!x||!x.last_seen)return {kind:'never',label:'never seen',color:'#fbbf24'};",
        "  if(!x||!x.last_seen)return {kind:'live',label:'never seen',color:'#34d399'};"),true],
  ['B1b · a branch ADDED above the ones the old regexes quoted','check-stations.mjs',
    sub("function posStationAge(x,now){","function posStationAge(x,now){\n  if(x&&x.seen)return {kind:'live',label:'checked in',color:'#34d399'};"),true],
  ['B4 · gut the classifier, keep the old body in a comment','check-stations.mjs',
    sub("function posStationAge(x,now){","function posStationAge(x,now){\n  return {kind:'live',label:'ok',color:'#34d399'};\n  // if(ms<STATION_QUIET_MS)return {kind:'live'\n  // return {kind:'silent'\n"),true],
  ['B5 · widen the silent threshold to a year — nothing is ever loud again','check-stations.mjs',
    sub('STATION_SILENT_MS=15*60*1000','STATION_SILENT_MS=365*24*60*60*1000'),true],
  ['B6 · a 24-hour "live" window, spelled past the \\b the old regex anchored on','check-stations.mjs',
    sub('const STATION_QUIET_MS=3*60*1000','const STATION_QUIET_MS=1*60*1000*60*24'),true],
  ['SKEW · widen the skew branch so every register reads as seen just now','check-stations.mjs',
    sub("  if(ms<0)return {kind:'skew'","  if(ms<1e15)return {kind:'skew'"),true],
  ['CLOCK · posStationNow returns 0, so every age is negative and reads live','check-stations.mjs',
    sub("  return (S.srvNow&&S.gotAt) ? S.srvNow+(Date.now()-S.gotAt) : Date.now();","  return 0;"),true],
  ['CLOCK2 · measure ages against the newest last_seen instead of the clock','check-stations.mjs',
    sub('  const now=posStationNow(S);','  const now=Math.max(...S.list.map(x=>Number(x.last_seen)||0),0)||posStationNow(S);'),true],

  // ── benign refactors: these must stay GREEN or the check will get trimmed by someone ──
  ['BENIGN · rename the local `live` to `talking`','check-stations.mjs',
    sub("  const live=ages.filter(a=>a.kind==='live'||a.kind==='skew').length;","  const talking=ages.filter(a=>a.kind==='live'||a.kind==='skew').length;")
      .replace("posStat('Talking now',String(live)","posStat('Talking now',String(talking)"),false],
  ['BENIGN · reorder the two kinds in the filter','check-stations.mjs',
    sub("a.kind==='live'||a.kind==='skew'","a.kind==='skew'||a.kind==='live'"),false],
  ['BENIGN · the same threshold written in milliseconds','check-stations.mjs',
    sub('const STATION_QUIET_MS=3*60*1000','const STATION_QUIET_MS=180000'),false],
  ['BENIGN · rename the local code-box handle','check-stations.mjs',
    sub("  const el=document.getElementById('station-code');\n  const code=String((el&&el.value)||'')",
        "  const codeEl=document.getElementById('station-code');\n  const code=String((codeEl&&codeEl.value)||'')"),false],

  // ── routing ──
  ['ROUTE · store the class ID instead of its printers','check-printclasses.mjs',
    sub('  else posRouting[row.key]=opt.printers;','  else posRouting[row.key]=opt.id;'),true],
  ['ROUTE2 · a second write elsewhere that stores a class id','check-printclasses.mjs',
    sub('function posSetRoute(enc,id){','function posQuickRoute(k,cls){posRouting[k]=cls.id}\nfunction posSetRoute(enc,id){'),true],
  ['ROUTE3 · the category control stops going through the shared helper','check-printclasses.mjs',
    sub('function posApplyRoute(row,opt){','function posApplyRouteV2(row,opt){'),true],
  ['ROUTE BASELINE','check-printclasses.mjs', SRC, false],

  // ── the wine buckets: a section on this page is not a category on the register ──
  ['WINE BASELINE','check-categories.mjs', SRC, false],
  ['WINE · publish the bucket as the category again (the original bug)','check-categories.mjs',
    sub("  if(!w)return {cat:section,name};","  return {cat:section,name};\n  if(!w)return {cat:section,name};"),true],
  ['WINE · keep the right category but drop the GL/BTL suffix','check-categories.mjs',
    sub("  return {cat:w.cat,name:String(name).endsWith(w.suffix)?String(name):String(name)+w.suffix};",
        "  return {cat:w.cat,name:String(name)};"),true],
  ['WINE · the way back is broken, so the item leaves his screen','check-categories.mjs',
    sub("const posSectionOf=(i)=>{","const posSectionOf=(i)=>{\n  return i&&i.cat;"),true],
  ['WINE · a bucket this page does not know about','check-categories.mjs',
    sub("  'WHITE WINE BOTTLE':{cat:'WHITE WINE',suffix:' \u2014 BTL'},","")
      .replace("  'WHITE WINE GLASS' :{cat:'WHITE WINE',suffix:' \u2014 GL'},\n","  'WHITE WINE GLASS' :{cat:'WHITE WINE',suffix:' \u2014 GL'},\n  'WHITE WINE BOTTLE':{cat:'WHITE WINE',suffix:' \u2014 BTL'},\n  'ROSE':{cat:'ROSE',suffix:' \u2014 GL'},\n"),true],
  ['WINE · a glass and a bottle become the same line','check-categories.mjs',
    sub("  'RED WINE BOTTLE'  :{cat:'RED WINE',  suffix:' \u2014 BTL'},","  'RED WINE BOTTLE'  :{cat:'RED WINE',  suffix:' \u2014 GL'},"),true],
  ['WINE · the × translates forward again, so a pre-00365d2 entry is unremovable','check-categories.mjs',
    sub("  posNewItems=posNewItems.filter(i=>!(i.name===name&&posSectionOf(i)===section));",
        "  posNewItems=posNewItems.filter(i=>!(i.name===name&&i.cat===posPublishAs(section,'').cat));"),true],
  // ── specials: the category the register has and the catalogue does not ─────────
  ['SPECIALS BASELINE','check-specials.mjs', SRC, false],
  ['SPECIALS · spelled in a case the register will never match','check-specials.mjs',
    sub("const POS_EMPTY_CATS=['Specials'];","const POS_EMPTY_CATS=['SPECIALS'];"),true],
  ['SPECIALS · no section at all, so there is nowhere to type one','check-specials.mjs',
    sub("const POS_EMPTY_CATS=['Specials'];","const POS_EMPTY_CATS=[];"),true],
  ['SPECIALS · the empty-state branch eats the body, add box and all','check-specials.mjs',
    sub("  return head+((shown.length||extrasDrawn)?body:empty)+more+delLine;",
        "  return head+(shown.length?body:empty)+more+delLine;"),true],
  ['SPECIALS · a pending item under an undrawn category goes invisible again','check-specials.mjs',
    sub("  for(const i of (posNewItems||[])){const k=posSectionOf(i); if(k&&!have.has(k))want.add(k);}",""),true],
  ['SPECIALS · Add borrows instead of making one, so it reaches no iPad','check-specials.mjs',
    sub("  if(exists&&exists.cat!==pub.cat&&!addOnly){posSectionAdd(encCat,exists.name);return;}",
        "  if(exists&&exists.cat!==pub.cat){posSectionAdd(encCat,exists.name);return;}"),true],
  ['SPECIALS · the dropdown stops offering it, so he cannot get there','check-specials.mjs',
    sub("  const cats=[...new Set([...c.items.map(posCatOf),...posAddOnlyCats()])].sort();",
        "  const cats=[...new Set(c.items.map(posCatOf))].sort();"),true],
  ['ROUTE · a special\'s printer never leaves the back office','check-specials.mjs',
    sub("    items[k]={...(items[k]||{}),printers:posRouting[k]||[]};",""),true],
  ['ROUTE · the key is minted a different way from the register\'s','check-specials.mjs',
    sub("const posNewItemKey=(i)=>'m:'+i.cat+':'+i.name;","const posNewItemKey=(i)=>'m:'+i.name;"),true],
  ['ROUTE · an unchosen route publishes an empty list, which means prints NOWHERE','check-specials.mjs',
    sub("    if(!Object.prototype.hasOwnProperty.call(posRouting,k))continue;",""),true],
  ['ROUTE · no dropdown on a pending item, so a salad special stays on the hot line','check-specials.mjs',
    sub("        <span style=\"width:210px;padding-left:14px\">${posNewRouteCell(i)}</span>",
        "        <span style=\"width:210px;padding-left:14px\"></span>"),true],
  ['BENIGN · rename the local inside the wine translation','check-categories.mjs',
    sub("  const w=POS_WINE_SECTIONS[section];\n  if(!w)return {cat:section,name};",
        "  const rule=POS_WINE_SECTIONS[section];\n  if(!rule)return {cat:section,name};")
      .replace("  return {cat:w.cat,name:String(name).endsWith(w.suffix)?String(name):String(name)+w.suffix};",
               "  return {cat:rule.cat,name:String(name).endsWith(rule.suffix)?String(name):String(name)+rule.suffix};"),false],
  // ── THE RELOAD GUARD THAT INVERTED ITSELF (11/15). take() was written against a kvGet
  // that returned null on failure; kvGet was later changed to return KV_FAIL, a truthy
  // frozen OBJECT, and the guard silently started returning the EMPTY default on every
  // failed read — a wipe of any of the 24 ct_pos_* stores, then published. Nothing in
  // tools/ covered it, and the ⛔ banner above the line still asserted the old contract,
  // which is exactly why re-reading the block never caught it. These six worlds are the
  // ones that have to stay distinguishable.
  ['KV 1 \u00b7 the historical bug verbatim \u2014 a failed read returns empty','check-kvtake.mjs',
    sub(GOOD_TAKE,'const take=(got,cur,empty)=>got?(got.v==null?empty:got.v):cur;'),true],
  ['KV 2 \u00b7 guard the failure but drop the null arm','check-kvtake.mjs',
    sub(GOOD_TAKE,'const take=(got,cur,empty)=>kvFailed(got)?cur:(got&&got.v!=null?got.v:empty);'),true],
  ['KV 3 \u00b7 an intentional clear stops surviving a reload','check-kvtake.mjs',
    sub(GOOD_TAKE,'const take=(got,cur,empty)=>(!got||kvFailed(got))?cur:(got.v==null||!got.v.length?cur:got.v);'),true],
  ['KV 4 \u00b7 one store folded in raw, the old ||[] way','check-kvtake.mjs',
    sub('newItems:take(ni,posNewItems,[])','newItems:(ni&&ni.v)||[]'),true],
  ['KV 5 \u00b7 a store taken TWICE by copy-paste, leaving another raw','check-kvtake.mjs',
    sub('sectionAdds:take(sa,posSectionAdds,{})','sectionAdds:take(ni,posSectionAdds,{})'),true],
  // The two that must stay GREEN. KV 7 is the one the first draft of check-kvtake failed:
  // it anchored on `function kvFailed(` and went red for a pure rename, while its own
  // header claimed it didn't. A check that screams for a rename gets its clauses trimmed.
  ['KV 6 \u00b7 an equivalent rewrite of the same three outcomes','check-kvtake.mjs',
    sub(GOOD_TAKE,'const take=(got,cur,empty)=>kvFailed(got)?cur:(got?(got.v==null?empty:got.v):cur);'),false],
  ['KV 7 \u00b7 BENIGN \u2014 rename the failure guard everywhere','check-kvtake.mjs',
    SRC.split('kvFailed').join('kvUnreadable'),false],
];

let wrong=0;
for(const [name,which,html,mustRed] of M){
  const r=run(which,html);
  const good = r.red===mustRed;
  if(!good) wrong++;
  const want = mustRed?'must go RED':'must stay GREEN';
  console.log((good?'  ok  ':'  WRONG')+'  '+name+'   ['+want+', got '+(r.red?'RED':'GREEN')+']');
  if(!good && r.red){ const f=r.out.split('\n').filter(l=>l.includes('FAIL')); console.log('        '+f.join('\n        ')); }
}
console.log(wrong?`\n${wrong} MUTANTS BEHAVED WRONG`:'\nevery mutant behaved as it should');
process.exit(wrong?1:0);
