// FIX A LOOSE NAME — tap the ⚑, Vinny's call 11/20/26.
//
//     node tools/check-staff-flag.mjs
//
// A raw Tips/Hours/timesheet-check name that doesn't resolve to Staff gets a tappable
// ⚑ that opens a small picker: alias it to an existing person, create a new one,
// restore a removed one, or mark it "not a person" (a WT-local ignore list, never a
// mini write). RUN, not read.
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
  if (i === -1) throw new Error('missing const ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};
const grabLet = (name) => {
  const i = src.indexOf('let ' + name + '=');
  if (i === -1) throw new Error('missing let ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};

function world({ people = {}, aliases = {}, kvValue, kvFails = false, writeOpResults = {}, confirmAnswer = true, promptAnswer, inputValues = {} } = {}) {
  const calls = { writeOps: [], kvGets: [], kvPushes: [], redraws: 0, alerts: [], confirms: [], prompts: [] };
  const ctx = {};
  const inputs = {};
  new Function('ctx', 'inputs', `
    const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings'];
    const POS='pos', TIPS='tips';
    let activeTab=POS; let posS={sec:'tips'};
    function tipsActive(){return activeTab===POS&&posS.sec===TIPS;}
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)}};
    Object.keys(staffS.people).forEach(k=>{if(!staffS.people[k].key)staffS.people[k].key=k;});
    ${grabConst('TIPS_IGNORE_KEY')}
    let tipsState={ignoreLoaded:false,ignoreSet:null};
    function esc(s){return(s||'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    ${grab('staffKeyOf')}
    const staffByFirst=(a,b)=>String(a.name||'').localeCompare(String(b.name||''));
    // Real input stand-ins, keyed by id — staffAddSpelling reads .value off one of
    // these by id, same as the real DOM, instead of window.prompt().
    const document={getElementById(id){
      if(!inputs[id])inputs[id]={value:${JSON.stringify(inputValues)}[id]||'',disabled:false};
      return inputs[id];
    }};
    ctx.inputs=inputs;
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function prompt(msg){ctx.calls.prompts.push(msg);return ${JSON.stringify(promptAnswer)};}
    function alert(msg){ctx.calls.alerts.push(msg);}
    async function kvGet(k){ctx.calls.kvGets.push(k);if(${JSON.stringify(kvFails)})throw new Error('network down');return {v:${JSON.stringify(kvValue === undefined ? null : kvValue)}};}
    async function kvPush(k,v,at){ctx.calls.kvPushes.push({k,v,at});}
    async function staffWriteOp(op){ctx.calls.writeOps.push(op);const key=op.pid+':'+op.op;const r=(${JSON.stringify(writeOpResults)});return (key in r)?r[key]:{};}
    function tipsHTML(){return '';}
    ${grab('staffFlagFindRemoved')}
    ${grab('staffFlagRedraw')}
    ${grab('staffFlagOpen')}
    ${grab('staffFlagClose')}
    ${grab('staffFlagResultsHTML')}
    ${grab('staffFlagSearch')}
    ${grab('staffFlagAlias')}
    ${grab('staffFlagCreate')}
    ${grab('staffFlagRestore')}
    ${grab('staffFlagIgnore')}
    ${grab('staffFlagHTML')}
    ${grab('staffAliasesFor')}
    ${grab('staffAddSpelling')}
    ${grab('staffDisplayMark')}
    function staffFlagIgnored(rawName){const k=staffKeyOf(rawName);return !!(k&&tipsState.ignoreSet&&tipsState.ignoreSet[k]);}
    ${grab('tipsFetchIgnore')}
    ctx.open=staffFlagOpen;ctx.close=staffFlagClose;ctx.search=staffFlagSearch;ctx.alias=staffFlagAlias;
    ctx.create=staffFlagCreate;ctx.restore=staffFlagRestore;ctx.ignore=staffFlagIgnore;ctx.html=staffFlagHTML;
    ctx.aliasesFor=staffAliasesFor;ctx.addSpelling=staffAddSpelling;ctx.mark=staffDisplayMark;
    ctx.fetchIgnore=tipsFetchIgnore;
    ctx.getState=()=>staffFlagS;ctx.getStaffS=()=>staffS;ctx.getTipsState=()=>tipsState;
  `)(ctx, inputs);
  ctx.calls = calls;
  return ctx;
}
const person = (name, extra = {}) => ({ name, sources: {}, at: 0, ...extra });

// ── staffFlagFindRemoved: by NAME, not key (a removed person's key is mangled) ─────
{
  // the real-world case: "Adelyn Porter" (same spelling) is removed, but her
  // projection KEY is now mangled with her pid — so staffS.people['adelyn porter']
  // does not exist any more, which is WHY she flags at all. Must be found by scanning
  // every record's NAME, never by treating staffKeyOf(name) as a key lookup.
  const w = world({ people: { 'adelyn porter a1b2': person('Adelyn Porter', { pid: 'p1', removed: { at: 1 } }) } });
  w.open('Adelyn Porter');
  ok('⛔ the mangled-key removed record is found by scanning NAMES, not by looking up staffKeyOf(name) as a key', w.getState().removedPerson && w.getState().removedPerson.pid === 'p1');
}
{
  const w = world({ people: { 'amy active': person('Amy Active', { pid: 'p1' }) } });
  w.open('Nobody Like This');
  ok('no removed match → null, not a false positive', w.getState().removedPerson === null);
}
{
  // a LIVE person who happens to share the spelling is never offered as "Restore"
  const w = world({ people: { 'amy active': person('Amy Active', { pid: 'p1' }) } });
  w.open('Amy Active');
  ok('⛔ a live (non-removed) name match is never offered as a restore target', w.getState().removedPerson === null);
}

// ── staffFlagSearch: live people only, substring, capped, sorted ───────────────────
{
  const w = world({
    people: {
      a: person('Bailey Jones', { pid: 'p1' }),
      b: person('Alice Bailey', { pid: 'p2' }),
      c: person('Removed Bailey', { pid: 'p3', removed: { at: 1 } }),
    },
  });
  w.open('some loose name');
  w.search('bailey');
  const names = w.getState().results.map(p => p.name);
  ok('⛔ a removed person never appears in "Same person as…" results', !names.includes('Removed Bailey'));
  ok('…matches are case-insensitive and sorted by first name', names.join(',') === 'Alice Bailey,Bailey Jones');
}
{
  const w = world({ people: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['p' + i, person('Match ' + i, { pid: 'p' + i })])) });
  w.open('x');
  w.search('match');
  ok('results are capped at 8', w.getState().results.length === 8);
}

// ── staffFlagAlias: the real op, and the real refusal path ─────────────────────────
{
  const w = world({ people: { k: person('Gabriella Chavez', { pid: 'keeper-pid' }) } });
  w.open('Gabby Chavez');
  await w.alias('keeper-pid');
  ok('⛔ exactly the alias op, with the raw spelling and the chosen pid', w.calls.writeOps.length === 1 && w.calls.writeOps[0].op === 'alias' && w.calls.writeOps[0].pid === 'keeper-pid' && w.calls.writeOps[0].spelling === 'Gabby Chavez');
  ok('panel closes on success', w.getState().name === null);
}
{
  // staffWriteOp returning falsy (refused, e.g. "spelling already taken") leaves the panel open
  const w = world({ people: { k: person('Someone', { pid: 'p1' }) }, writeOpResults: { 'p1:alias': null } });
  w.open('Gabby Chavez');
  await w.alias('p1');
  ok('⛔ a refused alias leaves the panel open, not silently closed', w.getState().name === 'Gabby Chavez');
}

// ── staffFlagCreate: confirm-gated, the right op, refusal and cancel do nothing ────
{
  const w = world({});
  w.open('Jack Fitzgerald');
  await w.create();
  ok('⛔ exactly one create op with the raw name', w.calls.writeOps.length === 1 && w.calls.writeOps[0].op === 'create' && w.calls.writeOps[0].person.name === 'Jack Fitzgerald');
  ok('panel closes on success', w.getState().name === null);
}
{
  const w = world({ confirmAnswer: false });
  w.open('Jack Fitzgerald');
  await w.create();
  ok('⛔ declining the confirm sends no op', w.calls.writeOps.length === 0);
}

// ── staffFlagRestore: the right op ──────────────────────────────────────────────────
{
  const w = world({ people: { k: person('Adelyn Porter', { pid: 'ap-pid', removed: { at: 1 } }) } });
  w.open('Adelyn Porter');
  await w.restore('ap-pid');
  ok('⛔ a status:active op naming the removed pid, nothing else', w.calls.writeOps.length === 1 && w.calls.writeOps[0].op === 'status' && w.calls.writeOps[0].pid === 'ap-pid' && w.calls.writeOps[0].status === 'active');
}

// ── staffFlagIgnore: WT-local only, never a mini write ──────────────────────────────
{
  const w = world({ kvValue: { names: ['Private Party'] } });
  w.open('Jonah Swett');
  await w.ignore();
  ok('⛔ ignore NEVER sends a staffWriteOp — it is not a Staff/mini concern at all', w.calls.writeOps.length === 0);
  ok('reads-merges-writes the ignore list rather than blind-overwriting it', w.calls.kvPushes[0].v.names.includes('Private Party') && w.calls.kvPushes[0].v.names.includes('Jonah Swett'));
  ok('the local ignoreSet updates immediately, no re-fetch needed', w.getTipsState().ignoreSet[w.getStaffS() && 'jonah swett'] === 'Jonah Swett' || Object.values(w.getTipsState().ignoreSet).includes('Jonah Swett'));
}
{
  // adding the same name (by normalized key) twice never duplicates it
  const w = world({ kvValue: { names: ['Jonah Swett'] } });
  w.open('jonah   swett');   // different spacing, same normalized key
  await w.ignore();
  ok('⛔ a name already on the list (by normalized key) is not duplicated', w.calls.kvPushes[0].v.names.length === 1);
}

// ── staffDisplayMark: ignored names show nothing, others get a tappable button ─────
{
  const w = world({ kvValue: null });
  w.getTipsState().ignoreSet = { 'private party': 'Private Party' };
  ok('⛔ an ignored name renders NOTHING — settled, not flagged', w.mark(false, 'Private Party') === '');
  ok('a matched name renders nothing regardless', w.mark(true, 'Anyone') === '');
  const html = w.mark(false, 'Jack Fitzgerald');
  ok('⛔ an unmatched, non-ignored name renders a CLICKABLE mark, wired to staffFlagOpen with the raw name', /onclick="staffFlagOpen\('Jack Fitzgerald'\)"/.test(html));
}

// ── tipsFetchIgnore: loads once, tolerates a missing/malformed key ─────────────────
{
  const w = world({ kvValue: { names: ['Private Party', 'Jack Fitzgerald'] } });
  await w.fetchIgnore();
  ok('builds the ignore set from the stored names', Object.values(w.getTipsState().ignoreSet).sort().join(',') === 'Jack Fitzgerald,Private Party');
  const before = w.calls.kvGets.length;
  await w.fetchIgnore();
  ok('⛔ a second call does not re-fetch — loads once', w.calls.kvGets.length === before);
}
{
  const w = world({ kvValue: null });
  await w.fetchIgnore();
  ok('a missing key leaves an empty set, never throws', Object.keys(w.getTipsState().ignoreSet).length === 0);
}
{
  const w = world({ kvFails: true });
  await w.fetchIgnore();
  ok('⛔ a failed fetch never throws — leaves an empty (not null) ignore set, so staffFlagIgnored never crashes on it', Object.keys(w.getTipsState().ignoreSet).length === 0);
}

// ── staffAliasesFor / staffAddSpelling (Staff row: "Other spellings") ──────────────
{
  const w = world({
    people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) },
    aliases: { 'mike fornero': 'keeper', 'unrelated name': 'someone else' },
  });
  const al = w.aliasesFor(w.getStaffS().people.keeper);
  ok('⛔ only aliases pointing AT this person\'s own key, sorted', al.join(',') === 'mike fornero');
}
{
  const w = world({ people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) } });
  ok('nobody aliased yet → empty list, not a throw', w.aliasesFor(w.getStaffS().people.keeper).length === 0);
}
{
  // ⛔ 11/20/26, Jarvis's review: a real input, never window.prompt() — iPad Safari
  // silently drops a paste into prompt(). staffAddSpelling reads the live box by id.
  const w = world({
    people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) },
    inputValues: { 'staff-addspell-keeper': 'Mike Fornero' },
  });
  await w.addSpelling('keeper');
  ok('⛔ typing a spelling into the real input sends exactly one alias op for this pid', w.calls.writeOps.length === 1 && w.calls.writeOps[0].op === 'alias' && w.calls.writeOps[0].pid === 'p1' && w.calls.writeOps[0].spelling === 'Mike Fornero');
}
{
  const w = world({
    people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) },
    inputValues: { 'staff-addspell-keeper': '   ' },
  });
  await w.addSpelling('keeper');
  ok('⛔ a blank (or whitespace-only) box sends nothing', w.calls.writeOps.length === 0);
}
{
  // a refused write re-enables the box so the typed text can be fixed and retried
  const w = world({
    people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) },
    inputValues: { 'staff-addspell-keeper': 'Already Taken Spelling' },
    writeOpResults: { 'p1:alias': null },
  });
  await w.addSpelling('keeper');
  ok('⛔ a refusal re-enables the box instead of leaving it stuck disabled', w.inputs['staff-addspell-keeper'].disabled === false);
}
{
  // a missing input element (the row isn't actually open) must not throw
  const w = world({ people: { keeper: person('Michael Fornero', { pid: 'p1', key: 'keeper' }) } });
  let threw = false;
  try { await w.addSpelling('nobody-such-key'); } catch (e) { threw = true; }
  ok('a key with no matching person is a no-op, not a throw', !threw && w.calls.writeOps.length === 0);
}
{
  // source-level: no window.prompt() left anywhere in staffAddSpelling
  const addSpellingFn = grab('staffAddSpelling');
  ok('⛔ staffAddSpelling never calls window.prompt() — iPad Safari drops a paste into it', !/\bprompt\(/.test(addSpellingFn));
  ok('…reads a real input by id instead', /getElementById\('staff-addspell-'\+kid\)/.test(addSpellingFn));
}

// ── source-level: the mark actually reaches Tips/Hours/timesheet-checks rows ──────
const tipsHTMLFn = grab('tipsHTML');
ok('tipsHTML\'s row passes the RAW name to staffDisplayMark, not the resolved one', /staffDisplayMark\(disp\.matched,name\)/.test(tipsHTMLFn));
const hoursHTMLFn = grab('hoursHTML');
ok('hoursHTML\'s row does the same', /staffDisplayMark\(disp\.matched,name\)/.test(hoursHTMLFn));
const tsChecksHTMLFn = grab('tsChecksHTML');
ok('⛔ the timesheet-checks row now ALSO shows the tappable mark — it used to show only the resolved name, never the flag', /staffDisplayMark\(staffDisplayName\(c\.name\)\.matched,c\.name\)/.test(tsChecksHTMLFn));
ok('⛔ the picker overlay is mounted on BOTH tipsHTML branches (tips view and hours view), or it would vanish depending which sub-tab is open', (tipsHTMLFn.match(/staffFlagHTML\(\)/g) || []).length === 2);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
