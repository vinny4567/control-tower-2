// ONE JOB, ONE ROW.
//
//     node tools/check-jobnames.mjs
//
// Vinny had two "Food Runner" rows and neither would delete. They were not the same
// string — one carried a trailing space — and the × only ever removed a default rate,
// so a row backed by PEOPLE or by the standard job list came straight back.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (what, cond) => { if (!cond) bad++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

// Pull the real helpers out of the page and run them, rather than reading the source
// and hoping. STAFF_JOBS is what the page uses, so the fold is exercised as shipped.
const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  const a = src.indexOf('\nfunction ', i + 1), b = src.indexOf('\nasync function ', i + 1);
  return src.slice(i, Math.min(a < 0 ? src.length : a, b < 0 ? src.length : b));
};
const STAFF_JOBS = JSON.parse(src.match(/const STAFF_JOBS=(\[[^\]]+\])/)[1].replace(/'/g, '"'));
const ctx = {};
new Function('ctx', `
  const STAFF_JOBS = ${JSON.stringify(STAFF_JOBS)};
  ${src.match(/const staffJobCanon=[^\n]+/)[0]}
  ${src.match(/const staffJobKey=[^\n]+/)[0]}
  // live view onto whatever the test has set, so the fixture can be swapped per case
  const staffS = {
    get jobs(){ return ctx.staffS.jobs; }, set jobs(v){ ctx.staffS.jobs = v; },
    get people(){ return ctx.staffS.people; },
  };
  function staffJobs(){return staffS.jobs||(staffS.jobs={})}
  ${grab('staffFoldJobNames')}
  ctx.fold = staffFoldJobNames;
  ctx.key = staffJobKey;
  ctx.canon = staffJobCanon;
`)(ctx);

// ---- the names that read identically ----------------------------------------
ok('a trailing space is the same job', ctx.key('Food Runner ') === ctx.key('Food Runner'));
ok('so is a different case', ctx.key('food runner') === ctx.key('Food Runner'));
ok('so is a double space', ctx.key('Food  Runner') === ctx.key('Food Runner'));
ok('two genuinely different jobs stay different', ctx.key('Server') !== ctx.key('Busser'));

// ---- the fold ----------------------------------------------------------------
ctx.staffS = {
  jobs: { 'Food Runner ': { rate: 15, at: 5 }, 'Food Runner': {} },
  people: {
    a: { key: 'a', positions: ['Food Runner '], rates: { 'Food Runner ': 16 } },
    b: { key: 'b', positions: ['food runner', 'Server'], rates: {} },
  },
};
ok('the fold reports that it changed something', ctx.fold() === true);
const j = ctx.staffS.jobs;
ok('one spelling survives in the job list', Object.keys(j).length === 1);
ok('and it is the standard one', Object.keys(j)[0] === 'Food Runner');
ok('⚠️ the rate is NOT lost to the blank duplicate', j['Food Runner'].rate === 15);
ok("a person's own rate moves to the surviving spelling",
   ctx.staffS.people.a.rates['Food Runner'] === 16 &&
   !('Food Runner ' in ctx.staffS.people.a.rates));
ok('their position does too', ctx.staffS.people.a.positions[0] === 'Food Runner');
ok('a lower-case spelling on somebody else folds as well',
   ctx.staffS.people.b.positions.includes('Food Runner'));
ok('and an unrelated job is untouched', ctx.staffS.people.b.positions.includes('Server'));
ok('running it again changes nothing', ctx.fold() === false);

// ---- the × tells the truth ----------------------------------------------------
const del = grab('staffDelJobRow');
ok('it knows a standard job cannot be removed', /STAFF_JOBS\.some/.test(del));
ok('it counts who is actually on the job', /staffS\.people/.test(del));
ok('removing a held job takes it off those people too',
   /p\.positions=p\.positions\.filter/.test(del) && /delete p\.rates\[n\]/.test(del));
ok('it clears EVERY spelling, not just the one clicked', /spellings\.forEach/.test(del));
ok('and republishes, so the mini stops seeing the old key',
   /staffPublishJobRates\(\)/.test(del));

// ---- the override box on a person --------------------------------------------
// It shows the job's default when empty, and empty has to STAY a normal state.
// ⚠️ `const tag=` appears earlier in the file for something else, so search forward
// from rateRow or the slice comes out empty and every assertion below it passes by
// accident on an empty string.
const rowAt = src.indexOf('const rateRow=(job)=>');
const row = src.slice(rowAt, src.indexOf('const tag=(t,c)=>', rowAt));
ok('the row markup was actually found', row.length > 200 && row.includes('staffEdit'));
ok('the box shows the default as a placeholder', /placeholder="\$\{def>0\?/.test(row));
ok('⚠️ and NOT as a prefilled value — an override must be distinguishable from a default',
   /value="\$\{own>0\?/.test(row) && !/value="\$\{(own\|\||def)/.test(row));
ok('the column is labelled OVERRIDE', /">OVERRIDE</.test(src));

const edit = src.slice(src.indexOf("else if(f.startsWith('rate:'))"), src.indexOf("else if(f.startsWith('rate:'))") + 900);
ok('emptying the box does not delete the job off the person',
   !/delete p\.rates\[job\]/.test(edit));
ok('it falls back to the default instead', /p\.rates\[job\]=\(isFinite/.test(edit));
ok('so there is a separate way to take a job away', src.includes('function staffDelPersonJob('));
const dpj = src.slice(src.indexOf('function staffDelPersonJob('), src.indexOf('function staffAddJob('));
ok('which removes the override with it', /delete p\.rates\[n\]/.test(dpj));
ok('and every spelling of that job, not just the one shown', /staffJobKey\(n\)===kk/.test(dpj));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
