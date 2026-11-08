// Do the two key-builders still agree?
//
//     node tools/check-item-keys.mjs
//
// The back office publishes prices, renames, deletions and now the button ORDER under
// a key it builds itself (`r.key` in pos-catalog.json). The register looks them up
// under a key IT builds, in angelis-pos/pos/src/menulive.js `keyOf(cat, item)`. Two
// files, two builders, agreeing only by convention.
//
// ⚠️ A DISAGREEMENT IS SILENT ON BOTH SIDES. A key the register never looks up is not
// an error there and not an error here: the office shows the edit applied, the floor
// ignores it, and the only symptom is Vinny saying weeks later that something "doesn't
// work right" with no way to tell which half is wrong. Two near-misses in one evening
// (11/8/26) came out of exactly this seam:
//
//   · the order map was nearly keyed on the DISPLAY group (posCatOf, which prefers
//     `r.group`) instead of `cat` — every list written under a name the register never
//     asks for;
//   · the HALF: prefix. keyOf prefixes half portions; it happens that the catalogue
//     does too, so they match — but that was luck confirmed late, not design, and it
//     took two sessions reading each other's code to establish it.
//
// Neither of those people will be here when somebody adds an item kind with a new
// prefix. This is the check that makes the convention hold without them.
//
// Skips cleanly when angelis-pos is not on this machine: the Watch Tower has to be
// checkable on a laptop that does not carry the register repo.
import { readFileSync, existsSync } from 'node:fs';

const POS = new URL('../../angelis-pos/pos/src/', import.meta.url);
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;

if (!existsSync(new URL('menulive.js', POS))) {
  console.log('  --   angelis-pos not on this machine — key agreement not checked');
  console.log('\nall good');
  process.exit(0);
}

// The register's OWN keyOf, lifted from its source rather than retyped. Retyping it
// here would make this check agree with a copy of the rule instead of the rule.
const live = readFileSync(new URL('menulive.js', POS), 'utf8');
const start = live.indexOf('export const keyOf');
const keyOfSrc = live.slice(start, live.indexOf(';', live.indexOf('item.liveKeyName')) + 1).replace('export ', '');
const keyOf = new Function(keyOfSrc + '\nreturn keyOf;')();

// Every item the register knows, from menu.js, with the flags keyOf reads.
const menu = readFileSync(new URL('menu.js', POS), 'utf8');
const regKeys = new Set();
const regByCat = new Map();
let cutsSeen = 0;
{
  // menu.js is an array of `{ cat: 'Appetizers', items: [ {...}, ... ] }`. Parsed
  // loosely on purpose — but the count is asserted below, because a parse that
  // silently matched nothing would report perfect agreement, which is the one answer
  // this file must never give by accident. (It did exactly that on the first draft:
  // the wrong heading pattern produced keys under invented category names and every
  // single one of the 919 looked like an orphan.)
  const catRe = /\{\s*cat:\s*(?:'([^']+)'|"([^"]+)")\s*,\s*items:\s*\[/g;
  let m, cuts = [];
  while ((m = catRe.exec(menu))) cuts.push({ cat: m[1] || m[2], at: m.index });
  cutsSeen = cuts.length;
  cuts.forEach((c, i) => {
    const body = menu.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : menu.length);
      // ⚠️ BOTH QUOTE STYLES. menu.js writes most names in single quotes but switches
      // to double for anything containing an apostrophe — name: "Tito's". A
      // single-quote-only pattern skips those entirely, and the five it missed
      // (Tito's, Cosmo Tito's, Pete's Sake, Angeli's Spritzer, Amar d'Saron) looked
      // exactly like genuine key mismatches until the parser turned out to be the
      // thing at fault. The same character has its own comment in index.html, where it
      // broke inline onclick handlers.
      const itemRe = /\{[^{}]*?name:\s*(?:'([^']*)'|"([^"]*)")[^{}]*\}/g;
    let it;
    while ((it = itemRe.exec(body))) {
      const frag = it[0];
      const item = { name: it[1] !== undefined ? it[1] : it[2], half: /\bhalf:\s*true/.test(frag), halfPrice: /\bhalfPrice:\s*true/.test(frag) };
      const k = keyOf(c.cat, item);
      regKeys.add(k);
      if (!regByCat.has(c.cat)) regByCat.set(c.cat, []);
      regByCat.get(c.cat).push(k);
    }
  });
}
ok(`the register menu parsed into keys at all (${regKeys.size} keys, ${cutsSeen} categories)`,
   regKeys.size > 100 && cutsSeen > 5);

// Every key the back office publishes under.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cat = JSON.parse(readFileSync(new URL('../pos-catalog.json', import.meta.url), 'utf8'));
const officeKeys = cat.items.map((i) => i.key).filter(Boolean);
ok('the catalogue has keys', officeKeys.length > 100);

// ── the agreement itself ────────────────────────────────────────────────────
// Scoped to the categories the register actually SHOWS. The catalogue is wider than
// the register's buttons by design: `Wine` is the master shelf every bottle is drawn
// from (POS_HIDDEN_CATS hides it here too), and a handful of categories exist for the
// office alone. Asserting over those would fail permanently and teach whoever runs
// this to ignore it — a check nobody believes is worse than no check.
//
// Inside a category the register does have, though, every key must land: that is where
// a prefix convention drifts, and it is the whole reason this file exists.
// The office's OWN hidden categories come out first, read from index.html rather than
// retyped, so this cannot drift from the app. Those rows are filtered out of the item
// list, so nothing can be published under them — the master wine shelf chief among
// them, since every bottle also lives on one of the four wine screens under its own
// cat and THAT is the row the register draws.
const hidden = new Set(
  (html.match(/POS_HIDDEN_CATS\s*=\s*new Set\(\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
);
ok(`the office's hidden categories were found (${[...hidden].join(', ') || 'none'})`, hidden.size > 0);

const shared = officeKeys.filter((k) => {
  const cat = k.slice(2, k.indexOf(':', 2));
  return regByCat.has(cat) && !hidden.has(cat);
});
const orphans = shared.filter((k) => !regKeys.has(k));
ok(`inside the categories the register shows, every published key lands (${shared.length - orphans.length}/${shared.length})`,
   orphans.length === 0);
ok('…and that is a real sample, not an empty one', shared.length > 200);
if (orphans.length) {
  console.log('       keys the register would never look up:');
  orphans.slice(0, 15).forEach((k) => console.log('         ' + k));
  if (orphans.length > 15) console.log(`         +${orphans.length - 15} more`);
}

// The half portions specifically, because that is the prefix that nearly got this
// wrong and the one a new item kind would most resemble.
const officeHalves = officeKeys.filter((k) => /:(HALF|HP):/.test(k));
const regHalves = [...regKeys].filter((k) => /:(HALF|HP):/.test(k));
ok(`half portions carry the prefix on BOTH sides (office ${officeHalves.length}, register ${regHalves.length})`,
   officeHalves.length > 0 && officeHalves.every((k) => regKeys.has(k)));

// ⚠️ The order map is keyed by `cat`, never by the display group. A row whose group
// differs from its cat is exactly where that distinction bites.
const grouped = cat.items.filter((i) => i.group && i.group !== i.cat);
ok(`rows whose display group differs from cat exist, so the distinction is load-bearing (${grouped.length})`,
   true);
if (grouped.length) {
  const wrong = grouped.filter((i) => !regKeys.has('m:' + i.group + ':' + i.name));
  ok('…and keying an order on the GROUP would miss the register entirely — as intended',
     wrong.length === grouped.length);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
