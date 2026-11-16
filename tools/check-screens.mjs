// Does the screen builder's core tell the truth?
//
//     node tools/check-screens.mjs
//
// screens-core.js is the pure half of the builder: importing the register's capture, moving and
// resizing rectangles, the per-screen draft compare, undo, and modelling the refusals the register
// would make. It is a separate file precisely so this can load that exact text and RUN it, rather
// than reading it and feeling reassured. Two of the rules below exist because the version of them
// in index.html is wrong today:
//
//   • The draft compare. The button page's guard is `remoteAt && localAt && remoteAt > localAt`,
//     which skips itself exactly when it is needed — a remote with no `at`, or our own `at` still
//     0 after a failed load. Those are the two cases where we know least, and it reads them as
//     permission. Here "we never read the remote" is a REFUSAL, and that is asserted directly.
//   • Three states, not two. An absent capture and an empty capture must not arrive at the screen
//     as the same answer; the precedent is a dropdown that told him his fully wired menu was
//     unwired because the file it read had not loaded yet.
//
// Nothing here talks to a store, so it runs anywhere — including on a machine with no sync key.
import { readFileSync } from 'node:fs';

const CORE = readFileSync(new URL('../screens-core.js', import.meta.url), 'utf8');
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;

// Load the real file the way the browser would, then take the global it publishes.
const SCR = new Function(`const globalThis={};${CORE};return globalThis.SCR;`)();
ok('ANCHOR: screens-core.js publishes its API', !!SCR);
if (!SCR) { console.log('\n1 FAILED'); process.exit(1); }

const NAMES = ['scrImport', 'scrClamp', 'scrMove', 'scrResize', 'scrOverlaps', 'scrHit', 'scrFlowBelow',
               'scrSaveVerdict', 'scrDraftKey', 'scrDraftOf', 'scrUndoPush', 'scrUndoPop', 'scrValidate', 'scrNewId'];
ok(`every function the page needs is exported (${NAMES.length})`, NAMES.every((n) => typeof SCR[n] === 'function'));

// ── the core stays pure, or none of the rest of this file means anything ──────
// Stripped of comments FIRST: a grep over source is happily satisfied by a comment
// about the code, and this file's own comments say the words "localStorage" and
// "fetch" out loud.
const CODE = CORE.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
ok('the core never fetches', !/\bfetch\s*\(/.test(CODE));
ok('the core never reads localStorage', !/localStorage/.test(CODE));
ok('the core never touches the DOM', !/\bdocument\b/.test(CODE));
ok('the core never reads the clock on its own (every `at` is passed in)', !/Date\.now\s*\(/.test(CODE));
ok('the core has real content, so the greps above are not vacuous', CODE.length > 6000);

// ═══ 1. IMPORT: the three states are three ════════════════════════════════════
const noCap = SCR.scrImport(undefined);
ok('no capture yet → reason "no-capture"', noCap.reason === 'no-capture');
ok('…and screens is UNDEFINED, not empty — nothing is drawn and nothing is flagged', noCap.screens === undefined);
ok('…and the size is UNDEFINED, so nothing can be laid out against a guess', noCap.size === undefined);
ok('…and it is not ok, so the page cannot save over a draft it never read', noCap.ok === false);

const emptyCap = SCR.scrImport({ install: 'host-stand-1', scopes: {} });
ok('the register answered with nothing → reason "empty-capture"', emptyCap.reason === 'empty-capture');
ok('…and screens is NULL — "there are none" is a fact worth saying', emptyCap.screens === null);
ok('⛔ absent and empty are DIFFERENT (undefined vs null), which is the whole point',
   noCap.screens === undefined && emptyCap.screens === null);
ok('junk → "bad-capture", not a crash', SCR.scrImport(42).reason === 'bad-capture');
ok('junk does not claim to be ok', SCR.scrImport('nope').ok === false);

// A capture shaped exactly as the mini's cleanScope stores it today.
const CAP = {
  install: 'host-stand-1',
  at: 1700000000000,
  window: { w: 1180, h: 820, scale: 2, topPad: 32 },
  scopes: {
    order: {
      measured_at: 1700000000000,
      dropped: 2,
      buttons: [
        { key: 'order|Appetizers', label: 'Appetizers', x: 0, y: 40, w: 120, h: 70, color: '#8a5a2b', cat: 'Appetizers', page: 'food' },
        { key: 'order|VODKA', label: 'VODKA', x: 0, y: 112, w: 120, h: 70, color: '#355', cat: 'VODKA', page: 'bar' },
        { key: 'chrome|check', label: '', x: 700, y: 40, w: 460, h: 600, kind: 'check' },
        { key: 'chrome|keypad', label: '', x: 700, y: 650, w: 460, h: 150, kind: 'keypad' },
        { key: 'order|bad', label: 'zero', x: 10, y: 10, w: 0, h: 40 },
      ],
    },
    floor: {
      measured_at: 1700000000001,
      buttons: [{ key: 'floor|tables', label: '', x: 0, y: 32, w: 1180, h: 788, kind: 'tables' }],
    },
    'grid:Appetizers': {
      measured_at: 1700000000002,
      window: { w: 700, h: 788 },
      buttons: [
        { key: 'm:Appetizers:Calamari', label: 'Calamari', x: 0, y: 32, w: 152, h: 66, c: 0, r: 0 },
        { key: 'm:Appetizers:Bruschetta', label: 'Bruschetta', x: 156, y: 32, w: 152, h: 66, c: 1, r: 0, hidden: true },
      ],
    },
  },
};
const IM = SCR.scrImport(CAP);
ok('a real-shaped capture imports', IM.ok === true);
ok('the size is the one the register REPORTED', IM.size && IM.size.w === 1180 && IM.size.h === 820);
ok('…including the clear band at the top', IM.size.top === 32);
ok('a capture with no window gives size NULL, not a plausible default',
   SCR.scrImport({ scopes: CAP.scopes }).size === null);
ok('…and says so in words', SCR.scrImport({ scopes: CAP.scopes }).warnings.some((w) => /how big|size/i.test(w)));
ok('a window with no topPad falls back to the 32pt band',
   SCR.scrImport({ window: { w: 100, h: 100 }, scopes: CAP.scopes }).size.top === 32);

ok('two screens and one dish page came through', IM.counts.screens === 2 && IM.counts.sheets === 1);
ok('a zero-size button is dropped rather than drawn where it cannot be grabbed',
   IM.screens.order.els.every((e) => e.t !== 'zero'));
ok('the register\'s own dropped count is surfaced, not swallowed', IM.counts.dropped === 2);
ok('…in words he can read', IM.warnings.some((w) => /dropped by the register/.test(w)));

// Returns {} rather than undefined for a missing id. A check that CRASHES mid-file stops
// running its remaining assertions, and a mutant proved red by a crash is proved by the
// crash, not by the assertion that was supposed to catch it — the same shape as a silently
// skipped block passing for green.
const byId = (s, id) => (((IM.screens || {})[s] || {}).els || []).find((e) => e.id === id) || {};
ok('a rail button becomes a button element with its label and colour',
   !!byId('order', 'k:order|Appetizers') && byId('order', 'k:order|Appetizers').t === 'Appetizers'
   && byId('order', 'k:order|Appetizers').c === '#8a5a2b');
ok('…carrying the category action the capture implies',
   byId('order', 'k:order|Appetizers').a.k === 'cat' && byId('order', 'k:order|Appetizers').a.cat === 'Appetizers');
ok('a known panel becomes a block, not a button', byId('order', 'k:chrome|check').kind === 'check');
ok('…and a block carries no label or action', byId('order', 'k:chrome|check').t === undefined);
ok('the register\'s own key is kept on the element, so a draft can be matched back to it',
   byId('order', 'k:order|Appetizers').key === 'order|Appetizers');

// ── ids: read them if they are there, derive them if they are not, never invent ──
ok('with no id in the capture the id is derived from the register\'s KEY',
   byId('order', 'k:order|VODKA').id === 'k:order|VODKA');
ok('…and the page is told the capture predates permanent ids', IM.idSource === 'derived');
// Matched on MEANING, not on the sentence: a reword must not turn this red, or the next
// person to improve the wording learns to delete the assertion instead.
ok('…in words, so he is not left wondering', IM.warnings.some((w) => /permanent|re-captur/i.test(w)));
const WITH_ID = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { s: { buttons: [
  { key: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10, id: 'menu.07' }] } } });
ok('an id in the capture is used verbatim', WITH_ID.screens.s.els[0].id === 'menu.07');
ok('…and reported as captured', WITH_ID.idSource === 'captured');
const WITH_BID = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { s: { buttons: [
  { key: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10, bid: 'order.11' }] } } });
ok('the recorder\'s own spelling (bid) is accepted too, so one reader serves both exports',
   WITH_BID.screens.s.els[0].id === 'order.11');
const MIXED = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { s: { buttons: [
  { key: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10, id: 'menu.07' },
  { key: 'b', label: 'B', x: 20, y: 0, w: 10, h: 10 }] } } });
ok('half a capture with ids is reported as MIXED, not as one or the other', MIXED.idSource === 'mixed');
const DUP = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { s: { buttons: [
  { key: '1', label: '1', x: 0, y: 0, w: 10, h: 10 },
  { key: '1', label: '1', x: 20, y: 0, w: 10, h: 10 }] } } });
ok('⛔ two buttons with the same key get DIFFERENT ids, or a drag moves whichever came first',
   DUP.screens.s.els[0].id !== DUP.screens.s.els[1].id);
ok('…and both still exist', DUP.screens.s.els.length === 2);

// ── the two-faced order screen is not split by guesswork ─────────────────────
ok('a screen captured with both food and liquor buttons is kept WHOLE', !!IM.screens.order && !IM.screens['order.food']);
ok('…and says so, rather than letting him think he is arranging one face',
   IM.warnings.some((w) => /\btwo\b/.test(w) && /liquor/i.test(w)));
const SPLIT = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { 'order.food': { buttons: [
  { key: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10, page: 'food' },
  { key: 'b', label: 'B', x: 20, y: 0, w: 10, h: 10, page: 'bar' }] } } });
ok('a scope the recorder already named as one face does NOT get that warning',
   !SPLIT.warnings.some((w) => /\btwo\b/.test(w) && /liquor/i.test(w)));

// ── dish pages become sheets ──────────────────────────────────────────────────
ok('a grid scope becomes a dish page keyed by the register\'s page name', !!IM.sheets.Appetizers);
ok('…placed by the dish\'s own key', Array.isArray(IM.sheets.Appetizers.place['m:Appetizers:Calamari']));
ok('…with the rectangle in points', IM.sheets.Appetizers.place['m:Appetizers:Calamari'][2] === 152);
ok('a hidden dish is recorded as hidden, not dropped', (IM.sheets.Appetizers.hide || []).indexOf('m:Appetizers:Bruschetta') >= 0);
ok('a dish page is NOT counted as a screen', !IM.screens['grid:Appetizers'] && !IM.screens.Appetizers);

// ── actions are never guessed ─────────────────────────────────────────────────
const ACT = SCR.scrImport({ window: { w: 100, h: 100 }, scopes: { s: { buttons: [
  { key: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10, a: { k: 'item', cat: 'Pasta', key: 'm:Pasta:Rigatoni' } },
  { key: 'b', label: 'B', x: 20, y: 0, w: 10, h: 10, a: { k: 'teleport', to: 'mars' } },
  { key: 'c', label: 'C', x: 40, y: 0, w: 10, h: 10 }] } } });
ok('a known action survives the import', ACT.screens.s.els[0].a.k === 'item' && ACT.screens.s.els[0].a.key === 'm:Pasta:Rigatoni');
ok('⛔ an action the register has never heard of is left ABSENT, not passed through',
   ACT.screens.s.els[1].a === undefined);
ok('a button with nothing to go on has no action at all, rather than a guessed one',
   ACT.screens.s.els[2].a === undefined);

// ═══ 2. GEOMETRY ══════════════════════════════════════════════════════════════
const SZ = { w: 1180, h: 820, top: 32 };
ok('a rectangle inside the glass is left alone', JSON.stringify(SCR.scrClamp([10, 40, 100, 50], SZ)) === JSON.stringify([10, 40, 100, 50]));
ok('⛔ nothing is allowed above the band the app keeps clear', SCR.scrClamp([10, 0, 100, 50], SZ)[1] === 32);
ok('nothing hangs off the right edge', (() => { const r = SCR.scrClamp([1150, 40, 100, 50], SZ); return r[0] + r[2] <= SZ.w; })());
ok('nothing hangs off the bottom', (() => { const r = SCR.scrClamp([10, 800, 100, 50], SZ); return r[1] + r[3] <= SZ.h; })());
ok('a button cannot be shrunk below a thumb', SCR.scrClamp([10, 40, 2, 2], SZ)[2] === SCR.MIN_SIDE);
ok('a button wider than the glass is capped at the glass', SCR.scrClamp([0, 40, 5000, 50], SZ)[2] === SZ.w);
ok('junk in, null out — never a half rectangle', SCR.scrClamp([10, 40, 'x', 50], SZ) === null);

ok('a drag moves the rectangle and keeps its size',
   JSON.stringify(SCR.scrMove([10, 40, 100, 50], 25, 10, SZ)) === JSON.stringify([35, 50, 100, 50]));
ok('a drag off the top stops at the band, it does not slide under it', SCR.scrMove([10, 40, 100, 50], 0, -500, SZ)[1] === 32);
ok('a drag keeps the size when it hits an edge', (() => { const r = SCR.scrMove([10, 40, 100, 50], 5000, 0, SZ); return r[2] === 100 && r[3] === 50; })());
ok('a fractional drag keeps a tenth of a point, which is the unit the register measures in',
   SCR.scrMove([10, 40, 100, 50], 0.25, 0, SZ)[0] === 10.3);

ok('dragging the east edge grows the width and leaves x alone', (() => {
  const r = SCR.scrResize([100, 100, 100, 50], 'e', 20, 0, SZ); return r[0] === 100 && r[2] === 120; })());
ok('dragging the west edge moves x and keeps the right edge still', (() => {
  const r = SCR.scrResize([100, 100, 100, 50], 'w', 20, 0, SZ); return r[0] === 120 && r[0] + r[2] === 200; })());
ok('dragging the south edge grows the height', SCR.scrResize([100, 100, 100, 50], 's', 0, 25, SZ)[3] === 75);
ok('dragging the north edge moves y and keeps the bottom still', (() => {
  const r = SCR.scrResize([100, 100, 100, 50], 'n', 0, 20, SZ); return r[1] === 120 && r[1] + r[3] === 150; })());
ok('a corner drags both edges', (() => { const r = SCR.scrResize([100, 100, 100, 50], 'se', 10, 10, SZ); return r[2] === 110 && r[3] === 60; })());
ok('⛔ shrinking past the minimum stops, and the edge he is NOT dragging stays put', (() => {
  const r = SCR.scrResize([100, 100, 100, 50], 'w', 500, 0, SZ); return r[2] === SCR.MIN_SIDE && r[0] + r[2] === 200; })());

const ELS = [{ id: 'a', r: [0, 40, 100, 50] }, { id: 'b', r: [50, 60, 100, 50] }, { id: 'c', r: [400, 40, 100, 50] },
             { id: 'h', r: [0, 40, 100, 50], hide: true }];
ok('two buttons on top of each other are REPORTED', JSON.stringify(SCR.scrOverlaps(ELS)) === JSON.stringify([['a', 'b']]));
ok('…and a button taken off the screen is not counted as overlapping anything', !SCR.scrOverlaps(ELS).some((p) => p.indexOf('h') >= 0));
ok('overlap is reported, not prevented — he asked for free placement', SCR.scrOverlaps(ELS).length === 1 && ELS.length === 4);
ok('⛔ a tap picks up the button drawn ON TOP, or one moved over another can never be moved again',
   SCR.scrHit(ELS, 60, 70) === 'b');
ok('a tap on nothing returns null', SCR.scrHit(ELS, 1170, 810) === null);
ok('a hidden button cannot be grabbed', SCR.scrHit([{ id: 'h', r: [0, 40, 100, 50], hide: true }], 10, 50) === null);

const FLOW = SCR.scrFlowBelow({ a: [0, 40, 100, 50], b: [0, 300, 100, 66] }, { w: 152, h: 66, gap: 4 }, SZ);
ok('⛔ an unplaced dish flows BELOW the lowest placed one, never on top of it', FLOW.y === 370);
ok('with nothing placed it starts under the clear band', SCR.scrFlowBelow({}, {}, SZ).y === 36);
ok('the flow size defaults to the register\'s own tile', FLOW.w === 152 && FLOW.h === 66);

// ═══ 3. THE DRAFT COMPARE — the one that is wrong in index.html today ═════════
const V = SCR.scrSaveVerdict;
ok('⛔ never read the remote → REFUSE. This is the case the existing guard treats as permission',
   V(1700, undefined).ok === false && V(1700, undefined).why === 'never-loaded');
ok('⛔ …and it still refuses when the remote has NO `at` at all', V(undefined, undefined).ok === false);
ok('⛔ …and when the remote `at` is 0, which is falsy and sails through `remoteAt && localAt &&`',
   V(0, undefined).ok === false);
ok('read it, there was none, nothing there now → first write is allowed', V(null, null).ok === true && V(null, null).why === 'first-write');
ok('read it, there was none, but something is there NOW → refuse: someone else got there first',
   V(1700, null).why === 'stale');
ok('the remote moved on since we read it → refuse', V(1800, 1700).why === 'stale');
ok('…and the message tells him what to do, not just that it failed', /[Rr]eload/.test(V(1800, 1700).msg));
ok('same `at` → allowed', V(1700, 1700).ok === true);
ok('an OLDER remote → allowed; we are ahead of it', V(1600, 1700).ok === true);
ok('the draft we read has VANISHED → refuse rather than recreate it over whatever happened',
   V(null, 1700).why === 'vanished');
ok('a refusal always carries words for the screen', ['never-loaded', 'stale', 'vanished']
   .every((w) => [V(1, undefined), V(1800, 1700), V(null, 1700)].some((r) => r.why === w && r.msg.length > 20)));
// The regression that matters: prove the OLD predicate would have passed where this refuses.
const OLD = (remoteAt, localAt) => !(remoteAt && localAt && remoteAt > localAt);   // true = "allowed"
ok('⛔ PROOF: the old guard allows all three of the dangerous cases, this one refuses all three',
   [[1700, undefined], [0, undefined], [1700, null]].every(([r, l]) => OLD(r, l) === true && V(r, l).ok === false));

ok('a draft key names one screen', SCR.scrDraftKey('order.food') === 'scr_draft:order.food');
ok('⛔ a draft key has NO ct_ prefix, so it is never mirrored to the mini and cannot trip the republish hook',
   !/^ct_/.test(SCR.scrDraftKey('order')) && !/^ct_/.test(SCR.SCR_BASE_KEY) && !/^ct_/.test(SCR.SCR_HIST_KEY));
ok('the only key the registers read IS prefixed, because that one is meant to travel', SCR.SCR_LIVE_KEY === 'ct_scr_live');
ok('each screen has its own draft, so a collision costs one screen and not the layout',
   SCR.scrDraftKey('order') !== SCR.scrDraftKey('floor'));
const D = SCR.scrDraftOf('order', ELS, SZ, 1700);
ok('a draft carries the size it was arranged against', D.size.w === 1180 && D.size.top === 32);
ok('…because a rectangle means nothing without the frame it was placed in', D.size !== null && D.v === 1);
ok('a draft with no size recorded says null rather than inventing one', SCR.scrDraftOf('order', ELS, null, 1).size === null);

// ═══ 4. UNDO ══════════════════════════════════════════════════════════════════
let st = [];
for (let i = 0; i < SCR.UNDO_CAP + 5; i++) st = SCR.scrUndoPush(st, { i });
ok('undo is bounded', st.length === SCR.UNDO_CAP);
ok('⛔ the OLDEST is dropped when it is full, never the newest', st[st.length - 1].i === SCR.UNDO_CAP + 4);
ok('undo returns the newest first', SCR.scrUndoPop(st).snapshot.i === SCR.UNDO_CAP + 4);
ok('…and shortens the stack', SCR.scrUndoPop(st).stack.length === SCR.UNDO_CAP - 1);
ok('undo on an empty stack is nothing, not a crash', SCR.scrUndoPop([]).snapshot === undefined);
ok('push does not mutate the stack it was given', (() => { const a = [{ i: 1 }]; SCR.scrUndoPush(a, { i: 2 }); return a.length === 1; })());

// ═══ 5. WHAT THE REGISTER WOULD REFUSE ═══════════════════════════════════════
const GOOD = { v: 1, layouts: { main: { size: { w: 1180, h: 820, top: 32 },
  screens: { order: { ctx: 'order', rev: 1, els: [{ id: 'a', r: [0, 40, 100, 50], t: 'Appetizers' }] } } } } };
ok('a good layout passes', SCR.scrValidate(GOOD).ok === true);
ok('the wrong version is a problem, and it is named as "every register draws its own"',
   SCR.scrValidate({ ...GOOD, v: 2 }).problems.some((p) => /built-in/.test(p)));
const NOSIZE = JSON.parse(JSON.stringify(GOOD)); delete NOSIZE.layouts.main.size;
ok('⛔ no size → a problem, because no register can use a rectangle with no frame',
   SCR.scrValidate(NOSIZE).problems.some((p) => /size/.test(p)));
const BLANK = JSON.parse(JSON.stringify(GOOD)); BLANK.layouts.main.screens.order.els[0].hide = true;
ok('⛔ a screen with everything hidden is a problem — the register would draw its own and he would be confused',
   SCR.scrValidate(BLANK).problems.some((p) => /nothing visible/.test(p)));
const DUPID = JSON.parse(JSON.stringify(GOOD));
DUPID.layouts.main.screens.order.els.push({ id: 'a', r: [200, 40, 100, 50], t: 'Twin' });
ok('two things with one name are counted and explained', SCR.scrValidate(DUPID).counts.bad === 1
   && SCR.scrValidate(DUPID).notes.some((n) => /same name/.test(n)));
const BADKIND = JSON.parse(JSON.stringify(GOOD));
BADKIND.layouts.main.screens.order.els.push({ id: 'z', kind: 'teleporter', r: [200, 40, 100, 50] });
ok('a panel the register does not know is counted, not drawn, and named', SCR.scrValidate(BADKIND).counts.bad === 1
   && SCR.scrValidate(BADKIND).notes.some((n) => /does not know/.test(n)));
const BADACT = JSON.parse(JSON.stringify(GOOD));
BADACT.layouts.main.screens.order.els.push({ id: 'z', r: [200, 40, 100, 50], t: 'Go', a: { k: 'teleport' } });
// Pinned to the BEHAVIOUR (counted, kept, explained) and only loosely to the words. A check
// pinned to a spelling goes red for a reword, which teaches whoever rewords it to delete the check.
ok('a button set to do something unknown is counted and explained, not silently drawn', (() => {
  const v = SCR.scrValidate(BADACT); return v.counts.bad === 1 && v.notes.some((n) => /nothing/.test(n)); })());
const OFFEDGE = JSON.parse(JSON.stringify(GOOD));
OFFEDGE.layouts.main.screens.order.els.push({ id: 'z', r: [1150, 40, 100, 50], t: 'Edge' });
ok('hanging off the edge is a NOTE, not a refusal — it is his layout to make', (() => {
  const v = SCR.scrValidate(OFFEDGE); return v.ok === true && v.notes.some((n) => /right edge/.test(n)); })());
ok('junk is not "ok"', SCR.scrValidate(null).ok === false);
ok('⛔ validation never LOCKS anything: every refusal is a problem to show, and nothing is removed',
   (() => { const before = JSON.stringify(BADACT); SCR.scrValidate(BADACT); return JSON.stringify(BADACT) === before; })());

// ═══ 6. IDS FOR BUTTONS HE MAKES ══════════════════════════════════════════════
let seed = 0;
const rnd = () => { seed += 0.137; return seed % 1; };
const id1 = SCR.scrNewId(rnd), id2 = SCR.scrNewId(rnd);
ok('a new button\'s id looks like one', /^u_[a-z0-9]{6}$/.test(id1));
ok('…and two are not the same', id1 !== id2);
ok('⛔ an id is never the label — renaming must not re-key anything', !/appetizers/i.test(SCR.scrNewId(rnd)));

// ═══ 7. REAL-FILE PINS, with count guards so they cannot pass vacuously ══════
ok('the closed panel list is the documented one', SCR.BLOCK_KINDS.length >= 12
   && ['check', 'dishwindow', 'keypad', 'tenders', 'pager', 'signin', 'letters', 'pizza', 'tables', 'cards', 'keyboard', 'body']
      .every((k) => SCR.BLOCK_KINDS.indexOf(k) >= 0));
ok('the closed action list is the documented one', SCR.ACTION_KINDS.length >= 9
   && ['cat', 'item', 'open', 'group', 'mods', 'disc', 'tender', 'fn', 'nav'].every((k) => SCR.ACTION_KINDS.indexOf(k) >= 0));
ok('this check actually exercised the import (count guard, so an empty fixture cannot pass it)',
   IM.counts.els >= 5 && IM.counts.screens >= 2 && IM.counts.sheets >= 1);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
