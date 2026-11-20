// TIPS SHEET SECTIONS COME FROM DEPARTMENT — Vinny's call, 11/20/26.
//
//     node tools/check-tips-department.mjs
//
// Server/Bartender/Busser/Food Runner(=runner)/Weddings(=events) now come from the Staff
// person's own `department` field, one per person. TRANSITION: while department is null,
// the person falls through to wherever the embedded ct_tips_roster/adds puts them today —
// nobody is allowed to drop off a section mid-migration. Kitchen and null never resolve to
// a section. Separately: a former/removed Staff person shows in a period ONLY if they
// actually have tips recorded that period (history), never a blank row after they've left.
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

function world({ people = {}, aliases = {}, roster = {}, adds = {}, moves = {}, cells = {}, busserSplit = {} } = {}) {
  const ctx = {};
  new Function('ctx', `
    const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings'];
    ${grabConst('TIP_SECTION_FROM_DEPT')}
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState={roster:${JSON.stringify(roster)},adds:${JSON.stringify(adds)},moves:${JSON.stringify(moves)},cells:${JSON.stringify(cells)},busserSplit:${JSON.stringify(busserSplit)}};
    ${grab('staffKeyOf')}
    ${grab('staffEmployed')}
    ${grab('tipDeptSection')}
    ${grab('tipBaseSection')}
    ${grab('tipEffSection')}
    ${grab('tipBusserSplit')}
    ${grab('tipBusserSplitPeople')}
    ${grab('tipRowTotals')}
    ${grab('tipStaffLive')}
    ${grab('tipPersonHasTipsThisPeriod')}
    ${grab('tipSectionPeople')}
    ctx.deptSection=tipDeptSection;ctx.baseSection=tipBaseSection;ctx.effSection=tipEffSection;
    ctx.sectionPeople=tipSectionPeople;ctx.staffLive=tipStaffLive;ctx.hasTips=tipPersonHasTipsThisPeriod;
  `)(ctx);
  return ctx;
}
const person = (key, name, extra = {}) => ({ [key]: { key, name, sources: {}, at: 0, ...extra } });

// ── DEPARTMENT WINS OUTRIGHT, mapped to the right section ──────────────────────────
{
  const w = world({ people: { ...person('amy server', 'Amy Server', { department: 'server' }) } });
  ok('server department → Server section', w.deptSection('Amy Server') === 'Server');
}
{
  const w = world({ people: { ...person('bob bar', 'Bob Bar', { department: 'bartender' }) } });
  ok('bartender → Bartender', w.deptSection('Bob Bar') === 'Bartender');
}
{
  const w = world({ people: { ...person('cara bus', 'Cara Bus', { department: 'busser' }) } });
  ok('busser → Busser', w.deptSection('Cara Bus') === 'Busser');
}
{
  const w = world({ people: { ...person('dan run', 'Dan Run', { department: 'runner' }) } });
  ok('runner → Food Runner', w.deptSection('Dan Run') === 'Food Runner');
}
{
  const w = world({ people: { ...person('eve event', 'Eve Event', { department: 'events' }) } });
  ok('events → Weddings', w.deptSection('Eve Event') === 'Weddings');
}
{
  const w = world({ people: { ...person('finn kit', 'Finn Kit', { department: 'kitchen' }) } });
  ok('⛔ kitchen resolves to NO section — it never gets a Tips sheet section', w.deptSection('Finn Kit') === null);
}
{
  const w = world({ people: { ...person('gus null', 'Gus Null', { department: null }) } });
  ok('⛔ null department resolves to no section, falls through to the roster', w.deptSection('Gus Null') === null);
}
ok('⛔ a person not matched to any Staff record at all also falls through (no department to read)',
   world({}).deptSection('Nobody Known') === null);

// ── TRANSITION: null department falls through to the roster/adds, unchanged ────────
{
  const w = world({
    people: { ...person('hank old', 'Hank Old', { department: null }) },
    roster: { Bartender: ['Hank Old'] },
  });
  ok('still null department, still placed by the roster — exactly the old behavior', w.baseSection('Hank Old') === 'Bartender');
}
{
  // a department value wins even over a roster entry that disagrees
  const w = world({
    people: { ...person('iris both', 'Iris Both', { department: 'busser' }) },
    roster: { Server: ['Iris Both'] },
  });
  ok('⛔ a SET department overrides a disagreeing roster placement — department decides, not the roster', w.baseSection('Iris Both') === 'Busser');
}
{
  // someone with no department AND not on the roster, but added manually
  const w = world({ adds: { Weddings: ['June Added'] } });
  ok('no department, no roster entry — falls all the way through to adds, unchanged', w.baseSection('June Added') === 'Weddings');
}
{
  // a manual move still outranks everything, department included
  const w = world({
    people: { ...person('kay moved', 'Kay Moved', { department: 'server' }) },
    moves: { 'Kay Moved': 'Bartender' },
  });
  ok('⛔ a manual move still outranks department — it is the more specific, more recent fact', w.effSection('Kay Moved') === 'Bartender');
}

// ── FORMER/REMOVED: shows in a period with tips, nowhere else ──────────────────────
{
  const w = world({
    people: { ...person('leo gone', 'Leo Gone', { department: 'server', removed: { at: 1 } }) },
    roster: { Server: ['Leo Gone'] },
  });
  ok('⛔ a removed person with NO tips this period does not appear at all', w.sectionPeople('Server').indexOf('Leo Gone') < 0);
}
{
  const w = world({
    people: { ...person('mia gone', 'Mia Gone', { department: 'server', removed: { at: 1 } }) },
    roster: { Server: ['Mia Gone'] },
    cells: { 'Mia Gone': { '11/1': { p: 40 } } },
  });
  ok('a removed person WITH tips this period still shows — history', w.sectionPeople('Server').indexOf('Mia Gone') >= 0);
}
{
  const w = world({
    people: { ...person('ned active', 'Ned Active', { department: 'server', active: true }) },
    roster: { Server: ['Ned Active'] },
  });
  ok('a currently-employed person with no tips yet still shows — same as always', w.sectionPeople('Server').indexOf('Ned Active') >= 0);
}
{
  const w = world({ roster: { Server: ['Ola Unknown'] } });
  ok('⛔ a roster name that matches no Staff record at all is never suppressed — no removal signal to suppress on', w.sectionPeople('Server').indexOf('Ola Unknown') >= 0);
}
{
  // the roster still carries the sign-up's OLD spelling, aliased to a removed person's
  // own key — tipStaffLive has to follow that chain, the same as staffDisplayName does,
  // or a renamed/merged person who left reads as "unknown" and is never suppressed.
  const w = world({
    people: { ...person('rae renamed', 'Rae Renamed', { department: 'server', removed: { at: 1 } }) },
    aliases: { 'rae old spelling': 'rae renamed' },
    roster: { Server: ['Rae Old Spelling'] },
  });
  ok('⛔ a removed person reached only through an alias is still recognized as removed, and suppressed with no tips', w.sectionPeople('Server').indexOf('Rae Old Spelling') < 0);
}
{
  // unpaid-only (tip-out) tips still count as "has tips"
  const w = world({
    people: { ...person('pia gone', 'Pia Gone', { department: 'busser', active: false }) },
    roster: { Busser: ['Pia Gone'] },
    cells: { 'Pia Gone': { '11/1': { u: 12 } } },
  });
  ok('an unpaid (tip-out) figure counts as "has tips" too, not just a direct paid tip', w.sectionPeople('Busser').indexOf('Pia Gone') >= 0);
}
{
  // busser pool share alone also counts as presence for a removed busser
  const w = world({
    people: { ...person('quin gone', 'Quin Gone', { department: 'busser', active: false }) },
    busserSplit: { 'Quin Gone': 25 },
  });
  ok('a removed busser with a pool share this period still shows', w.sectionPeople('Busser').indexOf('Quin Gone') >= 0);
}

// ── A BUSSER-POOL SHARE SURVIVES BEING PROMOTED OUT OF BUSSER — caught in review, 11/20/26 ──
// Department is read CURRENT on every period, not as-of-the-period: a busser later
// promoted to server has department='server' today, so tipEffSection resolves to
// 'Server' for every period including ones before the promotion — no longer empty, as
// it always was before department could decide a section on its own. The old guard
// (`!tipEffSection(n)`) assumed a non-empty section meant "the roster already claims
// them elsewhere," which stopped being true the moment department could produce one.
{
  const w = world({
    people: { ...person('reed promoted', 'Reed Promoted', { department: 'server' }) },
    busserSplit: { 'Reed Promoted': 40 },
  });
  ok('⛔ a past pool share still shows in Busser even though department now says Server — department changed, the money did not', w.sectionPeople('Busser').indexOf('Reed Promoted') >= 0);
  ok('placement only — the figure itself is unchanged, still read straight off tipsState.busserSplit', w.hasTips('Reed Promoted') === true);
}
{
  // the inverse must still hold: someone with NO pool share this period, promoted or
  // not, is never dragged into Busser just because they once held the job
  const w = world({
    people: { ...person('sam clean', 'Sam Clean', { department: 'server' }) },
    roster: { Server: ['Sam Clean'] },
  });
  ok('⛔ no pool share this period → not pulled into Busser at all', w.sectionPeople('Busser').indexOf('Sam Clean') < 0);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
