// CARRY OVER OLD SPELLINGS — Jarvis, 11/20/26.
//
//     node tools/check-staff-carry.mjs
//
// The retired tip roster's alias map (cloud KV ct_tips_roster → .aliases) did the import-time
// canonicalising — "priscill lagace" (MICROS) → Priscilla. Staff aliases do it now, but not
// every old spelling made it across, so a MICROS import would file those people under a second
// name. One-time: list each old spelling that doesn't already reach the right Staff person;
// Apply sends one op:'alias' per row. Never applied: a target not live on Staff, or a spelling
// that already reaches somebody ELSE. RUN, not read.
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

function world({ people = {}, aliases = {}, roster, kvFails = false, confirmAnswer = true, writeOk = true } = {}) {
  const calls = { writes: [], confirms: [], alerts: [], kvGets: [] };
  const ctx = { calls };
  new Function('ctx', `
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)},showCarry:true,carry:null};
    const TIPS_ROSTER_KEY='ct_tips_roster';
    const KV_FAIL={fail:1};
    function kvFailed(r){return r===KV_FAIL;}
    async function kvGet(k){ctx.calls.kvGets.push(k);return ${kvFails}?KV_FAIL:{v:${JSON.stringify(roster === undefined ? null : roster)},at:1};}
    ${grab('staffKeyOf')}
    ${grab('staffEmployed')}
    ${grab('staffResolveForTips')}
    ${grab('esc')}
    const posCardCss='';function posBtn(){return '';}
    function staffRefresh(){} function staffRedraw(){}
    function confirm(m){ctx.calls.confirms.push(m);return ${JSON.stringify(confirmAnswer)};}
    function alert(m){ctx.calls.alerts.push(m);}
    async function staffWriteOp(op){ctx.calls.writes.push(op);
      if(${JSON.stringify(writeOk)}&&op.op==='alias'){staffS.aliases[staffKeyOf(op.spelling)]=Object.keys(staffS.people).find(k=>staffS.people[k].pid===op.pid);}
      return ${JSON.stringify(writeOk)}?{}:null;}
    ${grab('staffCarryBuild')}
    ${grab('staffCarryApply')}
    ${grab('staffCarryHTML')}
    ctx.build=staffCarryBuild;ctx.apply=staffCarryApply;ctx.html=staffCarryHTML;ctx.st=()=>staffS;
  `)(ctx);
  return ctx;
}
const P = (key, name, extra = {}) => ({ [key]: { key, name, ...extra } });

// The real shape that broke: Staff knows "priscilla la gace" → Lagace, but not the MICROS spelling.
const people = {
  ...P('priscilla lagace', 'Priscilla Lagace', { pid: 'p1' }),
  ...P('amy server', 'Amy Server', { pid: 'p2' }),
  ...P('bea busser', 'Bea Busser', { pid: 'p3' }),
  ...P('olive old', 'Olive Old', { pid: 'p4', removed: { at: 1 } }),
};
const aliases = { 'priscilla la gace': 'priscilla lagace' };
const roster = {
  sections: {},
  aliases: {
    'priscill lagace': 'Priscilla La Gace',   // MICROS spelling → old canon → (Staff alias) → Lagace : TO ADD
    'priscilla la gace': 'Priscilla La Gace', // already reaches Lagace                              : done
    'amy servr': 'Amy Server',                // new (typo) spelling for a live person                : TO ADD
    'amy s': 'Amy Server',                    // keys to just "amy" — would catch every Amy             : short
    'mike fornero': 'Mike Fornero',           // old canon not on Staff                               : nostaff
    'olive olde': 'Olive Old',                   // target is a removed person                          : former
    'bea busser': 'Amy Server',               // spelling already reaches SOMEBODY ELSE (Bea)        : clash
  },
};

{
  const w = world({ people, aliases, roster });
  await w.build();
  const rows = w.st().carry.rows, by = s => rows.find(r => r.spelling === s);
  ok('reads the retired roster from the cloud, read-only (one kvGet of ct_tips_roster)', w.calls.kvGets.length === 1 && w.calls.kvGets[0] === 'ct_tips_roster');
  ok('⛔ the MICROS spelling "priscill lagace" is proposed for Priscilla LAGACE — through the old canon AND Staff\'s own alias', by('priscill lagace') && by('priscill lagace').status === 'todo' && by('priscill lagace').pid === 'p1' && by('priscill lagace').targetName === 'Priscilla Lagace');
  ok('a spelling that already reaches the right person is not listed — counted as done', !by('priscilla la gace') && w.st().carry.done === 1);
  ok('a new spelling for a live person is proposed', by('amy servr') && by('amy servr').status === 'todo' && by('amy servr').pid === 'p2');
  ok('⛔ a spelling that keys to ONE word ("amy s" → "amy") is too broad — listed, never applied', by('amy s') && by('amy s').status === 'short');
  ok('⛔ an old name that isn\'t on Staff is listed as "not on Staff", never guessed', by('mike fornero') && by('mike fornero').status === 'nostaff' && by('mike fornero').pid === null);
  ok('⛔ a target who is no longer on staff is listed as former, not applied', by('olive olde') && by('olive olde').status === 'former');
  ok('⛔ a spelling that already reaches SOMEBODY ELSE is a clash — listed, not applied', by('bea busser') && by('bea busser').status === 'clash' && by('bea busser').nowName === 'Bea Busser');
  ok('rows to add sort first', rows[0].status === 'todo' && rows[1].status === 'todo');
  const html = w.html();
  ok('the panel shows the Apply count for only the addable rows', html.includes('Apply 2'));
  ok('…and says why each skipped row is skipped', html.includes('isn\'t on Staff') && html.includes('no longer on staff') && html.includes('already reaches <b>Bea Busser</b>') && html.includes('too short to link safely'));

  await w.apply();
  ok('Apply asks first', w.calls.confirms.length === 1);
  ok('⛔ exactly one op:"alias" per addable row — nothing for nostaff / former / clash', w.calls.writes.length === 2 && w.calls.writes.every(o => o.op === 'alias'));
  ok('⛔ each write carries the right person and the old spelling', w.calls.writes.some(o => o.pid === 'p1' && o.spelling === 'priscill lagace') && w.calls.writes.some(o => o.pid === 'p2' && o.spelling === 'amy servr'));
  ok('the panel closes afterwards and reports the count', w.st().showCarry === false && /2 carried over/.test(w.calls.alerts[0] || ''));
}
{
  const w = world({ people, aliases, roster, confirmAnswer: false });
  await w.build(); await w.apply();
  ok('⛔ declining the confirm sends nothing', w.calls.writes.length === 0);
}
{
  // linked from another screen between build and Apply → left alone
  const w = world({ people, aliases, roster });
  await w.build();
  w.st().aliases['amy servr'] = 'amy server';
  await w.apply();
  ok('⛔ a spelling linked elsewhere in the meantime is re-checked and NOT re-sent', w.calls.writes.length === 1 && w.calls.writes[0].spelling === 'priscill lagace');
}
{
  const w = world({ people, aliases, roster, kvFails: true });
  await w.build();
  ok('⛔ an unreachable store is an error on screen, not an empty "nothing to do"', !w.st().carry.rows && /could not be reached/.test(w.st().carry.err));
}
{
  const w = world({ people, aliases, roster: { sections: {} } });
  await w.build();
  ok('a roster with no alias map says so', /no old spellings/.test(w.st().carry.err || ''));
}
{
  const w = world({ people, aliases: { ...aliases, 'priscill lagace': 'priscilla lagace', 'amy servr': 'amy server' }, roster });
  await w.build(); await w.apply();
  ok('nothing left to add → Apply refuses with a message, sends nothing', w.calls.writes.length === 0 && w.calls.alerts.length === 1);
}

// ⛔ the retired roster is READ here, never written
const fns = grab('staffCarryBuild') + grab('staffCarryApply') + grab('staffCarryHTML');
ok('⛔ nothing in the carry-over writes ct_tips_roster (no kvPush / kvSend)', !/kvPush\(|kvSend\(/.test(fns));
ok('⛔ every Staff change goes through staffWriteOp as op:"alias" — no rename, no other op', /staffWriteOp\(\{op:'alias',pid:r\.pid,spelling:r\.spelling\}\)/.test(fns) && (fns.match(/staffWriteOp\(/g) || []).length === 1);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
