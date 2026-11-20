// staffMergeInto — wired to a real button for the first time (11/20/26, Mauricio
// Perez → Gomez). The function existed, tested never, called by nobody: the duplicates
// panel only ever offered Delete and Not-a-dupe. RUN, not read.
//
//     node tools/check-staff-mergeinto.mjs
//
// ⚠️ REWRITTEN 11/20/26, SAME DAY — the mini is now the sole writer (Vinny: "Back office
// saves to mini"). staffMergeInto no longer gap-fills/aliases/deletes locally — it sends
// ONE {op:'merge',loser,keeper} to the mini and trusts it (confirmed by Jarvis: the mini
// now marks a merged-away person removed and points an alias at the keeper, no ghost left).
// What THIS function still owns: the UI prompts and the two money-safety pre-checks, which
// give a far clearer refusal than a bare 409 would.
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

function world(people, { typedAnswer, confirmAnswer = true, writeOpResult = {} } = {}) {
  const calls = { alerts: [], confirms: [], prompts: [], writeOps: [], notes: [] };
  const ctx = {};
  new Function('ctx', `
    let staffS = { people: ${JSON.stringify(people)} };
    Object.keys(staffS.people).forEach(k=>{if(!staffS.people[k].key)staffS.people[k].key=k;});
    ${grabConst('staffByFirst')}
    ${grab('staffKeyOf')}
    function staffRefreshNotes(){ctx.calls.notes.push(staffS.regNote);}
    function staffRedraw(){}
    function alert(msg){ctx.calls.alerts.push(msg);}
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function prompt(msg){ctx.calls.prompts.push(msg);return ${JSON.stringify(typedAnswer)};}
    async function staffWriteOp(op){ctx.calls.writeOps.push(op);return ${JSON.stringify(writeOpResult)};}
    ${grab('staffMergeInto')}
    ctx.run = staffMergeInto;
    ctx.getStaffS = () => staffS;
  `)(ctx);
  ctx.calls = calls;
  return ctx;
}

const person = (name, extra = {}) => ({ key: '', name, sources: {}, at: 0, ...extra });

// ── THE WORKED EXAMPLE: Mauricio Perez → Mauricio Gomez ────────────────────────────
{
  const w = world({
    'mauricio perez': person('Mauricio Perez', { pid: 'perez-pid', paychex_id: '605' }),
    'mauricio gomez': person('Mauricio Gomez', { pid: 'gomez-pid', paychex_id: '605', register: { emp_id: 76 } }),
  }, { typedAnswer: 'Mauricio Gomez' });
  await w.run('mauricio perez');
  ok('⛔ exactly one write op is sent, and it is the merge op with the right pids',
     w.calls.writeOps.length === 1 && w.calls.writeOps[0].op === 'merge' &&
     w.calls.writeOps[0].loser === 'perez-pid' && w.calls.writeOps[0].keeper === 'gomez-pid');
  ok('it asked who to keep, and asked to confirm before sending anything', w.calls.prompts.length === 1 && w.calls.confirms.length === 1);
  ok('…and the note names both people', w.calls.notes.some((m) => /Mauricio Perez/.test(m || '') && /Mauricio Gomez/.test(m || '')));
}

// ── REFUSES THE TWO CASES THAT WOULD COST MONEY, BEFORE EVER CALLING staffWriteOp ──
{
  const w = world({
    'a person': person('A Person', { paychex_id: '111' }),
    'b person': person('B Person', { paychex_id: '222' }),
  }, { typedAnswer: 'B Person' });
  await w.run('a person');
  ok('⛔ two different Paychex IDs refuses the merge outright — no write op sent', w.calls.writeOps.length === 0);
  ok('…and explains why, naming both numbers', w.calls.alerts.some((m) => /111/.test(m) && /222/.test(m)));
  ok('…never reaching the confirm dialog', w.calls.confirms.length === 0);
}
{
  const w = world({
    'a person': person('A Person', { register: { emp_id: 1 } }),
    'b person': person('B Person', { register: { emp_id: 2 } }),
  }, { typedAnswer: 'B Person' });
  await w.run('a person');
  ok('⛔ both sides able to sign in at a register refuses the merge too — no write op sent', w.calls.writeOps.length === 0);
  ok('…never reaching the confirm dialog', w.calls.confirms.length === 0);
}

// ── CANCEL AT EITHER STEP MEANS CANCEL ─────────────────────────────────────────────
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: null }); // Cancel on the prompt
  await w.run('a person');
  ok('⛔ cancelling the "merge into which person" prompt sends no write op', w.calls.writeOps.length === 0);
}
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: 'B Person', confirmAnswer: false });
  await w.run('a person');
  ok('⛔ declining the final confirm sends no write op either', w.calls.writeOps.length === 0);
}

// ── A TYPO'D TARGET NAME DOES NOT GUESS OR SEND A MALFORMED OP ────────────────────
{
  const w = world({
    'a person': person('A Person'),
    'b person': person('B Person'),
  }, { typedAnswer: 'Nobody By This Name' });
  await w.run('a person');
  ok('⛔ a name that matches nobody refuses rather than guessing — no write op sent', w.calls.writeOps.length === 0);
  ok('…and tells him to type it exactly as it appears', w.calls.alerts.some((m) => /exactly as it appears/.test(m)));
}

// ── TYPING THE LOSER'S OWN NAME BACK REFUSES, RATHER THAN A SELF-MERGE ────────────
{
  const w = world({
    'alice smith': person('Alice Smith'),
    'bailey jones': person('Bailey Jones'),
  }, { typedAnswer: 'Alice Smith' }); // typed the loser's own name
  await w.run('alice smith');
  ok('⛔ "merge into the same record" is refused outright — no write op sent', w.calls.writeOps.length === 0);
  ok('…and says plainly that it is the same record', w.calls.alerts.some((m) => /same record/.test(m)));
}

// ── NOTHING ELSE TO MERGE INTO ─────────────────────────────────────────────────────
{
  const w = world({ 'a person': person('A Person') });
  await w.run('a person');
  ok('⛔ with nobody else on the list, it says so and asks nothing', w.calls.prompts.length === 0 && w.calls.alerts.length === 1 && w.calls.writeOps.length === 0);
}

// ── A REFUSED write op (the mini says no — e.g. 409) LEAVES NO LOCAL TRACE ─────────
{
  const w = world({
    'loser key': person('Loser Name', { pid: 'loser-pid' }),
    'keeper key': person('Keeper Name', { pid: 'keeper-pid' }),
  }, { typedAnswer: 'Keeper Name', writeOpResult: null });   // staffWriteOp returns null on refusal
  await w.run('loser key');
  ok('⛔ a write op that the mini refuses sets no success note', !w.calls.notes.some((m) => /Merged/.test(m || '')));
}

// ── THE DUPLICATES PANEL: a real "Merge" button, wired, and gated correctly ───────
const dupesHTML = grab('staffDupesHTML');
ok('⛔ a "Merge into…" button exists in the duplicates panel, wired to staffMergeInto', /onclick="staffMergeInto\('\$\{esc\(p\.key\)\}'\)"/.test(dupesHTML));
ok('⛔ the Delete button is still there too — merge did not replace it', /onclick="staffRemove\('\$\{esc\(p\.key\)\}'\)"/.test(dupesHTML));
ok('⛔ the Merge button is suppressed when scanning the raw schedule app (staffMergeInto only knows staffS.people, not unmerged raw rows)',
   /\$\{staffRawRows\?'':`<button onclick="staffMergeInto/.test(dupesHTML));

// ── THE ACTUAL PERSISTENCE IS ONE merge OP, NOT LOCAL GAP-FILL/ALIAS/DELETE ANY MORE ──
const mergeFn = grab('staffMergeInto');
ok('⛔ staffMergeInto no longer gap-fills fields locally — that is the mini\'s job now',
   !/keeper\.rates=Object\.assign/.test(mergeFn) && !/delete staffS\.people\[loserKey\]/.test(mergeFn));
ok('⛔ the only persistence is one staffWriteOp merge call',
   /staffWriteOp\(\{op:'merge',loser:loser\.pid,keeper:keeper\.pid\}\)/.test(mergeFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
