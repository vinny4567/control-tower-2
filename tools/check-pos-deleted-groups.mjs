// DELETING A MOD GROUP: ASK FIRST, THEN IT'S GONE — Vinny, 11/20/26: "the only thing i want is a
// confirmation after pressing x in case anyone accidentally presses it."
//
//     node tools/check-pos-deleted-groups.mjs
//
// The red ✕ on a group card asks in-page (posAsk, Cancel the default — iPad-safe, not
// window.confirm). On Delete the group leaves the list. No red undo card, no "deleted · show"
// line (both tried and dropped). RUN, not read.
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
const line = (name) => { const i = src.indexOf('const ' + name + '='); return src.slice(i, src.indexOf('\n', i)); };

const groups = [
  { num: 120, name: 'Liquor Mods', used_by: ['Titos'], choices: [] },
  { num: 250, name: 'All Food Mods', used_by: ['PASTA', 'Titos'], choices: [] },
  { num: 300, name: 'Rocks', used_by: [], choices: [] },
];
function world({ deleted = [], answer = true } = {}) {
  const ctx = { asked: [], pushes: [], redraws: 0 };
  new Function('ctx', `
    let posS={cat:{mod_groups:${JSON.stringify(groups)}},q:''};
    let posDeletedGroups=${JSON.stringify(deleted)},posNewGroups=[],posGroupNames={},posGroupMods={};
    const posCardCss='';function posBtn(){return '';}
    function esc(s){return String(s==null?'':s);} function posEnc(s){return encodeURIComponent(s);}
    function posGroupKindHTML(){return '';} function posGroupModsHTML(){return '';} function posGroupAttachHTML(){return '';} function posUsedByHTML(){return '';}
    function posRedraw(){ctx.redraws++;}
    function kvPush(k,v){ctx.pushes.push({k,v:JSON.parse(JSON.stringify(v))});}
    async function posAsk(q,yes,no,opts){ctx.asked.push({q,yes,no,opts});return ${JSON.stringify(answer)};}
    function confirm(){ctx.windowConfirm=true;return true;}
    ${line('posGroupKey')}
    ${line('posGroupLabel')}
    const posAddedTo=(k)=>[];
    ${grab('posGroupsHTML')}${grab('posDeleteGroup')}
    ctx.html=posGroupsHTML;ctx.del=posDeleteGroup;ctx.st=()=>posDeletedGroups;
  `)(ctx);
  return ctx;
}
const cards = (h) => [...h.matchAll(/data-gk="([^"]+)"/g)].map(m => decodeURIComponent(m[1]));

{
  const w = world();
  await w.del('250', encodeURIComponent('All Food Mods'), 2);
  const a = w.asked[0] || {};
  ok('⛔ the ✕ ASKS first — an in-page confirm (posAsk), never window.confirm', w.asked.length === 1 && !w.windowConfirm);
  ok('…worded as asked: "Delete All Food Mods? It stops being asked on the register."', /Delete <b>All Food Mods<\/b>\? It stops being asked on the register\./.test(a.q));
  ok('…with Cancel / Delete, and Delete marked as the dangerous one (Cancel is the default)', a.yes === 'Delete' && a.no === 'Cancel' && a.opts && a.opts.danger === true);
  ok('it also says how many items will stop asking it', /It is on 2 items/.test(a.q));
  ok('⛔ on Delete the group is deleted, saved, and the list redraws (keeping the scroll)', w.st().includes('250') && w.pushes[0].k === 'ct_pos_deleted_groups' && w.redraws === 1);
  ok('⛔ …and it is simply GONE from the list — no red card, no undo', !cards(w.html()).includes('250') && !/undo<\/button>/.test(w.html()));
  ok('⛔ no "deleted · show" line either', !/deleted group/.test(w.html()));
}
{
  const w = world({ answer: false });
  await w.del('250', encodeURIComponent('All Food Mods'), 2);
  ok('⛔ Cancel deletes nothing, saves nothing, and the group stays in the list', !w.st().includes('250') && w.pushes.length === 0 && cards(w.html()).includes('250'));
}
{
  const w = world();
  ok('the other groups are untouched', cards(w.html()).join() === '120,250,300');
}

// ── posAsk's danger mode: Cancel is what Enter does, and what has focus ──────────────────────
{
  const ask = grab('posAsk');
  ok('⛔ in danger mode Enter means Cancel (a stray Enter never deletes)', /if\(e\.key==='Enter'\)done\(!danger\);/.test(ask));
  ok('⛔ …and Cancel has the focus', /wrap\.querySelector\(danger\?'button\[data-a="no"\]':'button\[data-a="yes"\]'\)\.focus\(\);/.test(ask));
  ok('every other posAsk caller keeps its old behaviour (Enter = yes, yes focused)', /const danger=!!\(opts&&opts\.danger\);/.test(ask));
}
ok('the card\'s ✕ never also toggles the card it sits on', /onclick="event\.stopPropagation\(\);posDeleteGroup\(/.test(grab('posGroupsHTML')));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
