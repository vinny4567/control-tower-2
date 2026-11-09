// ROUTING A WHOLE CATEGORY AT ONCE MUST TOUCH EXACTLY THAT CATEGORY.
//
//     node tools/check-bulkroute.mjs
//
// Setting forty pastas to one class a dropdown at a time is forty chances to miss one,
// and a single item left on the wrong printer is invisible until a ticket does not come
// out. So the category heading routes all of its rows together — and a bulk write is
// precisely the kind nobody can eyeball afterwards, which is what this file is for.
//
// ⚠️ THE TWO THINGS THAT WOULD BE SILENT IF THEY WERE WRONG:
//
//   · WHICH ROWS. Rows are chosen by `posCatOf` — the DISPLAY group, the same function
//     the heading used to collect them. Choosing by `r.cat` instead would act on items
//     filed under a different heading from the one being clicked, routing food the user
//     never saw. That cat-vs-group seam already nearly mis-keyed the item order; see
//     tools/check-item-keys.mjs.
//   · OVERRIDES THAT PILE UP. Setting a row to the printers it already ships with must
//     REMOVE its override, not store a copy of the default. Otherwise every row touched
//     and set back leaves an entry in the published blob, and "has this been changed?"
//     stops being answerable.
//
// The real functions are lifted from index.html rather than retyped, so this agrees with
// the page instead of with a copy of it.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grab = (name) => {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
};
// ⚠️ TO THE SEMICOLON, NOT TO THE END OF THE LINE. posRoutedTo is written across two
// lines, and a line-based grab returned only `…hasOwnProperty.call(posRouting,r.key)` —
// a function that answers TRUE instead of a printer list. Every assertion downstream of
// it then measured the wrong thing while looking like a real failure of the page.
const grabConst = (name) => {
  const i = html.indexOf('const ' + name + '=');
  if (i < 0) throw new Error('missing const ' + name);
  let d = 0;
  for (let k = i; k < html.length; k++) {
    const c = html[k];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0) return html.slice(i, k + 1);
  }
  throw new Error('unterminated const ' + name);
};

// ── the fixture ──────────────────────────────────────────────────────────────
// Two categories that LOOK different from how they are filed: `group` is the display
// heading, `cat` the underlying category. If the code picked rows by `cat` this fixture
// is what catches it.
const items = [
  { key: 'm:Pasta:Rigatoni',  cat: 'Pasta',     group: 'Pasta',   name: 'Rigatoni',  printers: ['Main'] },
  { key: 'm:Pasta:Lasagna',   cat: 'Pasta',     group: 'Pasta',   name: 'Lasagna',   printers: ['Main'] },
  // Filed under Pasta, SHOWN under Salads, and routed to Main — so the Salads heading is
  // genuinely mixed. A fixture whose "mixed" category agrees proves nothing; this one
  // did, and the assertion below failed honestly until the fixture was fixed.
  { key: 'm:Pasta:ColdPasta', cat: 'Pasta',     group: 'Salads',  name: 'Cold pasta',printers: ['Main'] },
  { key: 'm:Salads:Caesar',   cat: 'Salads',    group: 'Salads',  name: 'Caesar',    printers: ['Salad'] },
  { key: 'm:Food Mods:Extra', cat: 'Food Mods', group: 'Food Mods', name: 'extra',   printers: [] },
];

let posRouting = {};
let kvPushes = 0, confirms = [];
let confirmAnswer = true;

const ctx = {
  get posRouting() { return posRouting; },
  set posRouting(v) { posRouting = v; },
  posS: { cat: { items, printers: ['Bar', 'Salad', 'Main', 'Pizza'] } },
  posNewClasses: [{ key: 'pc:1', name: 'Hot line', printers: ['Main', 'Pizza'] }],
  POS_PRINTERS: ['Bar', 'Salad', 'Main', 'Pizza'],
  // The page groups by display group when there is one — the real posCatOf.
  posCatOf: (r) => r.group || r.cat,
  posEnc: encodeURIComponent,
  decodeURIComponent,
  kvPush: (k) => { kvPushes++; if (!/^ct_pos_/.test(k)) throw new Error('wrong store: ' + k); },
  posKeepScroll: (fn) => fn(),
  posRerenderList: () => {},
  renderViewport: () => {},
  confirm: (msg) => { confirms.push(msg); return confirmAnswer; },
  Date,
  Object, Array, JSON, String, Number, Math,
};

const src = [
  grabConst('posSameSet'), grabConst('posPrinters'), grabConst('posCatRows'),
  grab('posRouteOptions'), grab('posRouteIdFor'), grab('posApplyRoute'),
  grab('posCatRoute'), grab('posSetRouteCat'), grab('posSetRoute'),
  grabConst('posRoutedTo'), grabConst('posRerouted'),
].join('\n');
const names = Object.keys(ctx);
const api = new Function(...names, src + `
  return { posSetRouteCat, posSetRoute, posCatRoute, posCatRows, posApplyRoute,
           posRoutedTo, posRouteOptions, posRouteIdFor };`)(...names.map((n) => ctx[n]));

ok('the real functions were lifted from the page', typeof api.posSetRouteCat === 'function');

// ── which rows ───────────────────────────────────────────────────────────────
ok('a category collects the rows shown UNDER IT, by display group',
   api.posCatRows('Pasta').map((r) => r.name).join() === 'Rigatoni,Lasagna');
ok('⚠️ the row filed under Pasta but SHOWN under Salads goes with Salads, not Pasta',
   api.posCatRows('Salads').map((r) => r.name).join() === 'Cold pasta,Caesar');
ok('Food Mods have no routing of their own and are excluded', api.posCatRows('Food Mods').length === 0);

// ── what the heading SHOWS before it offers to change anything ───────────────
ok('a category whose rows agree reports that route', (api.posCatRoute('Pasta') || []).join() === 'Main');
ok('⚠️ a category whose rows DIFFER reports null, not the first row\'s value',
   api.posCatRoute('Salads') === null);
ok('an empty category reports null rather than an empty route', api.posCatRoute('Food Mods') === null);

// ── the bulk write ───────────────────────────────────────────────────────────
confirmAnswer = false;
api.posSetRouteCat('Pasta', 'sPizza');
ok('⚠️ it ASKS before writing, naming the count and the destination',
   /all 2 items in Pasta to Pizza/.test(confirms[0] || ''));
ok('…and says no when the answer is no', Object.keys(posRouting).length === 0 && kvPushes === 0);

confirmAnswer = true;
api.posSetRouteCat('Pasta', 'sPizza');
ok('a yes routes every row in the category',
   api.posCatRows('Pasta').every((r) => (api.posRoutedTo(r) || []).join() === 'Pizza'));
ok('⚠️ and routes NOTHING outside it',
   api.posCatRows('Salads').every((r) => (api.posRoutedTo(r) || []).join() === (r.printers || []).join()));
ok('the Food Mod is untouched', !Object.prototype.hasOwnProperty.call(posRouting, 'm:Food Mods:Extra'));
ok('it saves once for the whole category, not once per row', kvPushes === 1);

// ── overrides must not pile up ───────────────────────────────────────────────
api.posSetRouteCat('Pasta', 'sMain');          // back to what they ship with
ok('⚠️ setting a category back to its own printers REMOVES the overrides',
   Object.keys(posRouting).length === 0);
ok('…and the rows read as their original route again',
   api.posCatRows('Pasta').every((r) => (api.posRoutedTo(r) || []).join() === 'Main'));

// ── a class is a class, and the heading names it ─────────────────────────────
api.posSetRouteCat('Pasta', 'pc:1');            // Hot line = Main + Pizza
ok('a whole category can be put on a print class',
   (api.posCatRoute('Pasta') || []).slice().sort().join() === 'Main,Pizza');
ok('⚠️ and the heading then NAMES the class rather than listing printers',
   api.posRouteIdFor(api.posCatRoute('Pasta')) === 'pc:1');

// ── one item and a whole category decide the same way ────────────────────────
// posSetRoute and posSetRouteCat both go through posApplyRoute. If someone reimplements
// either, this is what disagrees.
ok('the single-row setter goes through the same rule',
   /posApplyRoute\(row,opt\)/.test(grab('posSetRoute')));
ok('and so does the bulk one', /rows\.forEach\(r=>posApplyRoute\(r,opt\)\)/.test(grab('posSetRouteCat')));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
