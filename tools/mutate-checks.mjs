// DOES A CHECK ACTUALLY SCREAM? — the test for the tests.
//
//     node tools/mutate-checks.mjs
//
// A check that stays green while the invariant it names is destroyed is worse than no
// check, because it is read as proof. Many checks in tools/ are a regex over index.html,
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
// The screen builder's core is its OWN file, so a mutant for check-screens has to break that
// file instead of the page. `run` takes which file the mutated text belongs in; everything
// else is copied through unchanged, so a mutant aimed at one subject cannot accidentally
// exercise the other.
const CORE=readFileSync(join(REPO,'screens-core.js'),'utf8');
const SW=readFileSync(join(REPO,'sw.js'),'utf8');

const run=(which,text,file)=>{
  const target=file||'index.html';
  rmSync(TMP,{recursive:true,force:true}); mkdirSync(join(TMP,'tools'),{recursive:true});
  writeFileSync(join(TMP,'index.html'),target==='index.html'?text:SRC);
  if(/^check-screens\.mjs$/.test(which)){
    writeFileSync(join(TMP,'screens-core.js'),target==='screens-core.js'?text:CORE);
    writeFileSync(join(TMP,'sw.js'),target==='sw.js'?text:SW);
  }
  cpSync(join(REPO,'tools',which),join(TMP,'tools',which));
  // ⚠️ A CHECK THAT READS A DATA FILE GOES RED IN THE SANDBOX WITHOUT IT, and a baseline
  // that is red for a missing fixture teaches nothing. Every check reading one must be listed.
  if(/^check-(printclasses|categories|specials|buttons)\.mjs$/.test(which)) cpSync(join(REPO,'pos-catalog.json'),join(TMP,'pos-catalog.json'));
  if(/^check-(reg)?buttons\.mjs$/.test(which)) cpSync(join(REPO,'pos-buttons.json'),join(TMP,'pos-buttons.json'));
  // ⛔ JUDGE THE WAY check-all DOES — BY FAIL LINES, NOT ONLY BY EXIT CODE.
  //
  // This read a non-zero exit as the only signal, and three check files (check-publish-shape,
  // check-backoffice-token, check-item-keys) never call process.exit at all: their `ok()` just
  // prints, and check-all judges them by counting '  FAIL' lines. So a mutant aimed at any of
  // them exited 0 and was scored GREEN no matter what it printed — "the check did not scream"
  // reported as "the check is fine". Found when four RAIL mutants came back green while the
  // same assertions failed loudly by hand. Nothing had fallen in before: they were the first
  // mutants ever aimed at an exit-less file. Both signals now count.
  try{
    const out=execFileSync('node',[join(TMP,'tools',which)],{encoding:'utf8'});
    return {red:(out.match(/^ {2}FAIL/gm)||[]).length>0, out};
  }
  catch(e){ return {red:true,out:String(e.stdout||'')+String(e.stderr||'')} }
};

const sub=(a,b)=>{ if(!SRC.includes(a)) throw new Error('anchor missing: '+a.slice(0,60)); return SRC.replace(a,b) };
// Same, against screens-core.js. Anchors are asserted PRESENT and UNIQUE: a mutant whose
// anchor has drifted is a mutant that silently tests nothing, which reads as a pass.
const csub=(a,b)=>{ const n=CORE.split(a).length-1;
  if(n!==1) throw new Error('core anchor '+(n?'not unique':'missing')+': '+a.slice(0,60)); return CORE.replace(a,b) };
const wsub=(a,b)=>{ const n=SW.split(a).length-1;
  if(n!==1) throw new Error('sw anchor '+(n?'not unique':'missing')+': '+a.slice(0,60)); return SW.replace(a,b) };
// Two edits in one mutant, for the cases where one plausible change touches two places.
const subs=(...pairs)=>pairs.reduce((h,[a,b])=>{
  if(!h.includes(a)) throw new Error('anchor missing: '+a.slice(0,60));
  return h.replace(a,b);
},SRC);
const GOOD_TAKE='const take=(got,cur,empty)=>(!got||kvFailed(got))?cur:(got.v==null?empty:got.v);';
const ROUTE_DROP="  let dropped=false;\n  for(const i of gone){\n    const k=posNewItemKey(i);\n    if(Object.prototype.hasOwnProperty.call(posRouting,k)){delete posRouting[k];dropped=true;}\n  }\n  if(dropped)kvPush('ct_pos_routing',posRouting,Date.now());\n";

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
  // ── THE ROUTE A REMOVED SPECIAL LEAVES BEHIND (11/15). posPruneOrphans cannot collect a
  // routing key for a non-catalogue item — its loop is `const it=byItem[k]; if(!it)continue;`
  // — so a route left here is permanent and cloud-synced, and specials rotate under repeating
  // names. The dangerous inheritance is the explicit "prints nowhere" ([]), which printersFor
  // honours over printClass and station.
  ['SPEC 1 \u00b7 the \u00d7 stops taking the route with it \u2014 next special of that name inherits it','check-categories.mjs',
    sub(ROUTE_DROP,''),true],
  ['SPEC 2 \u00b7 delete the key but never push it \u2014 the next reload puts it back','check-categories.mjs',
    sub("  if(dropped)kvPush('ct_pos_routing',posRouting,Date.now());\n",''),true],
  ['SPEC 3 \u00b7 clear the WHOLE routing map instead of just its key','check-categories.mjs',
    sub('if(Object.prototype.hasOwnProperty.call(posRouting,k)){delete posRouting[k];dropped=true;}',
        '{posRouting={};dropped=true;}'),true],
  // ── THE DROPDOWN THAT MUST NOT GUESS (11/15). posButtonFor is three-state:
  // undefined = no export yet (say nothing), null = export present and nothing opens it
  // (flag it), string = the button. Collapsing the first two flags EVERY category as
  // unwired while pos-buttons.json is missing — which is its state right now.
  ['BTN 1 \u00b7 collapse "unknown" into "none" \u2014 every category flagged as having no button','check-buttons.mjs',
    sub('  if(!posButtons)return undefined;','  if(!posButtons)return null;'),true],
  ['BTN 2 \u00b7 hand-type a rail here instead of reading the register\u2019s export','check-buttons.mjs',
    sub("  if(!posButtons)return undefined;",
        "  if(!posButtons)posButtons={food:['Appetizers','Pasta'],bar:[],extra:[]};"),true],
  ['BTN 3 \u00b7 rail positions reported 0-based','check-buttons.mjs',
    sub("    return i<0?null:what+' rail #'+(i+1);","    return i<0?null:what+' rail #'+i;"),true],
  ['BTN 4 \u00b7 a wine section reports the button but loses which PAGE it opens','check-buttons.mjs',
    sub("    return base+', '+page+' page';","    return base;"),true],
  ['BTN 5 \u00b7 Food Mods drifts back in with the sellable categories','check-buttons.mjs',
    sub("    if(c==='Food Mods'){mods.push(opt(c,c),opt(POS_GROUPS_CAT,'Mod groups'));continue;}",
        "    if(c==='Food Mods'){on.push(opt(c,c),opt(POS_GROUPS_CAT,'Mod groups'));continue;}"),true],
  ['BTN 6 \u00b7 BENIGN \u2014 reword the two headings','check-buttons.mjs',
    SRC.replace('Opens from a register button','Opened by a register button')
       .replace('Modifiers (not register buttons)','Modifiers (never register buttons)'),false],
  // ── THE KEY NAME THE EXPORTER OWNS (11/15). This reader guessed `extra` before
  // pos-buttons.json existed; the exporter calls it `openers`. Reading the wrong key is not
  // a blank — BEER, GOLF, Sides and BOTH wines (so all four wine sections) fall to null and
  // get flagged "no register button opens these", about a menu that is entirely wired up.
  // Caught by Jarvis before it shipped, and pinned here so it cannot come back.
  ['BTN 7 \u00b7 read `extra` instead of the exporter\u2019s `openers` \u2014 five buttons falsely unwired','check-buttons.mjs',
    sub("const posBtnOpeners=()=>(posButtons&&(posButtons.openers||posButtons.extra||posButtons.other))||[];",
        "const posBtnOpeners=()=>(posButtons&&(posButtons.extra||posButtons.other))||[];"),true],
  ['BTN 8 \u00b7 an opener loses which PAGE its row is on, so "top row" says top row of nothing','check-buttons.mjs',
    sub("    const where=[rail,ex.where].filter(Boolean).join(', ');","    const where=ex.where||'';"),true],
  ['BTN 9 \u00b7 wine sections stop using the register\u2019s own page names','check-buttons.mjs',
    sub("    const page=pages?(glass?pages[0]:pages[pages.length-1]):(glass?'glass':'bottle');",
        "    const page=glass?'glass':'bottle';"),true],
  // Labelled BENIGN at first, which was wrong: the legacy spelling is a DELIBERATE
  // tolerance with a test of its own, so removing it is a regression and not a cleanup.
  ['BTN 10 \u00b7 drop the documented legacy `extra`/`other` tolerance','check-buttons.mjs',
    sub("const posBtnOpeners=()=>(posButtons&&(posButtons.openers||posButtons.extra||posButtons.other))||[];",
        "const posBtnOpeners=()=>(posButtons&&posButtons.openers)||[];"),true],
  ['BTN 11 \u00b7 BENIGN \u2014 reorder the fallback chain, same meaning','check-buttons.mjs',
    sub("const posBtnOpeners=()=>(posButtons&&(posButtons.openers||posButtons.extra||posButtons.other))||[];",
        "const posBtnOpeners=()=>(posButtons&&(posButtons.openers||posButtons.other||posButtons.extra))||[];"),false],
  // ── THE CATEGORY RAIL: SENT vs DRAFT (11/15). Every edit in the Register buttons page
  // rides the same 1400ms debounce as a price. If the DRAFT travelled, the next unrelated
  // price edit would rearrange every server's screen with a half-finished rail. These are
  // the four worlds Jarvis asked to see pinned.
  ['RAIL 1 \u00b7 publish the DRAFT instead of the sent snapshot','check-publish-shape.mjs',
    sub('      const l=posBtnStore&&posBtnStore.live;','      const l=posBtnStore&&posBtnStore.draft;'),true],
  ['RAIL 2 \u00b7 re-stamp buttons.at on every publish, so a price edit looks like a rail change','check-publish-shape.mjs',
    sub('      return {buttons:{v:1, at:l.at,','      return {buttons:{v:1, at:Date.now(),'),true],
  ['RAIL 3 \u00b7 stop refusing a sent rail with zero buttons \u2014 every screen empties, no way back','check-publish-shape.mjs',
    sub('      if(!food.length||!bar.length)return {};',''),true],
  ['RAIL 4 \u00b7 emit the rail by reference, so a later edit mutates what was sent (keep() no longer copies)','check-publish-shape.mjs',
    sub('      const keep=(arr)=>((arr||[]).filter(e=>{const w=posBtnWhyNot(e&&e.cat);return w===undefined||w===\'\';}));',
        '      const keep=(arr)=>(arr||[]);'),true],
  ['RAIL 5 \u00b7 BENIGN \u2014 spread instead of slice, same copy','check-publish-shape.mjs',
    sub('      return {buttons:{v:1, at:l.at, food, bar, off:(l.off||[]).slice()}};',
        '      return {buttons:{v:1, at:l.at, food, bar, off:[...(l.off||[])]}};'),false],
  // And the store must keep going through take(), which is the check that catches a 26th
  // store being folded in raw later.
  ['RAIL 6 \u00b7 fold the rail store in raw, bypassing the failed-read guard','check-kvtake.mjs',
    sub('    buttons:take(bt,posBtnStore,null),','    buttons:(bt&&bt.v)||null,'),true],

  // ── the Register buttons PAGE. The two that matter most are the ▲▼ index pair and the
  // rename, because `cat` is the key every price, route and pending special is filed under.
  ['PAGE 1 \u00b7 \u25b2\u25bc swap the wrong neighbour (dir inverted)','check-regbuttons.mjs',
    sub('  i=Number(i);const j=i+Number(dir);','  i=Number(i);const j=i-Number(dir);'),true],
  ['PAGE 2 \u00b7 the swap drops the displaced one instead of exchanging','check-regbuttons.mjs',
    sub('    const t=a[i];a[i]=a[j];a[j]=t;','    a[i]=a[j];'),true],
  ['PAGE 3 \u00b7 moving off the end wraps round instead of refusing','check-regbuttons.mjs',
    sub('    if(i<0||j<0||i>=a.length||j>=a.length)return false;','    if(i<0||i>=a.length)return false;'),true],
  ['PAGE 4 \u00b7 \u26d4 a rename rewrites the KEY, orphaning every price and route filed under it','check-regbuttons.mjs',
    sub('      if(label&&label!==cat)e.label=label;else delete e.label;','      if(label&&label!==cat)e.cat=label;else delete e.label;'),true],
  ['PAGE 5 \u00b7 a rename is no longer capped, so one long name can break the rail','check-regbuttons.mjs',
    sub(".trim().slice(0,24);",".trim();"),true],
  ['PAGE 6 \u00b7 a blank box writes a blank label instead of clearing it','check-regbuttons.mjs',
    sub('      if(label&&label!==cat)e.label=label;else delete e.label;','      e.label=label;'),true],
  ['PAGE 7 \u00b7 \u26d4 a draft edit drops `live`, so editing silently reverts the registers','check-regbuttons.mjs',
    sub('  return {v:1,draft:d,live:(base&&base.live)||posBtnLive()||null};','  return {v:1,draft:d,live:null};'),true],
  ['PAGE 8 \u00b7 putting a button back always lands on the FOOD rail','check-regbuttons.mjs',
    sub('    for(const which of posBtnHomeRails(cat)){',"    for(const which of ['food']){"),true],
  ['PAGE 9 \u00b7 \u26d4 the send stops checking the gate, so a draft send becomes delayed-action','check-regbuttons.mjs',
    sub('  if(!POS_BTN_SEND_ENABLED){','  if(false){'),true],
  ['PAGE 10 \u00b7 \u26a0\ufe0f an all-off rail may be sent, leaving a register with an empty screen','check-regbuttons.mjs',
    sub('  if(!revert&&!posBtnMinPage(d)){','  if(false){'),true],
  // PAGE 11 used to be "the gate is flipped on while the registers cannot read a rail". That
  // mutant's premise died on 11/15 19:42 when the reading build went live and the flag was
  // released. What replaces it is the warning the release left behind: sending works, but the
  // register still cannot screen a bad name, add back a category left off the list, or re-pick
  // the active category. Dropping that note is now the regression worth catching.
  // ✅ PAGE 11 CHANGED TARGET when POS_BTN_READER_HARDENED was retired (9756817 live in 5218ccc).
  // The old mutant deleted a flag-keyed note. The surviving truth is the FEATURE — an `off`
  // category has no button on purpose — so the regression worth catching is now the page losing
  // that line, or going back to implying the register will put it back.
  ['PAGE 11 \u00b7 \u26d4 the page stops saying a category taken off has no button','check-regbuttons.mjs',
    (()=>{const i=SRC.indexOf('>Sending is live<');const j=SRC.indexOf('</div>`}',i);
          if(i<0||j<0)throw new Error('anchor missing: the off note');
          const a=SRC.lastIndexOf('`<div',i);
          return SRC.slice(0,a)+"`'"+"'"+SRC.slice(j+'</div>`}'.length);})(),true],
  ['PAGE 11e \u00b7 \u26d4 the note goes back to promising the register adds a removed category back','check-regbuttons.mjs',
    sub('The register does that on purpose and will\n      not put it back, so take nothing off that you still need to ring.',
        'The register does not add it back yet, so take nothing off that you still need to ring.'),true],
  ['PAGE 11d \u00b7 BENIGN \u2014 the off note is reworded, meaning kept','check-regbuttons.mjs',
    sub('      The registers read this list now, and a Send lands on them in about a minute.',
        '      The registers read this list, and a Send reaches them within a minute or so.'),false],
  ['PAGE 11b \u00b7 a second definition of the send flag, shadowing the released one','check-regbuttons.mjs',
    sub('const POS_BTN_SEND_ENABLED=true;','const POS_BTN_SEND_ENABLED=true;\nconst POS_BTN_SEND_ENABLED=false;'),true],
  ['PAGE 12 \u00b7 a draft save goes through kvPush, which publishes on every keystroke','check-regbuttons.mjs',
    sub("k!=='ct_pos_live' && k!=='ct_pos_buttons'","k!=='ct_pos_live'"),true],
  ['PAGE 13 \u00b7 the receipt trusts the mini\u2019s combined `at` again','check-regbuttons.mjs',
    sub('    const got=m&&m.buttons;','    const got=m;'),true],
  ['PAGE 13b \u00b7 \u26a0\ufe0f "no menu at all" is reported as "an older list", claiming the mini has it','check-regbuttons.mjs',
    sub("    if(!served)return 'Sent here, but the mini is not serving a menu at all right now, so I cannot confirm the registers have it.';",''),true],
  ['PAGE 13c \u00b7 an EMPTY items list is mistaken for no menu at all','check-regbuttons.mjs',
    sub("    const served=!!(m&&Object.prototype.hasOwnProperty.call(m,'items'));",
        '    const served=!!(m&&m.items&&m.items.length);'),true],
  ['PAGE 13d \u00b7 the receipt confirms on ANY rail the mini is serving, not the one just sent','check-regbuttons.mjs',
    sub("    if(got&&Number(got.at)===Number(at))return 'On the registers.';",
        "    if(got)return 'On the registers.';"),true],
  // ── the ×/+ pair, which is the only control there is, and the per-page zero
  ['PAGE 17 \u00b7 \u26d4 + restores to ONE rail, so \u00d7 then + deletes a both-rails button for good','check-regbuttons.mjs',
    sub("    for(const which of posBtnHomeRails(cat)){","    for(const which of [posBtnHomeRail(cat)]){"),true],
  ['PAGE 18 \u00b7 \u26d4 posBtnHomeRails answers with the first rail it finds, not every one','check-regbuttons.mjs',
    sub("  if(((posButtons&&posButtons.bar)||[]).some(e=>posBtnCat(e)===cat))on.push('bar');",
        "  if(!on.length&&((posButtons&&posButtons.bar)||[]).some(e=>posBtnCat(e)===cat))on.push('bar');"),true],
  ['PAGE 19 \u00b7 a cat the export never heard of lands on NO rail, so + silently loses it','check-regbuttons.mjs',
    sub('  return on.length?on:[posBtnHomeRail(cat)];','  return on;'),true],
  ['PAGE 20 \u00b7 \u26d4 the send\u2019s zero check counts both rails together again','check-regbuttons.mjs',
    sub('  if(!revert&&!posBtnMinPage(d)){','  if(!revert&&!posBtnCount(d)){'),true],
  ['PAGE 21 \u00b7 BENIGN \u2014 posBtnHomeRails built with filter instead of pushes','check-regbuttons.mjs',
    sub("const posBtnHomeRails=(cat)=>{\n  const on=[];\n  if(((posButtons&&posButtons.food)||[]).some(e=>posBtnCat(e)===cat))on.push('food');\n  if(((posButtons&&posButtons.bar)||[]).some(e=>posBtnCat(e)===cat))on.push('bar');\n  return on.length?on:[posBtnHomeRail(cat)];\n};",
        "const posBtnHomeRails=(cat)=>{\n  const on=['food','bar'].filter((w)=>(((posButtons&&posButtons[w])||[]).some(e=>posBtnCat(e)===cat)));\n  return on.length?on:[posBtnHomeRail(cat)];\n};"),false],
  ['RAIL 7 \u00b7 \u26d4 posBuildLive adds the two rails together, so an empty page half-publishes','check-publish-shape.mjs',
    sub('      if(!food.length||!bar.length)return {};',
        '      if(!food.length&&!bar.length)return {};'),true],
  // ── the predicate. The first two are the ones that would cost real tabs on real iPads.
  ['PRED 1 \u00b7 \u26d4 admitting folds case, so "PASTA" publishes a button that rings nothing','check-regbuttons.mjs',
    sub('  if(rails.includes(cat))return \'\';','  if(rails.map(posBtnFold).includes(posBtnFold(cat)))return \'\';'),true],
  ['PRED 2 \u00b7 \u26d4 refusing by substring, which eats the real "RED WINE" button as well','check-regbuttons.mjs',
    sub('  if(POS_BTN_REFUSE_FOLDED.includes(posBtnFold(cat)))return',
        '  if(POS_BTN_REFUSE_FOLDED.some(r=>r.indexOf(posBtnFold(cat))>=0||posBtnFold(cat).indexOf(r)>=0))return'),true],
  ['PRED 3 \u00b7 \u26d4 a blind page refuses everything instead of answering "do not know"','check-regbuttons.mjs',
    sub('  if(!rails)return undefined;',"  if(!rails)return 'is not a category the registers know';"),true],
  ['PRED 4 \u00b7 \u26d4 \u2026or calls everything fine while blind','check-regbuttons.mjs',
    sub('  if(!rails)return undefined;',"  if(!rails)return '';"),true],
  ['PRED 5 \u00b7 the view sentinels are matched by name, so the next one added slips through','check-regbuttons.mjs',
    sub("  if(/^__/.test(cat))return",
        "  if(['__groups','__classes'].includes(cat))return"),true],
  ['PRED 6 \u00b7 a spelling mismatch is reported as simply unknown, hiding the real cause','check-regbuttons.mjs',
    sub('  return near?(\'is spelled differently from the register\\u2019s \\u201c\'+near+\'\\u201d \\u2014 the registers match exactly\')\n             :\'is not a category the registers know\';',
        "  return 'is not a category the registers know';"),true],
  // \u26a0\ufe0f PRED 7 USED TO BE ITS OWN MIRROR IMAGE. Until 11/15 the openers were IN the admit
  // set and this mutant removed them. Jarvis ruled the other way \u2014 the five already have their
  // own buttons \u2014 so the mutant now widens the set instead of narrowing it. Same line, opposite
  // direction, because the requirement moved; the check it fires was inverted to match.
  // ── the drift card, which was blind in one direction ──
  ['DRIFT 1 \u00b7 \u26d4 the ahead branch is dropped, so a mini holding a NEWER copy is silent again','check-drift.mjs',
    sub("  if(m-c>g)return 'ahead';\n", ''),true],
  ['DRIFT 2 \u00b7 \u26d4 both directions collapse to "behind", so the card describes the opposite of what happened','check-drift.mjs',
    sub("  if(m-c>g)return 'ahead';","  if(m-c>g)return 'behind';"),true],
  ['DRIFT 3 \u00b7 \u26d4 a cloud with no copy goes back to being skipped, hiding the extreme case','check-drift.mjs',
    sub("  if(!c)return m?'ahead':null;","  if(!c)return null;"),true],
  ['DRIFT 4 \u00b7 \u26d4 the grace is dropped on the ahead side, so every ordinary save shows a false alarm','check-drift.mjs',
    sub("  if(m-c>g)return 'ahead';","  if(m-c>0)return 'ahead';"),true],
  ['DRIFT 5 \u00b7 \u26d4 the ahead card is given the BEHIND advice \u2014 "change it again" when the mini will refuse it','check-drift.mjs',
    sub("    ?'A change from this device may have been refused.","    ?'Changing one of these again will push it. ("),true],
  ['DRIFT 6 \u00b7 the mini never gave a key and the cloud has none \u2014 reported instead of staying silent','check-drift.mjs',
    sub("  if(miniAt===null||miniAt===undefined)return c?'missing':null;","  if(miniAt===null||miniAt===undefined)return 'missing';"),true],
  ['DRIFT 7 \u00b7 BENIGN \u2014 the ahead wording is reworded, meaning kept','check-drift.mjs',
    sub("`<b>The registers are holding ${ahead.length} thing${ahead.length>1?'s':''} the store does not.</b>`",
        "`<b>${ahead.length} thing${ahead.length>1?'s':''} on the registers ${ahead.length>1?'are':'is'} newer than the store.</b>`"),false],
  ['PRED 7 \u00b7 \u26d4 the openers are admitted again, so BEER lands on a rail it already sits above','check-regbuttons.mjs',
    sub('  for(const e of [...((posButtons.food)||[]),...((posButtons.bar)||[])]){',
        '  for(const e of [...((posButtons.food)||[]),...((posButtons.bar)||[]),...posBtnOpeners()]){'),true],
  ['PRED 15 \u00b7 \u26d4 the opener lookup is dropped, so BEER reads as a name the register never heard of','check-regbuttons.mjs',
    sub('  const op=posBtnOpenerFor(cat);','  const op=null;'),true],
  ['PRED 16 \u00b7 the opener reason is reworded \u2014 benign, must stay GREEN','check-regbuttons.mjs',
    sub('so it does not go on a rail as well','so it doesn\u2019t also need one on a rail'),false],
  ['PRED 17 \u00b7 the opener lookup stops folding case, so "beer" is called unknown','check-regbuttons.mjs',
    sub('const posBtnOpenerFor=(cat)=>posBtnOpeners().find(e=>posBtnFold(posBtnCat(e))===posBtnFold(cat))||null;',
        'const posBtnOpenerFor=(cat)=>posBtnOpeners().find(e=>posBtnCat(e)===cat)||null;'),true],
  ['PRED 8 \u00b7 \u26d4 posBtnOn stops asking, so a stored off entry becomes a button in one tap','check-regbuttons.mjs',
    sub("    if(why){posBtnS.err='\\u201c'+cat+'\\u201d '+why+', so it cannot go on a rail.';return false;}",''),true],
  ['PRED 9 \u00b7 \u26d4 the send stops naming bad buttons and sends them anyway','check-regbuttons.mjs',
    sub('  const bad=revert?[]:posBtnBadOnes(d);','  const bad=[];'),true],
  ['PRED 10 \u00b7 a revert is blocked by a bad draft, taking away the way back','check-regbuttons.mjs',
    sub('  const bad=revert?[]:posBtnBadOnes(d);','  const bad=posBtnBadOnes(d);'),true],
  ['PRED 11 \u00b7 \u26d4 posBuildLive stops filtering, so a stored bad rail publishes for ever','check-publish-shape.mjs',
    sub('      const keep=(arr)=>((arr||[]).filter(e=>{const w=posBtnWhyNot(e&&e.cat);return w===undefined||w===\'\';}));',
        '      const keep=(arr)=>((arr||[]).slice());'),true],
  ['PRED 12 \u00b7 \u26d4 posBuildLive drops entries while BLIND, emptying rails on a missing file','check-publish-shape.mjs',
    sub('      const keep=(arr)=>((arr||[]).filter(e=>{const w=posBtnWhyNot(e&&e.cat);return w===undefined||w===\'\';}));',
        '      const keep=(arr)=>((arr||[]).filter(e=>posBtnWhyNot(e&&e.cat)===\'\'));'),true],
  ['PRED 13 \u00b7 \u26d4 `off` is filtered too, which bricks the page \u2014 nothing can clear an off entry','check-publish-shape.mjs',
    sub('      return {buttons:{v:1, at:l.at, food, bar, off:(l.off||[]).slice()}};',
        '      return {buttons:{v:1, at:l.at, food, bar, off:(l.off||[]).filter(c=>posBtnWhyNot(c)===\'\')}};'),true],
  ['PRED 14 \u00b7 BENIGN \u2014 the refuse list is reordered and the fold helper renamed inline','check-regbuttons.mjs',
    subs(["const posBtnFold=(c)=>String(c==null?'':c).trim().toUpperCase();",
          "const posBtnFold=(x)=>String(x==null?'':x).trim().toUpperCase();"],
         ["  'all','\u2014',           // this page's own filter sentinels",
          "  '\u2014','all',           // this page's own filter sentinels"]),false],
  ['PAGE 14 \u00b7 BENIGN \u2014 the refusal messages are reworded','check-regbuttons.mjs',
    subs(['Every button is off the screen.','Nothing is on the screen.'],
         ['The registers cannot take a button list yet, so this is switched off.',
          'The registers are not ready for a button list, so sending is off for now.']),false],
  ['PAGE 15 \u00b7 BENIGN \u2014 the swap is written with destructuring','check-regbuttons.mjs',
    sub('    const t=a[i];a[i]=a[j];a[j]=t;','    [a[i],a[j]]=[a[j],a[i]];'),false],
  ['PAGE 16 \u00b7 BENIGN \u2014 the move guard is reordered','check-regbuttons.mjs',
    sub('    if(i<0||j<0||i>=a.length||j>=a.length)return false;','    if(j>=a.length||i>=a.length||j<0||i<0)return false;'),false],
  // ── THE SCREEN BUILDER'S CORE (subject = screens-core.js, not the page) ──────────────
  //
  // Two of these are the bug these checks exist to prevent: a draft compare that reads
  // "we know nothing" as permission, and three states collapsed into two.
  ['SCR 1 \u00b7 \u26d4 the draft compare reverts to `remoteAt && localAt && remoteAt>localAt`','check-screens.mjs',
    csub("function scrSaveVerdict(remoteAt, loadedAt) {",
         "function scrSaveVerdict(remoteAt, loadedAt) {\n    if (!(remoteAt && loadedAt && remoteAt > loadedAt)) return { ok: true, why: 'current', msg: '' };\n    return { ok: false, why: 'stale', msg: 'Reload this screen first.' };"),true,'screens-core.js'],
  ['SCR 2 \u00b7 \u26d4 "never read the remote" becomes permission','check-screens.mjs',
    csub("if (loadedAt === undefined) return { ok: false, why: 'never-loaded',",
         "if (loadedAt === undefined) return { ok: true, why: 'never-loaded',"),true,'screens-core.js'],
  ['SCR 3 \u00b7 \u26d4 no capture reports NULL, so "not asked yet" and "there are none" become one answer','check-screens.mjs',
    csub("return { ok: false, reason: 'no-capture', size: undefined, screens: undefined, sheets: undefined,",
         "return { ok: false, reason: 'no-capture', size: null, screens: null, sheets: null,"),true,'screens-core.js'],
  ['SCR 4 \u00b7 \u26d4 an unknown screen size falls back to a plausible one','check-screens.mjs',
    csub("const size = (w && h) ? { w, h, top } : null;",
         "const size = (w && h) ? { w, h, top } : { w: 1024, h: 768, top };"),true,'screens-core.js'],
  ['SCR 5 \u00b7 \u26d4 a button with no id gets a RANDOM one, so every import is a different button','check-screens.mjs',
    csub("if (id) withId++; else { id = 'k:' + key; derivedId++; }",
         "if (id) withId++; else { id = scrNewId(); derivedId++; }"),true,'screens-core.js'],
  ['SCR 6 \u00b7 \u26d4 two buttons with one key keep one id, so a drag moves whichever came first','check-screens.mjs',
    csub("if (seen[id]) { seen[id]++; id = id + '#' + seen[id]; } else { seen[id] = 1; }",
         "seen[id] = 1;"),true,'screens-core.js'],
  ['SCR 7 \u00b7 \u26d4 the clear band at the top stops being kept clear','check-screens.mjs',
    csub("const top = num(size.top) || 0;",
         "const top = 0;"),true,'screens-core.js'],
  ['SCR 8 \u00b7 \u26d4 a tap picks up the BOTTOM button, so one moved on top can never be moved again','check-screens.mjs',
    csub("for (let i = list.length - 1; i >= 0; i--) {",
         "for (let i = 0; i < list.length; i++) {"),true,'screens-core.js'],
  ['SCR 9 \u00b7 \u26d4 an unplaced dish flows from the top, landing on a placed one','check-screens.mjs',
    csub("return { x: 0, y: num(lowest + gap), w, h, gap };",
         "return { x: 0, y: num(gap), w, h, gap };"),true,'screens-core.js'],
  ['SCR 10 \u00b7 \u26d4 a full undo stack drops the NEWEST step instead of the oldest','check-screens.mjs',
    csub("while (s.length > c) s.shift();",
         "while (s.length > c) s.pop();"),true,'screens-core.js'],
  ['SCR 11 \u00b7 \u26d4 a screen with nothing visible on it passes as fine','check-screens.mjs',
    csub("if (!drawable) problems.push(",
         "if (false) problems.push("),true,'screens-core.js'],
  ['SCR 12 \u00b7 \u26d4 a screen captured as one face is shown as the whole screen, silently','check-screens.mjs',
    csub("if (bothFaces.food && bothFaces.bar && name.indexOf('.') < 0) {",
         "if (false) {"),true,'screens-core.js'],
  ['SCR 13 \u00b7 \u26d4 an action the register has never heard of is passed through','check-screens.mjs',
    csub("if (isObj(a) && ACTION_KINDS.indexOf(a.k || a.kind) >= 0) {",
         "if (isObj(a)) {"),true,'screens-core.js'],
  ['SCR 14 \u00b7 \u26d4 a draft key gains the ct_ prefix, so every keystroke is mirrored to the mini','check-screens.mjs',
    csub("const scrDraftKey = (screenId) => 'scr_draft:' + String(screenId || '');",
         "const scrDraftKey = (screenId) => 'ct_scr_draft:' + String(screenId || '');"),true,'screens-core.js'],
  ['SCR 15 \u00b7 \u26d4 the core reads the clock itself, so no check can pin a timestamp','check-screens.mjs',
    csub("at: num(at) || 0,",
         "at: num(at) || Date.now(),"),true,'screens-core.js'],
  ['SCR 16 \u00b7 \u26d4 a resize can shrink a button past a thumb and past its own far edge','check-screens.mjs',
    csub("if (e.indexOf('w') >= 0) { const nw = w - dx; if (nw >= MIN_SIDE) { x = x + dx; w = nw; } else { x = x + (w - MIN_SIDE); w = MIN_SIDE; } }",
         "if (e.indexOf('w') >= 0) { x = x + dx; w = w - dx; }"),true,'screens-core.js'],

  // The other half: a different number, three rewords and a rewrite must all stay GREEN, or
  // the next person to tidy this file learns to delete assertions to get back to green.
  ['SCR B1 \u00b7 BENIGN \u2014 the undo limit is a different number','check-screens.mjs',
    csub("const UNDO_CAP = 40;",
         "const UNDO_CAP = 25;"),false,'screens-core.js'],
  ['SCR B2 \u00b7 BENIGN \u2014 the stale-draft message is reworded','check-screens.mjs',
    csub("msg: 'Someone has saved this screen since this page read it. Reload it before saving, or their change is lost.' };",
         "msg: 'This screen changed on another device after this page read it. Reload it first, or that change is lost.' };"),false,'screens-core.js'],
  ['SCR B3 \u00b7 BENIGN \u2014 the two-faces warning is reworded','check-screens.mjs',
    csub("warnings.push('Screen \"' + name + '\" was captured as one screen, but the register draws it as two (food and liquor). '",
         "warnings.push('Screen \"' + name + '\" came over as a single screen, though the register splits it into two: food and liquor. '"),false,'screens-core.js'],
  ['SCR B4 \u00b7 BENIGN \u2014 the permanent-id note is reworded','check-screens.mjs',
    csub("warnings.push('This capture was taken before the register gave its buttons permanent names, so they are being '",
         "warnings.push('This capture predates permanent button names on the register, so they are being '"),false,'screens-core.js'],
  ['SCR 17 \u00b7 \u26d4 the service worker caches every page as the Watch Tower again','check-screens.mjs',
    wsub("caches.open(CACHE).then(c => c.put(shell, copy));","caches.open(CACHE).then(c => c.put('./index.html', copy));"),true,'sw.js'],
  ['SCR 18 \u00b7 \u26d4 offline, every page falls back to the Watch Tower again','check-screens.mjs',
    wsub(".catch(() => caches.match(shell))",".catch(() => caches.match('./index.html'))"),true,'sw.js'],
  ['SCR 19 \u00b7 \u26d4 the shell lookup answers with the first page whatever was asked for','check-screens.mjs',
    wsub("  for (const s of SHELLS) { const name = s.replace('./', ''); if (pathname.endsWith('/' + name)) return s; }",
         "  if (SHELLS.length) return SHELLS[0];"),true,'sw.js'],
  ['SCR B6 \u00b7 BENIGN \u2014 the two pages are listed in the other order','check-screens.mjs',
    wsub("const SHELLS = ['./index.html', './screens.html'];","const SHELLS = ['./screens.html', './index.html'];"),false,'sw.js'],
  ['SCR B5 \u00b7 BENIGN \u2014 the overlap test is written the other way round','check-screens.mjs',
    csub("const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];",
         "const overlaps = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);"),false,'screens-core.js'],
];

let wrong=0;
for(const [name,which,html,mustRed,file] of M){
  const r=run(which,html,file);
  const good = r.red===mustRed;
  if(!good) wrong++;
  const want = mustRed?'must go RED':'must stay GREEN';
  console.log((good?'  ok  ':'  WRONG')+'  '+name+'   ['+want+', got '+(r.red?'RED':'GREEN')+']');
  if(!good && r.red){ const f=r.out.split('\n').filter(l=>l.includes('FAIL')); console.log('        '+f.join('\n        ')); }
}
console.log(wrong?`\n${wrong} MUTANTS BEHAVED WRONG`:'\nevery mutant behaved as it should');
process.exit(wrong?1:0);
