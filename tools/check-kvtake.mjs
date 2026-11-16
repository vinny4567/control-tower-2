// Does a FAILED read still keep what we hold?
//
//     node tools/check-kvtake.mjs
//
// This file exists because the guard that answers that question inverted itself and
// nobody noticed for weeks.
//
// posReloadEdits() fetches 24 ct_pos_* stores in one Promise.all and folds each result
// into the live state through one helper, `take(got, cur, empty)`. The whole safety of
// the reload path is in that one line: a dropped connection must mean "we learned
// nothing, keep what we hold", NEVER "the list is empty". Because the register REPLACES
// its entire overlay from each published blob, an empty list does not mean "no change" —
// it means UNDONE. Deleted items come back on the iPads, pending specials vanish, and
// the next 1400ms debounce publishes the wipe. Every layer reports success.
//
// It was written correctly, against a `kvGet` that returned null on failure. `kvGet` was
// later refactored to return KV_FAIL — a frozen OBJECT. Truthy. With no `.v`. So the
// failure branch started returning `empty`, and the ⛔ banner above the line went on
// asserting the old null contract, which is precisely why re-reading the block never
// caught it: the prose was checked, the sentinel was not.
//
// ⚠️ SO THIS CHECK IS BEHAVIOURAL ON PURPOSE. No regex over that line can express
// "a failure preserves the current value" — the bug WAS a correct-looking expression.
// The function is lifted and RUN against a real KV_FAIL.
//
// And it is NAME-AGNOSTIC, the hard way. The first draft of this file anchored on
// `function kvFailed(` — and renaming the guard to kvUnreadable turned it red, with the
// header still claiming it wouldn't. A check that screams for a rename trains whoever
// hits it to delete the clause, which is how the next real wipe gets shipped green.
// So instead: take() is read, every identifier it CALLS is discovered from its own
// source, and those definitions are lifted by whatever they are called today. Rename
// the guard and this file follows. Delete the guard and the fixtures below go red.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) { ok(`ANCHOR: ${what} still found in index.html`, false); return ''; }
  return m[0];
};

const failDef = grab(/const KV_FAIL=[^;]+;/, 'the KV_FAIL sentinel');
const takeDef = grab(/const take=\(got,cur,empty\)=>[^;]+;/, 'the take() helper');

// Whatever take() calls, lift it BY THE NAME IT USES TODAY. No name is hardcoded here.
const called = [...new Set([...takeDef.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))]
  .filter((n) => n !== 'take');
const deps = called.map((n) => {
  const m = src.match(new RegExp(`function ${n}\\([^)]*\\)\\{[^}]*\\}`));
  if (!m) ok(`ANCHOR: take() calls ${n}(), whose definition is still findable`, false);
  return m ? m[0] : '';
});
ok(`take() reaches for a failure guard rather than testing shape (calls: ${called.join(', ') || 'NONE'})`,
   called.length > 0);

let take = null;
if (failDef && takeDef) {
  try {
    take = new Function(`${failDef}\n${deps.join('\n')}\n${takeDef}\nreturn {take, KV_FAIL};`)();
  } catch (e) {
    ok('the lifted helpers evaluate: ' + e.message, false);
  }
}
ok('take(), its guard and KV_FAIL all lifted and running', !!(take && take.take));
if (!take || !take.take) { console.log(`\n${bad} FAILED`); process.exit(1); }

const { take: T, KV_FAIL } = take;
const HELD = ['deleted-item-A', 'deleted-item-B'];
const run = (got, cur, empty) => { try { return JSON.stringify(T(got, cur, empty)); } catch { return '(threw)'; } };

// ── THE BUG ITSELF. If this goes red, a failed fetch is wiping a live store again.
ok('a FAILED read (KV_FAIL) keeps what we hold — it does NOT return empty',
   run(KV_FAIL, HELD, []) === JSON.stringify(HELD));
ok('…the same for an object store, not just a list',
   run(KV_FAIL, { 'm:Pasta:Rotini': 1450 }, {}) === JSON.stringify({ 'm:Pasta:Rotini': 1450 }));

// ── WHY THE NAIVE VERSION LOOKED RIGHT. These two are the trap, pinned so that anyone
// rewriting take() by eye can see what the shape of the sentinel actually is.
ok('KV_FAIL is TRUTHY — so a bare `got ? … : cur` test takes the WRONG branch on failure',
   !!KV_FAIL === true);
ok('…and KV_FAIL carries no `.v`, so `got.v==null` is true on a failure',
   KV_FAIL.v === undefined);

// ── THE OTHER TWO OUTCOMES MUST STAY DISTINCT.
ok('a null result keeps what we hold too', run(null, HELD, []) === JSON.stringify(HELD));
ok('an undefined result keeps what we hold', run(undefined, HELD, []) === JSON.stringify(HELD));
ok('a PRESENT empty list is trusted — an intentional clear survives a reload',
   run({ v: [] }, HELD, []) === '[]');
ok('a present value is trusted', run({ v: ['x'] }, HELD, []) === JSON.stringify(['x']));
ok('a present record with no inner value falls back to the empty default',
   run({ v: null }, HELD, []) === '[]');
ok('a present empty object is trusted', run({ v: {} }, { a: 1 }, {}) === '{}');

// ── EVERY STORE MUST GO THROUGH IT. A 25th ct_pos_* store folded in by hand would be
// unguarded, and would look exactly like the 24 that are guarded.
const reload = (() => {
  const a = src.indexOf('const [r,g,ng,at,rt,pc,nm,gn,gd,ml,dm,cc,mn,dg,ce,co,io,ito,di,ni,sa,dr,nd,dd]');
  const b = src.indexOf('const changed=', a);
  return a >= 0 && b > a ? src.slice(a, b) : '';
})();
ok('ANCHOR: the reload block is still found', !!reload);
const fetches = (reload.match(/kvGet\('ct_pos_/g) || []).length;
const destructured = (reload.match(/const \[([^\]]+)\]/) || [, ''])[1].split(',').map((v) => v.trim()).filter(Boolean);
const takenVars = [...reload.matchAll(/\w+:\s*take\((\w+)\s*,/g)].map((m) => m[1]);
// Count by VARIABLE, not by call, and name the offenders. A bare count passes a
// copy-paste that takes one store twice and leaves another raw — which is how a store
// would go unguarded while the tally still looked right.
const untaken = destructured.filter((v) => !takenVars.includes(v));
const doubled = [...new Set(takenVars)].filter((v) => takenVars.filter((x) => x === v).length > 1);
ok(`one kvGet, one destructured name, one take() each (${fetches} stores)`,
   fetches > 0 && fetches === destructured.length && fetches === takenVars.length);
ok(`every fetched store is folded in through take()${untaken.length ? ' — RAW: ' + untaken.join(', ') : ''}`,
   destructured.length > 0 && untaken.length === 0);
ok(`…and none is taken twice${doubled.length ? ' — DOUBLED: ' + doubled.join(', ') : ''}`,
   doubled.length === 0);
ok('…and no store is folded in with the old `||[]` / `||{}` shortcut that started this',
   !/\b(?:r|g|ng|at|rt|pc|nm|gn|gd|ml|dm|cc|mn|dg|ce|co|io|ito|di|ni|sa|dr|nd|dd)\s*&&\s*\w+\.v\s*\)\s*\|\|/.test(reload));

// ── AND THE CALLERS THAT CAN DESTROY DATA STILL REFUSE ON A FAILURE. kvFailed() exists
// for them; a session that deleted the guard here would likely delete it there too.
const guard = called[0];
ok(`the destructive callers still guard on ${guard || 'the failure guard'}() before merging or pushing`,
   !!guard && (src.match(new RegExp(`${guard}\\(`, 'g')) || []).length >= 6);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
