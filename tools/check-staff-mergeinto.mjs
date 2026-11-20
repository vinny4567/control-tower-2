// staffMergeInto — wired to a real button for the first time (11/20/26, Mauricio
// Perez → Gomez). The function existed, tested never, called by nobody: the duplicates
// panel only ever offered Delete and Not-a-dupe. RUN, not read.
//
//     node tools/check-staff-mergeinto.mjs
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
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};

function world(people, { typedAnswer, confirmAnswer = true } = {}) {
  const calls = { alerts: [], confirms: [], prompts: [], saves: 0, redraws: 0, notes: [] };
  const ctx = {};
  new Function('ctx', `
    let staffS = { people: ${JSON.stringify(people)} };
    Object.keys(staffS.people).forEach(k=>{if(!staffS.people[k].key)staffS.people[k].key=k;});
    ${grabConst('staffByFirst')}
    ${grab('staffKeyOf')}
    function staffTouch(p){if(p)p.at=1;return p}
    function staffSave(){ctx.calls.saves++;ctx.savedSnapshot=JSON.stringify(staffS);}
    function staffRedraw(){ctx.calls.redraws++;}
    function staffRefreshNotes(){ctx.calls.notes.push(staffS.regNote);}
    function alert(msg){ctx.calls.alerts.push(msg);}
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function prompt(msg){ctx.calls.prompts.push(msg);return ${JSON.stringify(typedAnswer)};}
    ${grab('staffMergeInto')}
    ctx.run = staffMergeInto;
    ctx.getStaffS = () => staffS;
  `)(ctx, calls);
  ctx.calls = calls;
  return ctx;
}

const person = (name, extra = {}) => ({ key: '', name, sources: {}, at: 0, ...extra });

// ── THE WORKED EXAMPLE: Mauricio Perez → Mauricio Gomez ────────────────────────────
{
  const w = world({
    'mauricio perez': person('Mauricio Perez', { paychex_id: '605' }),
    'mauricio gomez': person('Mauricio Gomez', { paychex_id: '605', register: { emp_id: 76 } }),
  }, { typedAnswer: 'Mauricio Gomez' });
  w.run('mauricio perez');
  const S = w.getStaffS();
  ok('⛔ the loser record is gone from staffS.people', !S.people['mauricio perez']);
  ok('⛔ the keeper survives, untouched spelling', !!S.people['mauricio gomez'] && S.people['mauricio gomez'].name === 'Mauricio Gomez');
  ok('⛔ the loser spelling becomes an alias pointing at the keeper', S.aliases['mauricio perez'] === 'mauricio gomez');
  ok('⛔ the keeper keeps its OWN register (register emp 76), never overwritten by the loser\'s', S.people['mauricio gomez'].register.emp_id === 76);
  ok('it asked who to keep, and asked to confirm before doing anything', w.calls.prompts.length === 1 && w.calls.confirms.length === 1);
  ok('staffSave() is called exactly once', w.calls.saves === 1);
}

// ── REFUSES THE TWO CASES THAT WOULD COST MONEY ────────────────────────────────────
{
  const w = world({
    'a person': person('A Person', { paychex_id: '111' }),
    'b person': person('B Person', { paychex_id: '222' }),
  }, { typedAnswer: 'B Person' });
  w.run('a person');
  ok('⛔ two different Paychex IDs refuses the merge outright', !!w.getStaffS().people['a person'] && !!w.getStaffS().people['b person']);
  ok('…and explains why, naming both numbers', w.calls.alerts.some((m) => /111/.test(m) && /222/.test(m)));
  ok('…never reaching the confirm dialog', w.calls.confirms.length === 0);
}
{
  const w = world({
    'a person': person('A Person', { register: { emp_id: 1 } }),
    'b person': person('B Person', { register: { emp_id: 2 } }),
  }, { typedAnswer: 'B Person' });
  w.run('a person');
  ok('⛔ both sides able to sign in at a register refuses the merge too', !!w.getStaffS().people['a person'] && !!w.getStaffS().people['b person']);
  ok('…never reaching the confirm dialog', w.calls.confirms.length === 0);
}

// ── CANCEL AT EITHER STEP MEANS CANCEL ─────────────────────────────────────────────
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: null }); // Cancel on the prompt
  w.run('a person');
  ok('⛔ cancelling the "merge into which person" prompt changes nothing', !!w.getStaffS().people['a person'] && w.calls.saves === 0);
}
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: 'B Person', confirmAnswer: false });
  w.run('a person');
  ok('⛔ declining the final confirm changes nothing — both records survive, nothing saved', !!w.getStaffS().people['a person'] && !!w.getStaffS().people['b person'] && w.calls.saves === 0);
}

// ── A TYPO'D TARGET NAME DOES NOT GUESS OR CREATE ANYONE ──────────────────────────
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: 'Nobody By This Name' });
  w.run('a person');
  ok('⛔ a name that matches nobody refuses rather than guessing', !!w.getStaffS().people['a person'] && w.calls.saves === 0);
  ok('…and tells him to type it exactly as it appears', w.calls.alerts.some((m) => /exactly as it appears/.test(m)));
}

// ── TYPING THE LOSER'S OWN NAME BACK REFUSES, RATHER THAN DELETING THE ONLY COPY ──
{
  const w = world({
    'alice smith': person('Alice Smith'),
    'bailey jones': person('Bailey Jones'),
  }, { typedAnswer: 'Alice Smith' }); // typed the loser's own name
  w.run('alice smith');
  ok('⛔ "merge into the same record" is refused outright, not silently deleting the only copy',
     !!w.getStaffS().people['alice smith'] && w.calls.saves === 0);
  ok('…and says plainly that it is the same record', w.calls.alerts.some((m) => /same record/.test(m)));
}

// ── NOTHING ELSE TO MERGE INTO ─────────────────────────────────────────────────────
{
  const w = world({ 'a person': person('A Person') });
  w.run('a person');
  ok('⛔ with nobody else on the list, it says so and asks nothing', w.calls.prompts.length === 0 && w.calls.alerts.length === 1);
}

// ── GAP-FILL ONLY: never overwrites something the keeper already has ──────────────
{
  const w = world({
    'loser key': person('Loser Name', { phone: '555-0100', nickname: 'Lo', rates: { Server: 20 } }),
    'keeper key': person('Keeper Name', { phone: '555-9999', rates: { Bartender: 15 } }),
  }, { typedAnswer: 'Keeper Name' });
  w.run('loser key');
  const keeper = w.getStaffS().people['keeper key'];
  ok('⛔ a field already set on the keeper (phone) is NEVER overwritten by the loser\'s', keeper.phone === '555-9999');
  ok('…but a field the keeper was missing (nickname) IS filled in from the loser', keeper.nickname === 'Lo');
  ok('⛔ rates merge key-by-key — the keeper keeps BOTH jobs, not just their own', keeper.rates.Server === 20 && keeper.rates.Bartender === 15);
}

// ── A CHAIN OF ALIASES ALL RE-POINT TO THE SURVIVING KEY ───────────────────────────
{
  const w = world({
    'oldest alias target': person('Oldest Alias Target'),
    'keeper key': person('Keeper Name'),
  }, { typedAnswer: 'Keeper Name' });
  // Simulate a prior merge that already pointed some spelling at the loser.
  w.getStaffS().aliases = { 'some old spelling': 'oldest alias target' };
  w.run('oldest alias target');
  ok('⛔ an alias that pointed at the just-deleted loser is RE-POINTED to the new keeper, not left dangling',
     w.getStaffS().aliases['some old spelling'] === 'keeper key');
}

// ── THE DUPLICATES PANEL: a real "Merge" button, wired, and gated correctly ───────
const dupesHTML = grab('staffDupesHTML');
ok('⛔ a "Merge into…" button exists in the duplicates panel, wired to staffMergeInto', /onclick="staffMergeInto\('\$\{esc\(p\.key\)\}'\)"/.test(dupesHTML));
ok('⛔ the Delete button is still there too — merge did not replace it', /onclick="staffRemove\('\$\{esc\(p\.key\)\}'\)"/.test(dupesHTML));
ok('⛔ the Merge button is suppressed when scanning the raw schedule app (staffMergeInto only knows staffS.people, not unmerged raw rows)',
   /\$\{staffRawRows\?'':`<button onclick="staffMergeInto/.test(dupesHTML));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
