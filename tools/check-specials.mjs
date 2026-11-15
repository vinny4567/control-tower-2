// SPECIALS — the one category the register has and the catalogue does not.
//
//     node tools/check-specials.mjs
//
// Vinny asked to "add a new category". What he wants is to run SPECIALS, and the
// register already has the tab: menu.js carries `{cat:'Specials', items:[]}` and
// FOOD_PAGE lists it. Nothing has to be invented — a published item with cat exactly
// 'Specials' draws there.
//
// ⚠️ EXACTLY. The register's addedFor filters `a.cat === cat`, with no case folding.
// 'specials' or 'SPECIALS' would publish, look right in the back office, and draw on
// no iPad — the quietest possible failure.
//
// The back-office half was the blocker: every section on the Menu items screen is drawn
// from CATALOGUE rows, and Specials has none. No heading, no add box — and an item filed
// under it rendered NOWHERE while still publishing on the 1400ms debounce. Unseeable and
// unremovable, because the only × lives inside the add box that never drew.
//
// So this RENDERS THE REAL LIST and looks at what comes out. Grepping for the fix would
// prove the lines exist; the question is whether there is a box to type a special into
// and an × to take it back out, and only the rendered page answers that. Helpers the
// question does not depend on resolve to harmless stubs — see tools/check-stations.mjs
// for why behaviour is run here rather than quoted.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cat = JSON.parse(readFileSync(new URL('../pos-catalog.json', import.meta.url), 'utf8'));

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
const cut = (a, b, what) => {
  const i = src.indexOf(a), j = src.indexOf(b, i + 1);
  if (i < 0 || j <= i) { ok(`the ${what} was found in the page at all`, false); return ''; }
  return src.slice(i, j);
};
const HELPERS = cut('const POS_WINE_SECTIONS=', 'function posAddItem(', 'category helpers');
const BODY = cut('function posItemsBodyHTML(){', '\nfunction posItemsHTML(', 'item list');

// ---- the name, which is the whole contract with the register ----------------------
ok('the page knows about a category the catalogue does not have', /const POS_EMPTY_CATS=/.test(HELPERS));
const empties = (HELPERS.match(/const POS_EMPTY_CATS=\[([^\]]*)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
ok(`⚠️ and spells it the way the register spells it (${empties.join(', ') || 'none'})`,
   empties.includes('Specials'));
ok('…not a case the register would never match',
   empties.every((c) => c === 'Specials' || !/^specials$/i.test(c)));
// If the catalogue ever grows real Specials rows this stops being special — the finder
// drops it on its own, and this says so rather than going red for a good reason.
ok('Specials is still empty in the catalogue, which is why it needs this at all',
   !cat.items.some((i) => i.cat === 'Specials'));

// ---- render it -------------------------------------------------------------------
const CAT = { items: [
  { key: 'm:Pasta:Rigatoni', cat: 'Pasta', name: 'Rigatoni', cents: 1800 },
  { key: 'm:Veal/Steak:Veal Marsala', cat: 'Veal/Steak', name: 'Veal Marsala', cents: 2895 },
] };
const draw = (pending, filter) => {
  const base = {
    esc: (x) => String(x == null ? '' : x), posEnc: (x) => encodeURIComponent(x),
    posInput: '', posCardCss: '', posBtn: () => '', POS_ITEM_CAP: 250,
    POS_GROUPS_CAT: 'Mod groups', POS_HIDDEN_CATS: new Set(['Wine', 'DISCOUNTS']),
    posS: { cat: CAT, q: '', catFilter: filter, openLetters: {}, openDeleted: false },
    posNewItems: pending.slice(), posSectionAdds: {}, posNewMods: [], posDeletedItems: [],
    posRouting: {}, posModNames: {}, posItemOrder: {}, kvPush() {}, posRedraw() {},
    posCatOf: (r) => (r && r.group) || (r && r.cat) || '-',
    posAllRows: () => CAT.items.slice(),
    posItemRows: () => CAT.items.filter((r) => filter === 'all' || base.posCatOf(r) === filter),
    posModDeleted: () => false, posItemDeleted: () => false, posRowGaps: () => [],
    posCatRows: () => [], posCatRoute: () => null, posRouteOptions: () => [],
    posRowLabel: (r) => r.name,
    Object, Set, Map, Array, String, Number, JSON, Math, isFinite,
    encodeURIComponent, decodeURIComponent,
  };
  const scope = new Proxy(base, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : () => '')),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  try { return new Function('scope', `with(scope){${HELPERS}\n${BODY}\nreturn posItemsBodyHTML();}`)(scope); }
  catch (e) { return 'THREW: ' + e.message; }
};
const all = draw([], 'all');
ok('the Menu items list still renders at all', !all.startsWith('THREW') && all.length > 0);
ok('Specials has a section with nothing in it yet', all.includes('Specials'));
ok('…and a box to type tonight\'s special into', all.includes('ni-n-Specials'));
ok('…without disturbing the categories that do have items', all.includes('Rigatoni'));

// ⚠️ The way he will actually use it. shown.length is 0 here, and the empty-state branch
// used to throw the whole body away — taking the only add box with it.
const only = draw([], 'Specials');
ok('⚠️ filtering to Specials shows the add box, not "No items in Specials."',
   only.includes('ni-n-Specials') && !only.includes('No items in Specials'));
const other = draw([], 'Pasta');
ok('and filtering to something else does not drag Specials along', !other.includes('ni-n-Specials'));

const sp = [{ cat: 'Specials', name: 'TEST SPECIAL', cents: 1 }];
for (const [f, label] of [['Specials', 'under its own filter'], ['all', 'and in the every-category view']]) {
  const h = draw(sp, f);
  ok(`a special that has been added is listed ${label}`, h.includes('TEST SPECIAL'));
  ok(`…with an × to take it back out, ${label}`, h.includes('posRemoveNewItem'));
}
ok('…and says where it will print, since nobody chose it',
   draw(sp, 'Specials').includes('prints at Main'));

// The safety net. Nothing can type this today, but the moment add-a-category exists a
// typo would otherwise publish an item that appears nowhere and cannot be removed.
const orphan = draw([{ cat: 'FLATBREADS', name: 'MARGHERITA', cents: 1400 }], 'all');
ok('⚠️ an item under a category nothing else draws is VISIBLE, not lost',
   orphan.includes('FLATBREADS') && orphan.includes('MARGHERITA'));
ok('…and removable', orphan.includes('posRemoveNewItem'));

// ---- and he has to be able to GET there ------------------------------------------
// A category the dropdown does not offer is a category he cannot use: the list opens on
// "every category", which caps at 250 rows, so Specials is reached by selecting it.
const TOOLBAR = cut('function posItemsHTML(', 'function posRowGaps(', 'items toolbar');
ok('the category dropdown is built from the add-only sections as well as the catalogue',
   /new Set\(\[\.\.\.c\.items\.map\(posCatOf\),\.\.\.posAddOnlyCats\(\)\]\)/.test(TOOLBAR));

// ---- and Add must MAKE one here, never borrow -------------------------------------
// A posSectionAdd is a back-office view and is deliberately never published. Harmless
// where the register already has the category; fatal in Specials, where a special named
// after a dish that exists would sit in the list looking added and reach no iPad.
const ADD = cut('function posAddItem(', 'function posRemoveNewItem(', 'add function');
const tryAdd = (section, name) => {
  const boxes = { ['ni-n-' + encodeURIComponent(section)]: { value: name, focus() {} },
                  ['ni-p-' + encodeURIComponent(section)]: { value: '9', focus() {} } };
  const borrowed = [];
  const base = {
    document: { getElementById: (id) => boxes[id] || null },
    posS: { cat: cat }, posNewItems: [], kvPush() {}, posRedraw() {},
    posSectionAdd: (e, n) => borrowed.push(n),
    posCatOf: (r) => (r && r.group) || (r && r.cat) || '-',
    // ⚠️ Real ones, not stubs: Date.now stamps the kvPush and parseFloat reads the price
    // box. A stub for either loses the price silently or throws after the item is already
    // in — which is how this check first "passed" the add and failed the assertion.
    Object, Set, Map, Array, String, Number, Math, Date, parseFloat, isFinite,
    decodeURIComponent, encodeURIComponent,
  };
  const scope = new Proxy(base, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : () => '')),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  try {
    new Function('scope', `with(scope){${HELPERS}\n${ADD}\nposAddItem(${JSON.stringify(encodeURIComponent(section))});}`)(scope);
    return { added: base.posNewItems, borrowed };
  } catch (e) { return { added: [], borrowed: [], threw: e.message }; }
};
const fresh = tryAdd('Specials', 'Osso Buco');
ok('a special publishes under Specials, spelled exactly',
   fresh.added.length === 1 && fresh.added[0].cat === 'Specials' && fresh.added[0].name === 'Osso Buco');
// Pick a real dish out of the catalogue rather than naming one here — a hardcoded name
// is a check that passes because the menu happens not to have changed.
const dish = cat.items.find((i) => i.cat !== 'Food Mods' && !i.group && i.name);
const clash = tryAdd('Specials', dish ? dish.name : 'Veal Marsala');
ok(`⚠️ a special named after a dish that exists ("${dish ? dish.name : '?'}" in ${dish ? dish.cat : '?'}) is MADE, not borrowed`,
   clash.borrowed.length === 0 && clash.added.length === 1 && clash.added[0].cat === 'Specials');
const borrow = tryAdd('Pasta', dish ? dish.name : 'Veal Marsala');
ok('…while in a category the register already has, it is still borrowed as before',
   !!dish && (dish.cat === 'Pasta' ? borrow.added.length === 0 : borrow.borrowed.length === 1));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
