// WHAT MAY BECOME THE STAFF ROSTER — and what must never be believed.
//
//     node tools/check-tipsroster.mjs
//
// The 108 names moved out of this public page into the key-gated store, in two commits.
// Step 1 (guarded by this file until tonight) added the key, the validation rule, and a
// hand-pressed seeder/verifier, and PROVED the store matched before anything was deleted.
// Step 2 — this version of the file — deletes the literal and the one-time seed/verify
// machinery with it, and switches tipsFetchRoster() to a live, validated store read.
//
// ⚠️ THE FIXTURE IS A FULL, VALID SHAPE, not a hand-written subset. A fixture that is a
// subset of the real shape passes through the wrong branch and goes quietly green, so every
// refusal below is a single deliberate edit to a complete, validating payload.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const cut = (a, b) => {
  const i = src.indexOf(a); const j = src.indexOf(b, i + 1);
  if (i < 0 || j < 0) return null;
  return src.slice(i, j);
};
const stripc = (t) => (t || '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

// ── the literal and the one-time seed/verify machinery are GONE ───────────────────────
ok('⛔ the 108-name literal is gone', !/const TIP_ROSTER_DATA=\{"Server":/.test(src));
ok('TIP_ROSTER_DATA is now `let`, starting empty', /let TIP_ROSTER_DATA=\{\};/.test(src));
ok('TIP_NAME_ALIASES is now `let`, starting empty', /let TIP_NAME_ALIASES=\{\};/.test(src));
ok('TIP_ROSTER_CANON is now `let`, starting empty', /let TIP_ROSTER_CANON=\{\};/.test(src));
['tipRosterSeedPayload', 'tipRosterVerify', 'tipRosterSeed', 'tipRosterSeedHTML'].forEach(fn => {
  ok('⛔ ' + fn + '() no longer exists', !new RegExp('function ' + fn + '\\(').test(src));
});
ok('⛔ no button calls the retired seeder/verifier', !/onclick="tipRosterSeed\(\)"/.test(src) && !/onclick="tipRosterVerify\(\)"/.test(src));
ok('each of TIP_ROSTER_DATA/TIP_NAME_ALIASES/TIP_ROSTER_CANON is DECLARED exactly once',
   (src.match(/\b(let|const)\s+TIP_ROSTER_DATA\s*=/g) || []).length === 1 &&
   (src.match(/\b(let|const)\s+TIP_NAME_ALIASES\s*=/g) || []).length === 1 &&
   (src.match(/\b(let|const)\s+TIP_ROSTER_CANON\s*=/g) || []).length === 1);

// ── lift the real rule and RUN it — unchanged by step 2, still the gate on everything ──
const DATA = cut('function tipNormKey', 'function tipRosterValidate');
const RULE = cut('function tipRosterValidate', 'function tipRosterSeedPayload') ||
             cut('function tipRosterValidate', 'async function tipsFetchRoster');
let R = null;
if (DATA && RULE) {
  try {
    R = new Function(`const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings'];
      ${DATA}${RULE}
      return {tipNormKey,tipRosterValidate,TIP_SECTIONS,TIP_ROSTER_COUNTS};`)();
  } catch (e) { ok('the roster rule evaluates: ' + e.message, false); }
}
ok('the roster rule lifts and runs', !!(R && R.tipRosterValidate));

// A realistic full payload — same 108 real names, built once here rather than read off a
// literal that no longer exists, so this file still exercises the real per-section floors.
const REAL_SECTIONS = {
  Server: Array.from({ length: 22 }, (_, i) => 'Server Person ' + i),
  Bartender: Array.from({ length: 10 }, (_, i) => 'Bartender Person ' + i),
  Busser: Array.from({ length: 34 }, (_, i) => 'Busser Person ' + i),
  'Food Runner': Array.from({ length: 9 }, (_, i) => 'Runner Person ' + i),
  Weddings: Array.from({ length: 33 }, (_, i) => 'Wedding Person ' + i),
};
REAL_SECTIONS.Bartender[5] = 'Priscilla La Gace';
const REAL_ALIASES = { 'priscilla lagace': 'Priscilla La Gace', 'priscill lagace': 'Priscilla La Gace', 'priscilla la gace': 'Priscilla La Gace' };
const real = () => ({ sections: JSON.parse(JSON.stringify(REAL_SECTIONS)), aliases: JSON.parse(JSON.stringify(REAL_ALIASES)) });

if (R && R.tipRosterValidate) {
  const { tipRosterValidate: V, TIP_SECTIONS: SECS, TIP_ROSTER_COUNTS: FLOOR } = R;

  const base = V(real());
  ok('a full, valid payload validates', !!base);
  const listed = SECS.reduce((n, s) => n + real().sections[s].length, 0);
  ok('…counting every name, not a subset that happened to pass', base && base.count === listed);

  ok('a null value is refused', V(null) === null);
  ok('undefined is refused', V(undefined) === null);
  ok('an empty object is refused', V({}) === null);
  ok('a value with no sections is refused', V({ aliases: {} }) === null);

  const short = real(); short.sections.Weddings = short.sections.Weddings.slice(0, 32);
  ok('⚠️ ONE PERSON short in ONE section is refused', V(short) === null);
  const gone = real(); gone.sections.Weddings = [];
  ok('a whole section emptied is refused', V(gone) === null);
  const missing = real(); delete missing.sections['Food Runner'];
  ok('a section missing altogether is refused', V(missing) === null);
  const extra = real(); extra.sections.Host = ['Someone'];
  ok('an extra section is refused', V(extra) === null);
  const hired = real(); hired.sections.Busser = hired.sections.Busser.concat(['New Busser']);
  ok('somebody hired — longer than the floor — still validates', !!V(hired) && V(hired).count === listed + 1);

  const dupe = real(); dupe.sections.Busser[0] = real().sections.Server[0];
  ok('the same person in two sections is refused', V(dupe) === null);
  const fat = real(); const who = fat.sections.Server[0]; fat.sections.Server[0] = who.replace(' ', '  ');
  const folded = V(fat);
  ok('⚠️ a double-spaced name is FOLDED back to the spelling the cells are keyed by', !!folded && folded.groups.Server[0] === who);

  const orphan = real(); orphan.aliases['someone else'] = 'Nobody At All';
  ok('a correction pointing at somebody not on the roster is refused', V(orphan) === null);
  const self = real();
  ok('pointing at yourself is allowed', !!V(self) && V(self).aliases['priscilla la gace'] === 'Priscilla La Gace');
  const redirect = real(); const a = real().sections.Server[0], b = real().sections.Server[1];
  redirect.aliases[R.tipNormKey(a)] = b;
  ok('⛔ a correction that redirects one roster person to ANOTHER is refused', V(redirect) === null);

  ok('⛔ every floor is at least the number the page actually lists',
     SECS.every(s => (FLOOR[s] || 0) >= real().sections[s].length));
}

// ── tipsFetchRoster now does a live, validated store read ─────────────────────────────
const fetchFn = cut('async function tipsFetchRoster(', 'function tipCell(');
ok('tipsFetchRoster exists and reads the store', !!fetchFn && /kvGet\(TIPS_ROSTER_KEY\)/.test(fetchFn));
ok('…and runs it through tipRosterValidate, not a bare assignment', !!fetchFn && /tipRosterValidate\(/.test(fetchFn));
ok('⛔ a failed read sets rosterFailed and returns null — never a half result',
   !!fetchFn && /kvFailed\(r\)\)\{tipsState\.rosterFailed=true;return null;/.test(stripc(fetchFn)));
ok('⛔ an invalid stored value ALSO sets rosterFailed — not just an unreachable store',
   !!fetchFn && /if\(!val\)\{tipsState\.rosterFailed=true;return null;/.test(stripc(fetchFn)));
ok('⛔ no ||[] fallback assigning the groups — val is already validated or we already returned',
   !!fetchFn && !/val\.groups\[s\]\s*\|\|\s*\[\]/.test(stripc(fetchFn)));
ok('success populates all three together before returning',
   !!fetchFn && /TIP_ROSTER_DATA=g/.test(fetchFn) && /TIP_NAME_ALIASES=Object\.assign/.test(fetchFn) && /TIP_ROSTER_CANON=canon/.test(fetchFn));
ok('⛔ a roster already loaded is never re-fetched (self-guard, same as before)',
   !!fetchFn && /if\(tipsState\.roster\)return tipsState\.roster;/.test(fetchFn));

// ── the loud-failure card now also fires on a roster load failure ─────────────────────
const initFn = cut('async function tipsInit(', 'async function tipsRefresh(');
ok('tipsInit folds rosterFailed into the SAME kvFailed OR-chain as the other stores',
   !!initFn && /kvFailed\(remote\)\|\|kvFailed\(rm\)\|\|kvFailed\(rh\)\|\|kvFailed\(ge\)\|\|tipsState\.rosterFailed\)/.test(stripc(initFn)));
ok('…which still shows the existing red loud-failure card text, not a new one',
   !!initFn && /Could not reach the store — this screen is NOT your data, and nothing will be saved/.test(initFn));
ok('⛔ `loaded` stays false on any failure, so the next open/refresh retries it',
   !!initFn && /tipsState\.loaded=true;tipsState\.loading=false;/.test(initFn));

// ── boot wiring: Staff's MICROS import reads TIP_NAME_ALIASES synchronously, so the roster
// must load at boot too, not only when someone opens the Tips tab ─────────────────────────
const boot = cut("window.addEventListener('load',()=>{setTimeout(()=>{", '},800)});');
ok('⛔ tipsFetchRoster() runs on every boot, not only when the Tips tab is opened',
   !!boot && /tipsFetchRoster\(\);/.test(boot));
const micros = cut('function staffMicrosParse(', '// NOBODY IS EVER CREATED BY THIS IMPORT');
ok('staffMicrosParse still reads the SAME alias map the tips roster uses (one map, one source)',
   !!micros && /TIP_NAME_ALIASES\[staffKeyOf\(nm\)\]/.test(micros));

// ── no quiet fallbacks in the rule ──────────────────────────────────────────────────
// ⛔ `(v[s]||[])` turns a missing section into an empty one in silence, which is exactly how
// a partial value renders as a finished sheet. Comments stripped first: this file's own
// comments say "||[]" while refusing it.
// Brace-matched, not a far-off string anchor: tipsFetchRoster now sits hundreds of lines
// below tipRosterValidate, past plenty of unrelated code that legitimately uses ||[]/||{}.
const grabFn = (name) => {
  let i = src.indexOf('async function ' + name + '(');
  if (i === -1) i = src.indexOf('function ' + name + '(');
  if (i === -1) return null;
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
const rule = grabFn('tipRosterValidate');
const ruleCode = stripc(rule);
ok('⛔ the rule has no ||[] fallback anywhere in it', !!rule && !/\|\|\s*\[\]/.test(ruleCode));
ok('…and no ||{} either', !!rule && !/\|\|\s*\{\}/.test(ruleCode.replace(/Object\.keys\(al\|\|\{\}\)/, '')));
ok('the key is named once, as a constant', (src.split("TIPS_ROSTER_KEY='").length - 1) === 1);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
