// WHO MAY OPEN THE CASH DRAWER — THREE STATES, NOT TWO.
//
//     node tools/check-drawer.mjs
//
// true = allow, false = DENY, null = no override, fall back to the job. The mini stores
// all three (Jarvis, e2c8c71) and this page has to as well. Collapsing them is the quiet
// failure: coerce with !! and a person can never go back to "by job", so an explicit
// true outlives the role that justified it — promote a server to manager and back and
// they keep the till for ever.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

// The reading of the flag, run for real rather than matched as text.
const body = src.slice(src.indexOf('function staffDrawer('),
                       src.indexOf('function staffOpen('));
const staffDrawer = new Function('return ' + body.trim() + '; ')() ||
                    new Function(body + '\nreturn staffDrawer;')();
const d = (role, drawer) => staffDrawer({ register: drawer === undefined ? { role } : { role, drawer } });

ok('an owner has it by the job',      d('owner').on === true && d('owner').byRole === true);
ok('a manager has it by the job',     d('manager').on === true);
ok('a server does not',               d('server').on === false && d('server').byRole === true);
// ⚠️ The whole reason the box exists: a BARTENDER signs in as a server, because there is
// no bartender role here, so this tick is the only way the bar gets the till.
ok('⚠️ an explicit true lets a server in', d('server', true).on === true);
ok('and that is marked as set for the person, not the job', d('server', true).byRole === false);
// ⚠️ The one that would silently do nothing.
ok('⚠️ an explicit false takes a manager OUT', d('manager', false).on === false);
ok('and that is marked as set for the person too', d('manager', false).byRole === false);
// ⚠️ NULL IS NOT FALSE.
ok('⚠️ null means no override — the job decides again',
   d('manager', null).on === true && d('manager', null).byRole === true);
ok('and null on a server denies, by the job', d('server', null).on === false);

// ---- the three states have to SURVIVE the edit and the wire ----------------------
const edit = src.slice(src.indexOf("else if(f==='drawer')"), src.indexOf("else if(f==='drawer')") + 220);
ok('⚠️ the editor keeps null as null rather than coercing it to false',
   /v===null\?null:!!v/.test(edit));
// ONE BOX (Vinny's call 9/24). The role dropdown above it is where privileges get set
// per person regardless of what they clock in as, so the drawer does not also carry a
// "by job / set here" distinction. It shows the role's answer until touched, and
// touching it stores a real true or false.
ok('one checkbox, and it says what it does',
   /Can open the cash drawer\n\s*<\/label>/.test(src));
ok('it shows the role answer until somebody touches it', /\$\{drawer\.on\?'checked':''\}/.test(src));
ok('and touching it stores the real value', /'drawer',this\.checked\)/.test(src));
// ⚠️ null has no CONTROL any more, but every layer underneath still carries it — the
// mini stores it, staffDrawer reads it, and the push forwards it. A tidy-up that
// collapsed it to false here would turn "no override" into a deny on the next write.
ok('⚠️ null is still handled by the editor even with no control for it',
   /v===null\?null:!!v/.test(src));

const push = src.slice(src.indexOf("what==='drawer'"), src.indexOf("what==='drawer'") + 300);
ok('⚠️ and null goes to the mini as null, not false',
   /===null\|\|[^?]*===undefined\?null:!!/.test(push));
ok('it posts to the endpoint the mini actually has', /'\/api\/employees\/drawer'/.test(push));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
