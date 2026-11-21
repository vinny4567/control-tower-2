// TIPS SHEET SECTIONS COME FROM DEPARTMENT, ROSTER RETIRED — Vinny, 11/20/26.
//
//     node tools/check-tips-department.mjs
//
// Server/Bartender/Busser/Food Runner(=runner)/Weddings(=events) come from the Staff
// person's own `department` field, among LIVE staff only. ⚠️ 11/20/26, SAME DAY: the tip
// roster (ct_tips_roster/TIP_ROSTER_DATA) is RETIRED entirely as a section source — Vinny,
// seeing "Mike Fornero" on Tips while Staff has "Michael Fornero": "that is why i said
// wipe the other lists... the staff list in the back office trumps any other version of
// someones name." A live staff person with NO department lands in a visible 'NoDept'
// ("No department yet") bucket instead of silently vanishing. Kitchen is a real, deliberate
// department with no Tips section — different from null, which just means nobody's looked
// yet. A former/removed Staff person shows in a period ONLY if they actually have tips
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

function world({ people = {}, aliases = {}, adds = {}, moves = {}, cells = {}, busserSplit = {} } = {}) {
  const ctx = {};
  new Function('ctx', `
    const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings','NoDept'];
    ${grabConst('TIP_SECTION_FROM_DEPT')}
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    let tipsState={adds:${JSON.stringify(adds)},moves:${JSON.stringify(moves)},cells:${JSON.stringify(cells)},busserSplit:${JSON.stringify(busserSplit)}};
    ${grab('staffKeyOf')}
    ${grab('staffEmployed')}
    ${grab('staffResolveForTips')}
    ${grab('tipBaseSection')}
    ${grab('tipEffSection')}
    ${grab('tipBusserSplit')}
    ${grab('tipBusserSplitPeople')}
    ${grab('tipRowTotals')}
    ${grab('tipStaffLive')}
    ${grab('tipPersonHasTipsThisPeriod')}
    ${grab('tipSectionPeople')}
    ctx.resolve=staffResolveForTips;ctx.baseSection=tipBaseSection;ctx.effSection=tipEffSection;
    ctx.sectionPeople=tipSectionPeople;ctx.staffLive=tipStaffLive;ctx.hasTips=tipPersonHasTipsThisPeriod;
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

// ── KITCHEN (real dept, no section) vs NULL (needs attention) are DIFFERENT outcomes ──
{
  const w = world({ people: { ...person('finn kit', 'Finn Kit', { department: 'kitchen' }) } });
  ok('⛔ kitchen is a real department that simply has no Tips section — excluded entirely, not "no department yet"', w.baseSection('Finn Kit') === null);
}
{
  const w = world({ people: { ...person('gus null', 'Gus Null', { department: null, active: true }) } });
  ok('⛔ a LIVE staff person with no department lands in the visible NoDept bucket — never silently dropped', w.baseSection('Gus Null') === 'NoDept');
}
{
  const w = world({ people: { ...person('nod unset', 'Nod Unset', {}) } });   // department key absent entirely
  ok('…same when department is simply absent from the record, not explicitly null', w.baseSection('Nod Unset') === 'NoDept');
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
  // a manual move still outranks everything, department included
  const w = world({
    people: { ...person('kay moved', 'Kay Moved', { department: 'server' }) },
    moves: { 'Kay Moved': 'Bartender' },
  });
  ok('⛔ a manual move still outranks department — it is the more specific, more recent fact', w.effSection('Kay Moved') === 'Bartender');
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
  const w = world({ people: { ...person('needs one', 'Needs One', { department: null, active: true }) } });
  ok('⛔ shows up in the NoDept bucket, with zero tips, so Vinny can see who still needs one', w.sectionPeople('NoDept').indexOf('Needs One') >= 0);
  ok('…and nowhere else', w.sectionPeople('Server').indexOf('Needs One') < 0 && w.sectionPeople('Busser').indexOf('Needs One') < 0);
}
{
  // kitchen staff never show in NoDept either — they have a real department, it's just not a tip one
  const w = world({ people: { ...person('cook here', 'Cook Here', { department: 'kitchen', active: true }) } });
  ok('⛔ a kitchen department does NOT land in NoDept — it is a decided answer, not a pending one', w.sectionPeople('NoDept').indexOf('Cook Here') < 0);
  ok('…kitchen staff appear in NO Tips section at all', TIP_SECTIONS_ALL(w).every(sec => w.sectionPeople(sec).indexOf('Cook Here') < 0));
}
{
  // a REMOVED person with no department and no tips never shows in NoDept either —
  // same history rule as every other section
  const w = world({ people: { ...person('left blank', 'Left Blank', { department: null, removed: { at: 1 } }) } });
  ok('⛔ a removed person with no department AND no tips this period does not show in NoDept', w.sectionPeople('NoDept').indexOf('Left Blank') < 0);
}
function TIP_SECTIONS_ALL(w) { return ['Server', 'Bartender', 'Busser', 'Food Runner', 'Weddings', 'NoDept']; }

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
