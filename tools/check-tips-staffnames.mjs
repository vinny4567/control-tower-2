// TIPS-TAB NAMES COME FROM STAFF. DISPLAY ONLY.
//
//     node tools/check-tips-staffnames.mjs
//
// Vinny, with screenshots: "names and spelling has to come from the back office master
// list, for example maria has the wrong spelling on the tip sheet but the right on the
// staff sheet." The Tips roster had "Maria S Ruiz"; Staff has "Maria Ruiz". Every name the
// Tips tab DISPLAYS now resolves through staffKeyOf + staffS.aliases to the Staff record
// and shows ITS name — a mismatch shows the raw name with a visible mark, never silently.
//
// ⛔ THE ONE RULE THIS FILE EXISTS TO GUARD: it is DISPLAY ONLY. The keys period data is
// STORED under (ct_hours/ct_tips/ct_emp_ids, all by name) are the LEAVE-IT money zone —
// nothing here may ever change what a lookup or a write uses as a key, only what prints.
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

// ── lift the real staffDisplayName/staffDisplayMark + their real deps, and RUN them ──
let R = null;
try {
  R = new Function(`
    let staffS = { people: {}, aliases: {} };
    ${grab('staffKeyOf')}
    ${grab('staffDisplayName')}
    ${grab('staffDisplayMark')}
    return { staffDisplayName, staffDisplayMark, setStaff: (people, aliases) => { staffS = { people, aliases: aliases || {} }; } };
  `)();
} catch (e) { ok('staffDisplayName/staffDisplayMark lift and run: ' + e.message, false); }

if (R) {
  // THE WORKED EXAMPLE FROM THE REQUEST ITSELF.
  R.setStaff({ 'maria ruiz': { key: 'maria ruiz', name: 'Maria Ruiz' } });
  const maria = R.staffDisplayName('Maria S Ruiz');
  ok('⛔ "Maria S Ruiz" (Tips\' own spelling, middle initial) resolves to Staff\'s "Maria Ruiz"',
     maria.name === 'Maria Ruiz' && maria.matched === true);
  ok('…and the mark is empty for a real match', R.staffDisplayMark(maria.matched) === '');

  // A person whose Staff record carries a DIFFERENT spelling entirely (merged/renamed).
  R.setStaff({ 'priscilla lagace': { key: 'priscilla lagace', name: 'Priscilla Lagace' } },
             { 'priscilla la gace': 'priscilla lagace', 'priscill lagace': 'priscilla lagace' });
  ok('a MICROS spelling ("Priscill Lagace") resolves through the alias chain to Staff\'s name',
     R.staffDisplayName('Priscill Lagace').name === 'Priscilla Lagace');
  ok('…and so does the Tips roster\'s own former spelling ("Priscilla La Gace")',
     R.staffDisplayName('Priscilla La Gace').name === 'Priscilla Lagace');

  // NO MATCH: shown as-is, flagged — never hidden, never guessed.
  R.setStaff({ 'maria ruiz': { key: 'maria ruiz', name: 'Maria Ruiz' } });
  const ghost = R.staffDisplayName('Totally Unknown Person');
  ok('⛔ a name with no Staff match is shown AS-IS, not blanked or substituted',
     ghost.name === 'Totally Unknown Person' && ghost.matched === false);
  ok('…and the mark is non-empty — visible, not silent', R.staffDisplayMark(ghost.matched).length > 0);
  ok('…the mark says plainly what it means', /not on the staff list/i.test(R.staffDisplayMark(false)));

  // A removed/tombstoned Staff record still resolves — a departed person's historical
  // period data should still show their real name, not get flagged as unknown.
  R.setStaff({ 'old server': { key: 'old server', name: 'Old Server', removed: { at: 1 } } });
  ok('a REMOVED Staff record still resolves for display (history keeps the real name)',
     R.staffDisplayName('Old Server').name === 'Old Server' && R.staffDisplayName('Old Server').matched === true);

  // Edge cases that must not throw.
  R.setStaff({});
  ok('an empty/blank name does not throw and is reported unmatched', R.staffDisplayName('').matched === false);
  ok('a name that normalises to nothing (e.g. all single letters) does not throw',
     R.staffDisplayName('A B').matched === false);
  R.setStaff(undefined);
  ok('no Staff data loaded yet (staffS.people undefined) falls back to the raw name, never throws', (() => {
    try { const r = R.staffDisplayName('Anybody'); return r.name === 'Anybody' && r.matched === false; }
    catch (e) { return false; }
  })());

  // The alias must point at a record that ACTUALLY EXISTS — a dangling alias (the keeper
  // was removed/renamed again) must not crash or silently invent a name.
  R.setStaff({}, { 'ghost key': 'nobody home' });
  ok('an alias pointing at a record that no longer exists falls back to the raw name safely',
     R.staffDisplayName('Ghost Key').matched === false);
}

// ── every call site passes the STORAGE name to logic/keys and only swaps `.name` for text ──
const tipsHTMLFn = grab('tipsHTML');
ok('tipsHTML resolves the row label through staffDisplayName', /staffDisplayMark\(disp\.matched,name\)/.test(tipsHTMLFn) && /staffDisplayName\(name\)/.test(tipsHTMLFn));
ok('⛔ the "Busser Pool" row is NEVER run through the Staff lookup (it is not a person)',
   /isPool\?\{name,matched:true\}:staffDisplayName\(name\)/.test(tipsHTMLFn));
ok('⛔ the row\'s department dropdown still keys off the RAW name, not the resolved display name',
   // 11/20/26: the dropdown now SETS the Staff department (tipSetDept resolves the raw stored
   // spelling to its Staff person) — still addressed by the raw spelling (g.primary), never
   // the display name, which may not resolve back.
   /const en=esc\(name\)\.replace/.test(tipsHTMLFn) && /onchange="tipSetDept\('\$\{en\}',this\.value\)"/.test(tipsHTMLFn) && /const name=g\.primary;/.test(tipsHTMLFn));

const hoursHTMLFn = grab('hoursHTML');
ok('hoursHTML resolves the per-person row label through staffDisplayName', /staffDisplayName\(name\)/.test(hoursHTMLFn) && /staffDisplayMark\(disp\.matched,name\)/.test(hoursHTMLFn));
// 11/20/26: the badge moved into tipIdBadgeHTML, and the ID now comes ONLY from Staff (the old
// map, tipsState.empIds, held MICROS numbers and is retired — never read).
const idFn = grab('tipPaychexId');
ok('⛔ the ID badge is handed the RAW name (Staff resolves it through the alias chain)',
   /\$\{tipIdBadgeHTML\(name\)\}/.test(hoursHTMLFn));
ok('⛔ …and the lookup resolves that RAW name through Staff, never the old map',
   /staffResolveForTips\(name\)/.test(idFn) && !/empIds/.test(idFn));
ok('⛔ tipHoursInput/tipHoursDelPos/tipHoursRenamePos/tipHoursAddRow/tipHoursDelPerson are all still called with the RAW name',
   /oninput="tipHoursInput\('\$\{esc\(name\)/.test(hoursHTMLFn) &&
   /onclick="tipHoursDelPerson\('\$\{esc\(name\)/.test(hoursHTMLFn));
ok('the "taken out" chip also resolves to a display name, while the undo button still targets the raw name',
   /tipHoursUndoOut\('\$\{esc\(n\)\.replace/.test(hoursHTMLFn) && /staffDisplayName\(n\)\.name/.test(hoursHTMLFn));

const csvFn = grab('tipsPaychexCsv');
ok('⛔ the Paychex CSV Worker ID lookup still keys off the RAW name', /ids\[n\]=tipPaychexId\(n\)/.test(csvFn) && /g\.members\.map\(m=>ids\[m\]\)/.test(csvFn) && /const wid=r\.id/.test(csvFn));
ok('⛔ every other lookup inside the CSV builder (tipRowTotals/tipHours/busserSplit) still uses the RAW name',
   // per stored spelling (m) of the person now — still raw keys, summed under one Worker ID
   /tipRowTotals\(m\)/.test(csvFn) && /tipHours\(m\)/.test(csvFn) && /\(tipsState\.busserSplit\|\|\{\}\)\[m\]/.test(csvFn));
ok('…and ONLY the printed Name column uses the resolved display name', /csvEsc\(dispName\)/.test(csvFn) && !/csvEsc\(name\)/.test(csvFn));

const tsRowFn = grab('tsCheckRow');
const tsHtmlFn = grab('tsChecksHTML');
ok('the timesheet-checks panel (surfaces MICROS-spelled names) also resolves through Staff',
   /staffDisplayName\(c\.name\)\.name/.test(tsHtmlFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
