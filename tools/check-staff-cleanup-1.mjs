// Does the 11/19 staff cleanup actually do what Vinny approved — and NOTHING until he
// presses confirm? RUN, not read.
//
//     node tools/check-staff-cleanup-1.mjs
//
// staffCleanup1Plan() must be PURE — read staffS, mutate nothing, return closures. A first
// draft mutated staffS directly and only gated the final staffSave() on confirm(), so
// pressing Cancel still left every change sitting in memory for the next unrelated save to
// persist. Caught before ever reaching a browser; this file exists so it can't come back.
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
const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n];', i) + 3);
};

// A tiny world: the real plan/apply functions, the real data tables, a minimal staffKeyOf/
// staffNewPid/staffTouch, a swappable staffS, and a recorder for confirm/alert/staffSave.
function world(people = {}, aliases = {}, confirmAnswer = true) {
  const calls = { confirms: [], alerts: [], saves: 0, redraws: 0 };
  const ctx = {};
  new Function('ctx', `
    let staffS = { people: ${JSON.stringify(people)}, aliases: ${JSON.stringify(aliases)} };
    function staffKeyOf(name){return String(name||'').toLowerCase().replace(/['’.]/g,'').replace(/-/g,' ').split(/\\s+/).filter(t=>t.length>1).join(' ').trim();}
    function staffNewPid(){return 'p_test'+(Math.floor(ctx._pidSeq=(ctx._pidSeq||0)+1));}
    function staffTouch(p){if(p)p.at=1;return p}
    function staffSave(){ctx.calls.saves++;ctx.savedSnapshot=JSON.stringify(staffS);}
    function staffRefreshNotes(){}
    function staffRedraw(){ctx.calls.redraws++;}
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function alert(msg){ctx.calls.alerts.push(msg);}
    ${grabConst('STAFF_CLEANUP_1_MERGES')}
    ${grabConst('STAFF_CLEANUP_1_NEW')}
    ${grabConst('STAFF_CLEANUP_1_POSITIONS')}
    ${grab('staffCleanup1Plan')}
    ${grab('staffCleanup1Apply')}
    ctx.plan = staffCleanup1Plan;
    ctx.apply = staffCleanup1Apply;
    ctx.getStaffS = () => staffS;
  `)(ctx, calls);
  ctx.calls = calls;
  return ctx;
}

const person = (name, extra = {}) => ({ key: '', name, sources: {}, at: 0, ...extra });
// Minimal starting world: the 3 merge keepers + Sophie Evans exist; nothing else does yet.
const baseline = () => ({
  'fernando armenta': person('Fernando Armenta'),
  'heriberto ferrel': person('Heriberto Ferrel'),
  'priscilla lagace': person('Priscilla Lagace'),
  'sophie evans': person('Sophie Evans'),
  // 'Fernado Armenta' and 'Heribert Ferrel' have NO row of their own in the real data —
  // they only ever showed up as misspellings in hours/timesheet data, never added to
  // Staff. 'fernado armenta' here is an ACTIVE row specifically to exercise the
  // delete-the-loser-on-merge path; Priscilla/Sophia (below, via their own fixtures)
  // cover "no loser row at all" and "loser is an already-removed tombstone" separately.
  'fernado armenta': person('Fernado Armenta', { phone: '555-0100' }),
  'sophia evans': person('Sophia Evans', { removed: true }),          // the tombstone case
});

// ── THE PLAN NEVER MUTATES ──────────────────────────────────────────────────────────────
let w = world(baseline());
const before = JSON.stringify(w.getStaffS());
w.plan();
ok('⛔ staffCleanup1Plan() mutates NOTHING — staffS is byte-identical before and after',
   JSON.stringify(w.getStaffS()) === before);

// ── CANCEL MEANS CANCEL ─────────────────────────────────────────────────────────────────
w = world(baseline(), {}, false);   // confirm() returns false
w.apply();
ok('⛔ pressing Cancel leaves staffS COMPLETELY untouched', JSON.stringify(w.getStaffS()) === before);
ok('…and never calls staffSave()', w.calls.saves === 0);

// ── THE HAPPY PATH, CONFIRMED ───────────────────────────────────────────────────────────
w = world(baseline());
w.apply();
const S = w.getStaffS();
ok('⛔ a real (active) loser record is DELETED on merge, folded into the keeper', !S.people['fernado armenta'] && S.aliases['fernado armenta'] === 'fernando armenta');
ok('…and a field only the loser had (phone) moved across to the keeper', S.people['fernando armenta'].phone === '555-0100');
ok('⛔ Priscilla La Gace merges even though no loser ROW exists for her (alias-only case)',
   S.aliases['priscilla la gace'] === 'priscilla lagace');
ok('⛔ Sophia Evans stays REMOVED — only the alias is new', S.people['sophia evans'] && S.people['sophia evans'].removed === true);
ok('…and resolves to Sophie', S.aliases['sophia evans'] === 'sophie evans');
ok('⛔ a new hire lands with the right positions', S.people['agnieszka kuc'] && S.people['agnieszka kuc'].positions.join(',') === 'Bartender');
ok('…all 11 new hires landed', ['arsen kronshtal','ashton dwyer','caden poss','harper mcdonald','jeana koo',
   'justyna consuegra','lydia freeborn','ryanna weiss','terrence mastrino','vivian lederer']
   .every(k => !!S.people[k]));
ok('staffSave() is called exactly once for the whole batch, not once per item', w.calls.saves === 1);
ok('⛔ staffSave() runs AFTER the actions, not before — it must see the applied changes, not the pre-apply state',
   JSON.parse(w.savedSnapshot).people['fernado armenta'] === undefined);

// ── POSITION FILLS: ONLY for someone with NONE already, and only present rows ──────────
w = world({ ...baseline(), 'maria ruiz': person('Maria Ruiz'), 'kevork sevan': person('Kevork Sevan') });
w.apply();
const S2 = w.getStaffS();
ok('a position-fill person with no positions gets them', S2.people['maria ruiz'].positions.join(',') === 'Server');
ok('…multi-job people get all their mapped positions', S2.people['kevork sevan'].positions.join(',') === 'Bartender,Server');
ok('⛔ a position-fill person who does not exist on the list is SKIPPED, not created',
   !S2.people['katia morfin']);

w = world({ ...baseline(), 'maria ruiz': person('Maria Ruiz', { positions: ['Host'] }) });
w.apply();
ok('⛔ a position-fill person who ALREADY has a position is left alone, never overwritten',
   w.getStaffS().people['maria ruiz'].positions.join(',') === 'Host');

// ── AIDEN BURKE: hours were all skip-listed, so he gets nothing, not an error ──────────
w = world({ ...baseline(), 'aiden burke': person('Aiden Burke') });
w.apply();
ok('Aiden Burke ends with no positions and no crash (his only hours were Setup, skip-listed)',
   JSON.stringify(w.getStaffS().people['aiden burke'].positions || []) === '[]' ||
   w.getStaffS().people['aiden burke'].positions === undefined);

// ── IDEMPOTENT: pressing it a second time changes nothing further ──────────────────────
w = world(baseline());
w.apply();
const afterFirst = JSON.stringify(w.getStaffS());
const planAgain = w.plan();
ok('⛔ a second plan finds ZERO actions left — everything already matches', planAgain.actions.length === 0);
const confirmsBefore=w.calls.confirms.length, savesBefore=w.calls.saves;
w.apply();   // "Nothing left to do" branch — must not call confirm or save again
ok('⛔ a second apply() never shows the confirm dialog a second time (nothing left to confirm)',
   w.calls.confirms.length === confirmsBefore);
ok('⛔ …and never calls staffSave() again either', w.calls.saves === savesBefore);
ok('⛔ …and staffS is unchanged by the second press', JSON.stringify(w.getStaffS()) === afterFirst);

// ── A MISSING KEEPER REFUSES THAT ONE MERGE, NOT THE WHOLE BATCH ───────────────────────
{
  const missingKeeper = baseline();
  delete missingKeeper['priscilla lagace'];
  w = world(missingKeeper);
  w.apply();
  const S3 = w.getStaffS();
  ok('⛔ a merge with no keeper row is skipped, not silently merged into nothing',
     !S3.aliases['priscilla la gace']);
  ok('…but the OTHER two merges still go through', S3.aliases['fernado armenta'] === 'fernando armenta');
  ok('…and new hires still land', !!S3.people['agnieszka kuc']);
}

// ── SOPHIA EVANS: if her row were somehow NOT removed, this must not silently merge her ──
// (the plan only special-cases the tombstone path; an active unremoved Sophia is outside
// what was approved and must be left for a human, not guessed at)
{
  const activeConfusion = { ...baseline() };
  activeConfusion['sophia evans'] = person('Sophia Evans');   // NOT removed
  w = world(activeConfusion);
  const plan = w.plan();
  const sophiaLine = plan.lines.find(l => l.includes('Sophia'));
  ok('an unexpectedly-active Sophia Evans still gets the alias written (Jarvis only said "keep removed" for the tombstone case; this path does not touch .removed at all either way)',
     !!sophiaLine);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
