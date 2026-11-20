// THE SIGN-IN NUMBER MUST NOT STAY IN THE BROWSER. FOR GOOD, THIS TIME.
//
//     node tools/check-signin-number.mjs
//
// It is typed into a box on this page, and every one of these is a way it could quietly
// end up somewhere it can be read back: saved onto the person, written to the cloud
// blob with the rest of the staff record, or simply left sitting in the field. The mini
// stores it hashed; that is only worth anything if this page keeps nothing.
//
// ⚠️ THIS FILE HAS REVERSED TWICE ALREADY (10/21 → 11/8 → back on 8/11 → off again
// 11/20/26, Vinny: "mini should hold everything, and watch tower is just a window into
// it"). Both reversals cost an evening each because the display disappearing read as
// data loss. 11/20 adds `staffShowNumber`, which is meant to make this the LAST
// reversal: Vinny can still look a number up, it just never sits in this page's own
// state waiting to go stale or leak in a cloud KV dump — every look-up is a fresh ask to
// the mini, which logs it.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (what, cond) => { if (!cond) bad++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };
const fn = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  // to the next top-level `function ` declaration
  const j = src.indexOf('\nfunction ', i + 1), k = src.indexOf('\nasync function ', i + 1);
  const end = Math.min(j < 0 ? src.length : j, k < 0 ? src.length : k);
  return src.slice(i, end);
};

const save = fn('staffSaveNumber');
const pin  = fn('staffSetPin');
const show = fn('staffShowNumber');
const hide = fn('staffHideNumber');
ok('the box has a handler at all', !!save);
ok('and it is wired to a Save button and to Enter',
   src.includes('staffSaveNumber(') && src.includes("event.key==='Enter'"));
ok('staffShowNumber and staffHideNumber both exist', !!show && !!hide);

// ---- it keeps nothing, permanently ---------------------------------------------
ok('the typed number is never written onto the person record in the save path',
   !/\bp\s*\.\s*(pin|code|number|sign_?in)/i.test(save));
// staffSetPin DOES call staffSave — it has to, to record that this person now has a
// code (pin_set). What must never be stored is the number itself.
ok('⛔ the plain number is never assigned onto p.register.signin, in staffSetPin or anywhere else',
   !/p\.register\.signin\s*=\s*pin/.test(pin) && !/register\.signin\s*=\s*[a-zA-Z_$][\w$]*\s*;/.test(src));
ok('…and a record that still carries the retired field from before this change has it actively deleted',
   /delete\s+p\.register\.signin\s*;/.test(pin));
ok('⛔ no signin_at timestamp either — nothing here to date, once there is no stored value to go stale',
   !/p\.register\.signin_at\s*=\s*Date\.now\(\)/.test(pin));
ok('the flag saying a code exists is still recorded (pin_set), just never the code itself',
   /p\.register\.pin_set\s*=\s*true/.test(pin));
ok('an unchanged-number optimisation is GONE too — this page has nothing left to compare a typed number against',
   !/register\.signin[^\n]*\n[^\n]*if\s*\(\s*v\s*===\s*cur\s*\)/.test(save) &&
   !/const cur=.*register\.signin/.test(save));
ok('the Set box always renders BLANK — no value carried over from a prior render',
   /id="staff-num-\$\{kid\}"[^>]*\svalue=""/.test(src));
ok('…and no code renders the Set box prefilled from reg.signin',
   !/value="\$\{esc\(reg\.signin/.test(src));
ok('nothing reads a number back out of the mini for the SET flow\'s own display — only staffShowNumber does, and only live',
   !/has_pin[^\n]*\bvalue\b/.test(src));

// ---- staffShowNumber: ask live, show briefly, save nowhere --------------------
ok('it refuses without a register id on file, rather than guessing or asking by name',
   /if\s*\(\s*id\s*==\s*null\s*\)\s*return\s+alert/.test(show));
ok('it asks the mini\'s code endpoint', /\/api\/employees\/code\?id=/.test(show));
ok('⛔ the revealed code is kept ONLY in staffS.reveal — never assigned onto p / p.register',
   !new RegExp('p\\.register\\.[a-zA-Z_]+\\s*=\\s*code').test(show) &&
   !/\bp\.code\s*=/.test(show) && !/\bp\.signin\s*=/.test(show));
ok('…and staffS.reveal itself never reaches staffSave() — it is never persisted',
   !/staffSave\(\)/.test(show));
ok('it self-clears after 10 seconds', /setTimeout\([^,]+,\s*10000\s*\)/.test(show));
ok('⛔ the 10s timer only clears ITS OWN reveal (checked by `at`), so a second press isn\'t clobbered by an earlier timer',
   /staffS\.reveal\[k\]\s*&&\s*staffS\.reveal\[k\]\.at\s*===\s*at/.test(show));
ok('a manual Hide clears the reveal outright', /delete\s+staffS\.reveal\[k\]/.test(hide));
ok('a 403 from the mini is read as a refusal, not silently empty', /403/.test(show));
ok('a 404 ("no_copy") is read as "nothing on file", not an error dressed as a number',
   /404/.test(show) && /Nothing on file/.test(show));
ok('the lookup goes through posSrv (the mini, with the back-office auth attached), never a bare fetch',
   /await\s+posSrv\(/.test(show) && !/await\s+fetch\(/.test(show));

// ---- the box is labelled as a SET box now, not a display of the stored value --
ok('the Set box is labelled "Set", not "Sign in" (it no longer shows what is stored, because nothing is)',
   /<label for="staff-num-\$\{kid\}"[^>]*>Set<\/label>/.test(src));
ok('a Show-number control exists next to it', /staffShowNumber\('/.test(src));
ok('…and a Hide control appears once a number is revealed', /staffHideNumber\('/.test(src));

// ---- the rule is the mini's rule ---------------------------------------------
// Two entry points now (the box and the prompt), so the shape check has to be the same
// in both or one of them accepts something the register will refuse.
// Four is the floor, at Vinny's call 9/19: the roster already in use is four-digit
// (1004, 7080), and a rule that rejects the numbers people are already punching is
// wrong rather than strict. ⚠️ The MINI enforces this too — if the two disagree, this
// page accepts a number the register then refuses, which is the worst of both.
// 3, not 4 — Vinny's call, so the register can reuse each person's MICROS Empl ID#,
// thirteen of which are three digits. The MINI enforces the same floor; if the two ever
// disagree this page accepts a number the register then refuses, which is the worst of
// both.
const rule = /\^\\d\{3,8\}\$/;
ok('the box checks 3 to 8 digits', rule.test(save));
ok('the prompt path checks the same thing', rule.test(pin));
ok('and nothing still says six anywhere', !/6 to 8|6–8|\{6,8\}/.test(src));

// ---- it goes to the mini, and only to the mini -------------------------------
ok('the number is posted to the register', pin.includes('/api/employees/pin'));
ok('the pin itself is not persisted locally after the post',
   !/p\.register\.pin\s*=\s*pin|localStorage\.setItem\([^)]*pin\b/.test(pin));
ok('a refusal from the mini stores nothing either',
   /Nothing was stored/.test(pin));

// ---- the people-list count/filter now key off pin_set, not the retired field --
ok('⛔ the "Sign-in set" count reads pin_set, not the retired signin field',
   /want\.filter\(p=>p\.register&&p\.register\.pin_set\)\.length/.test(src));
ok('⛔ the "no sign-in yet" filter reads pin_set too',
   /staffCanSignIn\(p\)&&!\(p\.register&&p\.register\.pin_set\)/.test(src));

// ---- the list keeps your place -----------------------------------------------
// Removing somebody rebuilt the whole tab and dropped you at the top of 231 rows —
// after every removal, and removing people is something you do several in a row.
const rm = src.slice(src.indexOf('async function staffRemove('), src.indexOf('function staffRestore('));
ok('removing somebody redraws the list instead of rebuilding the tab',
   /staffRedraw\(\)/.test(rm) && !/renderViewport\(\)/.test(rm));
const rsStart = src.indexOf('function staffRestore(');
const rs = (() => { let depth = 0, j = src.indexOf('{', rsStart); for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(rsStart, k + 1); } } return src.slice(rsStart, rsStart + 900); })();
ok('and so does putting them back', /staffRedraw\(\)/.test(rs));
ok('the redraw keeps the scroll position', /const top=sc\?sc\.scrollTop:0/.test(src));
ok('and redraws the register note, which lives outside the list',
   /function staffRedraw\(\)\{staffRefresh\(\);staffRefreshNotes\(\);\}/.test(src));
ok('both targets it redraws into actually exist',
   src.includes('id="staff-body"') && src.includes('id="staff-notes"'));

// ---- 11/20/26 — THE MINI IS THE SOLE WRITER NOW. The whole local-merge strip-on-read
// mechanism this section used to guard (staffMerge/staffMergeJobs/staffPushMerged, and
// stripping both a local AND a cloud copy before reconciling them) is retired along with
// it — there is only one copy of the truth, so there is nothing left to reconcile. What
// still matters: staffStripSignin stays correct (kept, unused, rather than deleted — see
// [[project_employee_database]]), AND the one place it is still genuinely needed —
// reading the CLOUD MIRROR when the mini can't be reached — actually calls it.
const grab = (name) => {
  let i = src.indexOf('async function ' + name + '(');
  if (i === -1) i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
let STRIP = null;
try {
  const lifted = new Function(`${grab('staffStripSignin')}\nreturn {staffStripSignin};`)();
  STRIP = lifted.staffStripSignin;
} catch (e) { ok('staffStripSignin lifts and runs: ' + e.message, false); }

if (STRIP) {
  const people = {
    alice: { name: 'Alice', register: { signin: '1234', signin_at: 999, pin_set: true, emp_id: 5 } },
    bob: { name: 'Bob', register: { pin_set: true } },           // already clean
    carol: { name: 'Carol' },                                    // no register at all — must not throw
  };
  STRIP(people);
  ok('⛔ staffStripSignin deletes register.signin', people.alice.register.signin === undefined);
  ok('⛔ …and register.signin_at', people.alice.register.signin_at === undefined);
  ok('…while leaving everything else on that record alone', people.alice.register.pin_set === true && people.alice.register.emp_id === 5);
  ok('a record with no signin to begin with is untouched', people.bob.register.pin_set === true);
  ok('a record with no register object at all does not throw', people.carol.register === undefined);
}

const load = src.slice(src.indexOf('async function staffLoad('), src.indexOf('function staffMirrorToCloud'));
const splitAt = load.indexOf('staffS.readOnly=true;');
ok('⛔ the MINI-success branch of staffLoad does NOT strip — the mini is trusted not to carry the retired field in its own answers',
   splitAt > 0 && !load.slice(0, splitAt).includes('staffStripSignin('));
ok('⛔ the read-only cloud-mirror branch (after staffS.readOnly=true) DOES strip — defensive, since that blob is externally sourced and could pre-date 11/20',
   splitAt > 0 && /staffStripSignin\(staffS\.people\)/.test(load.slice(splitAt)));
const mergeOneSrc = src.slice(src.indexOf('function staffMergeOne('), src.indexOf('function staffMerge('));
ok('staffMergeOne still carries its own backstop, even though nothing calls it right now',
   /out\.register=Object\.assign\([^)]*\);/.test(mergeOneSrc) &&
   /delete out\.register\.signin;delete out\.register\.signin_at;/.test(mergeOneSrc) &&
   mergeOneSrc.indexOf('out.register=Object.assign') < mergeOneSrc.indexOf('delete out.register.signin;'));
ok('⛔ staffLoad no longer calls staffPushMerged — that function is gone, replaced by staffWriteOp', !/staffPushMerged/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
