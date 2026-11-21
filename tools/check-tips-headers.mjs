// REPEATED SECTION HEADERS + THICKER PAID DIVIDER — Vinny, 11/20/26, same pass as the
// roster wipe.
//
//     node tools/check-tips-headers.mjs
//
// "give me the dates of the week at the top of each section right now theyre only at
// the top" → every section header row (SERVERS, BARTENDERS, BUSSERS, FOOD RUNNERS,
// WEDDINGS, NoDept) repeats the same day-of-week/date columns as the main thead, Paid
// and Unpaid included — even when Busser's pool-per-night row fires, which used to
// swallow the header row entirely.
//
// "give me a thicker line separating the last sunday and the paid column" → every
// Paid-column left edge (thead, every repeated section header, every data row, the
// busser-pool-per-night row, and the grand total) uses the SAME thicker divider, so it
// reads as one continuous line down the page.
//
// RUN, not read — lifts the real tipsHTML() and runs it against a built fixture, then
// parses the HTML string it returns.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing const ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};
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

// A short, fixed fortnight: Monday 11/2/26 → Sunday 11/15/26 (14 days), so the fixture
// is deterministic — tipsHTML must never call Date.now()/new Date() with no args itself.
function world({ people = {}, cells = {}, busserSplitByDay = {}, busserSplit = {}, adds = {}, moves = {} } = {}) {
  const ctx = {};
  new Function('ctx', `
    ${grabConst('TIP_SECTIONS')}
    ${grabConst('TIP_SEC_LABEL')}
    ${grabConst('TIP_SECTION_FROM_DEPT')}
    ${grabConst('TIP_DEPT_CHOICES')}
    let staffS={people:${JSON.stringify(people)},aliases:{}};
    let tipsState={
      loaded:true,view:'tips',
      start:new Date(2026,10,2),end:new Date(2026,10,15),
      cells:${JSON.stringify(cells)},busserSplitByDay:${JSON.stringify(busserSplitByDay)},
      busserSplit:${JSON.stringify(busserSplit)},adds:${JSON.stringify(adds)},moves:${JSON.stringify(moves)},
    };
    const esc=(s)=>(s||'').toString();
    const staffDisplayMark=()=>'';
    const tipsToggleHTML=()=>'';
    const tipsImportBtnHTML=()=>'';
    const staffFlagHTML=()=>'';
    const tipsLogBtnHTML=()=>'';
    const tipsLogPanelHTML=()=>'';
    ${grab('staffKeyOf')}
    ${grab('staffEmployed')}
    ${grabConst('staffJobCanon')}
    ${grabConst('staffJobKey')}
    ${grab('staffResolveForTips')}
    ${grab('tipPersonHasHoursThisPeriod')}
    let _ign={}; Object.defineProperty(tipsState,'ignoreSet',{value:_ign,writable:true});
    ${grab('staffFlagIgnored')}
    ${grab('tipNotAPerson')}
    ${grab('tipBaseSection')}
    ${grab('tipEffSection')}
    ${grab('tipBusserSplit')}
    ${grab('tipBusserDay')}
    ${grab('tipBusserSplitPeople')}
    ${grab('tipBusserPoolDay')}
    ${grab('tipRowTotals')}
    ${grab('tipStaffLive')}
    ${grab('tipPersonHasTipsThisPeriod')}
    ${grab('tipSectionPeople')}
    ${grab('tipHasTips')}
    ${grab('tipsGrandTotals')}
    ${grab('tipEnsureRange')}
    ${grab('tipDays')}
    ${grab('tipDayLabel')}
    ${grab('tipISO')}
    ${grab('tipId')}
    ${grab('tipCell')}
    ${grab('tipCellComps')}
    ${grab('tipNum')}
    ${grab('tipCompsHTML')}
    ${grab('tipMoney')}
    ${grab('staffDisplayName')}
    ${grab('tipIdNorm')}
    ${grab('tipPaychexId')}
    ${grab('tipIdBadgeHTML')}
    ${grab('tipPersonKey')}
    ${grab('tipGroupNames')}
    ${grab('tipGroupFor')}
    ${grab('tipRegisterGroups')}
    ${grab('tipGroupDayCell')}
    ${grab('tipGroupTotals')}
    ${grab('tipsHTML')}
    ctx.html=tipsHTML;ctx.staffS=staffS;ctx.tipsState=tipsState;ctx.grand=tipsGrandTotals;
  `)(ctx);
  return ctx;
}

const PAID_DIV = 'border-left:4px solid var(--border)';

{
  const w = world({ people: { 'amy server': { key: 'amy server', name: 'Amy Server', department: 'server', active: true } } });
  const html = w.html();

  // ── every section header row repeats the date columns ──────────────────────────────
  const headerRows = [...html.matchAll(/<tr style="background:var\(--surface2\)">\s*<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1].trim());
  ok('⛔ all 7 sections get a repeated header row (SERVERS, BARTENDERS, BUSSERS, FOOD RUNNERS, WEDDINGS, NoDept, KITCHEN)',
     ['SERVERS', 'BARTENDERS', 'BUSSERS', 'FOOD RUNNERS', 'WEDDINGS', 'NO DEPARTMENT YET', 'KITCHEN'].every(label => headerRows.some(h => h.toUpperCase().startsWith(label))) && headerRows.length === 7);
  ok('⛔ KITCHEN sits directly under NO DEPARTMENT YET', headerRows.indexOf('KITCHEN') === headerRows.indexOf('NO DEPARTMENT YET') + 1);
  ok('⛔ no "+ add" box on KITCHEN or NO DEPARTMENT YET (both list everyone already)', !html.includes('id="tip-add-Kitchen"') && !html.includes('id="tip-add-NoDept"'));

  // each repeated header row carries its own Paid/Unpaid <th> pair
  const sectionBlocks = html.split('<tr style="background:var(--surface2)">').slice(1);
  ok('⛔ every repeated section header row carries its own Paid and Unpaid <th> labels',
     sectionBlocks.length === 7 &&
     sectionBlocks.every(b => { const row = b.split('</tr>')[0]; return row.includes('>Paid<') && row.includes('>Unpaid<'); }));

  // the repeated header's day columns must be the SAME markup as the main thead's —
  // same count, same date labels — or the columns drift out of alignment with the data.
  const theadDayThCount = (html.split('<thead>')[1].split('</thead>')[0].match(/<th[^>]*>(Su|M|Tu|W|Th|F|Sa)<br>/g) || []).length;
  ok('⛔ the main thead has the expected 14 day-of-week <th> columns for this fixture (sanity check on the fixture itself)', theadDayThCount === 14);
  ok('⛔ every repeated section header row carries the SAME day-of-week/date columns as the main thead — dropping them breaks column alignment with the rows below',
     sectionBlocks.length === 7 &&
     sectionBlocks.every(b => { const row = b.split('</tr>')[0]; return (row.match(/<th[^>]*>(Su|M|Tu|W|Th|F|Sa)<br>/g) || []).length === theadDayThCount; }));
}

{
  // the Busser pool-per-night branch (triggered by a real split amount on a night in
  // range) must NOT swallow the header row the way it used to.
  const w = world({
    people: { 'bea bus': { key: 'bea bus', name: 'Bea Bus', department: 'busser', active: true } },
    busserSplitByDay: { '11/2': { 'Busser Pool': 50 } },
  });
  const html = w.html();
  ok('⛔ the Busser section still gets its repeated header row even when the pool-per-night branch fires',
     /<tr style="background:var\(--surface2\)">\s*<th[^>]*>BUSSER/.test(html));
}

// ── the thicker Paid divider is threaded through every required location ──────────────
{
  const w = world({ people: { 'amy server': { key: 'amy server', name: 'Amy Server', department: 'server', active: true, } } });
  const html = w.html();
  const paidDivCount = html.split(PAID_DIV).length - 1;
  // thead Paid th (1) + 6 repeated section headers (6) + 1 data row (Amy's, in Server) +
  // grand total (1) = 9. Other sections with nobody in them don't add a data-row count.
  ok('⛔ the thicker Paid divider style string appears at every required boundary (thead + every repeated header + each data row + grand total)',
     paidDivCount >= 9);
  ok('the thead Paid <th> uses the thicker divider', /<th style="padding:6px 8px;color:#34d399;border-left:4px solid var\(--border\);border-bottom/.test(html));
  ok('the grand-total Paid <td> uses the thicker divider', /id="tips-grand-paid" style="[^"]*border-left:4px solid var\(--border\)/.test(html));
  ok("Amy's own Paid <td> uses the thicker divider, not the old 2px border", /id="tp-[^"]+" style="[^"]*border-left:4px solid var\(--border\)/.test(html));
  ok('⛔ nothing still uses the OLD 2px literal on a Paid column", confirming it is not a stray duplicate', !/color:#34d399;border-left:2px solid var\(--border\)/.test(html));
}


// ── SETTING A DEPARTMENT MOVES THE ROW AND KEEPS EVERY FIGURE (Trinette, 11/20/26) ──────
// Vinny set Trinette Notarangeli → server and reported her 11/17 tips "didn't come up". The
// period was unsaved, so every figure was an in-memory auto-pull fill. Setting a department
// must only MOVE the row — the cells are keyed by the raw name and nothing about Staff
// touches them. Pinned here against the real tipsHTML(), paid AND unpaid, grand total too.
{
  const rowTotal = (html, name) => { const i = html.indexOf('>' + name + '<'); if (i < 0) return null; const tr = html.slice(i, html.indexOf('</tr>', i)); const p = tr.match(/id="tp-[^"]+"[^>]*>([^<]*)</); const u = tr.match(/id="tu-[^"]+"[^>]*>([^<]*)</); return (p ? p[1] : '') + '|' + (u ? u[1] : ''); };
  const sectionOf = (html, name) => { const i = html.indexOf('>' + name + '<'); if (i < 0) return null; const m = [...html.slice(0, i).matchAll(/<tr style="background:var\(--surface2\)">\s*<th[^>]*>([^<]+)<\/th>/g)]; return m.length ? m[m.length - 1][1] : null; };
  const w = world({
    people: { 'trinette notarangeli': { key: 'trinette notarangeli', name: 'Trinette Notarangeli', active: true, positions: ['Server'] } },
    cells: { 'Trinette Notarangeli': { '11/3': { p: 120 }, '11/4': { u: 35 } } },
  });
  let html = w.html();
  const beforeTotals = rowTotal(html, 'Trinette Notarangeli'), beforeGrand = JSON.stringify(w.grand());
  ok('fixture: a tipped person with no department starts in NO DEPARTMENT YET with her pulled figures', sectionOf(html, 'Trinette Notarangeli') === 'NO DEPARTMENT YET' && beforeTotals === '$120.00|$35.00');
  w.staffS.people['trinette notarangeli'].department = 'server';   // what the Staff write + staffLoad(true) lands
  html = w.html();
  ok('⛔ after a department is set her row MOVES to SERVERS', sectionOf(html, 'Trinette Notarangeli') === 'SERVERS');
  ok('⛔ …and keeps every pulled figure, paid and unpaid', rowTotal(html, 'Trinette Notarangeli') === beforeTotals);
  ok('⛔ …and appears exactly once (not left behind in NO DEPARTMENT YET as well)', html.split('>Trinette Notarangeli<').length - 1 === 1);
  ok('⛔ the grand total is unchanged by the move', JSON.stringify(w.grand()) === beforeGrand);
}


// ── KITCHEN: a real row, same as every other section (Vinny: "just in case i ever have to
// put a tip in for a kitchen employee") — editable cells, the thick Paid line, in the total ──
{
  const sectionOf = (html, name) => { const i = html.indexOf('>' + name + '<'); if (i < 0) return null; const m = [...html.slice(0, i).matchAll(/<tr style="background:var\(--surface2\)">\s*<th[^>]*>([^<]+)<\/th>/g)]; return m.length ? m[m.length - 1][1] : null; };
  const w = world({
    people: { 'cody cook': { key: 'cody cook', name: 'Cody Cook', department: 'kitchen', active: true }, 'kim cook': { key: 'kim cook', name: 'Kim Cook', department: 'kitchen', active: true } },
    cells: { 'Cody Cook': { '11/3': { p: 40 } } },
  });
  const html = w.html();
  ok('⛔ a kitchen person with money renders under KITCHEN', sectionOf(html, 'Cody Cook') === 'KITCHEN');
  ok('⛔ a kitchen person with NO money is listed under KITCHEN too (everyone, not just the paid)', sectionOf(html, 'Kim Cook') === 'KITCHEN');
  const tr = html.slice(html.indexOf('>Cody Cook<'), html.indexOf('</tr>', html.indexOf('>Cody Cook<')));
  ok('their day cells are editable like everyone else\'s (data-tipcell, click to edit)', /data-tipcell onclick="tipCellEditGroup\('Cody Cook'/.test(tr));
  ok('their Paid cell carries the thicker divider', /id="tp-[^"]+" style="[^"]*border-left:4px solid var\(--border\)/.test(tr));
  ok('⛔ their money counts in the grand total', w.grand().paid === 40);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
