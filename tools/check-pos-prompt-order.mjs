// THE ORDER AN ITEM ASKS ITS MOD GROUPS — Vinny, 11/20/26: "if i hit jose it brings up liqour
// mods first but i want it to bring up the tequlia mod group first … let me click drag and drop."
//
//     node tools/check-pos-prompt-order.mjs
//
// The drag on an item's group line stores the order by group NAME (ct_pos_item_group_order).
// It publishes as promptOrder: { '<item key>': ['<group key>', …] } — the SAME item key as the
// blob's `items`, the SAME group key posGroupKey gives ('120', or 'n:<title>'), every current
// group listed. Contract agreed with POS-UI (register half). RUN, not read.
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
const grabConst = (name) => { const i = src.indexOf('const ' + name + '='); return src.slice(i, src.indexOf('\n', i)); };   // one-line consts, whole line

// The real shape: Jose Curvo carries ONE built-in group (Liquor Mods #120, one of several groups
// with that title), and "tequila" is a group attached from the back office.
const modGroups = [
  { num: 121, name: 'Liquor Mods', used_by: ['Tito\'s'] },   // same title, different group — listed FIRST on purpose
  { num: 120, name: 'Liquor Mods', used_by: ['Jose Curvo', 'Patron'] },
  { num: 300, name: 'Rocks', used_by: ['Patron'] },
  { num: null, name: 'Garnish', used_by: ['Patron'] },
];
function world({ rows, order = {}, attach = {}, detach = {}, newGroups = [], names = {} }) {
  const ctx = {};
  new Function('ctx', `
    let posS={cat:{mod_groups:${JSON.stringify(modGroups)}}};
    let posGroupNames=${JSON.stringify(names)};
    let posItemGroupOrder=${JSON.stringify(order)},posGroupAttach=${JSON.stringify(attach)},posGroupDetach=${JSON.stringify(detach)},posNewGroups=${JSON.stringify(newGroups)};
    function posAllRows(){return ${JSON.stringify(rows)};}
    ${grabConst('posGroupKey')}
    ${grabConst('posGroupLabel')}
    ${grabConst('posPromptKey')}
    ${grab('posItemGroupKeys')}${grab('posBuildPromptOrder')}
    ctx.keys=posItemGroupKeys;ctx.build=posBuildPromptOrder;
  `)(ctx);
  return ctx;
}
const jose = { key: 'm:TEQUILA:Jose Curvo', name: 'Jose Curvo', cat: 'TEQUILA', groups: ['Liquor Mods'] };
const tequila = { key: 'g:tequila', name: 'tequila', choices: [] };
const attachTequila = { 'g:tequila': { items: ['Jose Curvo'], cats: [] } };

// ── Jarvis's test: Jose Curvo reordered to tequila, then Liquor Mods ─────────────────────────
{
  const w = world({ rows: [jose], newGroups: [tequila], attach: attachTequila, order: { 'm:TEQUILA:Jose Curvo': ['tequila', 'Liquor Mods'] } });
  const po = w.build();
  ok('⛔ promptOrder is keyed by the SAME item key the blob\'s items map uses', Object.keys(po).join() === 'm:TEQUILA:Jose Curvo');
  // ⚠️ the REGISTER's key for the attached group: 'n:' + its shown title, never our own 'g:…'
  // (menulive.js promptFromGroup numbers a group only when its key is all digits)
  ok('⛔ the dragged order is published in the REGISTER\'s keys: n:tequila first, then Liquor Mods #120', JSON.stringify(po['m:TEQUILA:Jose Curvo']) === JSON.stringify(['n:tequila', '120']));
  ok('⛔ the back office\'s own group key ("g:tequila") never reaches the register — it can\'t match it', !JSON.stringify(po).includes('g:tequila'));
}
{
  const w = world({ rows: [jose], newGroups: [tequila], attach: attachTequila });
  ok('no drag yet → nothing published for the item (the register keeps its own order)', JSON.stringify(w.build()) === '{}');
}

// ── the group KEY is right: same title on several groups, numbered vs unnumbered ─────────────
{
  const patron = { key: 'm:TEQUILA:Patron', name: 'Patron', cat: 'TEQUILA', groups: ['Liquor Mods', 'Rocks', 'Garnish'] };
  const w = world({ rows: [patron], order: { 'm:TEQUILA:Patron': ['Garnish', 'Rocks', 'Liquor Mods'] } });
  ok('⛔ "Liquor Mods" on Patron resolves to the group that lists Patron (#120), not the other one with that title (#121)', w.keys(patron).find(x => x.n === 'Liquor Mods').k === '120');
  ok('an unnumbered group publishes as n:<title>, the register\'s key form', JSON.stringify(w.build()['m:TEQUILA:Patron']) === JSON.stringify(['n:Garnish', '300', '120']));
}

// ── a RENAMED group: the register shows (and keys) the new title; a numbered one stays numbered ──
{
  const w = world({ rows: [jose], newGroups: [tequila], attach: attachTequila, names: { 'g:tequila': 'Tequila choice', '120': 'Liquor' }, order: { 'm:TEQUILA:Jose Curvo': ['tequila', 'Liquor Mods'] } });
  ok('⛔ an unnumbered group renamed here publishes under the title the register shows', JSON.stringify(w.build()['m:TEQUILA:Jose Curvo']) === JSON.stringify(['n:Tequila choice', '120']));
  ok('…while a numbered group stays its number whatever it is called', w.build()['m:TEQUILA:Jose Curvo'][1] === '120');
}

// ── ALL current groups, every time — even ones the drag never saw ───────────────────────────
{
  // order saved before "tequila" was attached: it still gets listed (after the dragged ones)
  const w = world({ rows: [jose], newGroups: [tequila], attach: attachTequila, order: { 'm:TEQUILA:Jose Curvo': ['Liquor Mods'] } });
  ok('⛔ a group not in the saved order is still listed (after the ordered ones) — every current group travels', JSON.stringify(w.build()['m:TEQUILA:Jose Curvo']) === JSON.stringify(['120', 'n:tequila']));
}
{
  // a group taken off the item stops being listed — its key just stops matching
  const w = world({ rows: [jose], newGroups: [tequila], attach: attachTequila, detach: { '120': ['Jose Curvo'] }, order: { 'm:TEQUILA:Jose Curvo': ['tequila', 'Liquor Mods'] } });
  ok('⛔ a detached group is no longer listed (and one group left has no order to publish)', JSON.stringify(w.build()) === '{}');
}
{
  const w = world({ rows: [jose], order: { 'm:TEQUILA:Jose Curvo': ['tequila', 'Liquor Mods'] } });
  ok('an order naming a group the item no longer has publishes nothing stale', JSON.stringify(w.build()) === '{}');
}

// ── it rides the published blob, and the drop publishes and keeps the scroll ────────────────
{
  const live = grab('posBuildLive');
  ok('⛔ posBuildLive carries promptOrder in the blob the register reads', /promptOrder:posBuildPromptOrder\(\)/.test(live));
  const drop = grab('posDragItemGroup');
  ok('the drop saves the order under the item key, with ALL the row\'s groups', /posItemGroupOrder\[decodeURIComponent\(enc\)\]=names;/.test(drop) && /kvPush\('ct_pos_item_group_order'/.test(drop));
  const kv = grab('kvPush');
  ok('…and that save publishes like any menu edit (every ct_pos_* write schedules posLiveSoon)', /\/\^ct_pos_\/\.test\(k\)[^;]*posLiveSoon\(\)/.test(kv));
  const sort = grab('posDragSort');
  ok('⛔ the drop redraws through posRedraw (keeps the scroll), never a bare renderViewport()', /posRedraw\(\);/.test(sort) && !/[^A-Za-z]renderViewport\(\)/.test(sort.replace(/\/\/.*$/gm, '')));
  ok('the publish count includes a changed prompt order', /Object\.keys\(b\.promptOrder\|\|\{\}\)\.length/.test(grab('posPublishableCount')));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
