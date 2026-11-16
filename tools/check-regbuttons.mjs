// Does the Register buttons page edit a DRAFT and leave the registers alone?
//
//     node tools/check-regbuttons.mjs
//
// This page rearranges the category buttons down the side of every register. Two things
// about it are dangerous and neither is visible in a screenshot:
//
//   1. A RENAME MUST NOT TOUCH THE KEY. `cat` is the string every item is already filed
//      under — 'm:<cat>:<name>' for prices and renames, added[].cat for specials,
//      itemOrder[cat], and the routing keys. Rename the key and every price, route and
//      pending special filed against it is orphaned, silently, because a key that matches
//      nothing is not an error anywhere. So the LABEL is a separate field and `cat` is
//      read-only for ever.
//   2. A DRAFT EDIT MUST NOT TOUCH `live`. Editing here must never change what the
//      registers have; only an explicit send does that. check-publish-shape proves the
//      publish side (live travels, draft never does) — this proves the edit side.
//
// Everything is RUN. The ▲▼ swap is an index pair, which is exactly the kind of thing
// that reads correctly and is off by one.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;
const cut = (a, b, what) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j <= i) { ok(`ANCHOR: ${what} still found in index.html`, false); return ''; }
  return src.slice(i, j);
};

const STATE = cut("const POS_BTN_STORE='ct_pos_buttons';", 'let posButtons=null;', 'the rail store helpers');
const HOME  = cut('const posBtnHomeRail=', 'const posBtnSwatches=', 'the home-rail resolvers');
// The predicate is lifted into both sandboxes rather than stubbed: posBtnOn and
// posBtnSend now consult it, so a stub would be proving things about the stub.
const PRED  = (() => {
  const i = src.indexOf('const POS_BTN_REFUSE=[');
  const j = src.indexOf('const posBtnBadOnes=', i);
  const k = src.indexOf('};', j);
  if (i < 0 || j < 0 || k < 0) { ok('ANCHOR: the rail predicate is still in index.html', false); return ''; }
  return src.slice(i, k + 2);
})();
const EDIT  = cut('const posBtnEdit=', '// ⛔ THE ONLY THING THAT REACHES A REGISTER', 'posBtnEdit and the handlers');

const EXPORT = {
  food: [{ cat: 'N/A BEVS', color: '#2C7BE5' }, { cat: 'Appetizers', color: '#8E2A2A' }, { cat: 'Pasta', color: '#A83C3C' }],
  bar: [{ cat: 'N/A BEVS', color: '#2C7BE5' }, { cat: 'VODKA', color: '#7C86A8' }, { cat: 'GIN', color: '#7C86A8' }],
  openers: [{ cat: 'BEER', label: 'BEER', page: 'bar', where: 'top row' },
    { cat: 'RED WINE', label: 'RED WINE', page: 'bar', where: 'bottom row', pages: ['BY THE GLASS', 'BOTTLES'] },
    { cat: 'WHITE WINE', label: 'WHITE WINE', page: 'bar', where: 'bottom row' },
    // The real export has openers on BOTH pages. They were missing here, and their absence
    // made the "GOLF is refused" assertion pass for the WRONG reason (refused as unknown,
    // not as an opener) \u2014 a fixture that is a subset of the real shape is a quiet green.
    { cat: 'GOLF', label: 'GOLF', page: 'food', where: 'bottom row' },
    { cat: 'Sides', label: 'SIDES', page: 'food', where: 'bottom row' }],
  colors: { 'N/A BEVS': '#2C7BE5', Pasta: '#A83C3C' }, defaultColor: '#7C86A8',
};

// ── the state helpers: seed, travel, and what "not sent yet" means
let S = null;
if (STATE) {
  try {
    S = new Function('EXPORT', `
      const posBtnCat=(e)=>typeof e==='string'?e:(e&&e.cat)||'';
      let posButtons=EXPORT;
      ${STATE}
      return {get store(){return posBtnStore},set store(v){posBtnStore=v},
              posBtnSeed,posBtnDraft,posBtnLive,posBtnUnsent,posBtnTravel,posBtnCount};`)(EXPORT);
  } catch (e) { ok('the state helpers evaluate: ' + e.message, false); }
}
ok('the rail store helpers lift and run', !!(S && S.posBtnUnsent));

if (S && S.posBtnUnsent) {
  S.store = null;
  ok('with no store the draft is SEEDED from the register’s own export',
     S.posBtnDraft().food.length === 3 && S.posBtnDraft().bar.length === 3
     && S.posBtnDraft().food[0].cat === 'N/A BEVS');
  ok('⚠️ and an untouched page is NOT "not sent yet" — the seed already IS what the registers have',
     S.posBtnUnsent() === false);
  const d = JSON.parse(JSON.stringify(S.posBtnDraft()));
  d.food = [d.food[1], d.food[0], d.food[2]];
  S.store = { v: 1, draft: d, live: null };
  ok('…once something is moved it IS unsent', S.posBtnUnsent() === true);
  S.store = { v: 1, draft: d, live: { v: 1, at: 7, food: d.food, bar: d.bar, off: d.off } };
  ok('…and sending it clears that', S.posBtnUnsent() === false);
  S.store = { v: 1, draft: d, live: { v: 1, at: 999999, food: d.food, bar: d.bar, off: d.off } };
  ok('…a different `at` alone does NOT make it look unsent — only what travels is compared',
     S.posBtnUnsent() === false);
  S.store = { v: 1, draft: { food: [], bar: [], off: [] }, live: null };
  ok('an all-off draft counts zero buttons, which the send refuses', S.posBtnCount(S.posBtnDraft()) === 0);
  S.store = null;
}

// ── posBtnEdit and the five handlers, with the write stubbed so the real closures run
let H = null, last = null, base = null;
if (EDIT) {
  try {
    H = new Function('EXPORT', 'report', `
      const posBtnCat=(e)=>typeof e==='string'?e:(e&&e.cat)||'';
      let posButtons=EXPORT;
      let BASE=null;
      const posBtnWrite=(make)=>{ const n=make(BASE); report(n); return n!==null; };
      const posBtnDraft=()=>(BASE&&BASE.draft)||{food:[],bar:[],off:[]};
      const posBtnLive=()=>(BASE&&BASE.live)||null;
      const posBtnLabelOf=(e)=>(e&&e.label)||(e&&e.cat)||'';
      const posBtnOpeners=()=>(posButtons&&posButtons.openers)||[];
      const posBtnS={busy:false,note:'',err:'',sent:'',editing:''};
      ${HOME}
      ${PRED}
      ${EDIT}
      return {setBase(b){BASE=b},posBtnMove,posBtnRename,posBtnColor,posBtnOff,posBtnOn,
              posBtnWhyNot,posBtnBadOnes,posBtnS,posBtnHomeRails};`)(
      EXPORT, (n) => { last = n; });
  } catch (e) { ok('posBtnEdit and the handlers evaluate: ' + e.message, false); }
}
ok('posBtnEdit and the five handlers lift and run', !!(H && H.posBtnMove));
// The same predicate with NO export loaded, for the three-state assertion below.
const H2 = () => new Function('report', `
  const posButtons=null;
  const posBtnCat=(e)=>typeof e==='string'?e:(e&&e.cat)||'';
  const posBtnOpeners=()=>[];
  const posBtnLabelOf=(e)=>(e&&e.label)||(e&&e.cat)||'';
  ${PRED}
  return {posBtnWhyNot,posBtnExportCats};`)(null);


if (H && H.posBtnMove) {
  const LIVE = { v: 1, at: 4242, food: [{ cat: 'LIVE ONLY' }], bar: [], off: [] };
  const fresh = () => {
    base = { v: 1, draft: { food: [{ cat: 'A' }, { cat: 'B' }, { cat: 'C' }], bar: [{ cat: 'VODKA' }, { cat: 'GIN' }], off: [] }, live: LIVE };
    H.setBase(base); last = null;
  };
  const cats = (a) => (a || []).map((e) => e.cat).join(',');

  // ── 2. a draft edit must never touch `live`
  fresh(); H.posBtnMove('food', 0, 1);
  ok('⛔ a draft edit leaves `live` exactly as it was — editing cannot change the registers',
     !!last && last.live === LIVE && cats(last.live.food) === 'LIVE ONLY');
  ok('…and it is written back under v:1 with both halves', !!last && last.v === 1 && !!last.draft);

  // ── the ▲▼ swap
  ok('moving down swaps with the one below', cats(last.draft.food) === 'B,A,C');
  fresh(); H.posBtnMove('food', 2, -1);
  ok('moving up swaps with the one above', cats(last.draft.food) === 'A,C,B');
  fresh(); H.posBtnMove('food', 0, -1);
  ok('moving the top one up is refused, not wrapped to the bottom', last === null);
  fresh(); H.posBtnMove('food', 2, 1);
  ok('moving the last one down is refused', last === null);
  fresh(); H.posBtnMove('bar', 0, 1);
  ok('a move on one rail leaves the other alone',
     cats(last.draft.bar) === 'GIN,VODKA' && cats(last.draft.food) === 'A,B,C');

  // ── 1. THE KEY IS NEVER TOUCHED
  fresh(); H.posBtnRename(encodeURIComponent('B'), 'Kids Menu');
  ok('⛔ a rename sets the LABEL and leaves the key alone',
     last.draft.food[1].cat === 'B' && last.draft.food[1].label === 'Kids Menu');
  ok('…and no other button is relabelled', !last.draft.food[0].label && !last.draft.food[2].label);
  fresh(); H.posBtnRename(encodeURIComponent('B'), '   ');
  ok('an empty box clears the label rather than making a blank button',
     last.draft.food[1].cat === 'B' && !('label' in last.draft.food[1]));
  fresh(); H.posBtnRename(encodeURIComponent('B'), 'B');
  ok('a label equal to the key is stored as no label at all',
     !('label' in last.draft.food[1]));
  fresh(); H.posBtnRename(encodeURIComponent('B'), '  Spaced  ');
  ok('a label is trimmed', last.draft.food[1].label === 'Spaced');
  fresh(); H.posBtnRename(encodeURIComponent('B'), 'x'.repeat(60));
  ok('…and capped, so one long name cannot break the rail’s layout',
     last.draft.food[1].label.length === 24);
  fresh(); H.posBtnRename(encodeURIComponent('NOPE'), 'x');
  ok('renaming a button that is not there changes nothing', last === null);

  // ── colour
  fresh(); H.posBtnColor(encodeURIComponent('A'), '#123456');
  ok('a colour is set on the right button', last.draft.food[0].color === '#123456');
  fresh(); H.posBtnColor(encodeURIComponent('A'), 'red');
  ok('…and anything that is not a #rrggbb hex is ignored, not written through', last === null);
  fresh(); H.posBtnColor(encodeURIComponent('A'), '#12345');
  ok('…including a short hex', last === null);

  // ── off and back on
  fresh(); H.posBtnOff(encodeURIComponent('B'));
  ok('× takes the button off the rail and into the tray',
     cats(last.draft.food) === 'A,C' && last.draft.off.join() === 'B');
  fresh(); H.posBtnOff(encodeURIComponent('NOPE'));
  ok('taking off a button that is not on a rail changes nothing', last === null);
  base = { v: 1, draft: { food: [{ cat: 'A' }], bar: [], off: ['GIN'] }, live: LIVE }; H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('GIN'));
  ok('⚠️ putting one back goes to the rail the REGISTER has it on, not whichever column is handy',
     last.draft.off.length === 0 && cats(last.draft.bar) === 'GIN' && cats(last.draft.food) === 'A');
  base = { v: 1, draft: { food: [], bar: [], off: ['Pasta'] }, live: LIVE }; H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('Pasta'));
  ok('\u2026carrying the register\u2019s own colour for that category, not a new one',
     last.draft.food[0].color === '#A83C3C');
  base = { v: 1, draft: { food: [], bar: [], off: ['GIN'] }, live: LIVE }; H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('GIN'));
  ok('\u2026and blank when the register has no colour for it, so it falls back to the default',
     last.draft.bar[0].color === '');
  base = { v: 1, draft: { food: [{ cat: 'A' }], bar: [], off: [] }, live: LIVE }; H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('GIN'));
  ok('putting back something that is not in the tray changes nothing', last === null);
  // ⚠️ A cat the export has never heard of still has to land somewhere. This is reachable:
  // the export is regenerated, a category it used to list is gone, and a name for it is
  // already sitting in a stored `off` — with the + chip the only control that touches it.
  base = { v: 1, draft: { food: [{ cat: 'Pasta' }], bar: [{ cat: 'VODKA' }], off: ['Mystery'] }, live: LIVE };
  H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('Mystery'));
  ok('\u26d4 + on a cat the register has never heard of is refused \u2014 the button would ring nothing',
     last === null && /registers know/.test(H.posBtnS.err));
  base = { v: 1, draft: { food: [{ cat: 'Pasta' }], bar: [{ cat: 'VODKA' }], off: ['BEER'] }, live: LIVE };
  H.setBase(base); last = null;
  H.posBtnOn(encodeURIComponent('BEER'));
  ok('\u26d4 + on an opener is refused too, and says it already has its own button',
     last === null && /already has its own button/.test(H.posBtnS.err));
  // posBtnHomeRails' "it is on no rail" fallback is tested DIRECTLY rather than through
  // posBtnOn. Through the handler it is unreachable now \u2014 the predicate refuses anything that
  // is not already on a rail \u2014 and a fallback whose only test runs through a door that is now
  // locked is untested code that looks covered.
  ok('posBtnHomeRails never answers "no rail at all", even for a cat the export omits',
     Array.isArray(H.posBtnHomeRails('Mystery')) && H.posBtnHomeRails('Mystery').length === 1);
  ok('\u2026and answers with EVERY rail for one the export has twice',
     H.posBtnHomeRails('N/A BEVS').slice().sort().join() === 'bar,food');

  // ⛔ THE ×/+ PAIR MUST NOT DELETE A BUTTON. 'N/A BEVS' is on BOTH rails in the real
  // export, and the ×/+ pair is the only control there is, so a restore that picks one rail
  // loses the other for good with nothing in the UI to undo it.
  base = { v: 1, draft: { food: [{ cat: 'N/A BEVS' }, { cat: 'A' }], bar: [{ cat: 'N/A BEVS' }, { cat: 'VODKA' }], off: [] }, live: LIVE };
  H.setBase(base); last = null;
  H.posBtnOff(encodeURIComponent('N/A BEVS'));
  ok('\u00d7 on a cat that is on BOTH rails takes it off both, and records it once',
     cats(last.draft.food) === 'A' && cats(last.draft.bar) === 'VODKA'
     && last.draft.off.join() === 'N/A BEVS');
  H.setBase(last); last = null;
  H.posBtnOn(encodeURIComponent('N/A BEVS'));
  ok('\u26d4 …and + puts it back on BOTH, not just one — one × then one + used to delete it',
     cats(last.draft.food).includes('N/A BEVS') && cats(last.draft.bar).includes('N/A BEVS')
     && last.draft.off.length === 0);
  ok('\u2026and does not duplicate a rail entry that is somehow already there',
     last.draft.food.filter((e) => e.cat === 'N/A BEVS').length === 1
     && last.draft.bar.filter((e) => e.cat === 'N/A BEVS').length === 1);

  // round trip
  base = { v: 1, draft: { food: [{ cat: 'A' }, { cat: 'Pasta' }], bar: [], off: [] }, live: LIVE }; H.setBase(base);
  H.posBtnOff(encodeURIComponent('Pasta'));
  const afterOff = last; H.setBase(afterOff); last = null;
  H.posBtnOn(encodeURIComponent('Pasta'));
  ok('off then on puts a food category back on the FOOD rail',
     last.draft.off.length === 0 && cats(last.draft.food).includes('Pasta') && last.draft.bar.length === 0);
}

// ── the predicate: what may be a register button
// ⚠️ The dangerous half of this is NOT letting a bad name through — it is refusing a good
// one. A match sloppy enough to eat 'RED WINE' along with 'RED WINE GLASS' takes two tabs
// off all eight registers, which is worse than the hole it closes.
if (H && H.posBtnWhyNot) {
  const why = H.posBtnWhyNot;
  const fine = (c) => why(c) === '';
  ok('a cat on one of the register\u2019s two rails is fine', fine('Pasta') && fine('VODKA'));
  // \u26a0\ufe0f THIS ASSERTION WAS THE OPPOSITE UNTIL 11/15, AND THE CHANGE IS A RULING, NOT A FIX.
  // It read "\u2026including an OPENER cat \u2014 RED WINE is a real button and must survive", because a
  // match sloppy enough to eat 'RED WINE' along with 'RED WINE GLASS' would take two tabs off
  // every register. That danger is unchanged and still pinned below. What changed is the
  // REQUIREMENT: POS-UI's reader (5218ccc) lists a built-in only if it is a built-in RAIL
  // category, so it skips these five, and Jarvis ruled both sides refuse them \u2014 they already
  // have their own buttons above the item grid, and placing a button anywhere else is the
  // screen builder's job. So the admit set is the two RAILS, not the openers.
  ok('\u26d4 every opener is refused for a rail, FOR THE OPENER REASON \u2014 not merely refused',
     ['BEER', 'RED WINE', 'WHITE WINE', 'GOLF', 'Sides']
       .every(c => /already has its own button/.test(why(c))));
  ok('\u26d4 \u2026and it says so, rather than implying its real button is being taken away',
     /already has its own button/.test(why('RED WINE')) && /already has its own button/.test(why('BEER')));
  ok('\u2026naming where that button is, in the register\u2019s own words',
     /LIQUOR/.test(why('BEER')) && /FOOD/.test(why('GOLF')));
  ok('\u2026and a case variant of an opener gets the SAME reason, not "unknown"',
     /already has its own button/.test(why('beer')));
  // The one that would actually hurt, still pinned: these two must not be confused. 'RED WINE'
  // is a real button being kept off a rail; 'RED WINE GLASS' is not a category at all.
  ok('\u26d4 the office-only wine SECTIONS are refused for a DIFFERENT reason than the real'
     + ' wine buttons, so the two are never conflated',
     !!why('RED WINE GLASS') && !!why('WHITE WINE BOTTLE')
     && !/already has its own button/.test(why('RED WINE GLASS'))
     && why('RED WINE GLASS') !== why('RED WINE'));
  ok('\u2026"Wine" is refused: a real category on no rail, whose items are already on the'
     + ' two wine screens', !!why('Wine'));
  ok('\u2026and so is the retired upper-case spelling, because refusing folds case',
     !!why('WINE'));
  ok('the modifier vocabulary and the discount key are not categories', !!why('Food Mods') && !!why('DISCOUNTS'));
  ok('\u26d4 "Baked" is refused \u2014 it is in FOOD_PAGE and is not a category anywhere',
     !!why('Baked'));
  // Asserted on the REASON, not merely on being refused: matching the two sentinels by name
  // still refuses an unknown '__' string — as "not a category the registers know" — so a
  // truthiness check cannot tell the prefix rule from the name list.
  ok('this page\u2019s own view sentinels are refused by PREFIX, so the next one added is'
     + ' covered too',
     /own views/.test(why('__groups')) && /own views/.test(why('__classes'))
     && /own views/.test(why('__whatever_comes_next')));
  ok('\u26d4 ADMITTING does NOT fold case \u2014 the registers match with ===, so "PASTA" would'
     + ' ring nothing', !!why('PASTA'));
  ok('\u2026and that mismatch is NAMED with the register\u2019s spelling, not dropped silently',
     /Pasta/.test(why('PASTA')) && /spelled differently/.test(why('PASTA')));
  ok('\u2026a stray space is the same mismatch', !!why(' Pasta '));
  ok('a name nothing knows is refused as unknown, not as a misspelling',
     /registers know/.test(why('Nope')));
  ok('an empty or non-string cat is refused', !!why('') && !!why(null) && !!why(42));
  ok('\u26a0\ufe0f and with no export loaded the verdict is UNDEFINED, not "fine" and not'
     + ' "refused" \u2014 blind is its own answer',
     (() => { const g = H2(); return g.posBtnWhyNot('Pasta') === undefined && g.posBtnWhyNot('Wine') === undefined; })());
  ok('posBtnBadOnes names every unusable entry on both rails, with label and key',
     (() => {
       const b = H.posBtnBadOnes({ food: [{ cat: 'Pasta' }, { cat: 'Wine', label: 'VINO' }], bar: [{ cat: 'PASTA' }] });
       return b.length === 2 && b[0].label === 'VINO' && b[0].cat === 'Wine' && b[1].which === 'bar';
     })());
}

// ── THE SAME PREDICATE, RUN AGAINST THE COMMITTED EXPORT (Jarvis: "pin it against the
// real file"). The fixture above proves the RULE; this proves the rule says the right thing
// about the buttons that are actually on Vinny's registers. A fixture can drift into being a
// subset of the real shape and go quietly green — that just happened with the FOOD openers.
const HX = (exp) => new Function('posButtons', 'report', `
  const posBtnCat=(e)=>typeof e==='string'?e:(e&&e.cat)||'';
  const posBtnOpeners=()=>(posButtons&&posButtons.openers)||[];
  const posBtnLabelOf=(e)=>(e&&e.label)||(e&&e.cat)||'';
  ${PRED}
  return {posBtnWhyNot,posBtnRailCats};`)(exp, null);

if (PRED) {
  let REAL = null;
  try { REAL = JSON.parse(readFileSync(new URL('../pos-buttons.json', import.meta.url), 'utf8')); }
  // Absent is a SKIP, not a failure \u2014 same as check-buttons. The export is a committed file,
  // not part of index.html, so a missing one says nothing about the code under test. A silent
  // drop of these five is caught by check-all's assertion COUNT, which is why it prints.
  catch (e) { console.log('  --   pos-buttons.json not readable \u2014 real-file pin not checked'); }
  if (REAL) {
    const g = HX(REAL);
    const rails = g.posBtnRailCats() || [];
    const openers = (REAL.openers || []).map(e => e && e.cat).filter(Boolean);
    // ⚠️ FIRST, that there is something to judge. With an empty export every assertion
    // below is vacuously true, which is the worst kind of green: it reads as coverage.
    ok('the real export has both rails and openers to judge (' + rails.length + ' rail cats, '
       + openers.length + ' openers)', rails.length >= 10 && openers.length >= 5);
    // The direction that costs money: a false refusal takes a tab off all eight registers.
    const refused = rails.filter(c => g.posBtnWhyNot(c) !== '');
    ok('⛔ EVERY category on the real rails is admitted — nothing Vinny already has gets'
       + ' refused' + (refused.length ? ' (refused: ' + JSON.stringify(refused) + ')' : ''),
       refused.length === 0);
    ok('⛔ every opener in the real export is refused, for the opener reason',
       openers.every(c => /already has its own button/.test(g.posBtnWhyNot(c))));
    ok('…and each one names its own screen and row, so the message is about THAT button',
       openers.every(c => {
         const e = (REAL.openers || []).find(o => o.cat === c), w = g.posBtnWhyNot(c);
         return (!e.where || w.includes(e.where))
           && (e.page !== 'bar' || /LIQUOR/.test(w)) && (e.page !== 'food' || /FOOD/.test(w));
       }));
    // If a cat were in both places the rule would be ambiguous and the verdict would depend
    // on check order. It is not today; this catches the export that changes that.
    ok('no category is both a rail category and an opener, so the rule is unambiguous',
       !rails.some(c => openers.includes(c)));
  }
}

// ── the send, which is the only thing here that reaches a register
const SEND = cut('async function posBtnSend(revert){', "// \u26a0\ufe0f `ats.menu`, NOT `menu.at`", 'posBtnSend');
const mkSend = (enabled, draft, exp) => {
  const calls = { wrote: null, published: 0, poked: 0, receipt: 0 };
  const fn = new Function('ENABLED', 'DRAFT', 'calls', 'report', 'posButtons', `
    const POS_BTN_SEND_ENABLED=ENABLED;
    const posBtnS={busy:false,note:'',err:'',sent:'',editing:''};
    const posRegButtonsRefresh=()=>{};
    const posBtnDraft=()=>DRAFT;
    const posBtnCat=(e)=>typeof e==='string'?e:(e&&e.cat)||'';
    const posBtnOpeners=()=>(posButtons&&posButtons.openers)||[];
    const posBtnLabelOf=(e)=>(e&&e.label)||(e&&e.cat)||'';
    ${PRED}
    const posBtnCount=(d)=>((d&&d.food)||[]).length+((d&&d.bar)||[]).length;
    const posBtnMinPage=(d)=>Math.min(((d&&d.food)||[]).length,((d&&d.bar)||[]).length);
    const posBtnWrite=async(make)=>{ calls.wrote=make({v:1,draft:DRAFT,live:null}); return true; };
    const posBuildLive=()=>({v:1,at:1});
    const posPublishSend=async()=>{ calls.published++; };
    const miniPoke=()=>{ calls.poked++; };
    const posBtnReceipt=async(at)=>{ calls.receipt++; return 'On the registers.'; };
    ${SEND}
    return async(revert)=>{ await posBtnSend(revert); return posBtnS; };`)(enabled, draft, calls, null, exp === undefined ? EXPORT : exp);
  return { fn, calls };
};
const FULL = { food: [{ cat: 'Pasta' }], bar: [{ cat: 'VODKA' }], off: [] };
const EMPTY = { food: [], bar: [], off: ['Pasta'] };
const HALF  = { food: [{ cat: 'Pasta' }], bar: [], off: ['VODKA'] };
if (SEND) {
  const off = mkSend(false, FULL);
  const s1 = await off.fn(false);
  ok('\u26d4 with the gate OFF a send writes NOTHING and publishes nothing',
     off.calls.wrote === null && off.calls.published === 0 && off.calls.poked === 0);
  // The WORDING is deliberately not pinned: a check that goes red for a reworded sentence
  // teaches whoever meets it to trim the clause. What matters is that it SAYS something.
  ok('\u2026and says so in a sentence rather than failing silently', (s1.err || '').length > 30);

  const empty = mkSend(true, EMPTY);
  const s2 = await empty.fn(false);
  ok('\u26a0\ufe0f a send with every button off the screen is REFUSED \u2014 an empty rail has no way back',
     empty.calls.wrote === null && empty.calls.published === 0);
  ok('\u2026and explains itself rather than just doing nothing', (s2.err || '').length > 30);

  // ⛔ PER RAIL, NOT COMBINED. A page with zero buttons makes the register draw that page's
  // full built-in rail AND stop honouring `off` for it, so half a rail is not "most of one".
  const half = mkSend(true, HALF);
  const s3 = await half.fn(false);
  ok('\u26d4 a send with ONE rail empty is refused, even though the other is full',
     half.calls.wrote === null && half.calls.published === 0);
  ok('\u2026and explains itself', (s3.err || '').length > 30);

  const rev = mkSend(true, EMPTY);
  await rev.fn(true);
  ok('\u2026but REVERTING with everything off is allowed, and clears `live`',
     !!rev.calls.wrote && rev.calls.wrote.live === null && rev.calls.published === 1);

  // ⛔ He is standing here, so the send TELLS him instead of quietly cleaning up. The
  // message has to carry the LABEL on the tile and the key underneath it: a message about a
  // key he cannot see on screen is a hunt at the worst hour of the week.
  const bad = mkSend(true, { food: [{ cat: 'Pasta' }, { cat: 'Wine', label: 'VINO' }], bar: [{ cat: 'VODKA' }], off: [] });
  const s4 = await bad.fn(false);
  ok('\u26d4 a send carrying a name the registers cannot use is REFUSED, not filtered',
     bad.calls.wrote === null && bad.calls.published === 0);
  ok('\u2026naming the label he can see AND the key underneath it',
     /VINO/.test(s4.err) && /Wine/.test(s4.err));
  const miss = mkSend(true, { food: [{ cat: 'PASTA' }], bar: [{ cat: 'VODKA' }], off: [] });
  const s5 = await miss.fn(false);
  ok('\u2026and a cat that only LOOKS right is refused with the register\u2019s spelling quoted',
     miss.calls.wrote === null && /Pasta/.test(s5.err));
  const blind = mkSend(true, { food: [{ cat: 'Anything' }], bar: [{ cat: 'At All' }], off: [] }, null);
  await blind.fn(false);
  ok('\u26a0\ufe0f but with no export loaded the send refuses NOTHING \u2014 blind is not a verdict',
     !!blind.calls.wrote && blind.calls.published === 1);
  // A revert is always allowed: it is the way back, and it carries no rail at all.
  const revBad = mkSend(true, { food: [{ cat: 'Wine' }], bar: [], off: [] });
  await revBad.fn(true);
  ok('\u2026and "back to the built-in buttons" is never blocked by a bad draft',
     !!revBad.calls.wrote && revBad.calls.wrote.live === null);

  const good = mkSend(true, FULL);
  await good.fn(false);
  ok('a real send writes `live` with a minted `at`, publishes once, pokes the mini and reads back',
     !!good.calls.wrote && good.calls.wrote.live && Number(good.calls.wrote.live.at) > 0
     && good.calls.published === 1 && good.calls.poked === 1 && good.calls.receipt === 1);
  ok('\u2026and the draft survives the send, so he can keep editing from where he was',
     good.calls.wrote.draft === FULL);
  ok('\u2026and `live` is a COPY, so a later draft edit cannot reach the registers',
     good.calls.wrote.live.food !== FULL.food);
}

// ── the receipt, RUN against each state the mini can actually be in
// ⚠️ This was two regexes over the file. One of them passed while the code read plain
// `j.menu`, because the comment above it mentions `menu.buttons.at` — a comment is not a
// behaviour. These stub fetch and read the sentence back.
const RBODY = cut('async function posBtnReceipt(at){', '\nasync function ', 'posBtnReceipt');
const receipt = (payload, status) => {
  const fn = new Function('payload', 'status', `
    const KV_MINI='http://mini.example/api/kv';
    const fetch=async()=>({ok:status===200,status,json:async()=>payload});
    ${RBODY}
    return posBtnReceipt;`)(payload, status === undefined ? 200 : status);
  return fn;
};
if (RBODY) {
  const CONFIRMED = 'On the registers.';
  const served = (buttons) => ({ menu: { items: [], ...(buttons ? { buttons } : {}) } });
  const noBlob = (buttons) => ({ menu: { ...(buttons ? { buttons } : {}) } });

  ok('a matching `at` read back from the mini is the ONLY thing that says "on the registers"',
     (await receipt(served({ v: 1, at: 500 }))(500)) === CONFIRMED);
  ok('\u26d4 an older rail still on the mini does NOT get reported as on the registers',
     (await receipt(served({ v: 1, at: 499 }))(500)) !== CONFIRMED);
  ok('\u2026and says the mini has a menu but not this list yet',
     /not this button list yet/.test(await receipt(served({ v: 1, at: 499 }))(500)));
  ok('a served menu carrying no rail at all is not reported as on the registers',
     (await receipt(served(null))(500)) !== CONFIRMED);

  // The state angelis-pos-server 6adcee3 made reachable: mini up, no blob to serve.
  const nb = await receipt(noBlob(null))(500);
  ok('\u26a0\ufe0f "the mini has NO menu" is reported as its own state, not as "an older list"',
     /not serving a menu at all/.test(nb));
  ok('\u2026and never claims the mini has it', !/the mini has it/.test(nb) && nb !== CONFIRMED);
  ok('\u2026while an EMPTY items list still counts as a served menu, because [] is a menu',
     /not this button list yet/.test(await receipt(served(null))(500)));

  ok('a revert is confirmed only when the mini is serving no rail',
     /back to their built-in buttons/.test(await receipt(served(null))(null)));
  ok('\u2026and while a rail is still being served it says so instead',
     /still serving a button list/.test(await receipt(served({ v: 1, at: 7 }))(null)));

  ok('a non-200 from the mini is reported as unconfirmed, with the status',
     /could not read the mini back/i.test(await receipt(null, 503)(500)));
  const dead = new Function('', `
    const KV_MINI='http://mini.example/api/kv';
    const fetch=async()=>{throw new Error('offline')};
    ${RBODY}
    return posBtnReceipt;`)();
  ok('and off the tailnet reads as UNKNOWN, not as failed',
     /could not reach the mini/i.test(await dead(500)));
}

// ── the gate and the auto-publish exclusion, which are one-line things worth pinning
// ⚠️ THE OLD ASSERTION HERE PINNED THE FLAG TO `false`, AND THAT INVARIANT IS RETIRED, NOT
// WEAKENED. It said "the send is gated, and it is still OFF" — true until 11/15 19:42, when
// the register build that reads a rail went live on main (angelis-pos 1693470→1693540) and
// host-stand-1 reloaded onto it. The reason for the gate was that a Send would otherwise be a
// DELAYED-ACTION change, landing whenever the build did; that reason is gone. What is still
// true and still worth pinning is the MECHANISM: the flags exist as single named constants,
// the send consults the send flag before anything else, and the gate-off path still refuses
// (proven behaviourally above with mkSend(false, …), which does not care what the constant
// currently says). Flipping the constant back and forth cannot make that coverage lie.
const once = (re) => (src.match(re) || []).length === 1;
ok('the send flag is ONE named constant, so nothing can shadow it',
   once(/const POS_BTN_SEND_ENABLED=/g));
ok('…and so is the flag that tracks what the register cannot do for itself yet',
   once(/const POS_BTN_READER_HARDENED=/g));
// ⛔ Jarvis asked that the page tell Vinny the truth: sending is live, but the register does
// not refuse a bad name, does not add back a category left off the list, and does not re-pick
// the active category when its button goes. Dropping that note would leave him sending into a
// register that cannot guard itself, with the page implying it can. The WORDING is not pinned
// — only that the note is keyed to the flag and actually says something.
const HARDNOTE = (() => {
  const i = src.indexOf('!POS_BTN_READER_HARDENED?');
  if (i < 0) return '';
  return src.slice(i, src.indexOf("</div>`:'')}", i));
})();
ok('⛔ while the register cannot screen a bad name itself, the page says so',
   HARDNOTE.length > 400);
ok('…and that note is keyed to the flag, so it retires itself rather than going stale',
   /!POS_BTN_READER_HARDENED\?/.test(src));
ok('⛔ …and the send checks it before anything else',
   /async function posBtnSend\([^)]*\)\{\s*if\(!POS_BTN_SEND_ENABLED\)\{/.test(src));
ok('⛔ a draft save does NOT trigger the auto-publish hook (ct_pos_buttons is excluded)',
   /k!=='ct_pos_live'\s*&&\s*k!=='ct_pos_buttons'/.test(src));
ok('…and the draft is written with kvSend, not kvPush, so it cannot publish',
   /kvSend\(POS_BTN_STORE,\{v:next,at\}/.test(src) && !/kvPush\(POS_BTN_STORE/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
