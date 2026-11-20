// Does a refused write get caught, and does it get caught FAST?
//
//     node tools/check-mini-echo.mjs
//
// The mini's KV is newest-wins: kvSet is a no-op for an older `at` and STILL answers 200 with
// the WINNING row's `at` (angelis-pos-server/server/index.js ~3221). That reply was always on
// the wire and nothing read it — both kvSend's fetches were `.catch(()=>{})`, response
// discarded. So a save that lost looked identical, from here, to one that won.
//
// kvSendMini now reads the body and resolves to exactly one of three outcomes. Everything here
// is RUN against the real functions lifted out of index.html, not inferred from reading them —
// the whole point of this file is that "fetch resolved" and "my value is what's stored" are two
// different facts, and a check that only looks at call counts would miss the gap it exists to
// catch, same as the bug did.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const lift = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing function ' + name);
  // balance braces so a nested function/object inside doesn't truncate the slice early
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};

const POS_SYNC_KEYS = [
  ['ct_pos_live', 'Menu, prices, routing'],
  ['ct_privs', 'Privileges'],
  ['ct_staff', 'Staff'],
  ['ct_job_rates', 'Job rates'],
  ['ct_calcs', 'Calculations'],
];

// A tiny world: the real kvSendMini + posWatchMiniEcho, a stub fetch, a stub localStorage/KV
// token, and a recorder for whether the fast recheck fired.
//
// ⚠️ TWO THINGS ABOUT THE SANDBOX THAT AREN'T OPTIONAL:
// (1) kvSendMini also calls `new AbortController()` + its OWN unrelated `setTimeout(…,5000)` —
//     Node has a global AbortController, so without shadowing it here, that 5s abort-timer gets
//     pushed into the SAME mock timer queue as posWriteLostSoon's 400ms recheck timer, and the
//     wrong one gets fired. Shadowing the name as a function parameter bound to `undefined` turns
//     off that branch inside the lifted code, the same way the page's own globals would be absent
//     in a worker that doesn't have it.
// (2) The real runtime's `.then()` chain inside kvSendMini is several hops deep (fetch → .then →
//     an async callback that itself awaits `.json()` → `.catch`), so posWatchMiniEcho's own
//     `.then()` on top of that does not settle within a single `await` on its return value — the
//     real `setTimeout` is used as a macrotask flush to let every pending microtask drain before a
//     test reads `calls.timers`, instead of guessing how many `await`s would be enough.
const realSetTimeout = setTimeout;
const flush = () => new Promise((r) => realSetTimeout(r, 0));
function world({ fetchImpl, kvMiniOff = false, token = 'tok123' } = {}) {
  const calls = { driftChecks: 0, timers: [] };
  const env = new Function(
    'fetch', 'localStorage', 'KV_TOKEN', 'KV_MINI', 'POS_SYNC_KEYS', 'setTimeout', 'clearTimeout', 'posDriftCheck', 'AbortController',
    `let posWriteLostTimer=null;
     ${lift('kvSendMini')}
     ${lift('posWatchMiniEcho')}
     ${lift('posWriteLostSoon')}
     return { kvSendMini, posWatchMiniEcho, posWriteLostSoon };`
  )(
    fetchImpl,
    { getItem: (k) => (kvMiniOff && k === 'ct_kv_mini' ? 'off' : null) },
    () => token,
    'https://mini.example/api/kv/',
    POS_SYNC_KEYS,
    (fn, ms) => { const id = calls.timers.length; calls.timers.push({ fn, ms, fired: false, cancelled: false }); return id; },
    (id) => { if (calls.timers[id]) calls.timers[id].cancelled = true; },   // a real clearTimeout, not a no-op — debounce only means something if cancelling actually cancels
    () => { calls.driftChecks++; },
    undefined
  );
  env.fire = () => { calls.timers.forEach(t => { if (!t.fired && !t.cancelled) { t.fired = true; t.fn(); } }); };
  env.flush = flush;
  return { env, calls };
}

const resOk = (at) => ({ ok: true, json: async () => ({ ok: true, at }) });
const resBad = (status) => ({ ok: false, status });

// ── THE THREE OUTCOMES ──────────────────────────────────────────────────────
let w = world({ fetchImpl: async () => resOk(500) });
let r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('echo matches what we sent → won', r.outcome === 'won' && r.winAt === 500);

w = world({ fetchImpl: async () => resOk(700) });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('⛔ echo differs → lost, and says the real winning value', r.outcome === 'lost' && r.winAt === 700);

w = world({ fetchImpl: async () => resBad(500) });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('a bad status is UNKNOWN, never reported as lost or won', r.outcome === 'unknown');

w = world({ fetchImpl: async () => { throw new Error('network down'); } });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('a network failure is UNKNOWN too', r.outcome === 'unknown');

w = world({ fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('unparseable body is UNKNOWN, not assumed lost', r.outcome === 'unknown');

w = world({ fetchImpl: async () => resOk('not-a-number') });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('a non-numeric echoed at is UNKNOWN, not silently cast to NaN!==at', r.outcome === 'unknown');

// ── GUARD CONDITIONS NEVER CLAIM A WIN ──────────────────────────────────────
w = world({ fetchImpl: async () => { throw new Error('must not be called'); }, kvMiniOff: true });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('the mirror turned off is UNKNOWN, and never even calls fetch', r.outcome === 'unknown');

w = world({ fetchImpl: async () => { throw new Error('must not be called'); }, token: '' });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false);
ok('no sync key on this device is UNKNOWN, and never even calls fetch', r.outcome === 'unknown');

w = world({ fetchImpl: async () => { throw new Error('must not be called'); } });
r = await w.env.kvSendMini('notct_x', { v: {}, at: 500 }, false);
ok('⛔ a key not prefixed ct_ never even calls fetch', r.outcome === 'unknown');

// ── KEEPALIVE: FIRE AND FORGET, NEVER WAITS ON A BODY ──────────────────────
let readAttempted = false;
w = world({ fetchImpl: async () => { readAttempted = true; return resOk(999); } });
r = await w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, true);
ok('a keepalive (pagehide) send still fires the request', readAttempted);
ok('⛔ …but never reports won/lost — there is nobody left to tell', r.outcome === 'unknown');

// ── posWatchMiniEcho: ONLY the POS_SYNC_KEYS, nothing else ──────────────────
w = world({ fetchImpl: async () => resOk(700) }); // echoes back DIFFERENT → would be 'lost'
await w.env.posWatchMiniEcho('ct_privs', w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false));
await w.env.flush();
ok('⛔ a lost write on a POS_SYNC_KEYS member triggers the fast recheck', w.calls.timers.length === 1);
w.env.fire();
ok('…and the timer actually calls posDriftCheck(true)', w.calls.driftChecks === 1);

w = world({ fetchImpl: async () => resOk(700) });
await w.env.posWatchMiniEcho('ct_tips_moves', w.env.kvSendMini('ct_tips_moves', { v: {}, at: 500 }, false));
await w.env.flush();
ok('⛔ the SAME loss on a non-POS key triggers NOTHING — scope stays to the back office', w.calls.timers.length === 0);

w = world({ fetchImpl: async () => resOk(500) }); // echoes back the SAME at → 'won'
await w.env.posWatchMiniEcho('ct_privs', w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false));
await w.env.flush();
ok('a WON write never triggers a recheck — nothing to tell him', w.calls.timers.length === 0);

w = world({ fetchImpl: async () => resBad(500) }); // 'unknown'
await w.env.posWatchMiniEcho('ct_privs', w.env.kvSendMini('ct_privs', { v: {}, at: 500 }, false));
await w.env.flush();
ok('⛔ UNKNOWN never triggers a recheck either — only a confirmed loss does', w.calls.timers.length === 0);

// ── posWriteLostSoon debounces a burst into one recheck ─────────────────────
w = world({});
w.env.posWriteLostSoon(); w.env.posWriteLostSoon(); w.env.posWriteLostSoon();
w.env.fire();
ok('three losses in a row (a burst of price edits) debounce to ONE recheck', w.calls.driftChecks === 1);

// ── every POS_SYNC_KEYS member is covered, by name — a key added there must not be forgotten here ──
for (const [k] of POS_SYNC_KEYS) {
  const ww = world({ fetchImpl: async () => resOk(999) });
  await ww.env.posWatchMiniEcho(k, ww.env.kvSendMini(k, { v: {}, at: 500 }, false));
  await ww.env.flush();
  ok(`POS_SYNC_KEYS member "${k}" is watched`, ww.calls.timers.length === 1);
}

// ── THE WIRING: both callers actually pass THROUGH posWatchMiniEcho ────────
// (behavioural proof the plumbing is connected, not just that the pieces work alone)
const kvSendSrc = (() => { const i = src.indexOf('function kvSend(k,p,keepalive){'); return src.slice(i, src.indexOf('\n}', i) + 2); })();
ok('⛔ kvSend watches the echo of every write it sends to the mini', /posWatchMiniEcho\(k,kvSendMini\(/.test(kvSendSrc));
const publishSendSrc = (() => { const i = src.indexOf('async function posPublishSend('); return src.slice(i, src.indexOf('\n}', i) + 2); })();
ok('⛔ posPublishSend (ct_pos_live\'s OWN path, which bypasses kvSend) is wired too',
   /posWatchMiniEcho\(POS_LIVE_KEY,kvSendMini\(/.test(publishSendSrc));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
