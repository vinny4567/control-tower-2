// PAYCHEX ID COMES FROM STAFF — Vinny, 11/20/26: "i want the emp number aka paychex id listed
// here. Remember this sheet gets turned into the paychex csv file import."
//
//     node tools/check-tips-paychex-id.mjs
//
// Staff's paychex_id is the master. The old per-sheet map (ct_emp_ids → tipsState.empIds) is a
// FALLBACK only when Staff has no ID, and is flagged when used. When the two DISAGREE the
// person is left OUT of the CSV and named — a wrong Worker ID pays the wrong person, so
// nothing is guessed. RUN, not read: lifts the real resolver, badge, CSV builder and the
// download's status line.
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
const grabLast = (name) => {
  const i = src.lastIndexOf('function ' + name + '(');
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};

function world({ people = {}, aliases = {}, empIds = {}, cells = {}, hours = {}, busserSplit = {} } = {}) {
  const ctx = { status: [] };
  new Function('ctx', `
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState={empIds:${JSON.stringify(empIds)},cells:${JSON.stringify(cells)},hours:${JSON.stringify(hours)},busserSplit:${JSON.stringify(busserSplit)},start:new Date(2026,10,16),end:new Date(2026,10,29)};
    ${grab('esc')}
    ${grab('staffKeyOf')}
    ${grab('staffResolveForTips')}
    ${grab('staffDisplayName')}
    ${grab('tipRowTotals')}
    ${grab('tipBusserSplitPeople')}
    ${grab('tipHours')}
    ${grab('csvEsc')}
    ${grab('tipIdNorm')}
    ${grab('tipPaychexId')}
    ${grab('tipIdBadgeHTML')}
    ${grab('tipsPaychexCsv')}
    ${grab('tipISO')}
    const tipsPeriodFolder=()=>'11-16 to 11-29';
    const tipsSetStatus=(s,c)=>{ctx.status.push({s,c});};
    const window={};                                         // no showDirectoryPicker → plain download path
    class Blob{constructor(p){this.p=p;}}
    const URL={createObjectURL(){return 'blob:x';},revokeObjectURL(){}};
    const document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}}};
    const setTimeout=()=>{};
    ${grab('tipsDownloadCsv')}
    ctx.id=tipPaychexId;ctx.badge=tipIdBadgeHTML;ctx.csv=tipsPaychexCsv;ctx.download=tipsDownloadCsv;
  `)(ctx);
  return ctx;
}
const P = (key, name, extra = {}) => ({ [key]: { key, name, ...extra } });
const paid = (n) => ({ [n]: { '11/17': { p: 100 } } });
const csvRow = (csv, name) => csv.split('\n').find(l => l.includes(',' + name + ','));

// ── the resolver: Staff first, fallback flagged, conflict never guessed ─────────────────
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }) });
  const r = w.id('Amy Server');
  ok('⛔ a Staff paychex_id is THE id (src: staff)', r.id === '412' && r.src === 'staff');
}
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), empIds: { 'Amy Server': '412' } });
  ok('the old sheet agreeing with Staff is no conflict', w.id('Amy Server').src === 'staff');
}
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), empIds: { 'Amy Server': '0412' } });
  ok('leading zeros are the same ID ("0412" is 412) — not a false conflict', w.id('Amy Server').src === 'staff' && w.id('Amy Server').id === '412');
}
{
  const w = world({ people: P('bob bar', 'Bob Bar', {}), empIds: { 'Bob Bar': '377' } });
  const r = w.id('Bob Bar');
  ok('⛔ Staff has no ID → the old sheet is used as a FALLBACK, and says so (src: sheet)', r.id === '377' && r.src === 'sheet');
}
{
  const w = world({ people: P('cal conflict', 'Cal Conflict', { paychex_id: '412' }), empIds: { 'Cal Conflict': '409' } });
  const r = w.id('Cal Conflict');
  ok('⛔ Staff and the old sheet DISAGREE → no id at all, flagged as a conflict carrying both', r.id === '' && r.src === 'conflict' && r.staff === '412' && r.sheet === '409');
}
{
  const w = world({ people: P('dee none', 'Dee None', {}) });
  ok('no ID anywhere → none', w.id('Dee None').src === 'none');
}
{
  // the raw stored spelling resolves through the alias chain to the Staff record's ID
  const w = world({ people: P('michael fornero', 'Michael Fornero', { paychex_id: '205' }), aliases: { 'mike fornero': 'michael fornero' } });
  ok('⛔ a raw alias spelling ("Mike Fornero") gets the Staff person\'s ID', w.id('Mike Fornero').id === '205');
}

// ── the CSV: matched / missing / fallback / conflict ───────────────────────────────────
{
  const w = world({
    people: { ...P('amy server', 'Amy Server', { paychex_id: '412' }), ...P('bob bar', 'Bob Bar', {}), ...P('cal conflict', 'Cal Conflict', { paychex_id: '412' }), ...P('dee none', 'Dee None', {}) },
    empIds: { 'Bob Bar': '377', 'Cal Conflict': '409', 'Amy Server': '999' },   // Amy's 999 vs Staff 412 is a conflict too
    cells: { ...paid('Amy Server'), ...paid('Bob Bar'), ...paid('Cal Conflict'), ...paid('Dee None') },
  });
  const out = w.csv();
  ok('⛔ a conflicted person is LEFT OUT of the CSV — no line under either ID', !csvRow(out.csv, 'Cal Conflict') && !csvRow(out.csv, 'Amy Server'));
  ok('…and listed with BOTH ids so Vinny can see which is which', out.conflicts.some(c => c.name === 'Cal Conflict' && c.staff === '412' && c.sheet === '409'));
  ok('⛔ the fallback person IS exported, with the old-sheet ID as the Worker ID', /^11048355,377,Bob Bar,hourly/.test(csvRow(out.csv, 'Bob Bar') || ''));
  ok('…and is flagged as a fallback', out.fallback.indexOf('Bob Bar') >= 0);
  ok('⛔ a person with no ID anywhere is left off (can\'t import) and listed as skipped', !csvRow(out.csv, 'Dee None') && out.skipped.indexOf('Dee None') >= 0);
}
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), empIds: { 'Amy Server': '0412' }, cells: paid('Amy Server') });
  const out = w.csv();
  ok('⛔ a matched person exports with the STAFF id', /^11048355,412,Amy Server,hourly,/.test(csvRow(out.csv, 'Amy Server') || ''));
  ok('…and is not flagged as fallback or conflict', out.fallback.length === 0 && out.conflicts.length === 0);
}
{
  // Staff ID beats an old-sheet ID that is simply absent for that name; sorted by the RESOLVED id
  const w = world({
    people: { ...P('zed', 'Zed Z', { paychex_id: '101' }), ...P('ann', 'Ann A', { paychex_id: '900' }) },
    cells: { ...paid('Zed Z'), ...paid('Ann A') },
  });
  const lines = w.csv().csv.split('\n').slice(1);
  ok('rows are ordered by the resolved (Staff) Worker ID', lines[0].startsWith('11048355,101,') && lines[1].startsWith('11048355,900,'));
}

// ── the status line names exactly who was left off, and why ────────────────────────────
{
  const w = world({
    people: { ...P('cal conflict', 'Cal Conflict', { paychex_id: '412' }), ...P('bob bar', 'Bob Bar', {}), ...P('dee none', 'Dee None', {}) },
    empIds: { 'Cal Conflict': '409', 'Bob Bar': '377' },
    cells: { ...paid('Cal Conflict'), ...paid('Bob Bar'), ...paid('Dee None') },
  });
  await w.download();
  const last = w.status[w.status.length - 1] || { s: '' };
  ok('⛔ the status names the conflict in Vinny\'s words: "Paychex ID differs: Cal Conflict (Staff 412, old sheet 409)"', last.s.includes('Paychex ID differs: Cal Conflict (Staff 412, old sheet 409)'));
  ok('…names who had no ID', last.s.includes('no Paychex ID): Dee None'));
  ok('…names who exported on an old-sheet ID', last.s.includes('ID from the old sheet, not Staff: Bob Bar'));
  ok('⛔ a conflict colours the status RED, not the amber of a plain skip', last.c === '#f87171');
}

// ── the badge beside a name (Tips read-only; Hours editable only when Staff has none) ───
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }) });
  const b = w.badge('Amy Server', true);
  ok('⛔ a Staff ID shows read-only even on Hours — the master isn\'t edited from the sheet', b.includes('>412<') && !b.includes('<input'));
}
{
  const w = world({ people: P('dee none', 'Dee None', {}) });
  ok('no ID on Tips reads a small red "no ID"', /color:#f87171">no ID</.test(w.badge('Dee None', false)));
  ok('…and on Hours it is the fallback box, placeholder "no ID"', /<input[^>]*placeholder="no ID"/.test(w.badge('Dee None', true)));
}
{
  const w = world({ people: P('cal conflict', 'Cal Conflict', { paychex_id: '412' }), empIds: { 'Cal Conflict': '409' } });
  const b = w.badge('Cal Conflict', true);
  ok('⛔ a conflict shows both ids in red, and is NOT an editable box', b.includes('412≠409') && b.includes('#f87171') && !b.includes('<input'));
}
{
  const w = world({ people: P('bob bar', 'Bob Bar', {}), empIds: { 'Bob Bar': '377' } });
  ok('a fallback ID on Tips is marked (amber, with *)', /#fbbf24">377\*</.test(w.badge('Bob Bar', false)));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
