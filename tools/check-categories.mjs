// The category dropdown offers what the list actually files rows under.
//
//     node tools/check-categories.mjs
//
// These have to be built from the SAME function or the tab lies: picking RED WINE
// answered "Nothing matches" for a while because the dropdown was offering the
// register's coarse category while every row had been filed under a finer one.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cat = JSON.parse(readFileSync(new URL('../pos-catalog.json', import.meta.url), 'utf8'));
let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const src = html.slice(html.indexOf('const POS_HIDDEN_CATS='), html.indexOf('function posItemRows'));
const F = new Function('with({Set,Object}){' + src + '\nreturn {posCatOf,POS_HIDDEN_CATS};}')();

// what the dropdown offers
const offered = [...new Set(cat.items.map(F.posCatOf))].sort()
  .filter((c) => !F.POS_HIDDEN_CATS.has(c));
// what the rows claim
const claimed = new Set(cat.items
  .filter((i) => !F.POS_HIDDEN_CATS.has(i.cat))
  .map(F.posCatOf));

ok('every option in the dropdown has rows behind it',
   offered.every((c) => claimed.has(c)));
const orphans = [...claimed].filter((c) => !offered.includes(c));
ok('and every row is reachable from the dropdown' + (orphans.length ? ' — ' + orphans.join(', ') : ''),
   orphans.length === 0);

for (const want of ['RED WINE GLASS', 'RED WINE BOTTLE', 'WHITE WINE GLASS', 'WHITE WINE BOTTLE']) {
  const n = cat.items.filter((i) => F.posCatOf(i) === want).length;
  ok(`${want} is its own bucket (${n} items)`, offered.includes(want) && n > 0);
}
ok('the master Wine list stays hidden — it would duplicate every wine',
   F.POS_HIDDEN_CATS.has('Wine'));
ok('a wine still carries the register\'s own category in its KEY, not the bucket',
   cat.items.filter((i) => /WINE/.test(String(i.cat))).every((i) => i.key.startsWith('m:' + i.cat + ':')));

// ⚠️ — AND AN ADDED WINE HAS TO BE PUBLISHED UNDER THAT CATEGORY, NOT THE BUCKET.
// Those four buckets are this page's own invention. Publishing one as a category sends
// the register a category it has never heard of, and it drops the item without a word:
// the wine saves, publishes, shows green on this screen, and is on no iPad. Found
// 11/15/26, with POS-UI's contract — cat 'RED WINE' / 'WHITE WINE', pour or bottle in
// the END OF THE NAME — because the name is the key their deletes and edits match on.
//
// RUN, not grepped. These are pure functions of their arguments, so the check asks them
// rather than quoting their source — a regex here would stay green for any rewrite that
// kept the lines it quoted. See tools/check-stations.mjs for why that matters.
const wsrc = html.slice(html.indexOf('const POS_WINE_SECTIONS='), html.indexOf('function posAddItem('));
ok('the wine translation can be read out of the page at all', wsrc.length > 0);
const W = wsrc.length ? new Function(`${wsrc}\nreturn {posPublishAs,posSectionOf,POS_WINE_SECTIONS};`)() : null;
const pub = (sec, name) => (W ? W.posPublishAs(sec, name) : { cat: '', name: '' });

// Every category the register actually has, off the catalogue — not a list typed here.
const regCats = new Set(cat.items.map((i) => i.cat));
const buckets = [...new Set(cat.items.filter((i) => i.group).map((i) => i.group))].sort();
ok(`the four wine buckets are still exactly the ones this translates (${buckets.join(', ')})`,
   !!W && buckets.length > 0 && buckets.every((b) => b in W.POS_WINE_SECTIONS)
   && Object.keys(W.POS_WINE_SECTIONS).every((b) => buckets.includes(b)));
ok('⚠️ and NONE of them is a category the register has',
   buckets.length > 0 && buckets.every((b) => !regCats.has(b)));
ok('⚠️ an item added to a wine bucket publishes under a category the register DOES have',
   buckets.length > 0 && buckets.every((b) => regCats.has(pub(b, 'Test Wine').cat)));
ok('…with the pour or the bottle in the end of the name, the way the built-ins are filed',
   buckets.every((b) => {
     const p = pub(b, 'Test Wine');
     // the suffix it got must be one the real menu already uses for that same bucket
     return cat.items.some((i) => i.group === b && i.name.endsWith(p.name.slice('Test Wine'.length)));
   }));
ok('typing the suffix yourself does not earn you two of them',
   buckets.every((b) => { const p = pub(b, 'Test Wine'); return pub(b, p.name).name === p.name; }));
ok('and every other section publishes exactly what he typed, under its own name',
   ['Appetizers', 'Pasta', 'Dessert', 'BEER'].every((c) => {
     const p = pub(c, 'Test Dish');
     return p.cat === c && p.name === 'Test Dish';
   }));
// Both directions, or the page stops drawing the item under the section he added it to.
ok('⚠️ and it comes BACK to the section he added it in, so it is still on his screen',
   buckets.every((b) => W.posSectionOf(pub(b, 'Test Wine')) === b));
ok('a pour and a bottle of the same wine stay told apart, though they share a category',
   buckets.filter((b) => /RED/.test(b)).every((b) => W.posSectionOf(pub(b, 'Barolo')) === b)
   && pub('RED WINE GLASS', 'Barolo').name !== pub('RED WINE BOTTLE', 'Barolo').name);
// A real row from the catalogue round-trips too — fixtures that only use invented names
// prove the function agrees with itself, not that it agrees with the menu.
const sample = cat.items.find((i) => i.group && / — (GL|BTL)$/.test(i.name));
ok(`a wine already on the menu round-trips (${sample ? sample.name : 'none found'})`,
   !!sample && W.posSectionOf({ cat: sample.cat, name: sample.name }) === sample.group);

// ⚠️ THE × TAKES OUT THE ROW IT SITS ON, whatever spelling that row was saved under.
// posRemoveNewItem is handed the SECTION the × was drawn in; the entry is stored under the
// register's category. Translating the section FORWARD to find it works for anything saved
// after 00365d2 and silently misses anything saved before it — which still draws, and would
// keep publishing with a × that does nothing. Asked of the real function, both spellings.
const rsrc = html.slice(html.indexOf('function posRemoveNewItem('), html.indexOf('// Choices taken OUT of a group'));
ok('the × can be read out of the page and run', wsrc.length > 0 && rsrc.length > 0);
const bucket = buckets.find((b) => / GLASS$/.test(b)) || buckets[0];
// The sandbox hands it a REAL routing map and records which stores it pushed, so the
// assertions below can ask what the × actually did to both of them.
const run = (stored, section, routing) => {
  const R = new Function(`let posNewItems=${JSON.stringify([].concat(stored))};
    let posRouting=${JSON.stringify(routing || {})};
    const pushed=[];const kvPush=(k)=>{pushed.push(k)};const posRedraw=()=>{};
    ${wsrc}${rsrc}
    return {posRemoveNewItem,pushed,get items(){return posNewItems},get routing(){return posRouting}};`)();
  R.posRemoveNewItem(encodeURIComponent(section), encodeURIComponent([].concat(stored)[0].name));
  return R;
};
const tryRemove = (stored, section) => run(stored, section === undefined ? bucket : section).items.length === 0;

ok('…and it removes an item saved the way this page saves them now',
   !!bucket && tryRemove(pub(bucket, 'Test Wine')));
ok('⚠️ …and one saved under the old bucket spelling, which still draws and still publishes',
   !!bucket && tryRemove({ cat: bucket, name: 'Test Wine' }));
ok('and a plain dish, where the two spellings are the same thing',
   tryRemove({ cat: 'Pasta', name: 'Test Dish' }, 'Pasta'));

// ⚠️ AND THE ROUTE GOES WITH IT. posPruneOrphans cannot collect these — its routing
// loop is `const it=byItem[k]; if(!it)continue;` and a special is never in the catalogue —
// so a route left behind here is permanent and cloud-synced. Specials rotate and names come
// back, so the next "Chicken Kalina" would silently inherit the last one's printer, or its
// "prints nowhere". Asked of the real function.
const KEY = 'm:Specials:Chicken Kalina';
const routed = run({ cat: 'Specials', name: 'Chicken Kalina' }, 'Specials',
                   { [KEY]: ['Salad'], 'm:Pasta:Rotini': ['Main'] });
ok('removing a routed special drops ITS routing key',
   !Object.prototype.hasOwnProperty.call(routed.routing, KEY));
ok('…and leaves every other item’s route alone',
   JSON.stringify(routed.routing['m:Pasta:Rotini'] || []) === JSON.stringify(['Main']));
ok('…and pushes ct_pos_routing, so the drop syncs instead of being undone by the next reload',
   routed.pushed.includes('ct_pos_routing') && routed.pushed.includes('ct_pos_new_items'));

const unrouted = run({ cat: 'Specials', name: 'Soup' }, 'Specials', { 'm:Pasta:Rotini': ['Main'] });
ok('removing an UNROUTED special does not write the routing store at all',
   !unrouted.pushed.includes('ct_pos_routing') && unrouted.pushed.includes('ct_pos_new_items'));

// The legacy-spelling trap again, one layer deeper: the key must be built from what the
// entry actually HOLDS, not from a forward translation of the section the × sat in.
const legacyKey = bucket ? 'm:' + bucket + ':Test Wine' : '';
const legacy = bucket
  ? run({ cat: bucket, name: 'Test Wine' }, bucket, { [legacyKey]: ['Bar'] })
  : { routing: { x: 1 } };
ok('⚠️ …and a wine saved under the old bucket spelling drops the key built from its STORED cat',
   !!bucket && !Object.prototype.hasOwnProperty.call(legacy.routing, legacyKey));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
