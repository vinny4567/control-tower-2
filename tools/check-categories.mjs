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

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
