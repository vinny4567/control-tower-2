// FILL DEPARTMENTS — one-time proposal tool, Vinny's call 11/20/26.
//
//     node tools/check-staff-filldept.mjs
//
// Proposes a department for everyone LIVE with no department set, from their Staff
// positions, when they point at a single department. Never touches anyone who already
// has one, and never guesses on a conflict — RUN, not read.
//
// ⚠️ 11/20/26 — this used to ALSO propose from which Tips-roster section a person was
// already in (Source 1). The roster is retired as a name/section source entirely (Vinny:
// "the staff list... trumps any other version"), so that source — and every test of it —
// is gone. Positions (Source 2, now the only source) are unaffected.
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

function world({ people = {}, writeOpResults = {}, confirmAnswer = true } = {}) {
  const calls = { writeOps: [], refreshes: 0, alerts: [], confirms: [] };
  const ctx = {};
  new Function('ctx', `
    let staffS={people:${JSON.stringify(people)},showFillDept:true,fillDept:null};
    Object.keys(staffS.people).forEach(k=>{if(!staffS.people[k].key)staffS.people[k].key=k;});
    ${grabConst('STAFF_DEPARTMENTS')}
    ${grabConst('STAFF_DEPARTMENT_LABELS')}
    ${grabConst('STAFF_FILLDEPT_POSITION')}
    ${grab('staffEmployed')}
    const staffJobCanon=(n)=>String(n||'').replace(/\\s+/g,' ').trim();
    const staffJobKey=(n)=>staffJobCanon(n).toLowerCase();
    const staffByFirst=(a,b)=>String(a.name||'').localeCompare(String(b.name||''));
    function esc(s){return(s||'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    const posCardCss='';const posInput='';function posBtn(){return ''}
    function staffRedraw(){}
    function staffRefresh(){ctx.calls.refreshes++;}
    function alert(msg){ctx.calls.alerts.push(msg);}
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    async function staffWriteOp(op){
      ctx.calls.writeOps.push(op);
      const key=(${JSON.stringify(writeOpResults)});
      if(op.pid in key)return key[op.pid];
      return {};
    }
    ${grab('staffFillDeptBuild')}
    ${grab('staffFillDeptSetRow')}
    ${grab('staffFillDeptApply')}
    ${grab('staffFillDeptHTML')}
    ctx.build=staffFillDeptBuild;ctx.setRow=staffFillDeptSetRow;ctx.apply=staffFillDeptApply;
    ctx.html=staffFillDeptHTML;ctx.getStaffS=()=>staffS;
  `)(ctx);
  ctx.calls = calls;
  return ctx;
}
const person = (name, extra = {}) => ({ name, sources: {}, at: 0, ...extra });

// ── NEVER TOUCHES SOMEBODY WHO ALREADY HAS A DEPARTMENT ────────────────────────────
{
  const w = world({ people: { 'has one': person('Has One', { pid: 'p1', department: 'server' }) } });
  await w.build();
  ok('⛔ a person who already has a department is not even listed, let alone proposed', w.getStaffS().fillDept.rows.length === 0);
}

// ── A SINGLE-DEPARTMENT POSITION PROPOSES ONE ───────────────────────────────────────
{
  const w = world({ people: { 'amy server': person('Amy Server', { pid: 'p1', positions: ['Server'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'amy server');
  ok('Server position → proposes server', !!r && r.pick === 'server' && !r.conflict);
}
{
  const w = world({ people: { 'wes wed': person('Wes Wed', { pid: 'p1', positions: ['Food Runner'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'wes wed');
  ok('Food Runner position → proposes runner', !!r && r.pick === 'runner');
}
{
  const w = world({ people: { 'dana dish': person('Dana Dish', { pid: 'p1', positions: ['Dishwasher'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'dana dish');
  ok('Dishwasher position → proposes kitchen', !!r && r.pick === 'kitchen');
}
{
  const w = world({ people: { 'cody cook': person('Cody Cook', { pid: 'p1', positions: ['Cook', 'Salads'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'cody cook');
  ok('Cook + Salads (both kitchen) → one agreeing proposal, not a false conflict', !!r && r.pick === 'kitchen' && !r.conflict);
}
{
  const w = world({ people: { 'bea bus': person('Bea Bus', { pid: 'p1', positions: ['Busser'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'bea bus');
  ok('Busser position alone → proposes busser', !!r && r.pick === 'busser');
}

// ── CONFLICTS: more than one candidate is NEVER guessed ─────────────────────────────
{
  const w = world({ people: { 'con flict': person('Con Flict', { pid: 'p1', positions: ['Server', 'Bartender'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'con flict');
  ok('⛔ two different implied departments → flagged a conflict, nothing picked', !!r && r.conflict === true && r.pick === '');
  ok('…but both candidates are still offered, marked, for Vinny to choose from', r.options.includes('server') && r.options.includes('bartender'));
}
{
  const w = world({ people: { 'host only': person('Host Only', { pid: 'p1', positions: ['Host'] }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'host only');
  ok('⛔ a Host (no mapped position) has no signal at all → nothing picked, not a guess', !!r && r.conflict === false && r.options.length === 0 && r.pick === '');
}
{
  const w = world({ people: { 'nada nobody': person('Nada Nobody', { pid: 'p1' }) } });
  await w.build();
  const r = w.getStaffS().fillDept.rows.find(x => x.key === 'nada nobody');
  ok('no positions at all → no signal, left for a pick', !!r && r.pick === '');
}

// ── NEVER PROPOSES FOR SOMEBODY NOT LIVE ────────────────────────────────────────────
{
  const w = world({
    people: { 'rem removed': person('Rem Removed', { pid: 'p1', removed: { at: 1 }, positions: ['Server'] }) },
  });
  await w.build();
  ok('⛔ a removed person is never even listed for a department proposal', w.getStaffS().fillDept.rows.length === 0);
}
{
  const w = world({
    people: { 'ina inactive': person('Ina Inactive', { pid: 'p1', active: false, positions: ['Server'] }) },
  });
  await w.build();
  ok('⛔ neither is somebody marked inactive', w.getStaffS().fillDept.rows.length === 0);
}

// ── A PICK CAN BE CHANGED BEFORE APPLY, AND ONLY A VALID DEPARTMENT STICKS ──────────
{
  const w = world({ people: { 'amy server': person('Amy Server', { pid: 'p1', positions: ['Server'] }) } });
  await w.build();
  w.setRow('amy server', 'bartender');
  ok('Vinny can override the proposed pick', w.getStaffS().fillDept.rows[0].pick === 'bartender');
  w.setRow('amy server', 'not-a-real-department');
  ok('⛔ an invalid value never sticks — falls back to skip', w.getStaffS().fillDept.rows[0].pick === '');
}

// ── APPLY: one update op per picked row, through staffWriteOp, nothing unpicked ────
{
  const w = world({
    people: {
      'amy server': person('Amy Server', { pid: 'p1', positions: ['Server'] }),
      'host only': person('Host Only', { pid: 'p2', positions: ['Host'] }),
    },
  });
  await w.build();
  await w.apply();
  ok('⛔ exactly one write op — only the picked row, never the unpicked "you pick" row', w.calls.writeOps.length === 1);
  ok('…the right op shape', w.calls.writeOps[0].op === 'update' && w.calls.writeOps[0].pid === 'p1' && w.calls.writeOps[0].patch.department === 'server');
}
{
  // nothing picked at all → refuses rather than sending nothing silently
  const w = world({ people: { 'host only': person('Host Only', { pid: 'p1', positions: ['Host'] }) } });
  await w.build();
  await w.apply();
  ok('⛔ nothing picked anywhere → refuses outright, no write op, explains why', w.calls.writeOps.length === 0 && w.calls.alerts.length === 1);
}
{
  // declining the confirm sends nothing
  const w = world({ people: { 'amy server': person('Amy Server', { pid: 'p1', positions: ['Server'] }) }, confirmAnswer: false });
  await w.build();
  await w.apply();
  ok('⛔ declining the confirm sends no write op', w.calls.writeOps.length === 0);
}
{
  // a department set on this person by another screen in the meantime is never overwritten
  const w = world({ people: { 'amy server': person('Amy Server', { pid: 'p1', positions: ['Server'] }) } });
  await w.build();
  w.getStaffS().people['amy server'].department = 'events';   // changed elsewhere between build and apply
  await w.apply();
  ok('⛔ a department set on the person between building the list and pressing Apply is never overwritten', w.calls.writeOps.length === 0);
}

// ── THE CARD ITSELF: toggled, and a conflict/no-signal row reads honestly ──────────
{
  const buildFn = grab('staffFillDeptBuild');
  ok('never proposes for anyone who already has a department', /if\(!staffEmployed\(p\)\|\|p\.department\)return;/.test(buildFn));
  ok('⛔ no longer reads the (retired) Tips roster at all', !/TIP_ROSTER_DATA|tipsFetchRoster/.test(buildFn));
  const htmlFn = grab('staffFillDeptHTML');
  ok('renders nothing when the panel is closed', /if\(!staffS\.showFillDept\)return/.test(htmlFn));
  ok('marks a conflict row and a no-signal row distinctly, in the text Vinny actually reads', /multiple possible/.test(htmlFn) && /no signal/.test(htmlFn));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
