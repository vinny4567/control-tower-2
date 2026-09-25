// THE PAYROLL ID HAS TO REACH THE REGISTER.
//
//     node tools/check-paychex-push.mjs
//
// ⚠️ Vinny's onboarding order is: add them here (quick), give them a sign-in code, THEN
// add them to Paychex and come back with the id. The id used to travel only at the
// moment the register row was CREATED — which is exactly when he does not have it yet —
// so the register held paychex_id: null for everybody onboarded that way, permanently.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const fn = src.slice(src.indexOf('async function staffPushPaychex('),
                     src.indexOf('// ---- one person, opened up'));
ok('typing a Paychex id pushes it', /if\(f==='paychex'\)staffPushPaychex\(p\)/.test(src));
ok('to the route the mini actually serves', /'\/api\/employees\/paychex'/.test(fn));
ok('by mini id when there is one', /id\?\{id,paychex_id/.test(fn));
ok('and by exact name otherwise', /\{name:p\.name,paychex_id/.test(fn));
ok('clearing the box clears it there too', /paychex_id:p\.paychex_id\|\|null/.test(fn));

// ---- ⚠️ TWO PEOPLE, ONE PAYROLL ID ------------------------------------------------
// A wrong paycheque, and a typo that looks perfectly fine on screen. The mini refuses
// and names the holder; that has to INTERRUPT rather than land in a note.
ok('⚠️ a clash is an alert, not a note that scrolls past', /r\.status===409/.test(fn) && /alert\(/.test(fn));
ok('and it names who already holds the id', /holder_name/.test(fn));
ok('saying plainly it did NOT reach the register', /NOT on the register/.test(fn));

// ---- a failure is never silent ----------------------------------------------------
ok('an older register says so rather than looking successful', /r\.status===404/.test(fn));
ok('an unreachable register says the id is NOT on it', /that Paychex id is NOT on it/.test(fn));
ok('and any other refusal is surfaced', /would not take that Paychex id/.test(fn));

// It fires on change, not on every keystroke — a half-typed id is not an id.
ok('the field pushes on change, not on input', /onchange="staffEdit\('\$\{esc\(k\)\}','paychex'/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
