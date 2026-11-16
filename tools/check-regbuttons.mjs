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
const EDIT  = cut('const posBtnEdit=', '// ⛔ THE ONLY THING THAT REACHES A REGISTER', 'posBtnEdit and the handlers');

const EXPORT = {
  food: [{ cat: 'N/A BEVS', color: '#2C7BE5' }, { cat: 'Appetizers', color: '#8E2A2A' }, { cat: 'Pasta', color: '#A83C3C' }],
  bar: [{ cat: 'VODKA', color: '#7C86A8' }, { cat: 'GIN', color: '#7C86A8' }],
  openers: [{ cat: 'BEER', label: 'BEER', page: 'bar', where: 'top row' }],
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
     S.posBtnDraft().food.length === 3 && S.posBtnDraft().bar.length === 2
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
      const posBtnHomeRail=(cat)=>((EXPORT.bar||[]).some(e=>e.cat===cat))?'bar':'food';
      ${EDIT}
      return {setBase(b){BASE=b},posBtnMove,posBtnRename,posBtnColor,posBtnOff,posBtnOn};`)(
      EXPORT, (n) => { last = n; });
  } catch (e) { ok('posBtnEdit and the handlers evaluate: ' + e.message, false); }
}
ok('posBtnEdit and the five handlers lift and run', !!(H && H.posBtnMove));

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

  // round trip
  base = { v: 1, draft: { food: [{ cat: 'A' }, { cat: 'Pasta' }], bar: [], off: [] }, live: LIVE }; H.setBase(base);
  H.posBtnOff(encodeURIComponent('Pasta'));
  const afterOff = last; H.setBase(afterOff); last = null;
  H.posBtnOn(encodeURIComponent('Pasta'));
  ok('off then on puts a food category back on the FOOD rail',
     last.draft.off.length === 0 && cats(last.draft.food).includes('Pasta') && last.draft.bar.length === 0);
}

// ── the send, which is the only thing here that reaches a register
const SEND = cut('async function posBtnSend(revert){', "// \u26a0\ufe0f `ats.menu`, NOT `menu.at`", 'posBtnSend');
const mkSend = (enabled, draft) => {
  const calls = { wrote: null, published: 0, poked: 0, receipt: 0 };
  const fn = new Function('ENABLED', 'DRAFT', 'calls', 'report', `
    const POS_BTN_SEND_ENABLED=ENABLED;
    const posBtnS={busy:false,note:'',err:'',sent:'',editing:''};
    const posRegButtonsRefresh=()=>{};
    const posBtnDraft=()=>DRAFT;
    const posBtnCount=(d)=>((d&&d.food)||[]).length+((d&&d.bar)||[]).length;
    const posBtnWrite=async(make)=>{ calls.wrote=make({v:1,draft:DRAFT,live:null}); return true; };
    const posBuildLive=()=>({v:1,at:1});
    const posPublishSend=async()=>{ calls.published++; };
    const miniPoke=()=>{ calls.poked++; };
    const posBtnReceipt=async(at)=>{ calls.receipt++; return 'On the registers.'; };
    ${SEND}
    return async(revert)=>{ await posBtnSend(revert); return posBtnS; };`)(enabled, draft, calls, null);
  return { fn, calls };
};
const FULL = { food: [{ cat: 'A' }], bar: [], off: [] };
const EMPTY = { food: [], bar: [], off: ['A'] };
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

  const rev = mkSend(true, EMPTY);
  await rev.fn(true);
  ok('\u2026but REVERTING with everything off is allowed, and clears `live`',
     !!rev.calls.wrote && rev.calls.wrote.live === null && rev.calls.published === 1);

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

// ── the gate and the auto-publish exclusion, which are one-line things worth pinning
ok('⛔ the send is gated behind POS_BTN_SEND_ENABLED, and it is still OFF',
   /const POS_BTN_SEND_ENABLED=false;/.test(src));
ok('⛔ …and the send checks it before anything else',
   /async function posBtnSend\([^)]*\)\{\s*if\(!POS_BTN_SEND_ENABLED\)\{/.test(src));
ok('⛔ a draft save does NOT trigger the auto-publish hook (ct_pos_buttons is excluded)',
   /k!=='ct_pos_live'\s*&&\s*k!=='ct_pos_buttons'/.test(src));
ok('…and the draft is written with kvSend, not kvPush, so it cannot publish',
   /kvSend\(POS_BTN_STORE,\{v:next,at\}/.test(src) && !/kvPush\(POS_BTN_STORE/.test(src));
// ⚠️ Read the receipt's OWN BODY with the comments stripped. Spelled as a regex over
// the whole file this passed while the code read plain `j.menu` — because the comment
// above it says "menu.buttons.at", and a comment is not a behaviour.
const RECEIPT = cut('async function posBtnReceipt(at){', '\nasync function ', 'posBtnReceipt')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
ok('⚠️ the receipt reads the NESTED `menu.buttons`, not the mini’s combined `menu.at`',
   /j\.menu\.buttons/.test(RECEIPT));
ok('…and only says "on the registers" when the `at` it reads back is the one just sent',
   /Number\(got\.at\)===Number\(at\)/.test(RECEIPT));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
