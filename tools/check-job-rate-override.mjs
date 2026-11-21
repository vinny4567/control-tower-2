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
  // Prefer the `async function NAME(` form when it exists — searching for the bare
  // `function NAME(` alone matches partway INTO an async declaration (right after the
  // `async ` keyword) and silently drops `async`, which then makes every `await` inside
  // a SyntaxError in the lifted copy. staffReconcileJobNums is async; this bit once.
  let i = src.indexOf('async function ' + name + '(');
  if (i === -1) i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
};
const STAFF_JOB_NUMS = JSON.parse(
  src.match(/const STAFF_JOB_NUMS=(\{[^}]+\})/)[1]
    .replace(/(\w[\w ]*|'[^']+')\s*:/g, (_, k) => JSON.stringify(k.replace(/^'|'$/g, '')) + ':')
);
ok('STAFF_JOB_NUMS was actually parsed (sanity on the regex above)', STAFF_JOB_NUMS.Server === 200);
const STAFF_JOBS = JSON.parse(src.match(/const STAFF_JOBS=(\[[^\]]+\])/)[1].replace(/'/g, '"'));
const JOBKEY = src.match(/const staffJobCanon=[^\n]+/)[0] + '\n' + src.match(/const staffJobKey=[^\n]+/)[0];

// Lifted with the real STAFF_JOB_NUMS and a swappable staffS, same pattern as
// check-jobnames.mjs.
const run = (people, jobs = {}) => {
  const ctx = {};
  new Function('ctx', `
    const STAFF_JOB_NUMS = ${JSON.stringify(STAFF_JOB_NUMS)};
    const STAFF_JOBS = ${JSON.stringify(STAFF_JOBS)};
    ${JOBKEY}
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

// ── A SAVE THAT TOUCHES AN OVERRIDE REACHES THE MINI (11/20/26 rewrite) ────────────────
// staffEdit's rate:<job> branch now writes straight through staffWriteOp — the mini's
// own `update` op — rather than the old local-save-then-debounced-push. staffPushMerged
// (the old thing that used to republish ct_job_rates on every push) is gone entirely;
// ct_job_rates publishing now rides staffReconcileJobNums, exercised directly below.
const editFn = grab('staffEdit');
const rateBranch = editFn.slice(editFn.indexOf("f.startsWith('rate:')"), editFn.indexOf("if(f==='paychex')"));
ok('⛔ the rate:<job> branch actually persists — writes the FULL merged rates object through staffWriteOp',
   /staffWriteOp\(\{op:'update',pid:p\.pid,patch:\{rates:p\.rates\}\}\)/.test(rateBranch));
ok('⛔ staffPushMerged is gone — nothing in this file still calls it', !/staffPushMerged/.test(src));

// ── ONE WRITER, SAME SHAPE AS THE JOB LOOP ──────────────────────────────────────────────
const fn = grab('staffJobRatesForMini');
ok('⛔ exactly one function publishes ct_job_rates',
   (src.match(/function staffJobRatesForMini\(/g) || []).length === 1);
ok('the per-person loop reuses STAFF_JOB_NUMS, not a second copy of the job-number map',
   (fn.match(/STAFF_JOB_NUMS\[/g) || []).length === 2);


// ── Jarvis, 11/19 late: does the drift check actually fire, and does it count the new
// emp: keys as drift? ────────────────────────────────────────────────────────────────
// Answered by RUNNING staffReconcileJobNums against a mini blob shaped exactly like the
// real one he reported (292 bytes, no emp: keys, last write 11/17) and a device that has
// person overrides to publish.
const reconcile = grab('staffReconcileJobNums');
const runReconcile = (people, jobs, miniHas) => {
  const ctx = {};
  new Function('ctx', `
    const STAFF_JOB_NUMS = ${JSON.stringify(STAFF_JOB_NUMS)};
    const STAFF_JOBS = ${JSON.stringify(STAFF_JOBS)};
    ${JOBKEY}
    const staffS = { people: ${JSON.stringify(people)}, jobs: ${JSON.stringify(jobs)} };
    function staffJobs(){return staffS.jobs||(staffS.jobs={})}
    ${grab('staffJobRatesForMini')}
    let kvFailed = () => false;
    let published = null;
    function staffPublishJobRates(){ published = staffJobRatesForMini(); }
    async function kvGet(key){ ctx.read = key; return ${JSON.stringify(miniHas)}; }
    ${reconcile}
    ctx.run = staffReconcileJobNums;
    ctx.getPublished = () => published;
  `)(ctx);
  return ctx;
};

// The exact shape Jarvis reported: a stale blob with no emp: keys, only job-level rates.
const staleMini = { v: { Server: 1400, '200': 1400 }, at: 1794958645453 };
let rc = runReconcile(
  { p1: { register: { emp_id: 42 }, rates: { Server: 17.5 } } },
  { Server: { rate: 14 } },
  staleMini,
);
await rc.run();
ok('⛔ a mini blob missing the new emp: keys IS counted as drift', rc.getPublished() !== null);
ok('…and republishing actually includes the override', rc.getPublished()['emp:42|Server'] === 1750);

// The OTHER direction — don't republish a mini that already agrees, including on the
// emp: keys (proves this isn't just "always republish once overrides exist").
const freshMini = { v: { Server: 1400, '200': 1400, 'emp:42|Server': 1750, 'emp:42|200': 1750 }, at: 999 };
rc = runReconcile(
  { p1: { register: { emp_id: 42 }, rates: { Server: 17.5 } } },
  { Server: { rate: 14 } },
  freshMini,
);
await rc.run();
ok('a mini that already matches, emp: keys included, is left alone', rc.getPublished() === null);

// ── CUTOVER #2 (Jarvis, 11/20/26): Day Party / Wedding Setup / Training ─────────────────────
// The register's clock-in picker punches these exact names; the mini's rateOf matches the job
// NAME exactly. So the standard spelling must be published even when the rate was typed under
// another one (the live store has 'training').
ok('⛔ the three jobs are standard jobs, spelled exactly "Day Party", "Wedding Setup", "Training"',
   ['Day Party', 'Wedding Setup', 'Training'].every(j => STAFF_JOBS.includes(j)) && !STAFF_JOBS.includes('training') && !STAFF_JOBS.includes('WeddingSetup'));
out = run({}, { training: { rate: 12 }, 'Day Party': { rate: 18 } });
ok('⛔ a rate stored as "training" is published as "Training" too — the spelling the register punches', out.Training === 1200);
ok('…and the stored "training" key stays published (nothing that matched it stops matching)', out.training === 1200);
ok('"Day Party" publishes under its own spelling, once', out['Day Party'] === 1800 && Object.keys(out).filter(k => /day party/i.test(k)).length === 1);
out = run({}, { training: { rate: 12 }, Training: { rate: 14 } });
ok('⛔ an exact "Training" rate wins over a variant\'s — never overwritten by the lowercase one', out.Training === 1400 && out.training === 1200);
out = run({}, { training: {} });
ok('a variant with NO rate publishes nothing under either spelling (missing stays missing, never 0)', !('Training' in out) && !('training' in out));
out = run({ p1: { register: { emp_id: 42 }, rates: { training: 13 } } });
ok('⛔ a person\'s override under "training" is published as emp:42|Training too', out['emp:42|Training'] === 1300 && out['emp:42|training'] === 1300);
out = run({ p1: { register: { emp_id: 42 }, rates: { training: 13, Training: 15 } } });
ok('…and the person\'s exact "Training" override wins', out['emp:42|Training'] === 1500);
out = run({}, { 'Server ': { rate: 20 } });
ok('the standard-spelling publish is generic: a stray-space "Server " also reaches the mini as "Server"', out.Server === 2000);

// ── Does it fire WITHOUT a save click — on ordinary page load? ─────────────────────────
// staffLoad() is the only caller of staffReconcileJobNums(), and until this fix it ran
// ONLY when someone navigated into POS → Staff or POS → Job rates (posSec/posJobRatesHTML/
// posStaffHTML) — not on an ordinary boot landing on, say, the Dashboard. Fixed by adding
// it to the SAME unconditional boot block wedMetaPull() already uses for exactly this
// reason ("tiny + holds the customer-email links — always sync at boot").
const bootBlock = (() => {
  const i = src.indexOf("window.addEventListener('load',()=>{setTimeout(()=>{");
  const j = src.indexOf('},800)});', i);
  return src.slice(i, j);
})();
ok('⛔ staffLoad() now runs in the SAME unconditional boot block as wedMetaPull — fires on every open, not just a specific POS sub-tab',
   /wedMetaPull\(\);[\s\S]*staffLoad\(\);/.test(bootBlock));
ok('…staffLoad() self-guards (idempotent), so this is free on every normal boot',
   grab('staffLoad').includes('if(staffS.loaded&&!force)return;'));
// ⚠️ 11/20/26 — reconcile now runs ONLY on the mini-success path, deliberately NOT in the
// read-only cloud-mirror fallback: republishing ct_job_rates from a possibly-stale offline
// copy could overwrite the mini's own correct rates with outdated ones.
ok('…and staffLoad() calls the reconcile right after a successful mini read, before returning',
   /staffReconcileJobNums\(\);\s*\n\s*return;/.test(grab('staffLoad')));


console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
