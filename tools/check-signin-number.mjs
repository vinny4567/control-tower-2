// THE SIGN-IN NUMBER MUST NOT STAY IN THE BROWSER.
//
//     node tools/check-signin-number.mjs
//
// It is typed into a box on this page, and every one of these is a way it could quietly
// end up somewhere it can be read back: saved onto the person, written to the cloud
// blob with the rest of the staff record, or simply left sitting in the field. The mini
// stores it hashed; that is only worth anything if this page keeps nothing.
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
ok('the box has a handler at all', !!save);
ok('and it is wired to a Save button and to Enter',
   src.includes('staffSaveNumber(') && src.includes("event.key==='Enter'"));

// ---- it keeps nothing --------------------------------------------------------
ok('the typed number is never written onto the person record',
   !/\bp\s*\.\s*(pin|code|number|sign_?in)/i.test(save));
// staffSetPin DOES call staffSave — it has to, to record that this person now has
// access. What must never be in that save is the number itself, so the real assertion
// is that nothing is ever assigned FROM the variables holding it.
// ⚠️ REVERSED 11/8/26, AND THIS FILE NOW GUARDS THE OPPOSITE. These three lines used
// to assert that the plain number was never stored or shown. It is both, by Vinny's
// explicit call (10/21, reaffirmed 8/11) — he reads people's numbers off this page.
//
// The reversal is why the guard is worth keeping rather than deleting: on 8/11 the
// display was removed for a good-looking reason, and 128 numbers disappeared from the
// back office in a way that read as data loss and cost three sessions an evening. These
// assertions are what makes that removal fail here first, in a terminal, instead of in
// front of him.
ok('the typed number IS stored, so the office can read it back',
   /p\.register\.signin\s*=\s*pin/.test(pin));
ok('with the date it was set, so a stale one can be recognised',
   /p\.register\.signin_at\s*=/.test(pin));
ok('and the flag saying a code exists is still recorded alongside it',
   /p\.register\.pin_set\s*=\s*true/.test(pin));
ok('⚠️ the field does NOT empty itself — the box IS the number now, and clearing it reads as the number being lost',
   !/el\.value\s*=\s*''/.test(save));
ok('an unchanged number is not re-sent to the register',
   /if\s*\(\s*v\s*===\s*cur\s*\)\s*return/.test(save));
// Also reversed: the box carries the number. "put their number right in the box"
// (Vinny, 8/11) — a separate display line under an empty box was the arrangement that
// made its removal look like deletion.
ok('the box IS rendered carrying the stored number',
   /id="staff-num-\$\{kid\}"[^>]*\svalue="\$\{esc\(reg\.signin/.test(src));
ok('and it is labelled, so the number is not a bare box',
   /<label for="staff-num-\$\{kid\}"[^>]*>Sign in<\/label>/.test(src));
ok('nothing reads a number back out of the mini for display — the mini only ever says whether one EXISTS',
   !/has_pin[^\n]*\bvalue\b/.test(src));

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

// ---- the list keeps your place -----------------------------------------------
// Removing somebody rebuilt the whole tab and dropped you at the top of 231 rows —
// after every removal, and removing people is something you do several in a row.
const rm = src.slice(src.indexOf('async function staffRemove('), src.indexOf('function staffRestore('));
ok('removing somebody redraws the list instead of rebuilding the tab',
   /staffRedraw\(\)/.test(rm) && !/renderViewport\(\)/.test(rm));
const rs = src.slice(src.indexOf('function staffRestore('), src.indexOf('function staffRestore(') + 900);
ok('and so does putting them back', /staffRedraw\(\)/.test(rs));
ok('the redraw keeps the scroll position', /const top=sc\?sc\.scrollTop:0/.test(src));
ok('and redraws the register note, which lives outside the list',
   /function staffRedraw\(\)\{staffRefresh\(\);staffRefreshNotes\(\);\}/.test(src));
ok('both targets it redraws into actually exist',
   src.includes('id="staff-body"') && src.includes('id="staff-notes"'));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
