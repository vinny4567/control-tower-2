// Does the drift card tell the truth in BOTH directions?
//
//     node tools/check-drift.mjs
//
// The card compares the cloud store against the mini the registers read. It used to compute
// `cloudAt - miniAt` and report only a POSITIVE gap, so the case where the MINI IS AHEAD gave a
// negative number, pushed no row, and rendered as "ok". Silence.
//
// That silence is the dangerous direction, because it is the fingerprint of a write this device
// LOST. The mini's KV is newest-wins — kvSet is a no-op for an older `at` and STILL answers 200
// (angelis-pos-server/server/index.js ~3195) — while the cloud overwrites unconditionally with no
// compare at all (angelis-backend/server.js ~434). Two stores, two rules, so they can disagree
// permanently, and "the registers hold something the store does not" was invisible.
//
// Everything here is RUN. A regex over the source cannot tell a sign error from a comment about
// one, and this bug WAS a sign error.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;
const cut = (a, b, what) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j <= i) { ok(`ANCHOR: ${what} still found in index.html`, false); return ''; }
  return src.slice(i, j);
};

// grace + posDriftAgo + the classifier, in one slice
const KIND = cut('const POS_DRIFT_GRACE_MS=', 'async function posDriftCheck(', 'the drift grace + classifier');
const CARD = (() => {
  const i = src.indexOf('function posDriftCardHTML(){');
  const j = src.indexOf('\n}', i);
  if (i < 0 || j < 0) { ok('ANCHOR: posDriftCardHTML still in index.html', false); return ''; }
  return src.slice(i, j + 2);
})();

const G = 10000;
if (KIND) {
  const K = new Function(`${KIND} return {posDriftKind,POS_DRIFT_GRACE_MS,posDriftAgo};`)();
  const kind = K.posDriftKind;

  ok('the grace window is still the 10s the comment describes', K.POS_DRIFT_GRACE_MS === G);

  // the direction that always worked
  ok('cloud newer than the mini by more than the grace = "behind"',
     kind(1000000 + G + 1, 1000000, G) === 'behind');
  // ⛔ THE BUG. This returned null before: cloudAt-miniAt was negative, so nothing was reported.
  ok('⛔ MINI newer than the cloud by more than the grace = "ahead", NOT silence',
     kind(1000000, 1000000 + G + 1, G) === 'ahead');
  ok('…and the two directions are told APART, never collapsed into one kind',
     kind(1000000 + G + 1, 1000000, G) !== kind(1000000, 1000000 + G + 1, G));

  // the grace window: a write is debounced 1400ms and mirrored fire-and-forget, so a small gap
  // is "in flight", not drift — in BOTH directions, or every save shows a false alarm.
  ok('a gap inside the grace window is silent either way',
     kind(1000000 + G, 1000000, G) === null && kind(1000000, 1000000 + G, G) === null);
  ok('exactly the grace is still silent; one ms past it reports',
     kind(1000000 + G, 1000000, G) === null && kind(1000000 + G + 1, 1000000, G) === 'behind');
  ok('identical timestamps are silent', kind(1000000, 1000000, G) === null);

  // the mini not having a key at all
  ok('the mini never received a key the cloud has = "missing"', kind(1234567, null, G) === 'missing');
  ok('…and undefined is treated the same as null, since mini[k] can be either',
     kind(1234567, undefined, G) === 'missing');
  ok('neither store has it = silent, not "missing" — there is nothing to prove',
     kind(0, null, G) === null);

  // ⛔ the extreme ahead case the loop used to `continue` past before it ever looked at the mini
  ok('⛔ the cloud has NO copy and the mini has one = "ahead" — the strongest version of the'
     + ' dangerous direction, and the old loop skipped it on `if(!cloudAt)continue`',
     kind(0, 1234567, G) === 'ahead');
  ok('both zero is silent', kind(0, 0, G) === null);

  // garbage must not invent drift
  ok('rubbish timestamps do not invent a kind',
     kind('x', 'y', G) === null && kind(null, null, G) === null);
  ok('the grace defaults to the constant when not passed',
     kind(1000000 + G + 1, 1000000) === 'behind' && kind(1000000 + G, 1000000) === null);
}

if (CARD) {
  const mk = (rows, state) => {
    const ctx = { state: state || 'mismatch', rows, at: Date.now(), err: '', checking: false };
    const f = new Function('posDrift', 'esc', 'posDriftAgo', `${CARD} return posDriftCardHTML();`);
    return f(ctx, (x) => String(x), () => 'a while');
  };

  const behindCard = mk([{ k: 'ct_pos_prices', label: 'Prices', kind: 'behind', by: 60000 }]);
  const aheadCard = mk([{ k: 'ct_pos_prices', label: 'Prices', kind: 'ahead', by: 60000 }]);
  const missingCard = mk([{ k: 'ct_pos_prices', label: 'Prices', kind: 'missing' }]);

  ok('a behind row still reads as the registers being behind',
     /behind/.test(behindCard) && /Prices/.test(behindCard));
  // Pinned to the MEANING, not the wording: newer OR ahead will do, so rewording the copy does
  // not go red, while losing the direction word altogether does. A check pinned to a SPELLING
  // goes red for a harmless rename, and then someone trims the clause to make it green.
  ok('\u26d4 an ahead card says the registers hold something NEWER than the store',
     /newer|ahead/i.test(aheadCard) && aheadCard !== behindCard);
  ok('…and does NOT describe it as the registers being behind, which is the opposite of true',
     !/are behind on/.test(aheadCard));
  // ⛔ THE ADVICE IS THE PART THAT COULD DO HARM. "Change it again and it will push" is right for
  // behind and WRONG for ahead: the mini refuses an older `at` and answers 200, so re-saving can
  // be refused every time while reporting success.
  ok('⛔ the ahead footer does NOT tell him to just change it again',
     !/Changing one of these again will push it/.test(aheadCard));
  ok('…it tells him to reload first, so he edits what the registers actually hold',
     /[Rr]eload/.test(aheadCard));
  ok('the behind footer DOES still say changing it again will push it',
     /Changing one of these again will push it/.test(behindCard));
  ok('a missing row keeps its own wording', /never received/.test(missingCard));
  ok('a mixed card does not claim everything is one direction',
     (() => { const c = mk([{ label: 'A', kind: 'ahead', by: 1 }, { label: 'B', kind: 'behind', by: 1 }]);
       return /do not match/.test(c) && !/are behind on/.test(c); })());
  // the silent states must stay silent: he asked for the green badge to go
  ok('ok / idle / off render an empty shell, and the element still exists for the refresher',
     ['ok', 'idle', 'off'].every(st => mk([], st) === '<div id="pos-drift-card"></div>'));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
