// RUN the tip sheet's saves against the race they used to lose.
// Clicking a date EMPTIES the sheet and then loads the new fortnight. A save that fires in
// that window used to write whatever was in memory under whatever key was current — an
// emptied sheet over the fortnight you just left, or real hours filed under the next one's
// name. The store compares nothing and there is no undo, so these are asserted by running
// the real functions, not by reading them.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const lift = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing function ' + name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
};

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

// A tiny world: real functions, stub everything they touch, and record what was written.
function world(state, periodKey = 'ct_tips_2026_12_1') {
  const env = {
    periodKey,
    writes: [], status: [], timers: [], gen: 7,
    tipsState: state, tipsSaveTimer: null, tipsHoursSaveTimer: null,
  };
  const api = new Function(
    'env', 'kvPush', 'tipsSetStatus', 'tipPeriodKey', 'tipHoursKey', 'tipsRerender',
    'setTimeout', 'clearTimeout', 'Date',
    `let tipsState = env.tipsState;
     let tipsSaveTimer, tipsHoursSaveTimer;
     ${lift('tipsSaveBlocked').replace(/tipsState/g, 'env.tipsState')}
     ${lift('tipsSaveSoon').replace(/tipsState/g, 'env.tipsState').replace(/tipsGen/g, 'env.gen')}
     ${lift('tipsSaveHoursSoon').replace(/tipsState/g, 'env.tipsState').replace(/tipsGen/g, 'env.gen')}
     return { tipsSaveBlocked, tipsSaveSoon, tipsSaveHoursSoon };`
  )(env,
    (k, v) => env.writes.push({ key: k, v }),
    (s) => env.status.push(s),
    () => env.periodKey,
    () => 'ct_tips_hours_' + env.periodKey,
    () => {},
    (fn) => { env.timers.push(fn); return env.timers.length; },
    () => {},
    { now: () => 1700000000000 });
  const fire = () => { const t = env.timers.slice(); env.timers.length = 0; t.forEach(f => f()); };
  return { env, fire, setKey: (k) => { env.periodKey = k; }, ...api };
}
const good = () => ({ loaded: true, loading: false, loadFailed: false, cells: { a: 1 }, adds: {}, moves: { m: 1 }, empIds: { Ann: '123' } });

// ── the fortnight race ──────────────────────────────────────────────────────
let w = world(good());
w.tipsSaveSoon();
w.env.gen++;                       // he clicked a different date inside the 600ms window
w.fire();
ok('⛔ a save whose fortnight changed under it writes NOTHING', w.env.writes.length === 0);

w = world(good());
w.tipsSaveSoon();
w.fire();
ok('a save on a sheet that did not move still writes', w.env.writes.length === 1);
ok('…under the period it was about', w.env.writes[0].key === 'ct_tips_2026_12_1');
ok('…and says so on screen', w.env.status.join('|').includes('Saved ✓'));

// The key must be decided when the edit happens, not when the timer fires. This is the
// difference between "which fortnight was I editing" and "which is on screen in 600ms".
w = world(good(), 'ct_tips_THE_ONE_HE_EDITED');
w.tipsSaveSoon();
w.setKey('ct_tips_A_DIFFERENT_FORTNIGHT');   // the screen moved on inside the 600ms
w.fire();
ok('⛔ the key is captured when he typed, not re-read when the timer fires',
   w.env.writes.length === 1 && w.env.writes[0].key === 'ct_tips_THE_ONE_HE_EDITED');

// ── a screen that never loaded ──────────────────────────────────────────────
const failed = () => ({ ...good(), loadFailed: true, cells: {}, empIds: {} });
w = world(failed());
w.tipsSaveSoon(); w.fire();
ok('⛔ a sheet that could not load never writes its empty self back', w.env.writes.length === 0);
ok('…and says so, loudly — a silent refusal is worse than the bug',
   w.env.status.join('|').includes('not saved'));

w = world(failed());
ok('⛔ the per-sheet moves have no saver at all any more (retired 11/20/26 — the dropdown sets the Staff department)', !/function tipsSaveMoves\(|kvPush\('ct_tips_moves'/.test(src));

// ⛔ THE PAYCHEX ONE (retired 11/20/26, "lets finish this"): the old worker-ID list held MICROS
// employee numbers (Ethan Browning's 13 vs Staff's 647). Nothing saves it any more — a Paychex ID
// comes only from Staff — so there is no saver left to guard.
ok('⛔ the worker-ID saver is gone (tipsSaveEmpIds no longer exists)', !/function tipsSaveEmpIds\(/.test(src));

// ── half-loaded is not loaded ───────────────────────────────────────────────
w = world({ ...good(), loading: true, cells: {} });
w.tipsSaveSoon(); w.fire();
ok('⛔ a sheet still loading does not write its half-empty self back', w.env.writes.length === 0);
// ── the hours save answers to the SAME gate ────────────────────────────────
// It carried its own copy of the load-failed line, and so was missing the still-loading
// one: hours typed into a half-loaded fortnight went to the store anyway.
w = world(failed());
w.tipsSaveHoursSoon(); w.fire();
ok('⛔ the hours save refuses on a sheet that failed to load', w.env.writes.length === 0);
w = world({ ...good(), loading: true, hours: {} });
w.tipsSaveHoursSoon(); w.fire();
ok('⛔ the hours save refuses while the fortnight is still loading', w.env.writes.length === 0);
w = world(good());
w.tipsSaveHoursSoon();
w.env.gen++;
w.fire();
ok('⛔ an hours save whose fortnight changed under it writes nothing', w.env.writes.length === 0);
w = world(good());
w.tipsSaveHoursSoon(); w.fire();
ok('hours still save on a good, settled sheet',
   w.env.writes.length === 1 && w.env.writes[0].key === 'ct_tips_hours_ct_tips_2026_12_1');

// ── NO writer for the worker IDs ────────────────────────────────────────────
// It used to be written from three places, then one guarded saver. Now none: ct_emp_ids stays
// in the store untouched, as history, and the page never writes it.
const raw = (src.match(/kvPush\(\s*['"]ct_emp_ids['"]/g) || []).length;
ok('⛔ nothing in the page writes the old worker-ID map (ct_emp_ids)', raw === 0);


// ── THE TWO LONG READS ──────────────────────────────────────────────────────
// The register read and the timesheet parse take SECONDS. Click a different fortnight
// inside one and the rows coming back describe the period he left. The saves would
// refuse (same gate), but the grid on screen would already be filled with the wrong
// fortnight's hours — and the next thing he typed would then save them under the new
// period's key, with the new generation, past every guard above. So the abort has to
// happen before anything is merged into memory, not just before the write.
// Lifted and RUN, because the ordering is the whole invariant and a regex only ever
// proves a spelling.
function longRead(name, { bumpDuring }) {
  const seen = { merged: 0, saved: 0, status: [] };
  const body = (() => { const i = src.indexOf('async function ' + name + '('); return src.slice(i, src.indexOf('\n}', i) + 2); })();
  const env = { gen: 3 };
  const fn = new Function('env', 'seen', 'posS', 'posSrv', 'tipsSetStatus', 'tipISO', 'tipsMergeMicros',
    'tipsSaveHoursSoon', 'tipsSaveEmpIds', 'tipsHTML', 'activeTab', 'TIPS', 'document', 'esc', 'tipMoney',
    'tipsState', 'tipsExtractPdfLines', 'tipsParseMicros', 'tipsComputeBusserSplit', 'tipsLoadPdfjs',
    'fetch', 'TIPS_LOG_URL', 'TIPS_LOG_KEY', 'tipsScanTimesheets', 'tipsRerender', 'tipsActive',
    'tipsPosPersonName', 'tipDays', 'tipDayLabel', 'tipsApplyPosSplit',
    `let tipsGen; Object.defineProperty(this,'x',{});
     ${body.replace(/\btipsGen\b/g, 'env.gen')}
     return ${name};`
  ).call({}, env, seen,
    { srv: 'http://mini' },
    async () => { if (bumpDuring) env.gen++; return { ok: true, status: 200, body: {
        people: [{ emp_id: 7, name: 'Ann', jobs: [{ job: 'Server', regular: 30, ot: 2, rate_cents: 1500 }] }],
        shifts: [], tip_name_collisions: [] } }; },
    (t) => seen.status.push(String(t)),
    () => '2026-12-01',
    () => { seen.merged++; return 1; },
    () => { seen.saved++; },
    () => { seen.saved++; },
    () => '', 'other', 'tips',
    { getElementById: () => ({ set innerHTML(_v) {} }) },
    (x) => x, () => '$0',
    { busserSplit: { x: 1 }, start: new Date(2026, 11, 1), end: new Date(2026, 11, 14) },
    async () => [], () => ({ people: {}, shifts: [], punches: [] }), () => ({ split: {}, byDay: {}, posNights: [] }), async () => {},
    async () => ({ ok: true, json: async () => ({ log: [] }) }), '', () => '', () => {}, () => {}, () => false,
    (eid, n) => n, () => [], (d) => '', () => { seen.applied = (seen.applied || 0) + 1; });
  return { run: fn, seen, env };
}

const quiet = longRead('tipsPullFromPos', { bumpDuring: false });
await quiet.run();
ok('a register pull on a sheet that did not move fills the grid', quiet.seen.merged === 1);
ok('…and saves the HOURS (only — 11/20/26: the register\'s employee number is not a Paychex ID, so the old ID list is no longer written)', quiet.seen.saved === 1);

const moved = longRead('tipsPullFromPos', { bumpDuring: true });
await moved.run();
ok('⛔ a register pull whose dates changed mid-read fills NOTHING IN', moved.seen.merged === 0);
ok('…writes nothing', moved.seen.saved === 0);
// NOT pinned to the wording — a check that goes red for a reword gets trimmed until it
// passes, and then it is not checking anything. The property is: he is told, and he is
// never told it worked.
ok('…and never claims success', !moved.seen.status.some(t => t.includes('✓')));
ok('…but does say something after the read, so he is not left thinking it filled in',
   moved.seen.status.length > quiet.seen.status.length - 1 && moved.seen.status.length >= 2);



// Same for the timesheet import, across the PDF parse and the tip-out log fetch.
// ⚠️ This function ends in a catch-all that turns any throw into "import failed", so a
// broken stub here would read as a quiet pass. The happy-path assertion below is what
// makes the moved-period one mean anything: if the stubs are wrong, it goes red too.
function importRun({ bumpDuring }) {
  const seen = { merged: 0, saved: 0, status: [] };
  const i = src.indexOf('async function tipsImportTimesheet(');
  const body = src.slice(i, src.indexOf('\n}', i) + 2);
  const env = { gen: 5 };
  const fn = new Function('env', 'seen', 'tipsSetStatus', 'tipsExtractPdfLines', 'tipsParseMicros',
    'tipsComputeBusserSplit', 'tipsMergeMicros', 'tipsSaveHoursSoon', 'tipsSaveEmpIds', 'tipsHTML',
    'activeTab', 'TIPS', 'document', 'tipsState', 'fetch', 'TIPS_LOG_URL', 'TIPS_LOG_KEY', 'tipsActive',
    'tipDays', 'tipDayLabel',
    `${body.replace(/\btipsGen\b/g, 'env.gen')}
     return tipsImportTimesheet;`
  )(env, seen,
    (t) => seen.status.push(String(t)),
    async () => { if (bumpDuring) env.gen++; return ['a line']; },
    () => ({ people: { 7: { name: 'Ann', jobs: {} } }, shifts: [{ n: 'Bob' }], punches: [] }),
    () => ({ split: { Bob: 40 }, byDay: {} }),
    () => { seen.merged++; return 1; },
    () => { seen.saved++; }, () => { seen.saved++; },
    () => '', 'other', 'tips',
    { getElementById: () => ({ set innerHTML(_v) {} }) },
    { punches: [] },
    async () => ({ ok: true, json: async () => ({ log: [{ pool: 40 }] }) }),
    '', () => 'k', () => false, () => [], (d) => '');
  return { run: () => fn({ files: [{ name: 't.pdf', arrayBuffer: async () => new ArrayBuffer(8) }], value: '' }), seen };
}
const imp = importRun({ bumpDuring: false });
await imp.run();
ok('a timesheet import on a sheet that did not move fills the grid', imp.seen.merged === 1);
ok('…and saves the HOURS (only — the MICROS employee number never becomes a Paychex ID)', imp.seen.saved === 1);
// ⛔ 11/20/26 (Jarvis/Vinny): the 11/2–11/15 CSV sent Ethan Browning as Worker 13 (his MICROS
// number) while Staff has 647. No importer may write a Paychex ID any more.
{
  const strip = (t) => t.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  for (const f of ['tipsMergeMicros', 'tipsImportTimesheet', 'tipsPullFromPos', 'tipsPullWeddingHours']) {
    const body = strip(lift(f));
    ok(`⛔ ${f} never writes a Paychex ID into the old list (no empIds assignment, no tipsSaveEmpIds)`, !/empIds\[[^\]]*\]\s*=/.test(body) && !/tipsSaveEmpIds\(/.test(body));
  }
}
ok('…and says it imported (if this is red the stubs below prove nothing)',
   imp.seen.status.join('|').includes('imported'));

const impMoved = importRun({ bumpDuring: true });
await impMoved.run();
ok('⛔ a timesheet import whose dates changed mid-parse fills NOTHING IN', impMoved.seen.merged === 0);
ok('…writes nothing', impMoved.seen.saved === 0);
ok('…and never claims it imported', !impMoved.seen.status.some(t => t.includes('✓')));
ok('…but does say something, so he is not left thinking it imported',
   impMoved.seen.status.length >= 2);


console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
