// Slice 1 of wt-merge-saves: does a save actually REFUSE instead of silently losing?
//
//     node tools/check-discount-refusal.mjs
//
// posCompareAndSetWrite re-reads the store immediately before writing and refuses if it
// moved since the caller's baseline. Lifted and RUN against a stub store that can move
// out from under the save mid-flight — a regex cannot prove a race was closed, only
// running the real function against a fake remote that changes between the read and the
// write can.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const lift = (name) => {
  const i = src.indexOf('async function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
const liftPlain = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
};

// A tiny world: the real posCompareAndSetWrite + posAddDiscount + posRemoveNewDiscount +
// posDiscSlug, a fake KV store that can be mutated BETWEEN the function's read and its
// write (the race this exists to close), stub DOM inputs, and a recorder for every alert
// shown. `initialDiscounts` seeds BOTH this device's local posNewDiscounts AND the remote
// store (device and store start in agreement, same as right after a real page load).
function world({ remoteStore = {}, remoteAt = 0, loadedAt = 0, kvFails = false, formValues = {},
                  mutateDuringRead = null, initialDiscounts = [], initialDiscRates = {} } = {}) {
  const calls = { alerts: [], sent: [], liveSoonCalls: 0, confirms: 0 };
  const posNewDiscAt = { at: loadedAt };
  if (!('ct_pos_new_discounts' in remoteStore)) remoteStore.ct_pos_new_discounts = initialDiscounts;
  if (!('ct_pos_disc_rates' in remoteStore)) remoteStore.ct_pos_disc_rates = initialDiscRates;
  let posNewDiscounts = initialDiscounts;
  let posDiscRates = initialDiscRates;
  const posS = { cat: { discounts: [] } };
  const els = {
    'nd-name': { value: formValues['nd-name'] || '' },
    'nd-kind': { value: formValues['nd-kind'] || 'amount' },
    'nd-rate': { value: formValues['nd-rate'] || '' },
    'nd-mgr': { checked: !!formValues['nd-mgr'] },
    'nd-unit': { value: formValues['nd-unit'] || 'amount' },
  };
  const document = { getElementById: (id) => els[id] || null };
  const alert = (msg) => calls.alerts.push(msg);
  const confirm = () => { calls.confirms++; return true; };
  const KV_FAIL = Symbol('KV_FAIL');
  const kvFailed = (r) => r === KV_FAIL;
  let reads = 0;
  const kvGet = async (key) => {
    reads++;
    if (kvFails) return KV_FAIL;
    // The race: a mutator fires the FIRST time THIS key is read, simulating another
    // device's write landing in the gap between this device's check and its own write.
    if (mutateDuringRead && key === 'ct_pos_new_discounts' && reads === 1) mutateDuringRead();
    return { v: remoteStore[key], at: remoteAt };
  };
  const kvSend = (key, p) => { calls.sent.push({ key, v: p.v, at: p.at }); remoteStore[key] = p.v; remoteAt = p.at; };
  // posRemoveNewDiscount and posClearChanges still use the OLD, unguarded kvPush — that is
  // exactly the thing being tested here: does the baseline still move even though the
  // write itself is fire-and-forget, not compare-and-set.
  const kvPush = (key, v, at) => { calls.sent.push({ key, v, at }); remoteStore[key] = v; if (key === 'ct_pos_new_discounts') remoteAt = at; };
  const kvSendMini = () => Promise.resolve({ outcome: 'unknown' });
  const posWatchMiniEcho = () => {};
  const posLiveSoon = () => { calls.liveSoonCalls++; };

  const env = new Function(
    'document', 'alert', 'confirm', 'kvGet', 'kvFailed', 'kvSend', 'kvPush', 'kvSendMini', 'posWatchMiniEcho', 'posLiveSoon',
    'posS', 'posNewDiscAt', 'posRedraw',
    `let posNewDiscounts = ${JSON.stringify(posNewDiscounts)};
     let posDiscRates = ${JSON.stringify(posDiscRates)};
     ${liftPlain('posDiscSlug')}
     ${lift('posCompareAndSetWrite')}
     ${lift('posAddDiscount')}
     ${liftPlain('posRemoveNewDiscount')}
     return { posAddDiscount, posRemoveNewDiscount, get posNewDiscounts(){ return posNewDiscounts }, posCompareAndSetWrite };`
  )(document, alert, confirm, kvGet, kvFailed, kvSend, kvPush, kvSendMini, posWatchMiniEcho, posLiveSoon, posS, posNewDiscAt, () => { calls.redraws = (calls.redraws||0)+1; });
  return { env, calls, posNewDiscAt, remoteStoreRef: () => remoteStore };
}

// ── THE HAPPY PATH ───────────────────────────────────────────────────────────────────────
let w2;
let w = world({ remoteStore: { ct_pos_new_discounts: [] }, remoteAt: 1000, loadedAt: 1000,
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount', 'nd-rate': '5' } });
await w.env.posAddDiscount();
ok('a clean add writes the discount', w.calls.sent.length === 1);
ok('…with the right id/name/rate', w.calls.sent[0].v.some(d => d.id === 'new:grazie' && d.rate === 500));
ok('…and no alert — nothing went wrong', w.calls.alerts.length === 0);
ok('local posNewDiscounts matches exactly what was written', JSON.stringify(w.env.posNewDiscounts) === JSON.stringify(w.calls.sent[0].v));
ok('posLiveSoon is called — this bypasses kvPush, so it must publish itself', w.calls.liveSoonCalls === 1);
ok('the baseline at advances after a successful write', w.posNewDiscAt.at === w.calls.sent[0].at);

// ── ⛔ THE RACE THIS EXISTS TO CLOSE ─────────────────────────────────────────────────────
// Another device adds a DIFFERENT discount in the gap between this device's read and its
// own write. The old code (plain kvPush of the stale in-memory list) would have silently
// overwritten that addition. This must refuse.
w = world({ remoteStore: { ct_pos_new_discounts: [{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }] },
  remoteAt: 2000, loadedAt: 1000,   // baseline OLDER than what's actually in the store
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount', 'nd-rate': '5' } });
await w.env.posAddDiscount();
ok('⛔ a stale baseline refuses the write — nothing sent', w.calls.sent.length === 0);
ok('…and says so', w.calls.alerts.some(a => /another device/i.test(a)));
ok('…the other device’s discount is untouched (never overwritten)',
   JSON.stringify(w.remoteStoreRef().ct_pos_new_discounts) === JSON.stringify([{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }]));

// ── a TRUE same-name collision, caught by the FRESH remote, not the stale local list ────
// This device's own posNewDiscounts is empty (thinks nobody has "Grazie" yet), but the
// remote list — read fresh, inside the writer — already has it. The in-memory pre-check
// in posAddDiscount cannot catch this; only the fresh re-check inside make() can.
w = world({ remoteStore: { ct_pos_new_discounts: [{ id: 'new:grazie', name: 'Grazie', kind: 'amount', rate: 300 }] },
  remoteAt: 1000, loadedAt: 1000,   // baseline MATCHES, so the at-check alone would pass
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount', 'nd-rate': '5' } });
await w.env.posAddDiscount();
ok('⛔ a same-name collision invisible to the stale local list is still caught', w.calls.sent.length === 0);
ok('…by the FRESH remote check inside make(), with its own message', w.calls.alerts.some(a => /already added/i.test(a)));

// ── ⛔ THE FRESH LIST CARRIES SOMEONE ELSE'S ADDITION WE DON'T KNOW ABOUT YET ────────────
// Our own baseline (loaded at 1000) still matches the store's current at (1000) — no
// conflict, so this write proceeds. But the REMOTE list already has a "House" discount
// this device's local posNewDiscounts has never seen (added after THIS device loaded, but
// without the store's `at` advancing past our baseline in a way we'd notice — e.g. a
// concurrent reload). A caller that syncs from "stale list + our entry" would DROP House
// from its own screen even though the write itself correctly included it.
w = world({ remoteStore: { ct_pos_new_discounts: [{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }] },
  remoteAt: 1000, loadedAt: 1000,
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount', 'nd-rate': '5' } });
await w.env.posAddDiscount();
ok('the write includes BOTH the pre-existing remote entry and the new one', w.calls.sent.length === 1 &&
   w.calls.sent[0].v.length === 2);
ok('⛔ local posNewDiscounts picks up the entry this device never knew about — not just its own add',
   w.env.posNewDiscounts.some(d => d.id === 'new:house') && w.env.posNewDiscounts.some(d => d.id === 'new:grazie'));

// ── no baseline yet ever refuses (fail open, matching posBtnWrite's own precedent) ──────
w = world({ remoteStore: { ct_pos_new_discounts: [] }, remoteAt: 500, loadedAt: 0,
  formValues: { 'nd-name': 'Grazie' } });
await w.env.posAddDiscount();
ok('an unset baseline (0) never refuses — nothing to compare against yet', w.calls.sent.length === 1);

// ── the store is unreachable ─────────────────────────────────────────────────────────────
w = world({ kvFails: true, loadedAt: 1000, formValues: { 'nd-name': 'Grazie' } });
await w.env.posAddDiscount();
ok('⛔ an unreachable store refuses rather than writing blind', w.calls.sent.length === 0);
ok('…and says nothing was saved', w.calls.alerts.some(a => /could not reach the store/i.test(a)));

// ── THE RACE, caught mid-flight (not just via a stale pre-loaded baseline) ──────────────
// Simulates another device's write landing in the literal gap between this call's OWN
// kvGet and its OWN kvSend — the TOCTOU window a debounced kvPush would have reopened.
w = world({ remoteStore: { ct_pos_new_discounts: [] }, remoteAt: 1000, loadedAt: 1000,
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount' },
  mutateDuringRead: null });
// (mid-flight mutation of remoteAt itself is exercised by the stale-baseline case above;
// this one instead proves the write is SYNCHRONOUS right after the read — no debounce gap
// for a second actor to land in — by checking exactly one kvGet happened before the send.)
let reads = 0;
const origGet = w.env.posCompareAndSetWrite;
await w.env.posAddDiscount();
ok('exactly one read before the write (no debounce window between check and send)',
   w.calls.sent.length === 1);

// ── ⛔ THIS DEVICE'S OWN OTHER WRITES MUST MOVE THE BASELINE TOO (found in review, Jarvis) ──
// posCompareAndSetWrite compares against posNewDiscAt.at. If posRemoveNewDiscount (still a
// plain kvPush, not compare-and-set — that's slice 2) left the baseline at the page-load
// value, a remove-then-add on the SAME device would refuse the add against this device's
// OWN prior write, reading "someone else changed this" for a change nobody else made. Not
// data loss, but exactly the kind of false alarm that trains staff to click through a real
// one without reading it.
w = world({ initialDiscounts: [{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }],
  loadedAt: 1000, remoteAt: 1000 });
await w.env.posRemoveNewDiscount('new:house');
ok('the remove itself goes through', w.env.posNewDiscounts.length === 0);
ok('⛔ …and moves this device’s OWN baseline, not just the remote store',
   w.posNewDiscAt.at === w.calls.sent.find(c => c.key === 'ct_pos_new_discounts').at);

// Same device, same session: remove, then immediately add. Must NOT refuse against its
// own prior write.
w2 = world({ initialDiscounts: [{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }],
  loadedAt: 1000, remoteAt: 1000, formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount' } });
await w2.env.posRemoveNewDiscount('new:house');
await w2.env.posAddDiscount();
ok('⛔ remove THEN add, same device, same session → the add does NOT refuse',
   w2.calls.alerts.filter(a => /another device/i.test(a)).length === 0);
ok('…and the add actually landed', w2.env.posNewDiscounts.some(d => d.id === 'new:grazie'));

// A REAL other-device write landing AFTER this device's own remove must still refuse —
// proving the fix moved the baseline, not disabled the check. Two devices share one fake
// store/clock: `afterRemoveAt` is what device A's remove actually set the store to; device
// B's own add happens strictly after that, on the SAME key, the way two browsers really
// would, and device A is still sitting on ITS pre-device-B baseline when it tries to add.
const deviceA = world({ initialDiscounts: [{ id: 'new:house', name: 'House', kind: 'amount', rate: 200 }],
  loadedAt: 1000, remoteAt: 1000 });
await deviceA.env.posRemoveNewDiscount('new:house');
const afterRemoveAt = deviceA.posNewDiscAt.at;
const sharedStore = deviceA.remoteStoreRef();
const deviceB = world({ remoteStore: sharedStore, remoteAt: afterRemoveAt, loadedAt: afterRemoveAt,
  formValues: { 'nd-name': 'Veal Promo', 'nd-kind': 'amount' } });
await deviceB.env.posAddDiscount();
ok('device B’s own add lands', deviceB.calls.sent.length === 1);
w2 = world({ remoteStore: sharedStore, remoteAt: deviceB.posNewDiscAt.at, loadedAt: afterRemoveAt,
  formValues: { 'nd-name': 'Grazie', 'nd-kind': 'amount' } });
await w2.env.posAddDiscount();
ok('⛔ …but device A, now stale behind device B’s real write, still refuses — the fix did not make this toothless',
   w2.calls.alerts.some(a => /another device/i.test(a)) && w2.calls.sent.length === 0);

// ── posClearChanges must move the baseline too, and with the SAME `at` it actually sent ──
const ccBody = (() => { const i = src.indexOf('function posClearChanges('); return src.slice(i, src.indexOf('\n}', i) + 2); })();
ok('⛔ posClearChanges moves posNewDiscAt.at to the SAME `at` its own loop used (one shared value, not a second Date.now())',
   /const at=Date\.now\(\);[\s\S]*for\(const k of \[[\s\S]*?\]\)[\s\S]*?,at\);[\s\S]*posNewDiscAt\.at=at;/.test(ccBody));

// ── validation still rejects a bad name BEFORE any network call ─────────────────────────
w = world({ formValues: { 'nd-name': '' } });
await w.env.posAddDiscount();
ok('an empty name is refused before ever touching the store', w.calls.sent.length === 0 && w.calls.alerts.length === 1);

// ── ONE WRITER ───────────────────────────────────────────────────────────────────────────
const noComments = src.replace(/\/\/[^\n]*/g, '');
ok('⛔ exactly one compare-and-set helper exists', (noComments.match(/function posCompareAndSetWrite\(/g) || []).length === 1);
const removeFn = (() => { const i = src.indexOf('function posRemoveNewDiscount('); return src.slice(i, src.indexOf('\n}', i) + 2); })();
ok('⛔ posRemoveNewDiscount is STILL a plain kvPush, not posCompareAndSetWrite — the multi-key gate for it is slice 2',
   removeFn.includes("kvPush('ct_pos_new_discounts',posNewDiscounts,at);") &&
   removeFn.includes("kvPush('ct_pos_disc_rates',posDiscRates,Date.now());") &&
   !removeFn.includes('posCompareAndSetWrite('));
ok('⛔ …but it DOES move posNewDiscAt.at to the exact `at` it just sent, not a second Date.now()',
   /const at=Date\.now\(\);\s*\n\s*kvPush\('ct_pos_new_discounts',posNewDiscounts,at\);[\s\S]*?posNewDiscAt\.at=at;/.test(removeFn));
const discRateFn = (() => { const i = src.indexOf('function posSetDiscRate('); return src.slice(i, src.indexOf('\n}', i) + 2); })();
ok('⛔ posSetDiscRate is UNTOUCHED tonight too (per-keystroke typing is not a discrete action)',
   discRateFn.includes("kvPush('ct_pos_disc_rates',posDiscRates,Date.now());") &&
   !discRateFn.includes('posCompareAndSetWrite'));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
