// A person's own rate, when one is set, has to reach the mini — RUN, not read.
//
//     node tools/check-job-rate-override.mjs
//
// Vinny, on cut-roster: "yes the persons overrided rate should win over" the job rate.
// This file is the Watch Tower half: staffJobRatesForMini has to PUBLISH each person's
// override, keyed by their register emp_id, so the mini (which decides who wins) can
// even see it. The mini ignores emp: keys until its own half ships — so a wrong key
// shape here would sit silently wrong for however long that gap lasts.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
};
const STAFF_JOB_NUMS = JSON.parse(
  src.match(/const STAFF_JOB_NUMS=(\{[^}]+\})/)[1]
    .replace(/(\w[\w ]*|'[^']+')\s*:/g, (_, k) => JSON.stringify(k.replace(/^'|'$/g, '')) + ':')
);
ok('STAFF_JOB_NUMS was actually parsed (sanity on the regex above)', STAFF_JOB_NUMS.Server === 200);

// Lifted with the real STAFF_JOB_NUMS and a swappable staffS, same pattern as
// check-jobnames.mjs.
const run = (people, jobs = {}) => {
  const ctx = {};
  new Function('ctx', `
    const STAFF_JOB_NUMS = ${JSON.stringify(STAFF_JOB_NUMS)};
    const staffS = { people: ${JSON.stringify(people)}, jobs: ${JSON.stringify(jobs)} };
    function staffJobs(){return staffS.jobs||(staffS.jobs={})}
    ${grab('staffJobRatesForMini')}
    ctx.out = staffJobRatesForMini();
  `)(ctx);
  return ctx.out;
};

// ── THE CASE VINNY ASKED FOR ────────────────────────────────────────────────────────────
let out = run({ p1: { register: { emp_id: 42 }, rates: { Server: 17.5 } } });
ok('⛔ a person with an emp_id and a positive override publishes emp:<id>|<job>',
   out['emp:42|Server'] === 1750);
ok('⛔ …and emp:<id>|<num> too, since Server has a register number',
   out['emp:42|200'] === 1750);

// ── MISSING STAYS MISSING, NEVER 0 (Jarvis's exact words) ──────────────────────────────
out = run({ p1: { register: { emp_id: 42 }, rates: { Server: 0 } } });
ok('⛔ a 0 override writes NOTHING — not emp:42|Server:0', !('emp:42|Server' in out));
out = run({ p1: { register: { emp_id: 42 }, rates: {} } });
ok('⛔ no override at all writes nothing for that person', Object.keys(out).length === 0);
out = run({ p1: { register: { emp_id: 42 }, rates: { Server: -5 } } });
ok('⛔ a negative override (should never happen, but) writes nothing either', !('emp:42|Server' in out));

// ── NOT ON THE REGISTER = NO SHIFT TO OVERRIDE ──────────────────────────────────────────
out = run({ p1: { rates: { Server: 17.5 } } });  // no .register at all
ok('⛔ a person with no register object publishes nothing (nothing to key it to)',
   Object.keys(out).length === 0);
out = run({ p1: { register: {}, rates: { Server: 17.5 } } });  // register object, no emp_id
ok('⛔ a register object with no emp_id publishes nothing either', Object.keys(out).length === 0);

// ── A JOB WITH NO REGISTER NUMBER (Setup) STILL PUBLISHES BY NAME ──────────────────────
out = run({ p1: { register: { emp_id: 42 }, rates: { Setup: 22 } } });
ok('a job with no STAFF_JOB_NUMS entry still publishes emp:<id>|<job>', out['emp:42|Setup'] === 2200);
ok('…and writes no bare-number key for it', Object.keys(out).filter(k => /^emp:42\|\d+$/.test(k)).length === 0);

// ── SEVERAL PEOPLE, SEVERAL JOBS, NONE STEP ON EACH OTHER ──────────────────────────────
out = run({
  p1: { register: { emp_id: 10 }, rates: { Server: 15, Bartender: 20 } },
  p2: { register: { emp_id: 11 }, rates: { Busser: 12.5 } },
});
ok('person 1’s two jobs both land', out['emp:10|Server'] === 1500 && out['emp:10|Bartender'] === 2000);
ok('…with their register numbers too', out['emp:10|200'] === 1500 && out['emp:10|201'] === 2000);
ok('person 2 is independent of person 1', out['emp:11|Busser'] === 1250 && out['emp:11|203'] === 1250);
ok('⛔ person 2 never shows up under person 1’s id', !('emp:10|Busser' in out));

// ── THE JOB-LEVEL RATES STILL PUBLISH ALONGSIDE THE NEW PER-PERSON ONES ────────────────
out = run({ p1: { register: { emp_id: 42 }, rates: { Server: 17.5 } } }, { Server: { rate: 14 } });
ok('the job-level rate is untouched by this change', out.Server === 1400 && out['200'] === 1400);
ok('…and the per-person override still publishes alongside it, under its OWN key',
   out['emp:42|Server'] === 1750);

// ── A SAVE THAT TOUCHES AN OVERRIDE REPUBLISHES ct_job_rates (Jarvis's requirement) ────
// staffEdit's rate:<job> branch, where an override is actually typed, must fall through
// to the same staffTouch/staffSave every other field edit uses — not a special early
// return that skips the republish path staffPublishJobRates rides on.
const editFn = grab('staffEdit');
const rateBranch = editFn.slice(editFn.indexOf("f.startsWith('rate:')"), editFn.indexOf("else if(f==='paychex')"));
ok('⛔ the rate:<job> branch does not return early — it falls through to staffSave()',
   !/return\s*;/.test(rateBranch));
ok('…and staffEdit itself ends in staffTouch + staffSave for every field, override included',
   /staffTouch\(p\);\s*\n\s*staffSave\(\);/.test(editFn));
const pushMerged = grab('staffPushMerged');
ok('⛔ staffPushMerged (what staffSave debounces into) calls staffPublishJobRates on every push',
   /staffPublishJobRates\(\);/.test(pushMerged.slice(pushMerged.lastIndexOf('kvPush('))));

// ── ONE WRITER, SAME SHAPE AS THE JOB LOOP ──────────────────────────────────────────────
const fn = grab('staffJobRatesForMini');
ok('⛔ exactly one function publishes ct_job_rates',
   (src.match(/function staffJobRatesForMini\(/g) || []).length === 1);
ok('the per-person loop reuses STAFF_JOB_NUMS, not a second copy of the job-number map',
   (fn.match(/STAFF_JOB_NUMS\[/g) || []).length === 2);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
