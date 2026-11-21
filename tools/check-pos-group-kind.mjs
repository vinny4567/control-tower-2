// PICK ONE / PICK SEVERAL / HOW MANY OF EACH, per mod group — Vinny, 11/20/26: "i need to set up
// certain mod groups to allow multiple selections."
//
//     node tools/check-pos-group-kind.mjs
//
// The register already reads prompt.multi (pick several, then Done) and prompt.qty (a count per
// choice). This is the switch: a three-way control on each group card, saved per group
// (ct_pos_group_kinds) and published on the group like any other group edit. RUN, not read.
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
const grabLine = (name) => { const i = src.indexOf('const ' + name + '='); return src.slice(i, src.indexOf('\n', i)); };
const grabArrow2 = (name) => { const i = src.indexOf('const ' + name + '='); const a = src.indexOf('\n', i); return src.slice(i, src.indexOf('\n', a + 1)); };

// The real group: "Platter flavors" is unnumbered, so its key is 'n:Platter flavors'.
const platter = { num: null, name: 'Platter flavors', required: false, choices: [{ name: 'Mango', cents: 0 }, { name: 'Vanilla', cents: 0 }] };
const wings = { num: 410, name: 'Wing sauce', required: true, multi: true, choices: [{ name: 'Hot', cents: 0 }] };
function world(kinds = {}) {
  const ctx = { pushes: [], redraws: 0 };
  new Function('ctx', `
    let posGroupKinds=${JSON.stringify(kinds)},posGroupNames={},posChoiceEdits={},posChoiceOrder={},posChoiceCuts={},posGroupMods={},
        posGroupAttach={},posGroupDetach={},posNewGroups=[],posDeletedGroups=[];
    let posS={cat:{mod_groups:${JSON.stringify([platter, wings])}}};
    function kvPush(k,v){ctx.pushes.push({k,v:JSON.parse(JSON.stringify(v))});}
    function posRedraw(){ctx.redraws++;}
    function posEnc(s){return encodeURIComponent(s);}
    ${grabLine('posGroupKey')}
    ${grabLine('posCutsFor')}
    ${grabArrow2('posAddedTo')}
    ${grab('posGroupKind')}${grab('posKindFlags')}${grab('posSetGroupKind')}${grab('posGroupKindHTML')}
    ${grab('posResolveGroup')}${grab('posBuildGroups')}
    ctx.kind=posGroupKind;ctx.set=posSetGroupKind;ctx.html=posGroupKindHTML;ctx.resolve=posResolveGroup;ctx.build=posBuildGroups;ctx.kinds=()=>posGroupKinds;
  `)(ctx);
  return ctx;
}
const K = 'n:Platter flavors', enc = encodeURIComponent(K);

// ── Jarvis's test: Platter flavors → pick several → multi; → how many of each → qty, not multi ──
{
  const w = world();
  ok('untouched, a group reads as the catalog has it (Platter flavors: pick one)', w.kind(K, platter) === 'one');
  w.set(enc, 'multi');
  let g = w.build().groups[K];
  ok('⛔ "pick several" → the published groups[\'n:Platter flavors\'].multi === true', !!g && g.multi === true && g.qty === false);
  ok('…saved where the publish reads it (ct_pos_group_kinds), and the card redraws keeping the scroll', w.pushes.at(-1).k === 'ct_pos_group_kinds' && w.pushes.at(-1).v[K] === 'multi' && w.redraws === 1);
  // 11/20/26, Vinny: "you can get rid of the how many of each button, if its several just let me
  // click unlimited" — two options; the switch never publishes qty.
  w.set(enc, 'qty');
  ok('⛔ "how many of each" is gone: the switch refuses qty and nothing is saved for it', w.kinds()[K] === 'multi' && w.pushes.length === 1);
  w.set(enc, 'one');
  g = w.build().groups[K];
  ok('"pick one" → both off', g.multi === false && g.qty === false);
  ok('…and the rest of the group still publishes as before (name, required, choices)', g.name === 'Platter flavors' && g.required === false && g.choices.length === 2);
}

// ── only a group that was switched is published; untouched groups keep the catalog's flags ──────
{
  const w = world();
  ok('nothing switched → no group is published for this reason alone', Object.keys(w.build().groups).length === 0);
  w.set(enc, 'multi');
  ok('switching one group publishes that group only', JSON.stringify(Object.keys(w.build().groups)) === JSON.stringify([K]));
  ok('a catalog group that is already "pick several" reads that way untouched', w.kind('410', wings) === 'multi');
}
{
  const w = world({ [K]: 'everything' });
  ok('⛔ a stored value that is not one of the three is ignored (catalog setting used), never published as-is', w.kind(K, platter) === 'one');
  w.set(enc, 'nonsense');
  ok('⛔ and the switch refuses anything but one / multi / qty', w.pushes.length === 0 && w.kinds()[K] === 'everything');
}

// ── the control itself ─────────────────────────────────────────────────────────────────────
{
  const w = world({ [K]: 'multi' });
  const h = w.html(platter);
  ok('⛔ TWO choices — "pick one" and "pick several" — and no "how many of each"', h.includes('>pick one<') && h.includes('>pick several<') && !/how many/.test(h));
  ok('the current setting is the highlighted one', /data-kind="multi"/.test(h));
  ok('each button sets that group\'s kind by its key', h.includes(`posSetGroupKind('${enc}','multi')`) && h.includes(`posSetGroupKind('${enc}','one')`) && !h.includes(`'qty')`));
  ok('⛔ a click on the switch never also opens/closes the card it sits on', (h.match(/event\.stopPropagation\(\);posSetGroupKind/g) || []).length === 2);
}
{
  // a 'qty' stored by the brief three-way version: ignored, never published as qty
  const w = world({ [K]: 'qty' });
  const g = w.build().groups[K];
  ok('⛔ a leftover stored "qty" is ignored — the group publishes the catalog\'s own flags, never qty:true from the switch', !!g && g.qty === false && g.multi === false);
  ok('…and reads as the catalog default on the card', w.kind(K, platter) === 'one');
}
{
  // a BUILT-IN group whose own catalog setting is qty keeps it — the switch only overrides when set
  const w = world();
  const g = w.resolve({ num: 77, name: 'Wings count', qty: true, choices: [] });
  ok('a built-in qty group (switch never touched) keeps its own qty — nothing here changes it', g.qty === true);
}
ok('⛔ the switch sits next to optional/required on ALL THREE group card headers', (src.match(/\?'required':'optional'\}<\/span>\$\{posGroupKindHTML\(g\)\}/g) || []).length === 3);
ok('⛔ it loads with the other stores, through the failure-safe take() (a failed read keeps what is held)',
   /kvGet\('ct_pos_group_kinds'\)\]\);/.test(src) && /kinds:take\(gk,posGroupKinds,\{\}\)/.test(src));

// ── a setting equal to the catalog's own is dropped by the settle step (no override for ever) ──
{
  const prune = grab('posPruneOrphans');
  ok('the settle step drops a kind that just repeats the catalog (so "pick one" on a pick-one group leaves nothing behind)',
     /for\(const \[k,v\] of Object\.entries\(posGroupKinds\)\)\{/.test(prune) && /if\(v===own\|\|v==='qty'\)drop\(posGroupKinds,k,'ct_pos_group_kinds'\);/.test(prune)
     && /ct_pos_group_kinds:posGroupKinds\}/.test(prune));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
