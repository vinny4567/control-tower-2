// THE THREE NUMBERS ARE THE WAY AROUND THE LIST.
//
//     node tools/check-staff-filter.mjs
//
// Each card filters the list to the people it counts the opposite of — the count says
// how many are fine, and the question being asked is who is not. ⚠️ Vinny hit this: with
// only ONE card clickable, filtering was a one-way trip, and there was no way back to
// everybody.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

for (const [what, call] of [
  ['PEOPLE clears the filter', "staffFilter(null)"],
  ['ON THE SCHEDULE filters to who is not', "staffFilter('noschedule')"],
  ['NO PAYCHEX ID filters to them', "staffFilter('noid')"],
]) ok(what, src.includes(call));

// ⚠️ THE WAY OUT MUST NOT TOGGLE. PEOPLE means "show everybody"; as a plain toggle,
// pressing it a second time would have turned the filter back on.
const fn = src.slice(src.indexOf('function staffFilter('), src.indexOf('function staffRows('));
ok('⚠️ pressing PEOPLE always ends with no filter, pressed twice or not',
   /mode==null\?null:/.test(fn));
ok('the others still toggle themselves off', /staffS\.filter===mode\?null:mode/.test(fn));
ok('opening a person does not survive the change of view', /staffS\.open=null/.test(fn));
ok('and it keeps your scroll place', /posKeepScroll/.test(fn));

// Both filters have to actually filter.
const rows = src.slice(src.indexOf('function staffRows('), src.indexOf('function staffSearch('));
ok("'noschedule' narrows to payroll-only", /filter==='noschedule'\)rows=rows\.filter\(staffPayrollOnly\)/.test(rows));
ok("'noid' narrows to people with no Paychex ID", /filter==='noid'\)rows=rows\.filter\(p=>!p\.paychex_id\)/.test(rows));

// ⚠️ SELECTED AND MERELY CLICKABLE ARE DIFFERENT MARKS. When they were the same, the
// filtered card looked like the ones that would clear it.
const stat = src.slice(src.indexOf('function posStat('), src.indexOf('const POS_GAP_COLOR'));
ok('⚠️ a selected card is marked differently from a clickable one',
   /on\?';border-color/.test(stat) && /click\?';cursor:pointer':''/.test(stat));
ok('a card with nothing to show is not clickable', /noId\?"staffFilter\('noid'\)":''/.test(src));

// Filtering to nobody has to say which question it answered.
ok('an empty schedule filter says so', /Everybody has a scheduler account/.test(src));
ok('an empty ID filter says so too', /Everybody has a Paychex ID/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
