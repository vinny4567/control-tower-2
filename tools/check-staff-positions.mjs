// HOLDING A JOB IS people.positions — Jarvis/Vinny 11/22/26: "the assign a job button didnt work."
//
//     node tools/check-staff-positions.mjs
//
// Giving a job used to write rates[job]=0 ("holds it, no override"). The mini's cleanRates
// (people.js) keeps only rates > 0, so the $0 entry was dropped, the re-pull came back without it
// and the tick vanished. On the mini, holding a job is positions — what the register's clock-in
// picker reads. This runs the REAL page functions against a fake mini that cleans the patch the
// same way the real one does (positions: trimmed, de-duped strings; rates: only > 0), then
// re-pulls — so "it shows ticked after the re-pull" is tested, not assumed.
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
const line = (re) => src.match(re)[0];

// the mini's own cleaning, as in angelis-pos-server people.js cleanPositions / cleanRates
const cleanPositions = (v) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))] : null;
const cleanRates = (v) => { if (!v || typeof v !== 'object') return null; const o = {}; for (const [k, x] of Object.entries(v)) { const n = Number(x); if (Number.isFinite(n) && n > 0) o[k] = n; } return o; };

function world(people) {
  const ctx = { writes: [], confirms: [], alerts: [], refreshes: 0, mini: JSON.parse(JSON.stringify(people)) };
  const listeners = {};
  const els = { '#sbj-job': { value: '' }, '#sbj-q': { value: '', focus() {} }, '#sbj-list': { innerHTML: '' }, '#sbj-count': { textContent: '' } };
  const wrap = { style: {}, set innerHTML(v) {}, querySelector: (q) => els[q], addEventListener: (t, f) => { listeners[t] = f; }, remove() { ctx.closed = true; } };
  const document = { createElement: () => wrap, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {},
    getElementById: (id) => ctx.selects[id] || null };
  ctx.selects = {}; ctx.els = els; ctx.listeners = listeners;
  new Function('ctx', 'document', 'cleanPositions', 'cleanRates', `
    let staffS={people:JSON.parse(JSON.stringify(ctx.mini)),jobs:{}};
    ${line(/const STAFF_JOBS=\[[^\]]+\];/)}
    ${line(/const staffJobCanon=[^\n]+/)}
    ${line(/const staffJobKey=[^\n]+/)}
    const posInput='';function esc(s){return String(s==null?'':s);}
    function staffByFirst(a,b){return a.name.localeCompare(b.name);}
    function staffAllJobNames(){return STAFF_JOBS.slice();}
    function staffTouch(){} function staffRefresh(){ctx.refreshes++;}
    function confirm(m){ctx.confirms.push(m);return true;} function alert(m){ctx.alerts.push(m);}
    function staffJobRate(){return 15;} function posBtn(){return '';} function staffDrawer(){return null;}
    function staffCanSignIn(){return false;}
    // the mini: clean the patch exactly as people.js does, store, then the page re-pulls the projection
    async function staffWriteOp(op){
      ctx.writes.push(JSON.parse(JSON.stringify(op)));
      const row=Object.values(ctx.mini).find(x=>x.pid===op.pid);if(!row)return false;
      const pt=op.patch||{};
      if(pt.positions!==undefined){const v=cleanPositions(pt.positions);if(!v)return false;row.positions=v;}
      if(pt.rates!==undefined){const v=cleanRates(pt.rates);if(!v)return false;row.rates=v;}
      staffS.people=JSON.parse(JSON.stringify(ctx.mini));   // staffLoad(true): the re-pull
      return true;
    }
    ${grab('staffStdJob')}${grab('staffHolds')}${grab('staffPositionsWith')}${grab('staffRealRates')}
    ${grab('staffAddJob')}${grab('staffDelPersonJob')}${grab('staffEdit')}${grab('staffBulkJob')}
    ctx.add=staffAddJob;ctx.del=staffDelPersonJob;ctx.edit=staffEdit;ctx.bulk=staffBulkJob;ctx.holds=staffHolds;
    ctx.p=(k)=>staffS.people[k];
  `)(ctx, document, cleanPositions, cleanRates);
  // drive the bulk modal: pick a job, tick/untick people, press Apply
  ctx.bulkRun = async (job, ticks) => {
    ctx.bulk();
    els['#sbj-job'].value = job;
    listeners.change({ target: { id: 'sbj-job', closest: () => null } });
    for (const [k, on] of Object.entries(ticks)) listeners.change({ target: { id: '', closest: () => ({ dataset: { k }, checked: on }) } });
    const before = ctx.writes.length;
    listeners.click({ target: { closest: () => ({ dataset: { a: 'yes' } }) } });
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    return ctx.writes.slice(before);
  };
  return ctx;
}
const P = (key, extra = {}) => ({ [key]: { key, pid: 'pid-' + key.replace(/ /g, '-'), name: key.replace(/\b\w/g, (c) => c.toUpperCase()), positions: [], rates: {}, ...extra } });

// ── THE CASE: bulk Assign Food Runner to Aiden Burke (positions []) ─────────────────────────
{
  const w = world({ ...P('aiden burke'), ...P('carter bergholtz', { positions: ['Busser'] }) });
  const sent = await w.bulkRun('Food Runner', { 'aiden burke': true, 'carter bergholtz': true });
  ok('⛔ giving a job writes POSITIONS (current + the job), never a $0 rate', sent.length === 2 && sent.every((o) => o.patch.positions && !('rates' in o.patch)));
  ok('…Carter keeps Busser and gains Food Runner', JSON.stringify(sent.find((o) => o.pid === 'pid-carter-bergholtz').patch.positions) === '["Busser","Food Runner"]');
  ok('⛔ after the mini cleans it and the page re-pulls, Aiden HOLDS Food Runner (positions ["Food Runner"])', JSON.stringify(w.p('aiden burke').positions) === '["Food Runner"]' && w.holds(w.p('aiden burke'), 'Food Runner'));
  ok('…so the tick is still there the next time the panel opens', w.holds(w.p('carter bergholtz'), 'Food Runner'));
  ok('the panel ends by refreshing the Staff list in place (staffRefresh — the keep-scroll path), not a full redraw', w.refreshes >= 1);
  // …then take it off
  const off = await w.bulkRun('Food Runner', { 'aiden burke': false });
  ok('⛔ unticking takes it off: positions without it, plus the full rates object', off.length === 1 && JSON.stringify(off[0].patch.positions) === '[]' && JSON.stringify(off[0].patch.rates) === '{}');
  ok('…and after the re-pull Aiden no longer holds it', !w.holds(w.p('aiden burke'), 'Food Runner'));
}
// ── the OLD way, for contrast: a $0 rate does not survive the mini ──────────────────────────
{
  const row = { rates: cleanRates({ 'Food Runner': 0 }) };
  ok('fixture: the mini really does drop a $0 rate (this is why the tick vanished)', JSON.stringify(row.rates) === '{}');
}
// ── the per-person "add a job… / Add" ────────────────────────────────────────────────────────
{
  const w = world({ ...P('drew murphy', { positions: ['Server'], rates: { Server: 16 } }) });
  w.selects['staff-job-drew_murphy'] = { value: 'Food Runner' };
  await w.add('drew murphy');
  const o = w.writes.at(-1);
  ok('⛔ per-person Add writes positions + the job, and leaves rates alone', JSON.stringify(o.patch) === JSON.stringify({ positions: ['Server', 'Food Runner'] }));
  ok('…and after the re-pull it is held, the Server override untouched', w.holds(w.p('drew murphy'), 'Food Runner') && w.p('drew murphy').rates.Server === 16);
  w.selects['staff-job-drew_murphy'] = { value: 'food runner' };
  const n = w.writes.length; await w.add('drew murphy');
  ok('adding a job they already hold (any spelling) does not add a second copy', JSON.stringify(w.writes.at(-1).patch.positions) === '["Server","Food Runner"]' && w.writes.length === n + 1);
}
{
  const w = world({ ...P('luke fugiel') });
  w.selects['staff-job-luke_fugiel'] = { value: 'training' };
  await w.add('luke fugiel');
  ok('a job is stored under its STAFF_JOBS spelling ("training" → "Training", the name the register punches)', JSON.stringify(w.p('luke fugiel').positions) === '["Training"]');
}
// ── per-person × ─────────────────────────────────────────────────────────────────────────────
{
  const w = world({ ...P('ava austin', { positions: ['Food Runner', 'Busser'], rates: { 'Food Runner': 14, Busser: 13 } }) });
  await w.del('ava austin', 'Food Runner');
  const o = w.writes.at(-1);
  ok('⛔ the × takes the job out of positions AND drops its override (full rates object sent)', JSON.stringify(o.patch.positions) === '["Busser"]' && JSON.stringify(o.patch.rates) === '{"Busser":13}');
  ok('…and asked first, naming the override', /Their \$14 override for it goes too/.test(w.confirms.at(-1)));
}
// ── typing an override ───────────────────────────────────────────────────────────────────────
{
  const w = world({ ...P('drew mastrino', { positions: ['Food Runner'] }) });
  await w.edit('drew mastrino', 'rate:Food Runner', '15.5');
  ok('⛔ an override > 0 writes rates only — positions untouched when the job is already held', JSON.stringify(w.writes.at(-1).patch) === JSON.stringify({ rates: { 'Food Runner': 15.5 } }));
  await w.edit('drew mastrino', 'rate:Food Runner', '');
  ok('⛔ emptying the box drops the override and the job STAYS held (through positions)', JSON.stringify(w.writes.at(-1).patch) === JSON.stringify({ rates: {} }) && w.holds(w.p('drew mastrino'), 'Food Runner'));
}
{
  const w = world({ ...P('griffin fiore', { positions: [], rates: { Busser: 12 } }) });
  await w.edit('griffin fiore', 'rate:Busser', '13');
  ok('an override on a job held only by an old rate > 0 also adds the job to positions', JSON.stringify(w.writes.at(-1).patch) === JSON.stringify({ rates: { Busser: 13 }, positions: ['Busser'] }));
  await w.edit('griffin fiore', 'rate:Busser', '');
  ok('…so emptying it later can never make the job vanish', w.holds(w.p('griffin fiore'), 'Busser'));
}
{
  const w = world({ ...P('lexi allen', { positions: ['Server'], rates: { Server: 0, 'food runner ': 0, Busser: 11 } }) });
  await w.edit('lexi allen', 'rate:Server', '17');
  ok('stale $0 entries are not sent back (the mini would drop them anyway) — only real overrides', JSON.stringify(w.writes.at(-1).patch.rates) === JSON.stringify({ Busser: 11, Server: 17 }));
}
// ── who HOLDS a job: positions OR a rate > 0 (older records) ─────────────────────────────────
{
  const w = world({ ...P('sean young', { positions: ['Server'], rates: { Busser: 12, Host: 0 } }) });
  const p = w.p('sean young');
  ok('held through positions', w.holds(p, 'Server'));
  ok('held through an old override > 0 (older records)', w.holds(p, 'Busser'));
  ok('⛔ a $0 rate alone is NOT holding the job', !w.holds(p, 'Host'));
  ok('spelling does not matter ("food runner " = "Food Runner")', w.holds({ positions: ['food runner '] }, 'Food Runner'));
}
// ── the person's own job list reads the same union ───────────────────────────────────────────
{
  const det = grab('staffDetail');
  ok('the Staff detail lists positions ∪ rates > 0, one row per job whatever the spelling',
     /\[\.\.\.\(p\.positions\|\|\[\]\),\.\.\.Object\.keys\(p\.rates\|\|\{\}\)\.filter\(n=>p\.rates\[n\]>0\)\]/.test(det) && /staffJobKey\(h\)===staffJobKey\(j\)/.test(det));
}
ok('⛔ nothing in the page writes a $0 rate to mean "holds the job" any more', !/rates\[[^\]]+\]=0;/.test(src) && !/\?n:0;/.test(grab('staffEdit')));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
