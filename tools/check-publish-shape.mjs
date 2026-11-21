// Does Publish always emit a blob the mini will ACCEPT?
//
//     node tools/check-publish-shape.mjs
//
// The mini's relay (angelis-pos server/menu.js, valid()) checks the top level only:
// `items` must be an object, `deleted` and `added` must be arrays. If any of the three
// is missing it rejects the WHOLE blob and keeps serving the last good copy — SILENTLY.
// Not stale, no error, nothing in the UI: the publish simply never lands.
//
// That makes a leaner payload the most dangerous kind of tidy-up anybody could do here
// (a "rename-only" blob, say). This is the check that turns an agreement between two
// sessions into something the repo enforces.
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

// The mini's own rule, copied here deliberately rather than imported — if the relay
// ever tightens it, this line is what somebody edits, and the checks below then say
// which publishes would stop landing.
const miniAccepts = (o) => !!o && typeof o === 'object'
  && o.items && typeof o.items === 'object'
  && Array.isArray(o.deleted) && Array.isArray(o.added);

const state = {
  rows: [], modNames: {}, deleted: [], added: [], discRates: {}, newMods: [], modLetters: {},
  // ⚠️ EVERY GLOBAL posBuildLive TOUCHES HAS TO BE HERE. The sandbox has no page around
  // it, so a new one reaches this file as a ReferenceError that takes the whole check
  // down — which is exactly what happened when deletedMods joined the payload: the
  // publish kept working and its shape simply stopped being checked at all.
  deletedMods: [], choiceCuts: {},
  groups: { groups: {}, attach: {}, detach: {}, gone: [] },
  itemOrder: {},
  promptOrder: {},
  // draft and live deliberately DIFFERENT, so a check that confuses them cannot pass.
  buttons: {
    draft: { food: [{ cat: 'DRAFT ONLY' }], bar: [], off: [] },
    live: { at: 1700000000001, food: [{ cat: 'Pasta' }, { cat: 'Pizza' }], bar: [{ cat: 'GIN' }], off: ['Specials'] },
  },
};
const ctx = {
  posAllRows: () => state.rows,
  posEntered: (r) => r.entered, posPriceOf: (r) => r.newCents,
  posRerouted: (r) => !!r.rerouted, posRoutedTo: (r) => r.routes,
  posModNames: state.modNames,
  posDeletedItems: state.deleted, posNewItems: state.added,
  posBuildGroups: () => state.groups,
  // the order each item asks its groups (11/20/26) — built by its own tested function
  posBuildPromptOrder: () => state.promptOrder,
  get posDiscRates() { return state.discRates; },
  get posNewMods() { return state.newMods; },
  get posModLetters() { return state.modLetters; },
  get posDeletedMods() { return state.deletedMods; },
  get posChoiceCuts() { return state.choiceCuts; },
  // Joined the payload after this sandbox was written, each one crashing the whole
  // check until it was added — which is the failure mode the comment above warns about,
  // twice over. posLiveAt is the write-through clock; posItemOrder is the button order
  // the register reads (added 11/8/26).
  get posItemOrder() { return state.itemOrder; },
  // The register's category rail. ⛔ posBuildLive must read `.live` and never `.draft` —
  // state.buttons carries both so the assertions below can prove which one travels.
  get posBtnStore() { return state.buttons; },
  posLiveAt: 0,
  posNewDiscounts: [], posDeletedDiscounts: [],
  posModLetter: (n) => (String(n).match(/[A-Za-z]/) || ['#'])[0].toUpperCase(),
  posS: { cat: { generated_at: '2026-09-17' } },
  Object, Date, Array, String, JSON, console,
};
// ⛔ The predicate is lifted, not stubbed: posBuildLive now filters through it, and a
// stub would prove nothing about which names actually travel. posButtons is the fixture
// export, so 'Pasta'/'Pizza'/'GIN' are admitted and anything else is not.
const PRED = (() => {
  const i = html.indexOf('const POS_BTN_REFUSE=[');
  const j = html.indexOf('const posBtnBadOnes=', i);
  const k = html.indexOf('};', j);
  if (i < 0 || j < 0 || k < 0) { ok('ANCHOR: the rail predicate is still in index.html', false); return ''; }
  return html.slice(i, k + 2);
})();
ctx.posButtons = { food: [{ cat: 'Pasta' }, { cat: 'Pizza' }], bar: [{ cat: 'GIN' }], openers: [{ cat: 'RED WINE' }] };
ctx.posBtnCat = (e) => (typeof e === 'string' ? e : (e && e.cat) || '');
ctx.posBtnOpeners = () => ctx.posButtons.openers;
ctx.posBtnLabelOf = (e) => (e && e.label) || (e && e.cat) || '';
const build = new Function('ctx', 'with(ctx){' + PRED + '\n' + grab('posBuildLive') + '\nreturn posBuildLive;}')(ctx);

// 1. the empty case — nothing edited at all
let b = build();
// ── reading through the blob without throwing ───────────────────────────────────────────
// `BT()` is `b.buttons` or `{}`, and arrays are taken as `(… || [])` AT THE POINT OF
// ACCESS. A blob that publishes no rail at all used to throw on the first `b.buttons.food`
// below, which stops the file: every assertion after it is silently skipped, the reported
// assertion count quietly drops, and `mutate-checks` scores the mutant red for the CRASH
// rather than for the assertion meant to catch it. Same pattern as tools/check-screens.mjs.
// Nothing here is weakened — where absence would otherwise satisfy an assertion vacuously,
// the `!!b.buttons &&` that used to be implied by the throw is now written out.
const BT = () => (b.buttons || {});
ok('an empty publish is still ACCEPTED by the mini', miniAccepts(b));
ok('  items is an object', b.items && typeof b.items === 'object');
ok('  deleted is an array', Array.isArray(b.deleted));
ok('  added is an array', Array.isArray(b.added));

// 2. a rename ONLY — the payload that would be most tempting to slim down
state.rows = [{ key: 'm:RED WINE BOTTLE:Mezzacorona Cab — BTL', name: 'Mezzacorona Cab — BTL', cents: 3200 }];
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezzacorona Cabernet';
b = build();
ok('A RENAME-ONLY publish is accepted', miniAccepts(b));
ok('and the rename is in it', b.items['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'].name === 'Mezzacorona Cabernet');
ok('under the ORIGINAL key — never a new one',
   Object.keys(b.items).every((k) => k.endsWith('Mezzacorona Cab — BTL')));

// 3. renaming to the same name is not an edit
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezzacorona Cab — BTL';
b = build();
ok('renaming something to what it already was publishes nothing',
   Object.keys(b.items).length === 0);

// 4. a price and a rename together
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezza Cab';
state.rows[0].entered = true; state.rows[0].newCents = 3400;
b = build();
const e = b.items['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'];
ok('a rename and a reprice travel together', e.name === 'Mezza Cab' && e.cents === 3400);
ok('and the blob is still accepted', miniAccepts(b));

// 5. the thing the mini needs that is easiest to drop by accident
ok('the blob names its catalog so the register knows what it sits on', 'base' in b);
ok('every publish carries a timestamp', typeof b.at === 'number' && b.at > 0);

// ---- DISCOUNT RATES TRAVEL ----------------------------------------------------
// They were read-only, on the honest grounds that the publish had nothing that could
// carry them. It does now, so the field is real rather than decorative — and money
// coming off a bill rides the same audited path as a price, not a second one.
state.discRates = {};
b = build();
ok('an untouched publish carries an empty discounts map',
   b.discounts && typeof b.discounts === 'object' && Object.keys(b.discounts).length === 0);

state.discRates = { birthday: 1000, vip_pct: 1250, house_acct: 5000 };
b = build();
ok('a set rate rides the publish', b.discounts.birthday === 1000);
ok('a fraction of a percent survives — 12.5% is 1250, not 12 or 13', b.discounts.vip_pct === 1250);
ok('and a dollar discount rides as cents', b.discounts.house_acct === 5000);
const sent = build().discounts;
state.discRates.birthday = 9999;
ok('⚠️ it is a COPY, so a later edit cannot rewrite a blob already sent', sent.birthday === 1000);

// ---- NEW FOOD MODS TRAVEL -------------------------------------------------------
// ⚠️ They did not, and it failed in the worst way available: adding one SAVED it and
// SHOWED it in the back office as a row marked new, then never published it. The back
// office said the mod existed; the register had never heard of it. Vinny added
// "$GF ROTINI" and published — the only thing that rode was a RENAME of a mod that was
// not there.
state.newMods = [];
b = build();
ok('an untouched publish carries an empty newMods list',
   Array.isArray(b.newMods) && b.newMods.length === 0);

state.newMods = [{ name: '$GF ROTINI', cents: 300 }, { name: 'extra napkins', cents: 0 }];
b = build();
ok('a mod added in the back office rides the publish', b.newMods.length === 2);
ok('with its price', b.newMods.find((m) => m.name === '$GF ROTINI').cents === 300);
ok('a free one rides too', b.newMods.find((m) => m.name === 'extra napkins').cents === 0);
ok('⚠️ and its LETTER, so it lands where the back office filed it',
   b.newMods.find((m) => m.name === '$GF ROTINI').letter === 'G');
state.modLetters = { '$GF ROTINI': 'R' };
b = build();
ok('a letter set by hand beats the first letter of the name',
   b.newMods.find((m) => m.name === '$GF ROTINI').letter === 'R');
state.newMods = []; state.modLetters = {};

// ── the order the register shows the buttons in ──────────────────────────────
// Added 11/8/26. menulive.orderItems has read blob.itemOrder all along and nothing
// published it; this is what keeps the field from quietly going missing again.
state.itemOrder = { Chicken: ['m:Chicken:HALF:1/2 Chx Armenta', 'm:Chicken:CHK PARM'] };
b = build();
ok('the item order rides the publish', !!b.itemOrder);
ok('keyed by category', Array.isArray(b.itemOrder.Chicken));
ok('⚠️ carrying the keys verbatim, prefix included — a HALF item that loses its prefix matches nothing',
   b.itemOrder.Chicken[0] === 'm:Chicken:HALF:1/2 Chx Armenta');
ok('and it is a copy, so a later edit here cannot mutate what was sent',
   b.itemOrder !== state.itemOrder);
state.itemOrder = {};

// ── the register's CATEGORY RAIL ─────────────────────────────────────────────
//
// ⛔ The one invariant that matters here: `buttons` carries the SENT snapshot and never
// the draft. Every edit in the Register buttons page rides the same 1400ms debounce as a
// price, so if the draft travelled, the next unrelated price edit would rearrange every
// server's screen with whatever Vinny happened to be part-way through arranging. The
// draft in the fixture is deliberately a category that must never appear in a blob.
b = build();
ok('the sent rail rides the publish', !!b.buttons && b.buttons.v === 1);
ok('⛔ it is the SENT snapshot, not the draft',
   (BT().food || []).some((e) => e.cat === 'Pasta')
   && JSON.stringify(BT()).indexOf('DRAFT ONLY') < 0);
ok('…carrying the sent `at`, which is what the on-the-registers receipt compares',
   BT().at === 1700000000001);
ok('…both rails and the off-list', Array.isArray(BT().bar) && (BT().off || [])[0] === 'Specials');
ok('and they are copies, so a later edit here cannot mutate what was sent',
   !!b.buttons && BT().food !== state.buttons.live.food && BT().off !== state.buttons.live.off);

// An unrelated edit must re-emit the SAME rail with the SAME at — otherwise every price
// change looks like a rail change to the register and redraws the screen.
const railAt = BT().at, railJson = JSON.stringify(BT());
state.rows = [{ key: 'm:Pasta:Rotini', cents: 1450, newCents: 1595, entered: true, cat: 'Pasta' }];
b = build();
ok('⚠️ an unrelated price edit re-emits the same rail, byte for byte, with the same `at`',
   !!b.buttons && JSON.stringify(BT()) === railJson && BT().at === railAt);
state.rows = [];

// Never edited ⇒ the key is ABSENT, so each register keeps its own built-in rail. An
// empty rail and "use your built-in one" are different answers, and only one is safe.
state.buttons = null;
b = build();
ok('⛔ never edited ⇒ no `buttons` key at all, so the register uses its built-in rail',
   !('buttons' in b));
state.buttons = { draft: { food: [{ cat: 'x' }], bar: [], off: [] }, live: null };
b = build();
ok('…and so does "back to the built-in buttons", which sends live = null',
   !('buttons' in b));
// A sent rail with no buttons would leave every register with an empty screen and no way
// back. Refused here as well as at the send, because this is the half that reaches iPads.
state.buttons = { draft: {}, live: { at: 1, food: [], bar: [], off: [] } };
b = build();
ok('⛔ a sent rail with ZERO buttons is refused rather than emptying every screen',
   !('buttons' in b));
// ⛔ AND PER PAGE, NOT ADDED TOGETHER. The register treats a page with zero buttons as
// unusable: it draws that page's full built-in rail and stops honouring `off` for it. So a
// full FOOD rail behind an empty LIQUOR one is not "most of a rail" — it is the bar page
// silently reverting while the suppression list quietly stops applying to it. Both guards
// counted food.length + bar.length, which this case passes.
state.buttons = { draft: {}, live: { at: 1, food: [{ cat: 'Pasta' }], bar: [], off: ['Specials'] } };
b = build();
ok('⛔ a rail with one page FULL and the other EMPTY is refused, not half-published',
   !('buttons' in b));
state.buttons = { draft: {}, live: { at: 1, food: [], bar: [{ cat: 'VODKA' }], off: [] } };
b = build();
ok('…either way round', !('buttons' in b));
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Pasta' }], bar: [{ cat: 'GIN' }], off: [] } };
b = build();
ok('…while one button on EACH page travels normally',
   !!b.buttons && (BT().food || []).length === 1 && (BT().bar || []).length === 1 && BT().at === 9);

// ⛔ THE PREDICATE HAS TO RUN HERE, NOT ONLY AT THE SEND. This function runs on EVERY
// publish — a price edit re-emits the stored `live` with no send involved — so a rail written
// by another device, an older build, or before the predicate existed would otherwise keep
// going out to the iPads for ever with nothing on the send path ever seeing it.
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Pasta' }, { cat: 'Wine' }], bar: [{ cat: 'GIN' }], off: [] } };
b = build();
ok('⛔ a stored rail carrying a name the registers cannot use publishes WITHOUT it',
   !!b.buttons && (BT().food || []).map((e) => e.cat).join() === 'Pasta');
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Pasta' }, { cat: 'PASTA' }], bar: [{ cat: 'GIN' }], off: [] } };
b = build();
ok('…and a MISSPELLED cat is dropped too, not waved through because it looks close',
   !!b.buttons && (BT().food || []).map((e) => e.cat).join() === 'Pasta');
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Pasta' }], bar: [{ cat: '__groups' }], off: [] } };
b = build();
ok('⛔ …and if dropping empties a page, the whole key goes rather than half a rail',
   !('buttons' in b));
// `off` is deliberately NOT filtered: it is a suppression instruction, so an unknown name is
// a no-op for any reader, and the ×/+ pair is the only control that can touch it.
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Pasta' }], bar: [{ cat: 'GIN' }], off: ['Wine', 'Specials'] } };
b = build();
ok('an unknown name in `off` still travels — suppressing something no reader knows is a no-op',
   !!b.buttons && (BT().off || []).join() === 'Wine,Specials');
// Blind must not refuse: with no export loaded nothing is known, and guessing here would
// take real tabs off eight registers.
const noExport = ctx.posButtons; ctx.posButtons = null;
state.buttons = { draft: {}, live: { at: 9, food: [{ cat: 'Anything' }], bar: [{ cat: 'At All' }], off: [] } };
b = build();
ok('⚠️ with pos-buttons.json not loaded NOTHING is refused — blind is not a verdict',
   !!b.buttons && (BT().food || []).length === 1 && (BT().bar || []).length === 1);
ctx.posButtons = noExport;

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
