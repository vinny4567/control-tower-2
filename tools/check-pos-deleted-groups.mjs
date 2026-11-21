// A DELETED MOD GROUP LEAVES THE LIST — Vinny, 11/20/26, after deleting group 250: "now get rid of
// it from the mod group list."
//
//     node tools/check-pos-deleted-groups.mjs
//
// It used to stay in the grid, outlined red with "undo". Now it is gone from the list, and the way
// back is one quiet line at the foot — "N deleted groups · show" — which opens to the deleted
// cards with their undo. RUN, not read: the real posGroupsHTML, its sub-sections stubbed.
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
  { num: 250, name: 'All Food Mods', used_by: ['PASTA'], choices: [] },
  { num: 300, name: 'Rocks', used_by: [], choices: [] },
];
function world({ deleted = [], open = false, q = '' } = {}) {
  const ctx = { redraws: 0 };
  new Function('ctx', `
    let posS={cat:{mod_groups:${JSON.stringify(groups)}},openDeletedGroups:${open},q:${JSON.stringify(q)}};
    let posDeletedGroups=${JSON.stringify(deleted)},posNewGroups=[],posGroupNames={},posGroupMods={};
    const posCardCss='';function posBtn(){return '';}
    function esc(s){return String(s==null?'':s);} function posEnc(s){return encodeURIComponent(s);}
    function posGroupKindHTML(){return '';} function posGroupModsHTML(){return '';} function posGroupAttachHTML(){return '';} function posUsedByHTML(){return '';}
    function posRedraw(){ctx.redraws++;}
    ${line('posGroupKey')}
    ${line('posGroupLabel')}
    const posAddedTo=(k)=>[];
    ${grab('posGroupsHTML')}${grab('posToggleDeletedGroups')}
    ctx.html=posGroupsHTML;ctx.toggle=posToggleDeletedGroups;ctx.st=()=>posS;
  `)(ctx);
  return ctx;
}
const cards = (h) => [...h.matchAll(/data-gk="([^"]+)"/g)].map(m => decodeURIComponent(m[1]));
const mainPart = (h) => h.split('data-deleted-groups')[0];

{
  const w = world({ deleted: ['250'] });
  const h = w.html();
  ok('⛔ a deleted group is GONE from the mod group list — no card, no undo in the grid', !cards(mainPart(h)).includes('250') && cards(mainPart(h)).join() === '120,300');
  ok('⛔ …and the way back is one quiet line at the foot: "1 deleted group · show"', /1 deleted group\s*<button onclick="posToggleDeletedGroups\(\)"[^>]*>show<\/button>/.test(h));
  ok('closed by default — the deleted card is not on the page at all', !cards(h).includes('250'));
}
{
  const w = world({ deleted: ['250'], open: true });
  const h = w.html();
  ok('"show" opens the deleted card, with its undo', cards(h).includes('250') && />undo<\/button>/.test(h.split('data-deleted-groups')[1]));
  ok('…still only under the foot line, never back in the list', !cards(mainPart(h)).includes('250'));
  ok('the line now offers hide', />hide<\/button>/.test(h));
}
{
  const w = world({ deleted: ['250', '300'] });
  ok('the count reads naturally for several ("2 deleted groups")', /2 deleted groups/.test(w.html()));
}
{
  const w = world();
  ok('nothing deleted → no foot line at all', !/deleted group/.test(w.html()));
}
{
  // undo is the same posDeleteGroup toggle: once undone, the group is simply back in the list
  const w = world({ deleted: [] });
  ok('an undone group is back in the list like any other', cards(w.html()).includes('250'));
}
{
  const w = world({ deleted: ['250'] });
  w.toggle();
  ok('the show/hide toggle flips and redraws through posRedraw (keeps the scroll)', w.st().openDeletedGroups === true && w.redraws === 1);
}
ok('the delete confirm still points at that line', /You can put it back from \\u201cdeleted \\u00b7 show\\u201d at the foot of the list/.test(grab('posDeleteGroup')));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
