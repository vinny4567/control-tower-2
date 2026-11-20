// A PERSON'S PERMANENT ID.
//
//     node tools/check-personid.mjs
//
// ⚠️ The staff key is the lowercased name. That is fine for looking somebody up and
// fatal as an identity: fix a spelling and the key changes, and every hour already filed
// under the old one silently stops reaching that person's pay. Priscilla Lagace is the
// standing case — MICROS exports her as "Priscill" and payroll rewrites it every period.
// Two Mike Smiths would share one key as well, and payroll would merge them silently.
//
// So `pid` is minted once, stored, never regenerated, never reused, and meaningless by
// design. Everything below is a way it could start to drift anyway.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

// Bounded to staffStripSignin, not the far-off staffMergeOne — code inserted between
// staffBackfillPids and staffMergeOne (staffStripSignin, 11/20) was swept into this slice
// under the old anchor, and its own `Object.keys(people)` tripped the NAME/key regex below
// on the built-in method name, not a real leak.
const mint = src.slice(src.indexOf('function staffNewPid('), src.indexOf('function staffStripSignin('));
ok('an id is generated, not derived', /randomUUID|Math\.random/.test(mint));
// ⚠️ THE WHOLE POINT. Anything drawn from the name is the bug we are fixing.
ok('⚠️ nothing about the NAME goes into it', !/name|key/.test(mint.replace(/\/\/.*$/gm, '')));
ok('it is marked so a person can see what it is', /'p_'/.test(mint));
ok('rows that predate ids get one', /function staffBackfillPids\(\)/.test(mint));
ok('and only where one is missing', /if \(p && !p\.pid\)/.test(mint));

// ⚠️ TWO DEVICES, ONE PERSON, TWO MINTED IDS. Newest-wins would flap forever, and a
// flapping identity is the exact failure this exists to prevent.
const merge = src.slice(src.indexOf('function staffMergeOne('), src.indexOf('function staffMerge('));
ok('⚠️ the merge resolves two ids deterministically, not by recency',
   /pidA < pidB \? pidA : pidB/.test(merge));
ok('and never drops an id for nothing', /\(pidA \|\| pidB \|\| undefined\)/.test(merge));
ok('an id is not invented by the merge itself', /if \(!out\.pid\) delete out\.pid/.test(merge));

// ⚠️ 11/20/26 — THE MINI IS THE SOLE WRITER NOW, so staffLoad has nothing left to backfill
// OR merge: staffBackfillPids has ZERO callers (the mini mints a pid on create), and
// staffMerge/staffMergeJobs are unused for the same reason — there is only one copy of the
// truth any more. Both assertions below are the inverse of what this file asserted before
// the switch; see [[project_employee_database]] for the full rewrite.
const load = src.slice(src.indexOf('async function staffLoad('), src.indexOf('function staffMirrorToCloud'));
ok('⛔ staffLoad no longer calls staffBackfillPids — the mini mints the pid now, this page never does',
   !/staffBackfillPids\(\)/.test(load));
ok('⛔ staffLoad no longer calls staffMerge/staffMergeJobs — there is nothing left to reconcile against',
   !/staffMerge\(|staffMergeJobs\(/.test(load));
ok('staffBackfillPids itself is left in place, unused, rather than deleted mid-rewrite',
   /function staffBackfillPids\(\)/.test(src));

// A brand new person gets one at creation, not on some later pass.
ok('a row created by a scheduler pull is born with an id', /pid:staffNewPid\(\),name:r\.name/.test(src));
ok('and an older row picks one up on the way through', /if\(!p\.pid\)p\.pid=staffNewPid\(\)/.test(src));

// ---- the id actually behaves ------------------------------------------------------
// `self` is the browser's global; give it one so the function runs unchanged here.
const fn = new Function('self', mint.slice(mint.indexOf('function staffNewPid')) + '\nreturn staffNewPid;')(globalThis);
const seen = new Set();
for (let i = 0; i < 5000; i++) seen.add(fn());
ok('5000 ids, no collisions', seen.size === 5000);
ok('and they all look like ids', [...seen].every((x) => /^p_[a-z0-9]{8,}$/.test(x)));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
