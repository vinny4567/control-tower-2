// TIPS SHEET SECTIONS COME FROM DEPARTMENT, ROSTER RETIRED — Vinny, 11/20/26.
//
//     node tools/check-tips-department.mjs
//
// Server/Bartender/Busser/Food Runner(=runner)/Weddings(=events) come from the Staff
// person's own `department` field, among LIVE staff only. ⚠️ 11/20/26, SAME DAY: the tip
// roster (ct_tips_roster/TIP_ROSTER_DATA) is RETIRED entirely as a section source — Vinny,
// seeing "Mike Fornero" on Tips while Staff has "Michael Fornero": "that is why i said
// wipe the other lists... the staff list in the back office trumps any other version of
// someones name." ⚠️ SAME DAY AGAIN: the sheet covers the WHOLE staff list — every live person
// with no department (tipped or not) lands in NO DEPARTMENT YET, and kitchen has its own KITCHEN
// section listing everyone in it. A former/removed Staff person shows in a period ONLY if they actually have tips
// that period (history), never a blank row after they've left. The one surviving manual
// path for someone NOT on Staff at all is `tipsState.adds` (the "+ add" box).
//
// RUN, not read — lifts the real functions and exercises them against built fixtures.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing const ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};
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

function world({ people = {}, aliases = {}, adds = {}, moves = {}, cells = {}, busserSplit = {}, busserSplitByDay = {}, hours = {}, ignore = {} } = {}) {
  const ctx = {};
  new Function('ctx', `
    ${grabConst('TIP_SECTIONS')}
    ${grabConst('TIP_SECTION_FROM_DEPT')}
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState={adds:${JSON.stringify(adds)},moves:${JSON.stringify(moves)},cells:${JSON.stringify(cells)},busserSplit:${JSON.stringify(busserSplit)},busserSplitByDay:${JSON.stringify(busserSplitByDay)},hours:${JSON.stringify(hours)},ignoreSet:${JSON.stringify(ignore)},start:new Date(2026,10,2),end:new Date(2026,10,15)};
    ${grab('staffKeyOf')}
    ${grab('staffEmployed')}
    ${grab('staffResolveForTips')}
    ${grab('tipPersonHasHoursThisPeriod')}
    ${grab('staffFlagIgnored')}
    ${grab('tipNotAPerson')}
    ${grab('tipBaseSection')}
    ${grab('tipEffSection')}
    ${grab('tipBusserSplit')}
    ${grab('tipBusserDay')}
    ${grab('tipBusserSplitPeople')}
    ${grab('tipBusserPoolDay')}
    ${grab('tipRowTotals')}
    ${grab('tipStaffLive')}
    ${grab('tipPersonHasTipsThisPeriod')}
    ${grab('tipSectionPeople')}
    ${grab('tipEnsureRange')}
    ${grab('tipDays')}
    ${grab('tipDayLabel')}
    ${grab('tipsGrandTotals')}
    ctx.resolve=staffResolveForTips;ctx.baseSection=tipBaseSection;ctx.effSection=tipEffSection;
    ctx.sectionPeople=tipSectionPeople;ctx.staffLive=tipStaffLive;ctx.hasTips=tipPersonHasTipsThisPeriod;
    ctx.hasHours=tipPersonHasHoursThisPeriod;
    ctx.grand=tipsGrandTotals;
  `)(ctx);
  return ctx;
}
const person = (key, name, extra = {}) => ({ [key]: { key, name, sources: {}, at: 0, ...extra } });

// ── DEPARTMENT DECIDES THE SECTION, AMONG LIVE STAFF ────────────────────────────────
{
  const w = world({ people: { ...person('amy server', 'Amy Server', { department: 'server' }) } });
  ok('server department → Server section', w.baseSection('Amy Server') === 'Server');
}
{
  const w = world({ people: { ...person('bob bar', 'Bob Bar', { department: 'bartender' }) } });
  ok('bartender → Bartender', w.baseSection('Bob Bar') === 'Bartender');
}
{
  const w = world({ people: { ...person('cara bus', 'Cara Bus', { department: 'busser' }) } });
  ok('busser → Busser', w.baseSection('Cara Bus') === 'Busser');
}
{
  const w = world({ people: { ...person('dan run', 'Dan Run', { department: 'runner' }) } });
  ok('runner → Food Runner', w.baseSection('Dan Run') === 'Food Runner');
}
{
  const w = world({ people: { ...person('eve event', 'Eve Event', { department: 'events' }) } });
  ok('events → Weddings', w.baseSection('Eve Event') === 'Weddings');
}

// ── THE WHOLE STAFF LIST HAS A ROW: KITCHEN gets its own section, no department → NoDept ──
{
  const w = world({ people: { ...person('finn kit', 'Finn Kit', { department: 'kitchen' }) } });
  ok('⛔ kitchen → its own KITCHEN section (Vinny: "i actually want everyone listed")', w.baseSection('Finn Kit') === 'Kitchen');
}
{
  const w = world({ people: { ...person('gus null', 'Gus Null', { department: null, active: true, positions: ['Server'] }) } });
  ok('⛔ a LIVE staff person with no department lands in NO DEPARTMENT YET', w.baseSection('Gus Null') === 'NoDept');
}
{
  const w = world({ people: { ...person('nod unset', 'Nod Unset', {}) } });   // department key absent entirely
  ok('…same when department is simply absent from the record, not explicitly null', w.baseSection('Nod Unset') === 'NoDept');
}
{
  // 11/20/26 reversal: no tipped signal needed any more ("in case i ever have to record someones tips manually")
  const w = world({ people: { ...person('hal host', 'Hal Host', { department: null, active: true, positions: ['Host'] }) } });
  ok('⛔ no department and NO tipped signal (a Host) → STILL listed in NO DEPARTMENT YET, the whole staff list is covered', w.baseSection('Hal Host') === 'NoDept');
}
{
  const w = world({ people: { ...person('odd dept', 'Odd Dept', { department: 'management', active: true }) } });
  ok('⛔ a department value the sheet has no section for lands in NO DEPARTMENT YET, never silently off the sheet', w.baseSection('Odd Dept') === 'NoDept');
}
{
  // tombstoned hours only matter now for a name Staff doesn't know: not a real signal
  const w = world({ hours: { 'Ivy Ghost': { '11/1': { x: true } } } });
  ok('⛔ an unmatched name with only a tombstoned hours row is not surfaced — "taken out" is not a signal', w.baseSection('Ivy Ghost') === null);
}
{
  const w = world({ hours: { 'Some Name': { '11/1': { h: 5 } } } });
  ok('tipPersonHasHoursThisPeriod sees a real row', w.hasHours('Some Name') === true);
}
{
  const w = world({ hours: { 'Some Name': { '11/1': { x: true } } } });
  ok('⛔ tipPersonHasHoursThisPeriod ignores a tombstoned-only row', w.hasHours('Some Name') === false);
}
{
  const w = world({});
  ok('tipPersonHasHoursThisPeriod on nobody at all → false, not a throw', w.hasHours('Nobody Here') === false);
}
ok('⛔ a person not matched to any Staff record and not in adds resolves to no section at all',
   world({}).baseSection('Nobody Known') === null);

// ── THE ROSTER IS GONE: adds is the only surviving fallback for someone off Staff ───
{
  const w = world({ adds: { Weddings: ['June Added'] } });
  ok('not on Staff at all, but manually added → the add still places them', w.baseSection('June Added') === 'Weddings');
}
{
  // a department value wins even if an add disagrees
  const w = world({
    people: { ...person('iris both', 'Iris Both', { department: 'busser' }) },
    adds: { Server: ['Iris Both'] },
  });
  ok('⛔ a SET department overrides a disagreeing add — department decides, never a stray add', w.baseSection('Iris Both') === 'Busser');
}
{
  // 11/20/26: the per-sheet moves are RETIRED — the row's dropdown sets the Staff department
  // instead, so a stale ct_tips_moves entry must change nothing (department is the one place).
  const w = world({
    people: { ...person('kay moved', 'Kay Moved', { department: 'server' }) },
    moves: { 'Kay Moved': 'Bartender' },
  });
  ok('⛔ a leftover per-sheet move is IGNORED — department decides, one place for it', w.effSection('Kay Moved') === 'Server');
}

// ── staffResolveForTips: alias chain, direct key, and the mangled-removed-key fallback ──
{
  const w = world({ people: { ...person('michael fornero', 'Michael Fornero', { pid: 'p1', department: 'server' }) } });
  ok('direct key match resolves', w.resolve('Michael Fornero').pid === 'p1');
}
{
  const w = world({
    people: { ...person('keeper', 'Michael Fornero', { pid: 'p1', department: 'server' }) },
    aliases: { 'mike fornero': 'keeper' },
  });
  ok('an alias resolves to the keeper, same chain staffDisplayName uses', w.resolve('Mike Fornero').pid === 'p1');
}
{
  // the real-world case: a removed person's projection key is mangled with their pid, so
  // the plain key lookup misses — must be found by scanning removed records by NAME.
  const w = world({ people: { ...person('adelyn porter a1b2', 'Adelyn Porter', { pid: 'p1', removed: { at: 1 } }) } });
  ok('⛔ a removed person at a mangled key is still found, by NAME, not by key', w.resolve('Adelyn Porter').pid === 'p1');
}
{
  // a LIVE person is never found by a name-scan — only a removed one
  const w = world({ people: { ...person('some other key', 'Not The Same Key Live', { pid: 'p1', active: true }) } });
  ok('⛔ a live person is never matched by a name-scan on a different key — only removed records use that fallback', w.resolve('Not The Same Key Live') === null);
}
ok('no match at all → null, not a throw', world({}).resolve('Totally Unknown') === null);

// ── FORMER/REMOVED: shows in a period with tips, nowhere else ──────────────────────
{
  // in `adds` too — e.g. a manager added them by hand once — so they're a real candidate
  // in `all`; without that, nothing would be around to prove the suppression filter works.
  const w = world({
    people: { ...person('leo gone', 'Leo Gone', { department: 'server', removed: { at: 1 } }) },
    adds: { Server: ['Leo Gone'] },
  });
  ok('⛔ a removed person with NO tips this period does not appear at all', w.sectionPeople('Server').indexOf('Leo Gone') < 0);
}
{
  const w = world({
    people: { ...person('mia gone', 'Mia Gone', { department: 'server', removed: { at: 1 } }) },
    cells: { 'Mia Gone': { '11/1': { p: 40 } } },
  });
  ok('a removed person WITH tips this period still shows — history', w.sectionPeople('Server').indexOf('Mia Gone') >= 0);
}
{
  const w = world({ people: { ...person('ned active', 'Ned Active', { department: 'server', active: true }) } });
  ok('a currently-employed person with no tips yet still shows — same as always', w.sectionPeople('Server').indexOf('Ned Active') >= 0);
}
{
  const w = world({ adds: { Server: ['Ola Unknown'] } });
  ok('⛔ an added name that matches no Staff record at all is never suppressed — no removal signal to suppress on', w.sectionPeople('Server').indexOf('Ola Unknown') >= 0);
}
{
  const w = world({
    people: { ...person('rae renamed', 'Rae Renamed', { department: 'server', removed: { at: 1 } }) },
    aliases: { 'rae old spelling': 'rae renamed' },
  });
  ok('⛔ a removed person reached only through an alias is still recognized as removed, and suppressed with no tips', w.sectionPeople('Server').indexOf('Rae Old Spelling') < 0);
}
{
  const w = world({
    people: { ...person('pia gone', 'Pia Gone', { department: 'busser', active: false }) },
    cells: { 'Pia Gone': { '11/1': { u: 12 } } },
  });
  ok('an unpaid (tip-out) figure counts as "has tips" too, not just a direct paid tip', w.sectionPeople('Busser').indexOf('Pia Gone') >= 0);
}
{
  const w = world({
    people: { ...person('quin gone', 'Quin Gone', { department: 'busser', active: false }) },
    busserSplit: { 'Quin Gone': 25 },
  });
  ok('a removed busser with a pool share this period still shows', w.sectionPeople('Busser').indexOf('Quin Gone') >= 0);
}

// ── NoDept, end to end through tipSectionPeople ─────────────────────────────────────
{
  const w = world({ people: { ...person('needs one', 'Needs One', { department: null, active: true, positions: ['Server'] }) } });
  ok('⛔ shows up in the NoDept bucket, with zero tips, so Vinny can see who still needs one', w.sectionPeople('NoDept').indexOf('Needs One') >= 0);
  ok('…and nowhere else', w.sectionPeople('Server').indexOf('Needs One') < 0 && w.sectionPeople('Busser').indexOf('Needs One') < 0);
}
{
  // kitchen: everyone listed, in KITCHEN, money or not (Vinny: "cover the entire staff list")
  const w = world({ people: { ...person('cook here', 'Cook Here', { department: 'kitchen', active: true }) } });
  ok('⛔ a live kitchen person with no money at all is listed in KITCHEN', w.sectionPeople('Kitchen').indexOf('Cook Here') >= 0);
  ok('…and nowhere else, NoDept included', TIP_SECTIONS_ALL(w).filter(sec => sec !== 'Kitchen').every(sec => w.sectionPeople(sec).indexOf('Cook Here') < 0));
}
{
  // a REMOVED person with no department and no tips never shows in NoDept either —
  // same history rule as every other section
  const w = world({ people: { ...person('left blank', 'Left Blank', { department: null, removed: { at: 1 } }) } });
  ok('⛔ a removed person with no department AND no tips this period does not show in NoDept', w.sectionPeople('NoDept').indexOf('Left Blank') < 0);
}
{
  // …and a removed kitchen person shows in KITCHEN only in a period they have money
  const gone = world({ people: { ...person('old cook', 'Old Cook', { department: 'kitchen', removed: { at: 1 } }) } });
  ok('⛔ a removed kitchen person with no money this period is not listed in KITCHEN', gone.sectionPeople('Kitchen').indexOf('Old Cook') < 0);
  const paid = world({ people: { ...person('old cook', 'Old Cook', { department: 'kitchen', removed: { at: 1 } }) }, cells: { 'Old Cook': { '11/3': { p: 25 } } } });
  ok('…but IS listed in a period where they have tips — history', paid.sectionPeople('Kitchen').indexOf('Old Cook') >= 0);
  ok('…and that money reaches the grand total', paid.grand().paid === 25);
}
{
  // a live Host (no department, no tipped signal) IS listed now — reversed 11/20/26
  const w = world({ people: { ...person('hal host2', 'Hal Host2', { department: null, active: true, positions: ['Host'] }) } });
  ok('⛔ a live Host with no tipped signal is listed in NO DEPARTMENT YET', w.sectionPeople('NoDept').indexOf('Hal Host2') >= 0);
  ok('…and only there', TIP_SECTIONS_ALL(w).filter(sec => sec !== 'NoDept').every(sec => w.sectionPeople(sec).indexOf('Hal Host2') < 0));
}
function TIP_SECTIONS_ALL(w) { return ['Server', 'Bartender', 'Busser', 'Food Runner', 'Weddings', 'NoDept', 'Kitchen']; }

// ── MONEY MUST NEVER GO INVISIBLE (Jarvis's review catch, 11/20/26) ─────────────────
// The exact "Mike Fornero" case: a raw name that doesn't resolve to any Staff record (not
// aliased, not yet linked via the ⚑ picker) and isn't in `adds` either. Before the wipe the
// roster placed him; now nothing else will. He MUST still render — in NoDept, with his ⚑ —
// and his dollars MUST still reach the grand total, or his money is silently off the grid.
{
  const w = world({ cells: { 'Mike Fornero': { '11/3': { p: 212.5 } } } });
  ok('⛔ an unmatched name with real PAID tips this period still renders, in NoDept', w.sectionPeople('NoDept').indexOf('Mike Fornero') >= 0);
  ok('…and nowhere else', TIP_SECTIONS_ALL(w).filter(sec => sec !== 'NoDept').every(sec => w.sectionPeople(sec).indexOf('Mike Fornero') < 0));
  ok('⛔ his dollars reach tipsGrandTotals too — not just a visible row with money that never gets summed', w.grand().paid === 212.5);
}
{
  // unpaid (tip-out) money, same requirement
  const w = world({ cells: { 'Ghost Name': { '11/3': { u: 40 } } } });
  ok('⛔ an unmatched name with UNPAID tips this period still renders, in NoDept', w.sectionPeople('NoDept').indexOf('Ghost Name') >= 0);
  ok('…and counts in the grand total', w.grand().upt === 40);
}
{
  // hours-only — no cells money at all, the other half of "money or hours"
  const w = world({ hours: { 'Hourly Ghost': { '11/3': { h: 6 } } } });
  ok('⛔ an unmatched name with ONLY hours (no tips cells at all) still renders in NoDept — hours are a signal too', w.sectionPeople('NoDept').indexOf('Hourly Ghost') >= 0);
}
{
  // no money, no hours, not in adds, not on Staff → correctly invisible (nothing to surface)
  const w = world({});
  ok('a name with no money, no hours, and no Staff/adds match at all has nothing to show — correctly absent, not a false positive', w.sectionPeople('NoDept').indexOf('Nobody At All') < 0);
}
{
  // an add still places someone even with zero money — unaffected by this fix
  const w = world({ adds: { Weddings: ['June Added'] }, cells: { 'June Added': { '11/3': { p: 75 } } } });
  ok('an added name with money still places via the add path (Weddings), not pulled into NoDept by the money fallback', w.sectionPeople('Weddings').indexOf('June Added') >= 0 && w.sectionPeople('NoDept').indexOf('June Added') < 0);
}

// ── NOT-A-PERSON ROWS STAY OUT OF NO DEPARTMENT YET (Vinny saw "Busser Pool" there) ──
{
  // the lumped pool has money in cells exactly like a person would — that's what fooled it
  const w = world({ cells: { 'Busser Pool': { '11/3': { u: 300 } }, 'Mike Fornero': { '11/3': { p: 50 } } } });
  ok('⛔ "Busser Pool" never lands in NO DEPARTMENT YET, despite having money in cells', w.sectionPeople('NoDept').indexOf('Busser Pool') < 0);
  ok('…nor in any other section via tipSectionPeople (its own row is drawn separately in Busser)', TIP_SECTIONS_ALL(w).every(sec => w.sectionPeople(sec).indexOf('Busser Pool') < 0));
  ok('⛔ the grand total counts the unsplit pool EXACTLY once, not twice ($300 pool + $50 Mike)', w.grand().upt === 300 && w.grand().paid === 50);
  ok('…while a real unmatched name with money still surfaces right beside it', w.sectionPeople('NoDept').indexOf('Mike Fornero') >= 0);
}
{
  const w = world({ cells: { 'Private Party': { '11/3': { p: 200 } } } });
  ok('⛔ "Private Party" (a tracking row, same rule as the Hours sheet) stays out of NO DEPARTMENT YET', w.sectionPeople('NoDept').indexOf('Private Party') < 0);
}
{
  const w = world({ hours: { 'Busser Pool': { '11/3': { h: 4 } } } });
  ok('⛔ a pool row with hours is not pulled in by the hours scan either', w.sectionPeople('NoDept').indexOf('Busser Pool') < 0);
}
{
  // a spelling Vinny marked "not a person" on the ⚑ picker
  const w = world({ cells: { 'Cash Drawer': { '11/3': { p: 20 } } }, ignore: { 'cash drawer': 1 } });
  ok('⛔ a spelling on the ignore list ("not a person") stays out of NO DEPARTMENT YET', w.sectionPeople('NoDept').indexOf('Cash Drawer') < 0);
}
{
  // a real person whose surname merely contains "pool" as part of a word is NOT excluded
  const w = world({ cells: { 'Ann Poole': { '11/3': { p: 30 } } } });
  ok('a real name like "Ann Poole" is not mistaken for a pool row (whole-word match only)', w.sectionPeople('NoDept').indexOf('Ann Poole') >= 0);
}

// ── A BUSSER-POOL SHARE SURVIVES BEING PROMOTED OUT OF BUSSER (kept from 11/20 review) ──
{
  const w = world({
    people: { ...person('reed promoted', 'Reed Promoted', { department: 'server' }) },
    busserSplit: { 'Reed Promoted': 40 },
  });
  ok('⛔ a past pool share still shows in Busser even though department now says Server — department changed, the money did not', w.sectionPeople('Busser').indexOf('Reed Promoted') >= 0);
  ok('placement only — the figure itself is unchanged, still read straight off tipsState.busserSplit', w.hasTips('Reed Promoted') === true);
}
{
  const w = world({ people: { ...person('sam clean', 'Sam Clean', { department: 'server' }) } });
  ok('⛔ no pool share this period → not pulled into Busser at all', w.sectionPeople('Busser').indexOf('Sam Clean') < 0);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
