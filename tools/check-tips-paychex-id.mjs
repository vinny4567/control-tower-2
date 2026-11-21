// A PAYCHEX ID COMES ONLY FROM STAFF — Vinny, 11/20/26: "i want the emp number aka paychex id listed
// here. Remember this sheet gets turned into the paychex csv file import." … "lets finish this".
//
//     node tools/check-tips-paychex-id.mjs
//
// The old per-sheet list (ct_emp_ids) is RETIRED — never read, never written. It held MICROS
// EMPLOYEE NUMBERS, not Paychex IDs: the 11/2–11/15 CSV paid Ethan Browning as Worker 13 while
// Staff has 647. A person has Staff's ID or none; none = left off the CSV and NAMED, tappable to
// open them in Staff. RUN, not read: the real resolver, badge, CSV builder and download status.
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

function world({ people = {}, aliases = {}, empIds = {}, cells = {}, hours = {}, busserSplit = {} } = {}) {
  const ctx = { status: [], left: { innerHTML: '' } };
  new Function('ctx', `
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState={empIds:${JSON.stringify(empIds)},cells:${JSON.stringify(cells)},hours:${JSON.stringify(hours)},busserSplit:${JSON.stringify(busserSplit)},start:new Date(2026,10,16),end:new Date(2026,10,29)};
    ${grab('esc')}
    ${grab('staffKeyOf')}${grab('staffResolveForTips')}${grab('staffDisplayName')}
    ${grab('tipRowTotals')}${grab('tipBusserSplitPeople')}${grab('tipHours')}${grab('csvEsc')}
    ${grab('tipPaychexId')}${grab('tipIdBadgeHTML')}
    ${grab('tipPersonKey')}${grab('tipGroupNames')}${grab('tipGroupFor')}${grab('tipRegisterGroups')}
    ${grab('tipsPaychexCsv')}${grab('tipISO')}
    const tipsPeriodFolder=()=>'11-16 to 11-29';
    const tipsSetStatus=(s,c)=>{ctx.status.push({s,c});};
    const window={};
    class Blob{constructor(p){this.p=p;}}
    const URL={createObjectURL(){return 'blob:x';},revokeObjectURL(){}};
    const document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}},getElementById(id){return id==='tips-csv-left'?ctx.left:null;}};
    const setTimeout=()=>{};
    ${grab('tipsCsvLeftOff')}${grab('tipsDownloadCsv')}
    ctx.nav={};function posSec(x){ctx.nav.posSec=x;} function staffFlagOpen(n){ctx.nav.flag=n;}
    ${grab('tipOpenInStaff')}
    ctx.id=tipPaychexId;ctx.badge=tipIdBadgeHTML;ctx.csv=tipsPaychexCsv;ctx.download=tipsDownloadCsv;ctx.openInStaff=tipOpenInStaff;ctx.staffS=()=>staffS;
  `)(ctx);
  return ctx;
}
const P = (key, name, extra = {}) => ({ [key]: { key, name, ...extra } });
const paid = (n) => ({ [n]: { '11/17': { p: 100 } } });
const csvRow = (csv, name) => csv.split('\n').find(l => l.includes(',' + name + ','));

// ── the resolver: Staff, or nothing — the old list is never read ─────────────────────────
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), empIds: { 'Amy Server': '999' } });
  ok('⛔ Staff\'s paychex_id is THE id — an old-list value is ignored entirely, even a different one', w.id('Amy Server').id === '412' && w.id('Amy Server').src === 'staff');
}
{
  const w = world({ people: P('ethan browning', 'Ethan Browning', { paychex_id: '647' }), empIds: { 'Ethan Browning': '13' }, cells: paid('Ethan Browning') });
  ok('⛔ Ethan Browning is 647 (Staff), never 13 (his MICROS number in the old list)', w.id('Ethan Browning').id === '647');
  ok('…and exports as 647', /^11048355,647,Ethan Browning,hourly/m.test(w.csv().csv) && !/,13,Ethan/.test(w.csv().csv));
}
{
  const w = world({ people: P('caden poss', 'Caden Poss', {}), empIds: { 'Caden Poss': '645' } });
  ok('⛔ no Staff ID → NO id, even with an old-list value (Caden Poss 645 is no longer used)', w.id('Caden Poss').id === '' && w.id('Caden Poss').src === 'none');
}
{
  const w = world({ people: P('michael fornero', 'Michael Fornero', { paychex_id: '205' }), aliases: { 'mike fornero': 'michael fornero' } });
  ok('a raw alias spelling ("Mike Fornero") gets the Staff person\'s ID', w.id('Mike Fornero').id === '205');
}
ok('⛔ the resolver does not read the old list at all', !/empIds/.test(grab('tipPaychexId')));

// ── the CSV: Staff ID or left off and named ──────────────────────────────────────────────────
{
  const w = world({
    people: { ...P('amy server', 'Amy Server', { paychex_id: '412' }), ...P('caden poss', 'Caden Poss', {}) },
    empIds: { 'Caden Poss': '645' },
    cells: { ...paid('Amy Server'), ...paid('Caden Poss') },
  });
  const out = w.csv();
  ok('⛔ a person with a Staff ID exports under it', /^11048355,412,Amy Server,hourly/m.test(out.csv));
  ok('⛔ a person with no Staff ID is LEFT OFF — the old 645 is never used as a Worker ID', !csvRow(out.csv, 'Caden Poss') && !/,645,/.test(out.csv) && out.skipped.indexOf('Caden Poss') >= 0);
  ok('the result has no fallback/conflict lists any more — one source, nothing to fall back to', out.fallback === undefined && out.conflicts === undefined);
}
{
  const w = world({ people: { ...P('zed', 'Zed Z', { paychex_id: '101' }), ...P('ann', 'Ann A', { paychex_id: '900' }) }, cells: { ...paid('Zed Z'), ...paid('Ann A') } });
  const lines = w.csv().csv.split('\n').slice(1);
  ok('rows are ordered by Staff Worker ID', lines[0].startsWith('11048355,101,') && lines[1].startsWith('11048355,900,'));
}

// ── the status line names who was left off; the names are TAPPABLE (open in Staff) ──────────
{
  const w = world({ people: { ...P('caden poss', 'Caden Poss', {}), ...P('amy server', 'Amy Server', { paychex_id: '412' }) }, cells: { ...paid('Caden Poss'), ...paid('Amy Server') } });
  await w.download();
  const last = w.status[w.status.length - 1] || { s: '' };
  ok('⛔ the status says who was left off and why: "no Paychex ID on Staff: Caden Poss"', last.s.includes('left off, no Paychex ID on Staff: Caden Poss') && last.c === '#fbbf24');
  ok('⛔ …and each name is a button that opens them in Staff', /<button onclick="tipOpenInStaff\('Caden Poss'\)"[^>]*>Caden Poss<\/button>/.test(w.left.innerHTML));
}
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), cells: paid('Amy Server') });
  await w.download();
  ok('nobody left off → no list, and the status is green', w.left.innerHTML === '' && w.status.at(-1).c === '#34d399');
}

// ── the badge: blue from Staff, or a red "no ID" that opens Staff ────────────────────────────
{
  const w = world({ people: P('amy server', 'Amy Server', { paychex_id: '412' }), empIds: { 'Amy Server': '9' } });
  const b = w.badge('Amy Server');
  ok('a Staff ID shows plainly, nothing to tap', b.includes('>412<') && !b.includes('onclick'));
}
{
  const w = world({ people: P('caden poss', 'Caden Poss', {}), empIds: { 'Caden Poss': '645' } });
  const b = w.badge('Caden Poss');
  ok('⛔ no Staff ID reads a red "no ID" — the old 645 is never shown, amber or otherwise', />no ID</.test(b) && b.includes('#f87171') && !b.includes('645') && !b.includes('#fbbf24'));
  ok('…tapping it opens the person in Staff, and it is never a box to type into', /tipOpenInStaff\('Caden Poss'\)/.test(b) && !b.includes('<input'));
}

// ── tapping opens the RIGHT place ─────────────────────────────────────────────────────────────
{
  const w = world({ people: P('michael fornero', 'Michael Fornero', { pid: 'm1' }), aliases: { 'mike fornero': 'michael fornero' } });
  w.staffS().filter = 'noid'; w.staffS().open = null;
  w.openInStaff('Mike Fornero');
  ok('⛔ a raw spelling that resolves opens THAT Staff person, row expanded, search on their name, filter cleared', w.nav.posSec === 'staff' && w.staffS().open === 'michael fornero' && w.staffS().q === 'Michael Fornero' && w.staffS().filter === null);
}
{
  const w = world({ people: {} });
  w.openInStaff('Ghost Person');
  ok('⛔ a name Staff can\'t resolve opens the ⚑ picker instead', w.nav.flag === 'Ghost Person' && !w.nav.posSec);
}

// ── the old list is RETIRED: nothing in the page reads or writes it ──────────────────────────
ok('⛔ nothing writes ct_emp_ids any more (no saver, no kvPush of it anywhere)', !/kvPush\('ct_emp_ids'/.test(src) && !/function tipsSaveEmpIds\(/.test(src));
ok('⛔ nothing reads ct_emp_ids any more (the Tips load no longer fetches it)', !/kvGet\('ct_emp_ids'\)/.test(src));
ok('⛔ the conflict resolver and its dialog are gone — with one source there is nothing to conflict', !/function tipResolveIdConflict\(|function tipIdConflictAsk\(/.test(src));
ok('the sheet never takes an ID (no input in the badge, no tipEmpIdSet)', !/<input/.test(grab('tipIdBadgeHTML')) && !/tipEmpIdSet\(/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
