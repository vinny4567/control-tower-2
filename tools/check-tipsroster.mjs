// WHAT MAY BECOME THE STAFF ROSTER — and what must never be believed.
//
//     node tools/check-tipsroster.mjs
//
// The 108 names are moving out of this public page into the key-gated store, in two
// commits. This file guards the FIRST one. Nothing in step 1 changes what the tip sheet
// reads — tipsFetchRoster still builds the roster from the literal — so the only thing
// worth checking is the rule that decides whether a stored value may ever be believed,
// and the two hand-pressed buttons that write and prove it.
//
// ⚠️ THE FIXTURE IS THE REAL LIST, not a hand-written stand-in. A fixture that is a
// subset of the real shape passes through the wrong branch and goes quietly green, so
// every refusal below is a single deliberate edit to the page's OWN roster.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

// ── lift the real thing and RUN it ───────────────────────────────────────────────────
// A regex over this file is satisfied by a COMMENT about the code. These are the actual
// functions, evaluated, with the page's own two literals as their input.
const cut = (a, b) => {
  const i = src.indexOf(a); const j = src.indexOf(b, i + 1);
  if (i < 0 || j < 0) return null;
  return src.slice(i, j);
};
// ⚠️ EVERY "does NOT do X" ASSERTION READS THIS, NOT THE SLICE. The comments in here name
// kvPush, kvSend and POST in order to refuse them — so a negative regex over the slice is
// tripped by the comment that says the code must not do it. Strip the commentary first.
const stripc = (t) => (t || '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const DATA = cut('const TIP_SECTIONS=', 'function tipNormKey');
const RULE = cut('function tipNormKey', 'let tipsState=');
let R = null;
if (DATA && RULE) {
  try {
    R = new Function(`${DATA}${RULE}
      return {TIP_SECTIONS,TIP_ROSTER_DATA,TIP_NAME_ALIASES,TIP_ROSTER_COUNTS,
              tipNormKey,tipRosterValidate,tipRosterSeedPayload};`)();
  } catch (e) { ok('the roster rule evaluates: ' + e.message, false); }
}
ok('the roster rule lifts and runs', !!(R && R.tipRosterValidate && R.tipRosterSeedPayload));

if (R && R.tipRosterValidate) {
  const { tipRosterValidate: V, tipRosterSeedPayload: PAY, TIP_SECTIONS: SECS, TIP_ROSTER_COUNTS: FLOOR } = R;
  // a deep copy of the page's own payload, so each case below is one edit to the real list
  const real = () => JSON.parse(JSON.stringify(PAY()));

  // ── the page's own roster is the thing that has to pass ────────────────────────────
  const base = V(real());
  ok('the page’s own roster validates', !!base);
  // ⚠️ NOT A HARD 108. Somebody gets hired, and a check pinned to today's number goes red
  // for a legitimate edit — which teaches whoever meets it to delete the clause. So: every
  // name the page lists is counted, and the number may only ever go UP. A roster that has
  // lost people is the failure this is here to catch.
  const listed = SECS.reduce((n, s) => n + real().sections[s].length, 0);
  ok('…and it is every one of them, not a subset that happened to pass', base && base.count === listed);
  ok('…and there are still at least the 108 we know about', base && base.count >= 108);
  ok('…counted per section, matching the page exactly',
     !!base && SECS.every(s => base.groups[s].length === real().sections[s].length));
  ok('…and it carries the three name corrections', base && Object.keys(base.aliases).length === 3);

  // ── absent is not none ─────────────────────────────────────────────────────────────
  // A key that was never written answers 200 {v:null,at:0} — byte-identical to one a
  // whole-value overwrite has just emptied. There is no restaurant with no tipped staff.
  ok('a null value is refused', V(null) === null);
  ok('undefined is refused', V(undefined) === null);
  ok('an empty object is refused', V({}) === null);
  ok('an array is refused', V([]) === null);
  ok('a value with no sections is refused', V({ aliases: {} }) === null);
  ok('sections as an array is refused', V({ sections: [] }) === null);

  // ── per-section floors, which is the whole point of having five numbers ────────────
  const short = real(); short.sections.Weddings = short.sections.Weddings.slice(0, 32);
  ok('⚠️ ONE PERSON short in ONE section is refused', V(short) === null);
  const padded = real();
  padded.sections.Weddings = padded.sections.Weddings.slice(0, 32);
  padded.sections.Server = padded.sections.Server.concat(['Someone New']);
  ok('⚠️ …and padding the TOTAL back up with a new Server does NOT rescue it — ' +
     'a total floor alone would have passed this', V(padded) === null);
  const gone = real(); gone.sections.Weddings = [];
  ok('a whole section emptied is refused', V(gone) === null);
  const missing = real(); delete missing.sections['Food Runner'];
  ok('a section missing altogether is refused', V(missing) === null);
  const extra = real(); extra.sections.Host = ['Someone'];
  ok('an extra section is refused', V(extra) === null);
  const hired = real(); hired.sections.Busser = hired.sections.Busser.concat(['New Busser']);
  ok('somebody hired — longer than the floor — still validates', !!V(hired) && V(hired).count === listed + 1);

  // ── names ─────────────────────────────────────────────────────────────────────────
  const notstr = real(); notstr.sections.Server[0] = { name: 'x' };
  ok('a name that is not a string is refused', V(notstr) === null);
  const blank = real(); blank.sections.Server[0] = '   ';
  ok('a blank name is refused', V(blank) === null);
  const dupe = real(); dupe.sections.Busser[0] = real().sections.Server[0];
  ok('the same person in two sections is refused', V(dupe) === null);
  const dupe2 = real(); dupe2.sections.Server[1] = real().sections.Server[0];
  ok('…and twice in ONE section is refused', V(dupe2) === null);

  // ⚠️ FOLDED, NOT REFUSED. Two spaces renders pixel-identically (HTML collapses a run of
  // whitespace in a text node) and would orphan her money on a key no row reads.
  const fat = real();
  const who = fat.sections.Server[0];
  fat.sections.Server[0] = who.replace(' ', '  ');
  const folded = V(fat);
  ok('⚠️ a double-spaced name is FOLDED back to the spelling the cells are keyed by',
     !!folded && folded.groups.Server[0] === who);
  ok('…and folding does not lose or duplicate anybody', !!folded && folded.count === listed);
  const tabbed = real();
  tabbed.sections.Bartender[0] = ' ' + tabbed.sections.Bartender[0] + ' ';
  ok('…leading and trailing space too', !!V(tabbed) && V(tabbed).groups.Bartender[0] === real().sections.Bartender[0]);

  // ── name corrections ──────────────────────────────────────────────────────────────
  const noAl = real(); delete noAl.aliases;
  ok('no name corrections at all is allowed', !!V(noAl) && Object.keys(V(noAl).aliases).length === 0);
  const nullAl = real(); nullAl.aliases = null;
  ok('…and null is allowed', !!V(nullAl));
  const badAl = real(); badAl.aliases = [];
  ok('corrections as an array is refused', V(badAl) === null);
  const orphan = real(); orphan.aliases['someone else'] = 'Nobody At All';
  ok('a correction pointing at somebody not on the roster is refused', V(orphan) === null);
  const unnorm = real(); unnorm.aliases['Priscilla LaGace'] = 'Priscilla La Gace';
  ok('a correction key not already in normalised form is refused — the Staff tab reads ' +
     'this same map through a DIFFERENT normalisation', V(unnorm) === null);
  const self = real();
  ok('pointing at yourself is allowed — the live map holds exactly that',
     !!V(self) && V(self).aliases['priscilla la gace'] === 'Priscilla La Gace');
  // ⛔ the quietest failure there is: both people keep a row, both rows sit in the right
  // section, the grand total reconciles to the penny, and one is paid the other's fortnight.
  const redirect = real();
  const a = real().sections.Server[0], b = real().sections.Server[1];
  redirect.aliases[R.tipNormKey(a)] = b;
  ok('⛔ a correction that redirects one roster person to ANOTHER is refused', V(redirect) === null);

  // ── the floors are the real lengths, so lowering one goes red ──────────────────────
  // ⛔ "never lower one to make a load go green" is the refusal this assertion exists to
  // make executable: a floor under the page's own count is a floor that has been lowered.
  ok('⛔ every floor is at least the number of people the page actually lists',
     SECS.every(s => (FLOOR[s] || 0) >= real().sections[s].length));
  ok('…and there is a floor for every section', SECS.every(s => typeof FLOOR[s] === 'number' && FLOOR[s] > 0));
  ok('…and no floor for a section that does not exist',
     Object.keys(FLOOR).every(s => SECS.indexOf(s) >= 0));
}

// ── TONIGHT CHANGES NOTHING ABOUT WHAT THE SHEET READS ──────────────────────────────
// This is the assertion that makes "the names have not come out yet" a fact rather than
// a claim. Step 2 is the commit that changes this function; until then it must not move.
const fetchFn = cut('async function tipsFetchRoster(', 'function tipCell(');
ok('the roster the sheet renders still comes from the page’s own literal',
   !!fetchFn && /TIP_ROSTER_DATA/.test(fetchFn));
ok('…and it does not read the store yet', !!fetchFn && !/kvGet|TIPS_ROSTER_KEY/.test(stripc(fetchFn)));
ok('…so the 108 names are still in this file', /const TIP_ROSTER_DATA/.test(src));

// ── the seeder: a hand action, awaited, and read back ───────────────────────────────
const seed = cut('async function tipRosterSeed(', 'function tipRosterSeedHTML(');
const vfy = cut('async function tipRosterVerify(', 'async function tipRosterSeed(');
ok('both buttons exist', !!seed && !!vfy);
if (seed && vfy) {
  // ⛔ NOT kvPush. It debounces 1.2s, never reads its response, and kvFlushNow would ship
  // a half-built value on pagehide — a rejected write would report nothing at all.
  ok('⛔ the seed does not go through the fire-and-forget push', !/kvPush|kvSend/.test(stripc(seed)));
  ok('…it awaits a real POST', /await fetch\(/.test(seed) && /method:'POST'/.test(seed));
  ok('…and READS the status instead of assuming it worked', /if\(!r\.ok\)/.test(seed));
  ok('…with the key in the header, never the URL', /'x-sync-token'/.test(seed) && !/\?token=/.test(stripc(seed)));
  ok('…and it asks before replacing what is there', /confirm\(/.test(seed));
  ok('…then proves it by reading the key back out', /tipRosterVerify\(\)/.test(seed));
  ok('…refusing outright on a device with no sync key', /KV_TOKEN\(\)/.test(seed));
  // an echo of what was sent is not a confirmation
  ok('the check does a fresh read', /await kvGet\(TIPS_ROSTER_KEY\)/.test(vfy));
  ok('…and writes nothing at all', !/fetch\(|kvPush|kvSend|method:'POST'/.test(stripc(vfy)));
  ok('…telling "I could not ask" apart from "there is nothing there"',
     /kvFailed\(r\)/.test(vfy) && /r\.v==null/.test(vfy));
  ok('…and refusing a stored value that is not a usable roster', /tipRosterValidate\(/.test(vfy));
  ok('…diffing name by name rather than trusting a count', /indexOf\(nm\)<0/.test(vfy));
  ok('…and alias by alias', /name correction missing/.test(vfy) && /name correction extra/.test(vfy));
}
// ⛔ NEVER ON LOAD. One whole-value overwrite from a device that had not loaded a roster
// would replace all 108 names with nothing, for everybody, permanently.
const calls = src.split('tipRosterSeed(').length - 1;
ok('⛔ the seed is written in exactly two places — its own definition and its button',
   calls === 2);
ok('…and the only thing that calls it is a click', /onclick="tipRosterSeed\(\)"/.test(src));
const payload = cut('function tipRosterSeedPayload(', 'async function tipRosterVerify(');
ok('what gets written is built from this page’s own two literals and nothing else',
   !!payload && /TIP_ROSTER_DATA/.test(payload) && /TIP_NAME_ALIASES/.test(payload)
   && !/kvGet|fetch\(|ct_staff/.test(stripc(payload)));

// ── no quiet fallbacks in the rule ──────────────────────────────────────────────────
// ⛔ `(v[s]||[])` turns a missing section into an empty one in silence, which is exactly
// how a partial value renders as a finished sheet. Comments stripped first: this file's
// own comments say "||[]" while refusing it.
const rule = cut('function tipRosterValidate(', 'function tipRosterSeedPayload(');
const code = stripc(rule);
ok('⛔ the rule has no ||[] fallback anywhere in it', !!rule && !/\|\|\s*\[\]/.test(code));
ok('…and no ||{} either', !!rule && !/\|\|\s*\{\}/.test(code.replace(/Object\.keys\(al\|\|\{\}\)/, '')));
ok('the key is named once, as a constant', (src.split("TIPS_ROSTER_KEY='").length - 1) === 1);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
