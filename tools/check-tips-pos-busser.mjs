// CUTOVER #4 — THE BUSSER 3:30 SPLIT FROM THE REGISTER'S PUNCHES (Jarvis/Vinny 11/20/26).
//
//     node tools/check-tips-pos-busser.mjs
//
// One place works out each busser's after-3:30 share per night: the MINI. It writes them into
// the tip-out log entry as bussers[] = {name, emp_id, hours, after330_hours, share} (dollars),
// source:'pos'. The Watch Tower takes those shares for THOSE nights and keeps the MICROS path
// for every other night. The POS pull matches people by emp_id (Staff register.emp_id), never
// lets two same-named people overwrite each other, and keeps the register's shifts as punches
// so the 3am / too-long / missing-half checks run on POS hours too. RUN, not read.
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
const grabConst = (name) => { const i = src.indexOf('const ' + name + '='); let depth = 0, k = src.indexOf('{', i);
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(i, src.indexOf(';', k) + 1); };

const STAFF = {
  'michael fornero': { key: 'michael fornero', pid: 'm1', name: 'Michael Fornero', register: { emp_id: 21 } },
  'chris lee': { key: 'chris lee', pid: 'c1', name: 'Chris Lee', register: { emp_id: 5 } },
  'ana busser': { key: 'ana busser', pid: 'a1', name: 'Ana Busser', register: { emp_id: 31 } },
  'old timer': { key: 'old timer', pid: 'o1', name: 'Old Timer', removed: true, register: { emp_id: 44 } },
};
// A world with the REAL functions; only the network and the screen are stubs.
function world({ people = STAFF, aliases = {}, state = {}, labor = null, log = [], logFails = false } = {}) {
  const ctx = { status: [], saved: 0, scanned: 0 };
  new Function('ctx', `
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState=Object.assign({start:new Date(2026,10,16),end:new Date(2026,10,29),hours:{},busserSplit:{},busserSplitByDay:{},punches:[]},${JSON.stringify(state)});
    tipsState.start=new Date(2026,10,16);tipsState.end=new Date(2026,10,29);
    let tipsGen=1;
    const posS={srv:'http://mini'};
    const TIPS_LOG_URL='https://log',TIPS_LOG_KEY=()=>'k';
    async function posSrv(){return {ok:true,status:200,body:${JSON.stringify(labor)}};}
    async function fetch(){if(${logFails})throw new Error('offline');return {ok:true,json:async()=>({log:${JSON.stringify(log)}})};}
    function tipsSetStatus(s,c){ctx.status.push({s,c});}
    function tipsSaveHoursSoon(){ctx.saved++;} function tipsActive(){return false;} function tipsRedraw(){}
    function tipsScanTimesheets(){ctx.scanned++;}
    function esc(s){return String(s);} function tipMoney(v){return '$'+v;}
    const TIP_NAME_ALIASES={'michael fornero':'Mike Fornero'},TIP_ROSTER_CANON={};   // a legacy re-spelling, to prove the POS pull never applies itfunction tipNormKey(n){return String(n||'').toLowerCase().trim();}
    ${grab('tipCanon')}
    ${grab('tipEnsureRange')}${grab('tipDays')}${grab('tipISO')}${grab('tipDayLabel')}
    ${grab('staffKeyOf')}${grab('staffResolveForTips')}
    ${grab('tipsStaffByEmpId')}${grab('tipsPosPersonName')}${grab('tipsComputeBusserSplit')}${grab('tipsApplyPosSplit')}
    ${grab('tipsMergeMicros')}${grab('tipsPullFromPos')}
    ${grabConst('TS_RULES')}
    ${grab('tsDec')}${grab('tsLen')}${grab('tsFmt')}${grab('tsCheckRow')}
    ctx.split=tipsComputeBusserSplit;ctx.apply=tipsApplyPosSplit;ctx.nameOf=tipsPosPersonName;ctx.pull=tipsPullFromPos;
    ctx.check=tsCheckRow;ctx.st=()=>tipsState;
  `)(ctx);
  return ctx;
}
const IN = { '11/17': true, '11/18': true, '11/19': true, '11/20': true };
const posNight = (date, bussers, extra = {}) => ({ date, source: 'pos', savedAt: '2026-11-' + date.split('/')[1] + 'T23:00', pools: { busser: 999 }, bussers, ...extra });
const microsNight = (date, pool, extra = {}) => ({ date, savedAt: '2026-11-01', pools: { busser: pool }, ...extra });
const MICROS_SHIFTS = [
  { name: 'Ana Busser', md: '11/17', after330: 4 }, { name: 'Bo Busser', md: '11/17', after330: 4 },
  { name: 'Ana Busser', md: '11/18', after330: 6 }, { name: 'Bo Busser', md: '11/18', after330: 2 },
];

// ── per night: the mini's shares on a POS night, the MICROS maths on every other ────────────
{
  const w = world();
  const log = [
    microsNight('11/17/2026', 100),
    posNight('11/18/2026', [{ name: 'Ana B', emp_id: 31, hours: 6, after330_hours: 5, share: 70 }, { name: 'Bo Busser', emp_id: 99, hours: 3, after330_hours: 2, share: 30.004 }]),
  ];
  const out = w.split(MICROS_SHIFTS, log, IN);
  ok('⛔ a MICROS night still divides its pool by after-3:30 hours (11/17: $100, 4h/4h → 50/50)', out.byDay['11/17']['Ana Busser'] === 50 && out.byDay['11/17']['Bo Busser'] === 50);
  ok('⛔ a POS night takes the MINI\'s shares — NOT the MICROS shifts that night (11/18 would be 75/25 off MICROS)', out.byDay['11/18']['Ana Busser'] === 70 && out.byDay['11/18']['Bo Busser'] === 30);
  ok('…the pool on a POS entry is never re-divided (the 999 is ignored)', Object.values(out.byDay['11/18']).reduce((a, b) => a + b, 0) === 100);
  ok('⛔ a POS busser is filed by emp_id → the Staff person (register name "Ana B" → "Ana Busser"), so the split lands on their hours row', !('Ana B' in out.byDay['11/18']));
  ok('the period totals add both nights', out.split['Ana Busser'] === 120 && out.split['Bo Busser'] === 80);
  ok('the POS nights are named, so a POS pull knows which nights it owns', out.posNights.join() === '11/18');
}
{
  const w = world();
  const log = [posNight('11/19/2026', [{ name: 'Ana Busser', emp_id: 31, share: 42.5 }])];
  ok('⛔ a POS night counts with NO MICROS shift on it, when it is inside the period', w.split([], log, IN).byDay['11/19']['Ana Busser'] === 42.5);
  ok('…but not outside the period', !w.split([], [posNight('12/3/2026', [{ name: 'Ana Busser', emp_id: 31, share: 10 }])], IN).byDay['12/3']);
  ok('without a period (the old call shape) only nights the MICROS shifts cover are looked at, as before', !w.split([], log).byDay['11/19']);
}
{
  const w = world();
  const log = [microsNight('11/18/2026', 80), posNight('11/18/2026', [{ name: 'Ana Busser', emp_id: 31, share: 500 }], { practice: true })];
  const out = w.split(MICROS_SHIFTS, log, IN);
  ok('⛔ a PRACTICE POS night never feeds payroll — the real night\'s MICROS split stands (80: 60/20)', out.byDay['11/18']['Ana Busser'] === 60 && out.byDay['11/18']['Bo Busser'] === 20 && !out.posNights.length);
}
{
  const w = world();
  const log = [posNight('11/18/2026', [{ name: 'Ana Busser', emp_id: 31, share: 10 }], { draft: true, savedAt: '2026-11-19' }), microsNight('11/18/2026', 80, { savedAt: '2026-11-02' })];
  ok('a finalized entry beats a newer DRAFT for the same night — same rule as before (here the MICROS one)', w.split(MICROS_SHIFTS, log, IN).byDay['11/18']['Bo Busser'] === 20);
  const log2 = [microsNight('11/18/2026', 80, { savedAt: '2026-11-02' }), posNight('11/18/2026', [{ name: 'Ana Busser', emp_id: 31, share: 10 }], { savedAt: '2026-11-19' })];
  ok('…and of two finalized entries the newest wins (here the POS one)', w.split(MICROS_SHIFTS, log2, IN).byDay['11/18']['Ana Busser'] === 10);
}
{
  const w = world();
  const out = w.split([], [posNight('11/19/2026', [{ name: 'Ana Busser', emp_id: 31, share: 0 }, { name: 'X', share: 'abc' }, null])], IN);
  ok('a zero / unreadable share is nobody owed — no row, but the night is still a POS night', !out.byDay['11/19'] && out.posNights.join() === '11/19');
}

// ── a POS pull only replaces ITS nights' split ───────────────────────────────────────────
{
  const w = world({ state: { busserSplit: { 'Ana Busser': 80, 'Bo Busser': 40 }, busserSplitByDay: { '11/17': { 'Ana Busser': 50, 'Bo Busser': 30 }, '11/18': { 'Ana Busser': 30, 'Bo Busser': 10 } } } });
  w.apply({ '11/18': { 'Ana Busser': 25, 'Cy': 15 } }, ['11/18']);
  const st = w.st();
  ok('⛔ the MICROS night already in the period is kept exactly', JSON.stringify(st.busserSplitByDay['11/17']) === JSON.stringify({ 'Ana Busser': 50, 'Bo Busser': 30 }));
  ok('⛔ the POS night is REPLACED by the mini\'s shares', JSON.stringify(st.busserSplitByDay['11/18']) === JSON.stringify({ 'Ana Busser': 25, 'Cy': 15 }));
  ok('…and the totals move by exactly the difference (Ana 80→75, Bo 40→30, Cy +15)', st.busserSplit['Ana Busser'] === 75 && st.busserSplit['Bo Busser'] === 30 && st.busserSplit.Cy === 15);
  w.apply({}, ['11/18']);
  ok('a POS night whose shares are all zero clears what was there (the mini said nobody is owed)', !w.st().busserSplitByDay['11/18'] && w.st().busserSplit['Ana Busser'] === 50 && !('Cy' in w.st().busserSplit));
}

// ── who is who: emp_id first, the name only as a fallback ───────────────────────────────
{
  const w = world();
  ok('⛔ emp_id 21 is Michael Fornero, whatever the register calls him', w.nameOf(21, 'Mike F') === 'Michael Fornero');
  ok('a person removed mid-period is still found by emp_id (they still get paid)', w.nameOf(44, 'O T') === 'Old Timer');
  ok('no Staff person with that emp_id → the register\'s name', w.nameOf(77, 'Dee New') === 'Dee New');
  ok('⛔ a name that is SOMEONE ELSE on the register (Chris Lee is emp 5) is kept apart: "Chris Lee #9"', w.nameOf(9, 'Chris Lee') === 'Chris Lee #9');
}

// ── the POS pull, end to end ──────────────────────────────────────────────────────────────
const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
const LABOR = {
  people: [
    { emp_id: 21, name: 'Mike F', jobs: [{ job: 'Server', regular: 20, ot: 0 }] },
    { emp_id: 5, name: 'Chris Lee', jobs: [{ job: 'Bartender', regular: 10, ot: 0 }] },
    { emp_id: 9, name: 'Chris Lee', jobs: [{ job: 'Cook', regular: 30, ot: 1 }] },
    { emp_id: 31, name: 'Ana B', jobs: [{ job: 'Busser', regular: 12, ot: 0 }] },
  ],
  shifts: [
    { emp_id: 21, name: 'Mike F', date: '2026-11-18', in: at(18, 16, 0), out: at(18, 22, 30), job: 'Server' },
    { emp_id: 9, name: 'Chris Lee', date: '2026-11-18', in: at(18, 10, 0), out: null, job: 'Cook', open: true },
    { emp_id: 31, name: 'Ana B', date: '2026-11-19', in: at(19, 17, 0), out: at(20, 0, 15), job: 'Busser' },
    { emp_id: 5, name: 'Chris Lee', date: '2026-11-20', in: at(20, 9, 0), out: at(20, 23, 30), job: 'Bartender' },
    { emp_id: 21, name: 'Mike F', date: '2026-11-17', in: at(18, 1, 10), out: at(18, 2, 0), job: 'Server' },
  ],
  tip_name_collisions: [],
};
{
  const w = world({
    labor: LABOR,
    state: { punches: [{ name: 'Old Micros', date: '11/16', inTime: '16:00', outTime: '22:00' }, { name: 'Gone', date: '11/18', inTime: '16:00', outTime: '22:00' }],
      busserSplit: { 'Bo Busser': 30 }, busserSplitByDay: { '11/17': { 'Bo Busser': 30 } } },
    log: [posNight('11/19/2026', [{ name: 'Ana B', emp_id: 31, share: 55 }])],
  });
  await w.pull();
  const st = w.st();
  ok('⛔ emp_id 21 lands on Michael Fornero\'s row, not a new "Mike F" row', st.hours['Michael Fornero'] && st.hours['Michael Fornero'].Server.h === 20 && !st.hours['Mike F']);
  ok('⛔ two people named "Chris Lee" keep their OWN hours — never one overwriting the other', st.hours['Chris Lee'].Bartender.h === 10 && st.hours['Chris Lee #9'].Cook.h === 30 && !st.hours['Chris Lee'].Cook);
  ok('…the emp_id-matched one keeps the plain name (Staff\'s), the other is marked', !st.hours['Chris Lee #5']);
  const pp = st.punches.filter(p => p.src === 'pos');
  ok('⛔ the register\'s shifts are kept as punches (same shape as the MICROS import), by the night they belong to', pp.length === 5 && pp.some(p => p.name === 'Michael Fornero' && p.date === '11/18' && p.inTime === '16:00' && p.outTime === '22:30'));
  ok('…a shift past midnight stays on its service night (in 11/19 17:00, out 00:15)', pp.some(p => p.name === 'Ana Busser' && p.date === '11/19' && p.outTime === '00:15'));
  ok('⛔ a shift clocked in after midnight (1:10am on the 18th) is dated by the MINI\'s service night, 11/17 — not the calendar day', pp.some(p => p.name === 'Michael Fornero' && p.date === '11/17' && p.inTime === '01:10'));
  ok('…the same-named people stay apart in the punches too', pp.some(p => p.name === 'Chris Lee #9' && p.date === '11/18') && pp.some(p => p.name === 'Chris Lee' && p.date === '11/20'));
  ok('⛔ MICROS punches stay for nights the register has none (11/16), and are replaced on nights it has (11/18)', st.punches.some(p => p.name === 'Old Micros') && !st.punches.some(p => p.name === 'Gone'));
  const checks = st.punches.flatMap(p => w.check(p, 'Restaurant', null));
  ok('⛔ the time-sheet checks RUN on POS punches: a never-punched-out shift reads "missing half"', checks.some(c => c.rule === 'missingHalf' && c.name === 'Chris Lee #9'));
  ok('…a 14½-hour shift reads "too long"', checks.some(c => c.rule === 'tooLong' && c.name === 'Chris Lee'));
  ok('…and the check is re-run after the pull', w.scanned === 1);
  ok('⛔ the POS night\'s busser split comes from the mini\'s shares, on the emp_id-resolved name', st.busserSplitByDay['11/19']['Ana Busser'] === 55);
  ok('⛔ …and the MICROS night already there is untouched', st.busserSplitByDay['11/17']['Bo Busser'] === 30 && st.busserSplit['Bo Busser'] === 30 && st.busserSplit['Ana Busser'] === 55);
  ok('the hours are saved', w.saved === 1);
  ok('the status says the split came from the register', /busser split from the register for 1 night/.test(w.status.at(-1).s));
}
{
  // two people NOBODY on Staff knows, same name, different emp_ids
  const w = world({ labor: { people: [
      { emp_id: 60, name: 'Sam Doe', jobs: [{ job: 'Server', regular: 8, ot: 0 }] },
      { emp_id: 61, name: 'Sam Doe', jobs: [{ job: 'Server', regular: 3, ot: 0 }] }],
    shifts: [], tip_name_collisions: [] } });
  await w.pull();
  ok('⛔ two same-named people neither of whom is on Staff still keep their own hours ("Sam Doe" 8h, "Sam Doe #61" 3h)', w.st().hours['Sam Doe'].Server.h === 8 && w.st().hours['Sam Doe #61'].Server.h === 3);
}
{
  const w = world({ labor: LABOR, state: { busserSplit: { 'Bo Busser': 30 }, busserSplitByDay: { '11/17': { 'Bo Busser': 30 } } }, log: [posNight('11/19/2026', [{ name: 'Ana B', emp_id: 31, share: 500 }], { practice: true })] });
  await w.pull();
  ok('⛔ a PRACTICE POS night changes no split in a pull', JSON.stringify(w.st().busserSplit) === JSON.stringify({ 'Bo Busser': 30 }));
}
{
  const w = world({ labor: LABOR, state: { busserSplit: { 'Bo Busser': 30 }, busserSplitByDay: { '11/17': { 'Bo Busser': 30 } } }, logFails: true });
  await w.pull();
  ok('⛔ a tip-out log that can\'t be read leaves the split alone — and says so', JSON.stringify(w.st().busserSplit) === JSON.stringify({ 'Bo Busser': 30 }) && /busser split not updated/.test(w.status.at(-1).s) && w.status.at(-1).c === '#fbbf24');
  ok('…while the hours still come in', w.st().hours['Michael Fornero'].Server.h === 20);
}

// ── the MICROS import passes its period, so POS nights count there too ──────────────────
ok('the MICROS timesheet import hands the period to the split (a POS night inside it uses the mini\'s shares)',
   /tipsComputeBusserSplit\(shifts,log,inPeriod\)/.test(grab('tipsImportTimesheet')));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
