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

function world({ people = {}, aliases = {}, empIds = {}, cells = {}, hours = {}, busserSplit = {}, answer = null, blocked = false } = {}) {
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
    ${grab('tipPersonKey')}
    ${grab('tipGroupNames')}
    ${grab('tipGroupFor')}
    ${grab('tipRegisterGroups')}
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
    ctx.nav={};function posSec(x){ctx.nav.posSec=x;} function staffFlagOpen(n){ctx.nav.flag=n;}
    ${grab('tipOpenInStaff')}
    ctx.asked=[];ctx.saves=[];ctx.redraws=0;
    async function tipIdConflictAsk(n,a,b){ctx.asked.push([n,a,b]);return ${JSON.stringify(answer)};}
    function tipsSaveBlocked(){return ${JSON.stringify(blocked)};}
    function tipsSaveEmpIds(){if(tipsSaveBlocked())return false;ctx.saves.push(JSON.parse(JSON.stringify(tipsState.empIds)));return true;}
    function tipsRedraw(){ctx.redraws++;}
    ${grab('tipResolveIdConflict')}
    ctx.resolveConflict=tipResolveIdConflict;ctx.ids=()=>tipsState.empIds;
    ctx.openInStaff=tipOpenInStaff;ctx.staffS=()=>staffS;
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

// ── the badge beside a name: READ-ONLY on Tips AND Hours — the sheet never takes an ID ──
// (Jarvis/Vinny 11/20/26: "wipe the other lists" — a typed fallback would keep ct_emp_ids
// alive as a second ID list.) Anything to fix is a tap that opens the person in Staff.
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }) });
  const b = w.badge('Amy Server');
  ok('a Staff ID shows plainly, nothing to tap', b.includes('>412<') && !b.includes('<input') && !b.includes('onclick'));
}
{
  const w = world({ people: P('dee none', 'Dee None', {}) });
  const b = w.badge('Dee None');
  ok('⛔ no ID reads a small red "no ID" — and is NOT a box to type into', />no ID</.test(b) && b.includes('#f87171') && !b.includes('<input'));
  ok('…tapping it opens the person in Staff', /onclick="event\.stopPropagation\(\);tipOpenInStaff\('Dee None'\)"/.test(b));
}
{
  const w = world({ people: P('cal conflict', 'Cal Conflict', { paychex_id: '412' }), empIds: { 'Cal Conflict': '409' } });
  const b = w.badge('Cal Conflict');
  ok('⛔ a conflict shows both ids in red, tap-to-fix (the conflict resolver), never an editable box', b.includes('412≠409') && b.includes('#f87171') && !b.includes('<input') && b.includes('tipResolveIdConflict('));
}
{
  const w = world({ people: P('bob bar', 'Bob Bar', {}), empIds: { 'Bob Bar': '377' } });
  const b = w.badge('Bob Bar');
  ok('an existing old-sheet ID still works as the flagged amber fallback (377*), tap to move it onto Staff', /377\*</.test(b) && b.includes('#fbbf24') && b.includes('tipOpenInStaff('));
}

// ── tapping opens the RIGHT place ───────────────────────────────────────────────────────
{
  const w = world({ people: P('michael fornero', 'Michael Fornero', { pid: 'm1' }), aliases: { 'mike fornero': 'michael fornero' } });
  w.staffS().filter = 'noid'; w.staffS().open = null;
  w.openInStaff('Mike Fornero');
  ok('⛔ a raw spelling that resolves opens THAT Staff person, row expanded, search on their name', w.nav.posSec === 'staff' && w.staffS().open === 'michael fornero' && w.staffS().q === 'Michael Fornero');
  ok('…with any Staff filter cleared, so a filter can\'t hide them', w.staffS().filter === null);
}
{
  const w = world({ people: {} });
  w.openInStaff('Ghost Person');
  ok('⛔ a name Staff can\'t resolve opens the ⚑ picker instead (Add to Staff / Same person as…)', w.nav.flag === 'Ghost Person' && !w.nav.posSec);
}

// ── a RED CONFLICT settled from the badge: "Staff is right" (Lydia Freeborn, 648≠16) ─────────
const lydia = P('lydia freeborn', 'Lydia Freeborn', { pid: 'L1', paychex_id: '648' });
{
  const w = world({ people: lydia, empIds: { 'Lydia Freeborn': '16', 'Amy Server': '412' }, cells: { 'Lydia Freeborn': { '11/17': { p: 90 } } }, answer: 'staff' });
  ok('fixture: Lydia is a conflict and is left OFF the CSV', w.id('Lydia Freeborn').src === 'conflict' && w.csv().conflicts.length === 1);
  await w.resolveConflict('Lydia Freeborn');
  ok('the tap asks first, naming both IDs', w.asked.length === 1 && w.asked[0][0] === 'Lydia Freeborn' && w.asked[0][1] === '648' && w.asked[0][2] === '16');
  ok('⛔ "Staff is right" removes HER old-list 16 — nobody else\'s entry is touched', !('Lydia Freeborn' in w.ids()) && w.ids()['Amy Server'] === '412');
  ok('⛔ …through the ONE guarded saver, once', w.saves.length === 1 && !('Lydia Freeborn' in w.saves[0]));
  ok('the badge is blue now (Staff\'s 648), and the screen redraws (keeping the scroll)', w.id('Lydia Freeborn').src === 'staff' && w.id('Lydia Freeborn').id === '648' && w.redraws === 1);
  const out = w.csv();
  ok('⛔ she is back in the CSV under 648', out.conflicts.length === 0 && /^11048355,648,Lydia Freeborn,hourly/m.test(out.csv));
  ok('⛔ Staff is never written from here (still 648, nothing else on her record changed)', JSON.stringify(w.staffS().people['lydia freeborn']) === JSON.stringify(lydia['lydia freeborn']));
}
{
  // a second spelling of the same person holding the old value goes too; a spelling that AGREES stays
  const w = world({ people: lydia, aliases: { 'lydia free born': 'lydia freeborn' }, empIds: { 'Lydia Freeborn': '16', 'Lydia Free Born': '16', 'lydia freeborn ': '0648' }, answer: 'staff' });
  await w.resolveConflict('Lydia Freeborn');
  ok('every stored spelling of HER holding the disagreeing ID is removed', !('Lydia Freeborn' in w.ids()) && !('Lydia Free Born' in w.ids()));
  ok('…while a spelling that agrees with Staff (0648 = 648) is left alone', w.ids()['lydia freeborn '] === '0648');
}
{
  const w = world({ people: lydia, empIds: { 'Lydia Freeborn': '16' }, answer: 'open' });
  await w.resolveConflict('Lydia Freeborn');
  ok('⛔ "the old one is right" opens her in Staff and removes NOTHING', w.nav.posSec === 'staff' && w.staffS().open === 'lydia freeborn' && w.ids()['Lydia Freeborn'] === '16' && w.saves.length === 0);
}
{
  const w = world({ people: lydia, empIds: { 'Lydia Freeborn': '16' }, answer: null });
  await w.resolveConflict('Lydia Freeborn');
  ok('"Not now" / Escape changes nothing and goes nowhere', w.ids()['Lydia Freeborn'] === '16' && w.saves.length === 0 && !w.nav.posSec);
}
{
  const w = world({ people: lydia, empIds: { 'Lydia Freeborn': '16' }, answer: 'staff', blocked: true });
  await w.resolveConflict('Lydia Freeborn');
  ok('⛔ on a screen that failed to load, "Staff is right" removes nothing (not even in memory)', w.ids()['Lydia Freeborn'] === '16' && w.saves.length === 0);
}
{
  const w = world({ people: P('dee none', 'Dee None', {}), answer: 'staff' });
  await w.resolveConflict('Dee None');
  ok('a tap on a non-conflict just opens Staff, no question asked', w.asked.length === 0 && w.nav.posSec === 'staff');
}
{
  const fn = grab('tipResolveIdConflict');
  ok('⛔ the resolver never writes Staff (no staffWriteOp / staffSave in it)', !/staffWriteOp|staffSave\(/.test(fn));
}

// ── the sheet has NO way to write an ID any more ────────────────────────────────────────
ok('⛔ the sheet\'s ID writer (tipEmpIdSet) is gone', !/function tipEmpIdSet\(|tipEmpIdSet\(/.test(src));
ok('⛔ the badge never renders an input, on any path', !/<input/.test(grab('tipIdBadgeHTML')));
ok('…and ct_emp_ids is written ONLY by the guarded saver (the MICROS import / wedding pull still fill the fallback through it)',
   (src.match(/kvPush\('ct_emp_ids'/g) || []).length === 1 && /function tipsSaveEmpIds\(\)\{\s*if\(tipsSaveBlocked\(\)\)return false;\s*try\{kvPush\('ct_emp_ids'/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
