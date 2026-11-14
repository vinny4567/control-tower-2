// ENROLLING AN iPAD.
//
//     node tools/check-stations.mjs
//
// ⚠️ THE MANAGER APPROVES A CODE READ OFF THE DEVICE IN THEIR HAND — NEVER A ROW.
// The name and hint on a claim are supplied by whatever made it, so anything on the wifi
// can file a claim calling itself "Bar" and sit in the waiting list looking legitimate.
// Tapping the convincing row is how it gets approved. Typing the code off the physical
// iPad cannot approve a different device, because the code IS the binding.
//
// ─────────────────────────────────────────────────────────────────────────────
// 11/14/26 — THREE ASSERTIONS HERE WENT RED WITHOUT A SINGLE THING BREAKING, and
// the way they went red is the lesson:
//   · "the waiting list has no approve control" sliced the page from the first
//     literal word "waiting" — and someone wrote a new sentence containing that
//     word, higher up the page ("counts silence rather than waiting for bad
//     news"). The region slid upward and swallowed the Approve BUTTON, so the
//     check began flagging the very control it wants to exist.
//   · "sends only the code" matched JSON.stringify({code}) — and the body
//     correctly gained a manager-typed name.
//   · "how many checked in" matched the tile LABEL, which was renamed when the
//     screen started counting silence instead of first contact.
// Each is a check pinned to a spelling rather than to the thing it protects.
// A regex that goes red for a rename teaches the next reader to trim clauses
// until it passes, which is how an invariant gets deleted by someone being
// helpful. So the rules this file now follows:
//   1. ANCHOR ON CODE, NEVER ON PROSE. Prose gets rewritten.
//   2. EVERY SLICE IS GUARDED. A missing anchor must fail LOUDLY — never
//      silently collapse to '' (which makes a ban trivially true) or expand to
//      the whole file (which lets a comment satisfy it).
//   3. PROVE THE CHECK SCREAMS. `node tools/mutate-checks.mjs` breaks the page
//      twenty-four ways and demands the right colour from each — red for every
//      edit that destroys an invariant, green for every rename and reformat
//      that does not. Run it after touching any assertion here.
//   4. WHERE BEHAVIOUR CAN BE RUN, RUN IT. No regex can say "a register dead
//      since August is not counted as healthy" — but posStationAge is a pure
//      function of (station, now), so the check below lifts it out and asks it.
//      That survives renames, reformatting and added branches, which is exactly
//      what the old assertions did not.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

// A slice that cannot lie. If either end is missing the check says so and the region
// is empty — and every assertion below is written so an empty region FAILS.
const cut = (a, b, what) => {
  const i = src.indexOf(a), j = b ? src.indexOf(b, i + 1) : src.length;
  if (i < 0 || (b && j <= i)) { ok(`the ${what} was found in the page at all`, false); return ''; }
  return src.slice(i, j);
};
const html = cut('function posStationsHTML(', 'const POS_SECTIONS=', 'Registers screen');
// ⚠️ ENDS AT THE THRESHOLDS, not at posStationsHTML — the old end swept in
// STATION_QUIET_MS, posStationAge and posStationNow, so unrelated edits in that gap
// landed inside assertions about "the approve function".
const fn = cut('async function posApproveStation(', 'const STATION_QUIET_MS=', 'approve function');
const approve = fn.replace(/\/\/[^\n]*/g, '');   // comments cannot satisfy or break a claim about code

// ---- ⚠️ THE ONE THAT MATTERS ------------------------------------------------------
ok('⚠️ approval takes a typed CODE', /id="station-code"/.test(html));

// The waiting list read on its own: from where the claims are rendered to the end of
// the function. Anchored on S.pending — the code that draws the rows — because the
// word "waiting" is prose and prose moves.
const wStart = html.indexOf('S.pending.map(');
const waiting = wStart >= 0 ? html.slice(wStart, html.indexOf('\n}', wStart) + 1 || undefined) : '';
ok('⚠️ a device in the waiting list is only ever text — no row can approve anything',
   wStart >= 0 && waiting.length > 0
   // Every shape a row could get a handle by: a call, an inline handler of any name, a
   // button, a link, the data-* a delegated listener would need, a pointer cursor (a row
   // that merely LOOKS tappable is already a lie — the card's own copy says it is not a
   // button), the two input ids, and the claim's own code, which is never rendered.
   && !/posApproveStation|station-code|station-name|c\.code|<button|<a[\s>]|href=|\son[a-z]+\s*=|data-|cursor\s*:\s*pointer/i.test(waiting));

// Closes the gap neither of those can see: a SECOND approve path, defined anywhere else
// in 16,000 lines and wired to a row, would satisfy both of them.
ok('and there is one approve call in the whole page, so no row can have its own',
   (src.match(/\/api\/stations\/claim\/approve/g) || []).length === 1);

// ---- what reaches the wire ---------------------------------------------------------
// The body is {code,name}: the six digits, and the name VINNY types. `name` is not a row
// identity and is not a loosening — the mini resolves a station's name as
// `b.name || claim.name` and slugs its id from the result, so before the name was sent,
// a device that named itself chose both. Typing it REMOVES device influence over identity.
const call = (approve.match(/posSrv\((?:[^()]|\([^()]*\))*\)/) || [''])[0];
const path = (call.match(/^posSrv\(\s*'([^']*)'/) || [, ''])[1];
const opts = call.slice(call.indexOf(',') + 1);   // ⚠️ the PATH is excluded on purpose — it
const body = approve.match(/body:\s*JSON\.stringify\(\{([^{}]*)\}\)/);  // has the word "claim" in it
ok('the approve call sends the typed code and the typed name, and nothing else',
   path === '/api/stations/claim/approve'                    // a fixed path: nothing of a row's in it
   && !!body
   && body[1].split(',').map(s => s.trim()).filter(Boolean).sort().join(',') === 'code,name'
   && (approve.match(/posSrv\(/g) || []).length === 1
   && !/pending|claim|headers|\$\{/i.test(opts));           // nor in the options, nor a header

// Pinned to the SEMICOLON. Without it the pin matches a prefix, and
// `...||document.querySelector('#wait-rows span').textContent` appended after it would
// scrape a name off the waiting list with the check still green.
// \w+ for the handle, because renaming a local is not a defect — but the SEMICOLON is
// pinned, because without it this matches a prefix and
// `…||document.querySelector('#wait-rows span').textContent` appended after it would
// scrape a name straight off the waiting list with the check still green.
ok('both values are read off the two boxes he typed into, and nothing is appended to them',
   /const code=String\(\(\w+&&\w+\.value\)\|\|''\)\.replace\(\/\\D\/g,''\);/.test(approve)
   && /const name=String\(\(\w+&&\w+\.value\)\|\|''\)\.trim\(\);/.test(approve));

// ⚠️ THE GUARD IS LOAD-BEARING. Delete this one line and an approve with the name box
// left blank sends name:'' — the mini falls back to `claim.name`, the device's own
// word for itself, and names the station (and slugs its id) from it. That is the whole
// vulnerability, restored, with every other assertion in this file still green.
ok('⚠️ and an empty name is refused here, or the device gets to name itself after all',
   /if\(!name\)\{posStationsS\.note=/.test(approve));

// The other half: a claim must not reach the wire by being typed FOR him. Counted over
// the WHOLE file and across both ways of getting a handle — querySelector appears 70
// times in this page, so a getElementById-only count is not a ban.
const handles = (src.match(/getElementById\(['"]station-(?:code|name)['"]\)|querySelector(?:All)?\(['"][^'"]*#station-(?:code|name)[^'"]*['"]\)/g) || []).length;
ok('and nothing fills those two boxes for him, so a waiting claim cannot put a name in his hand',
   handles === 3                                             // posNameHint reads one, approve reads two
   && !/station-(?:code|name)['"]\)[^;\n]*\.value\s*=(?!=)\s*(?!'')/.test(src)   // the only write is the clear to ''
   && !/<input id="station-(?:code|name)"[^>]*\svalue\s*=/i.test(html)           // and no seeded value attribute
   && /<datalist id="station-name-ideas">(?:\s*<option>[^<>${]+<\/option>)+\s*<\/datalist>/.test(html));

ok('and the screen says why, in words a manager will read',
   /Do not approve a device you are not holding/.test(html));
ok('a device that names itself is described as doing exactly that',
   /its own\s*\n?\s*claim about itself|claim about itself/.test(html));

// A six-digit code, checked before anything is sent.
ok('a short code is refused here rather than at the mini', /code\.length!==6/.test(approve));
ok('and non-digits cannot be smuggled in', approve.includes("replace(/\\D/g,'')"));

// ---- failures are named ----------------------------------------------------------
ok('an expired or reused code explains itself', /expires after ten minutes/.test(fn));
ok('an unreachable register says nothing was approved', /nothing was approved/.test(fn));

// ---- the readiness view, which is the point of the whole thing --------------------
// ⚠️ RUN, NOT GREPPED. "A register that checked in once in August is not counted as
// healthy" is a statement about VALUES, and no regex over source text can make it —
// every regex anyone proposed for this stayed green when a one-line branch was added
// above the lines it quoted, or was satisfied by this file's own habit of quoting
// deleted code verbatim in comments. posStationAge and posStationNow are pure functions
// of their arguments, so they are lifted out and asked directly.
const ageSrc = cut('const STATION_QUIET_MS=', 'function posStationNow(', 'age classifier');
// Ends two characters PAST the brace — a slice that stops before it is an unterminated
// function, which throws, which would have made every fixture below vacuous.
const nowAt = src.indexOf('function posStationNow('), nowEnd = src.indexOf('\n}', nowAt);
const nowSrc = nowAt >= 0 && nowEnd > nowAt ? src.slice(nowAt, nowEnd + 2) : '';
let age = null, stationNow = null;
try {
  const mk = new Function(`const posDriftAgo=()=>'a while';${ageSrc}\n${nowSrc}\nreturn {posStationAge,posStationNow};`)();
  age = mk.posStationAge; stationNow = mk.posStationNow;
} catch (e) { /* reported by the assertion below */ }
const RAN = typeof age === 'function' && typeof stationNow === 'function';
ok('the age classifier and the clock can be read out of the page and run', RAN);

const NOW = 1763000000000;
// Returns '' when the lift failed, so a fixture that could not run FAILS rather than
// passing because '' is not in the counted list. A check that passes when it did not run
// is worse than no check.
const kindOf = (st) => { if (!RAN) return ''; try { return String(age(st, NOW).kind || ''); } catch { return ''; } };
const KNEVER = kindOf(null);
const KDEAD  = kindOf({ last_seen: NOW - 90 * 24 * 3600 * 1000 });   // last heard in August
const KQUIET = kindOf({ last_seen: NOW - 8 * 60 * 1000 });
const KLIVE  = kindOf({ last_seen: NOW - 30 * 1000 });

// Which classes the tile actually adds up — followed from the TILE to the variable it
// shows to that variable's declaration, rather than pinned to the name `live`. Renaming a
// local is not a defect and must not turn this red; what matters is that whatever number
// the tile prints is built by filtering on kinds, and which kinds those are.
const tileVar = (html.match(/posStat\('Talking now',String\((\w+)\)/) || [, ''])[1];
const liveExpr = tileVar ? (html.match(new RegExp('const ' + tileVar + '=[^;]+;')) || [''])[0] : '';
const counted = [...liveExpr.matchAll(/kind===['"]([a-z]+)['"]/g)].map((m) => m[1]);
ok('the second tile counts classes of register, and we can see which ones',
   !!tileVar && counted.length > 0);

ok('⚠️ an iPad that has never called home is NOT counted as talking',
   !!KNEVER && !counted.includes(KNEVER));
ok('⚠️ nor is one last heard from in August — silence is not health',
   !!KDEAD && !counted.includes(KDEAD) && KDEAD !== KQUIET && KDEAD !== KLIVE);
// ⚠️ THE ORIGINAL BUG, AS A FIXTURE. `seen` was the one-way boolean this screen used
// to render — true forever once a register had called home even once. A branch reading it
// again, added ABOVE everything else, is the cheapest way back to an August corpse in
// green, and it is invisible to any regex pinned to the lines below it.
const KZOMBIE = kindOf({ seen: true, last_seen: NOW - 90 * 24 * 3600 * 1000 });
ok('⚠️ and not one carrying the old "has checked in" flag over a dead last_seen',
   !!KZOMBIE && !counted.includes(KZOMBIE));
ok('one that went quiet mid-service is not counted either', !!KQUIET && !counted.includes(KQUIET));
ok('and one that spoke thirty seconds ago is', !!KLIVE && counted.includes(KLIVE));
// A quarter of an hour of nothing during service is the loud one. Bounded so it cannot be
// widened to a year, which would leave every corpse reading merely "quiet" and the red
// card unable to fire.
ok('the loud class starts within the quarter hour it promises',
   kindOf({ last_seen: NOW - 16 * 60 * 1000 }) === KDEAD);

// The ages are measured against the MINI's clock carried forward, never this laptop's —
// `const now=0` or a posStationNow that returns 0 would make every register read as
// "seen just now" through the skew branch, with every line above still matching.
ok('the ages are measured against the register server\'s clock, not this computer\'s',
   RAN
   && /const now=posStationNow\(S\)/.test(html)
   && Math.abs(stationNow({ srvNow: NOW, gotAt: Date.now() }) - NOW) < 5000
   && stationNow({}) > 1.7e12);

ok('enrolled registers are counted', /posStat\('Registers'/.test(html));
ok('and how many of them are talking right now', !!tileVar);
ok('⚠️ a device approved but never seen is called out', /never seen/.test(html));
ok('before a cutover, not after', /before a cutover, not after/.test(html));

// The warnings the mini supplies are shown rather than dropped.
ok('a duplicate-name claim is flagged', /duplicate_name/.test(html));
ok('and where it is asking from is shown', /source_ip/.test(html));

ok('the section is reachable', /\['stations','Registers'\]/.test(src));
ok('and loads when opened', /if\(s==='stations'\)posLoadStations\(\)/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
