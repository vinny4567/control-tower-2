// TAKE A GROUP OFF EVERY ITEM AT ONCE — Vinny, 11/20/26: "250 All Food Mods" sat on 156 items
// (every vodka, gin, rum…): "right now i have all the food mods attatched to all the drinks and
// some of the food items, take all those off."
//
//     node tools/check-pos-detach-all.mjs
//
// One button on the group card's ON THESE ITEMS row. Covers both ways an item asks a group — the
// register's built-in uses (a detach each) and the back office's own attachments (items AND whole
// categories, cleared) — and never deletes the group itself. RUN, not read.
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
const two = (name) => { const i = src.indexOf('const ' + name + '='); const a = src.indexOf('\n', i); return src.slice(i, src.indexOf('\n', a + 1)); };

// The real shape, shrunk: group 250 "All Food Mods" is built into drinks and food, AND the back
// office attached it to more items and a whole category.
const g250 = { num: 250, name: 'All Food Mods', used_by: ['MUSSELS APP', 'House Salad', 'PASTA', 'Titos', 'Bombay', 'Bacardi'], choices: [{ name: 'No onion', cents: 0 }] };
const other = { num: 130, name: 'Liquor Mods', used_by: ['Titos'], choices: [] };
function world({ attach = {}, detach = {}, confirmAnswer = true } = {}) {
  const ctx = { pushes: [], confirms: [], redraws: 0 };
  new Function('ctx', `
    let posS={cat:{mod_groups:${JSON.stringify([g250, other])}}};
    let posGroupAttach=${JSON.stringify(attach)},posGroupDetach=${JSON.stringify(detach)},posNewGroups=[],posDeletedGroups=[],
        posGroupNames={},posChoiceEdits={},posChoiceOrder={},posChoiceCuts={},posGroupMods={},posGroupKinds={};
    function kvPush(k,v){ctx.pushes.push({k,v:JSON.parse(JSON.stringify(v))});}
    function posRedraw(){ctx.redraws++;}
    function confirm(m){ctx.confirms.push(m);return ${JSON.stringify(confirmAnswer)};}
    ${line('posGroupKey')}
    ${line('posGroupLabel')}
    ${line('posDetachedFrom')}
    ${line('posIsDetached')}
    ${line('posAttachOf')}
    ${line('posCutsFor')}
    ${two('posAddedTo')}
    ${grab('posGroupKind')}${grab('posKindFlags')}
    ${grab('posDetachAll')}${grab('posResolveGroup')}${grab('posBuildGroups')}
    ctx.detachAll=posDetachAll;ctx.build=posBuildGroups;ctx.st=()=>({posGroupAttach,posGroupDetach,posDeletedGroups});
  `)(ctx);
  return ctx;
}
const attach = { '250': { items: ['CALAMARI', 'Titos'], cats: ['VODKA', 'GIN'] }, '130': { items: ['Patron'], cats: [] } };

{
  const w = world({ attach });
  w.detachAll('250');
  const b = w.build();
  ok('it asks first, naming the group, the item count and the categories', w.confirms.length === 1 && /All Food Mods/.test(w.confirms[0]) && /all 7 items/.test(w.confirms[0]) && /VODKA, GIN/.test(w.confirms[0]) && /The group itself stays/.test(w.confirms[0]));
  ok('⛔ the published blob attaches 250 to NOTHING — back-office items and whole categories cleared', !b.attach['250']);
  ok('⛔ …and detaches 250 from EVERY built-in item that asked it (food and drinks)', JSON.stringify([...b.detach['250']].sort()) === JSON.stringify([...g250.used_by].sort()));
  ok('⛔ so no item prompts 250 any more: every built-in user detached, no attach left', g250.used_by.every(n => b.detach['250'].includes(n)) && !b.attach['250']);
  ok('⛔ the group itself is NOT deleted', !b.gone.includes('250') && w.st().posDeletedGroups.length === 0);
  ok('⛔ another group is untouched (130 keeps its attach, gets no detach)', JSON.stringify(b.attach['130']) === JSON.stringify(attach['130']) && !b.detach['130']);
  ok('both stores are saved (they publish together — posLiveSoon is debounced), and the redraw keeps the scroll', w.pushes.map(p => p.k).sort().join() === 'ct_pos_group_attach,ct_pos_group_detach' && w.redraws === 1);
}
{
  const w = world({ attach, detach: { '250': ['PASTA', 'Old Item'] } });
  w.detachAll('250');
  const d = w.st().posGroupDetach['250'];
  ok('items already taken off stay taken off (no duplicates, nothing lost)', d.filter(n => n === 'PASTA').length === 1 && d.includes('Old Item'));
}
{
  const w = world({ attach, confirmAnswer: false });
  w.detachAll('250');
  ok('⛔ declining the confirm changes nothing and saves nothing', w.pushes.length === 0 && JSON.stringify(w.st().posGroupAttach) === JSON.stringify(attach) && !w.st().posGroupDetach['250']);
}
{
  const html = grab('posUsedByHTML');
  ok('the button sits on the ON THESE ITEMS row and counts what it will remove', /Remove from all \$\{items\.length\} items/.test(html) && /posDetachAll\('\$\{enc\}'\)/.test(html));
  ok('…and its tap never also opens/closes the card', /onclick="event\.stopPropagation\(\);posDetachAll\(/.test(html));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
