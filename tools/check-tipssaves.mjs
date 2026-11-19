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
     ${lift('tipsSaveEmpIds').replace(/tipsState/g, 'env.tipsState')}
     ${lift('tipsSaveMoves').replace(/tipsState/g, 'env.tipsState')}
     ${lift('tipsSaveSoon').replace(/tipsState/g, 'env.tipsState').replace(/tipsGen/g, 'env.gen')}
     ${lift('tipEmpIdSet').replace(/tipsState/g, 'env.tipsState')}
     ${lift('tipsSaveHoursSoon').replace(/tipsState/g, 'env.tipsState').replace(/tipsGen/g, 'env.gen')}
     return { tipsSaveBlocked, tipsSaveEmpIds, tipsSaveMoves, tipsSaveSoon, tipEmpIdSet, tipsSaveHoursSoon };`
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
w.tipsSaveMoves();
ok('⛔ nor do the moves', w.env.writes.length === 0);

// ⛔ THE PAYCHEX ONE. On a screen that failed to load, empIds is empty — typing one ID used
// to write a map containing ONLY that ID over every worker in the business, after which
// every row is quietly left out of the payroll file.
w = world(failed());
w.tipEmpIdSet('Ann', '456');
ok('⛔ typing a Paychex ID on a screen that failed to load writes nothing', w.env.writes.length === 0);
ok('…and does not even change what is in memory',
   Object.keys(w.env.tipsState.empIds).length === 0);
ok('…and says so', w.env.status.join('|').includes('not saved'));

// ── half-loaded is not loaded ───────────────────────────────────────────────
w = world({ ...good(), loading: true, cells: {} });
w.tipsSaveSoon(); w.fire();
ok('⛔ a sheet still loading does not write its half-empty self back', w.env.writes.length === 0);
w = world({ ...good(), loading: true, empIds: {} });
w.tipsSaveEmpIds();
ok('⛔ …nor the worker IDs', w.env.writes.length === 0);
ok('…and the refusal is visible, not silent', w.env.status.join('|').includes('not saved'));

// ── the normal path still works ─────────────────────────────────────────────
w = world(good());
ok('typing an ID on a good screen saves it', (w.tipEmpIdSet('Bob', '789'), w.env.writes.length === 1));
ok('…and keeps everyone else', w.env.tipsState.empIds.Ann === '123' && w.env.tipsState.empIds.Bob === '789');
w = world(good());
w.tipsSaveMoves();
ok('moves still save on a good screen', w.env.writes.length === 1 && w.env.writes[0].key === 'ct_tips_moves');
w = world(good());
ok('tipsSaveEmpIds reports success', w.tipsSaveEmpIds() === true);
ok('…and refuses with false when it cannot', world(failed()).tipsSaveEmpIds() === false);

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

// ── ONE writer for the worker IDs ───────────────────────────────────────────
// It used to be written from three places and the one that mattered had no guard. Three
// copies of a rule is how one ends up missing it.
const raw = (src.match(/kvPush\('ct_emp_ids'/g) || []).length;
ok('⛔ exactly one place writes the worker-ID map', raw === 1);
ok('…and it is inside the guarded saver',
   lift('tipsSaveEmpIds').includes("kvPush('ct_emp_ids'"));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
