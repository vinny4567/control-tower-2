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

const mint = src.slice(src.indexOf('function staffNewPid('), src.indexOf('function staffMergeOne('));
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

// ⚠️ ORDER MATTERS ON LOAD. Backfilling before the merge would mint an id here for
// somebody the cloud already has one for — churn, on the one field that must not churn.
const load = src.slice(src.indexOf('async function staffLoad('), src.indexOf('let staffPushTimer'));
ok('⚠️ the backfill runs AFTER the cloud merge',
   load.indexOf('staffMerge(') < load.indexOf('staffBackfillPids()'));
ok('and only writes when something was actually minted', /if\(staffBackfillPids\(\)\)staffSave\(\)/.test(load));

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
