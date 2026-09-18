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
const ok = (t, c) => console.log((c ? '  ok  ' : '  FAIL') + '  ' + t);

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
