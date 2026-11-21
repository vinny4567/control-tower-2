// tipsPull SKIPS PRACTICE-MODE TIP-OUT LOG ENTRIES — Vinny, 11/20/26.
//
//     node tools/check-tips-pull-practice.mjs
//
// The register will start saving practice nights into the same tip-out log the
// calculator writes to. tipsPull prefers the newest finalized entry per date — without a
// skip, a `practice:true` entry (typically no bussers/runners clocked in) would REPLACE a
// real calculator night in Vinny's pay the moment it is newer. Practice entries are
// skipped OUTRIGHT, never merely out-aged by a newer real one.
//
// RUN, not read — lifts the real tipsPull() and runs it against a stubbed fetch.
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

// A fixed fortnight: Monday 11/2/26 → Sunday 11/15/26.
async function run(log) {
  const ctx = {};
  await new Function('ctx', `
    return (async () => {
      let TIP_NAME_ALIASES={}, TIP_ROSTER_CANON={};
      ${grab('tipNormKey')}
      ${grab('tipCanon')}
      let tipsState={loaded:false,start:new Date(2026,10,2),end:new Date(2026,10,15),cells:{},adds:{},gen:1};
      let tipsGen=1;
      const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings','NoDept'];
      const tipSectionPeople=()=>[];            // nobody pre-placed — irrelevant to this test
      const tipBaseSection=()=>null;
      const tipsActive=()=>false;
      const document={getElementById(){return null;}};
      let savedSoonCalled=false; const tipsSaveSoon=()=>{savedSoonCalled=true;};
      let statusCalls=[]; const tipsSetStatus=(s)=>{statusCalls.push(s);};
      ${grab('tipEnsureRange')}
      ${grab('tipDays')}
      ${grab('tipDayLabel')}
      ${grab('tipCell')}
      ${grab('tipSetComp')}
      const TIPS_LOG_URL='x'; const TIPS_LOG_KEY=()=>''; const fetch=async (url)=>({json:async()=>(${JSON.stringify({ log })})});
      ${grab('tipsPull')}
      await tipsPull(false);
      ctx.cells=tipsState.cells;ctx.statusCalls=statusCalls;ctx.savedSoonCalled=savedSoonCalled;
    })();
  `)(ctx);
  return ctx;
}

{
  // a calculator entry (final) plus a NEWER practice entry on the SAME date → the
  // calculator's numbers are pulled, the practice entry never even competes on recency.
  const log = [
    { date: '11/3/2026', savedAt: '2026-11-03T20:00:00Z', draft: false, servers: [{ name: 'Amy Server', remaining: 120 }] },
    { date: '11/3/2026', savedAt: '2026-11-03T23:00:00Z', draft: false, practice: true, servers: [{ name: 'Amy Server', remaining: 999 }] },
  ];
  const ctx = await run(log);
  ok('⛔ a calculator entry survives a NEWER practice entry on the same date — practice never wins on recency', ctx.cells['Amy Server'] && ctx.cells['Amy Server']['11/3'] && ctx.cells['Amy Server']['11/3'].p === 120);
}
{
  // a practice-ONLY date pulls nothing at all for that date
  const log = [
    { date: '11/5/2026', savedAt: '2026-11-05T20:00:00Z', draft: false, practice: true, servers: [{ name: 'Nobody Real', remaining: 500 }] },
  ];
  const ctx = await run(log);
  ok('⛔ a practice-only date pulls nothing — no row, no cell, nothing to accidentally pay', !ctx.cells['Nobody Real']);
}
{
  // an older practice entry does not get preferred over an older-but-real one either —
  // sanity check that the skip is unconditional, not merely a tiebreak
  const log = [
    { date: '11/4/2026', savedAt: '2026-11-04T10:00:00Z', draft: false, practice: true, servers: [{ name: 'Decoy', remaining: 1 }] },
    { date: '11/4/2026', savedAt: '2026-11-04T09:00:00Z', draft: false, servers: [{ name: 'Real Night', remaining: 88 }] },
  ];
  const ctx = await run(log);
  ok('⛔ the real (older) entry is pulled even though a practice entry for the same date is present', ctx.cells['Real Night'] && ctx.cells['Real Night']['11/4'].p === 88);
  ok('…and the practice entry contributes nothing', !ctx.cells['Decoy']);
}
{
  // no practice entries at all → unaffected, normal behavior
  const log = [
    { date: '11/6/2026', savedAt: '2026-11-06T20:00:00Z', draft: false, servers: [{ name: 'Plain Night', remaining: 45 }] },
  ];
  const ctx = await run(log);
  ok('a period with no practice entries at all pulls exactly as before', ctx.cells['Plain Night'] && ctx.cells['Plain Night']['11/6'].p === 45);
}

// ── THE MICROS IMPORT'S BUSSER SPLIT SKIPS PRACTICE NIGHTS TOO (Jarvis, 11/20/26) ────────
// tipsComputeBusserSplit reads the nightly busser pool from the SAME log. A practice entry
// that won "newest" for a date would have its pool divided among real bussers' pay.
{
  const split = new Function(`${grab('tipsComputeBusserSplit')}\nreturn tipsComputeBusserSplit;`)();
  const shifts = [
    { md: '11/3', name: 'Bea Bus', after330: 4 },
    { md: '11/3', name: 'Cal Bus', after330: 4 },
    { md: '11/5', name: 'Bea Bus', after330: 5 },
  ];
  const log = [
    { date: '11/3/2026', savedAt: '2026-11-03T22:00:00Z', pools: { busser: 100 } },
    { date: '11/3/2026', savedAt: '2026-11-03T23:30:00Z', practice: true, pools: { busser: 999 } },   // NEWER, practice
    { date: '11/5/2026', savedAt: '2026-11-05T22:00:00Z', practice: true, pools: { busser: 80 } },    // practice-only night
  ];
  const { split: s, byDay } = split(shifts, log);
  ok('⛔ a newer PRACTICE pool never replaces the real night\'s pool — 11/3 splits the calculator\'s $100, not $999', byDay['11/3'] && byDay['11/3']['Bea Bus'] === 50 && byDay['11/3']['Cal Bus'] === 50);
  ok('⛔ a practice-only night produces no split at all', !byDay['11/5']);
  ok('…so the period totals carry only real money ($50 each)', s['Bea Bus'] === 50 && s['Cal Bus'] === 50);
  const { byDay: plain } = split(shifts, [{ date: '11/5/2026', savedAt: 'x', pools: { busser: 80 } }]);
  ok('a non-practice night splits exactly as before', plain['11/5'] && plain['11/5']['Bea Bus'] === 80);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
