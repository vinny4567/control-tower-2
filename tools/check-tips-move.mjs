// 🧾 TIPS MOVED OUT OF THE TOP TAB BAR, INTO THE POS SIDEBAR — Vinny, 11/20/26.
//
//     node tools/check-tips-move.mjs
//
// A move, not a rebuild: Tips is now a POS_SECTIONS entry (posS.sec==='tips'), the same
// mechanism as Staff/Reports/etc, never a standalone top-level activeTab value. Everything
// that used to ask "is Tips showing?" (activeTab===TIPS) now asks tipsActive(). An old
// saved/bookmarked activeTab==='tips' must land in the new home, not on a blank page.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grab = (name) => {
  let i = src.indexOf('async function ' + name + '(');
  if (i === -1) i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing const ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};

// ── STRUCTURE: Tips is a POS_SECTIONS entry, next to Staff ─────────────────────────
const SECTIONS = grabConst('POS_SECTIONS');
ok("POS_SECTIONS carries a 'tips' entry", /\['tips','Tips'\]/.test(SECTIONS));
{
  const keys = [...SECTIONS.matchAll(/\['(\w+)'/g)].map(m => m[1]);
  const si = keys.indexOf('staff'), ti = keys.indexOf('tips');
  ok('⛔ Tips sits immediately next to Staff in the sidebar order, as asked', ti === si + 1);
}
const ICONS = grabConst('POS_ICONS');
ok('Tips has an icon in the rail, same as every other section', /tips:'/.test(ICONS));

// ── tipsActive(): the one gate, string-keyed, never by position ────────────────────
function world({ activeTabVal, posSec }) {
  const ctx = {};
  new Function('ctx', `
    const POS='pos', TIPS='tips';
    let activeTab=${JSON.stringify(activeTabVal)};
    let posS={sec:${JSON.stringify(posSec)}};
    ${grab('tipsActive')}
    ctx.active=tipsActive;
  `)(ctx);
  return ctx.active();
}
ok('⛔ true only when BOTH activeTab is POS and posS.sec is tips', world({ activeTabVal: 'pos', posSec: 'tips' }) === true);
ok('false on POS with a different section (e.g. Staff) — Tips is not "always on" inside POS', world({ activeTabVal: 'pos', posSec: 'staff' }) === false);
ok('⛔ false even if posS.sec is somehow "tips" while a DIFFERENT top tab is active — stale posS.sec from another tab must never leak the mark/redraw logic on', world({ activeTabVal: 'weddings', posSec: 'tips' }) === false);
ok('false with nothing set (boot default)', world({ activeTabVal: 'pos', posSec: 'items' }) === false);

// ── BOOT MIGRATION: an old saved/bookmarked activeTab==='tips' lands in the new home ──
function bootWorld(savedActiveTab) {
  const ctx = {};
  new Function('ctx', `
    const POS='pos', TIPS='tips';
    let activeTab=${JSON.stringify(savedActiveTab)};
    let posS={sec:'items'};
    ${grab('tipsActive')}
    ${(() => {
      // lift the exact migration line, not a re-typed copy of it
      const i = src.indexOf('if(activeTab===TIPS){activeTab=POS;posS.sec=TIPS;}');
      if (i < 0) throw new Error('missing the boot migration line');
      return src.slice(i, i + 'if(activeTab===TIPS){activeTab=POS;posS.sec=TIPS;}'.length);
    })()}
    ctx.activeTab=activeTab;ctx.sec=posS.sec;ctx.active=tipsActive();
  `)(ctx);
  return ctx;
}
{
  const w = bootWorld('tips');
  ok('⛔ an old activeTab==="tips" migrates to POS with sec=tips, not a blank page', w.activeTab === 'pos' && w.sec === 'tips');
  ok('…and tipsActive() reads true immediately after, with no extra click needed', w.active === true);
}
{
  const w = bootWorld('pos');
  ok('a normal boot (already on POS) is left alone by the migration', w.activeTab === 'pos' && w.sec === 'items');
}
{
  const w = bootWorld('weddings');
  ok('a boot on any other tab is untouched too — the migration is narrowly targeted', w.activeTab === 'weddings');
}

// ── posHTML dispatches to tipsHTML() for the tips section, inside the normal shell ──
const posHTMLFn = grab('posHTML');
ok("posHTML's body dispatch calls tipsHTML() when posS.sec===TIPS", /posS\.sec===TIPS\?tipsHTML\(\)/.test(posHTMLFn));
ok('⛔ the body renders INSIDE the POS shell (sidebar + #pos-body), not as a standalone replacement — the sidebar must stay visible while Tips is open', /id="pos-body">\$\{body\}/.test(posHTMLFn));

// ── posSec('tips') and loadTabData(POS, sec=tips) both trigger the same load ────────
const posSecFn = grab('posSec');
ok("⛔ clicking into Tips from elsewhere in POS loads it (posSec) — same as Staff's staffLoad()", /if\(s===TIPS\)tipsRefresh\(\);/.test(posSecFn));
const loadTabDataFn = grab('loadTabData');
ok('⛔ landing on POS from another top tab (or a page boot) with Tips remembered as the section also loads it', /if\(posS\.sec===TIPS\)tipsRefresh\(\);/.test(loadTabDataFn));

// ── THE TOP TAB BAR NO LONGER HAS A TIPS BUTTON ─────────────────────────────────────
ok('⛔ no "🧾 Tips" button left in the top tab bar', !/onclick="switchTab\('tips'\)"/.test(src) && !/>🧾 Tips</.test(src.slice(0, src.indexOf('function posHTML'))));
ok('⛔ renderViewport no longer special-cases TIPS as a top-level destination — it falls through to the generic POS branch, which renders the full shell', !/activeTab===TIPS\)\{document\.getElementById\('viewport'\)/.test(src));

// ── EVERY TIPS REDRAW TARGETS #pos-body, NEVER THE BARE #viewport ──────────────────
// (a stray #viewport write from inside Tips would blow away the POS sidebar around it)
{
  // 11/20/26: every Tips redraw now goes through ONE helper, tipsRedraw(), which writes into
  // #pos-body (and keeps the scroll). So: no direct tipsHTML() write anywhere else at all, and
  // the helper's own write targets #pos-body, never #viewport.
  const direct = [...src.matchAll(/getElementById\('(viewport|pos-body)'\)\.innerHTML=tipsHTML\(\)/g)];
  const helper = grab('tipsRedraw');
  ok('⛔ every single redraw that sets tipsHTML() as innerHTML targets #pos-body — none target the bare #viewport',
     direct.length === 0 && /const vp=document\.getElementById\('pos-body'\)/.test(helper) && /vp\.innerHTML=tipsHTML\(\)/.test(helper) && !/'viewport'/.test(helper));
}
{
  // tipsRerender's own scroll-preserving helper must also have moved
  const tipsRerenderFn = grab('tipsRerender');
  ok("⛔ tipsRerender goes through the same #pos-body helper, so scroll restores to the right element", /tipsRedraw\(\)/.test(tipsRerenderFn) && !/getElementById\('viewport'\)/.test(tipsRerenderFn));
}

// ── staffLoad's cross-module Tips catch-up uses the gate too ───────────────────────
const staffLoadFn = grab('staffLoad');
ok('⛔ staffLoad catching Tips up after a late staff projection load still checks tipsActive(), not the retired activeTab===TIPS', (staffLoadFn.match(/tipsActive\(\)/g) || []).length >= 2 && !/activeTab===TIPS/.test(staffLoadFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
