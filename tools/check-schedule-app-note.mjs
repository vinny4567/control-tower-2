// STAFF AND THE SCHEDULE APP ARE ONE LIST — Jarvis, 11/20/26, mini 5a18cda.
//
//     node tools/check-schedule-app-note.mjs
//
// A rename on Staff renames the schedule app account too; remove/restore turns that
// account off/on. /api/people/write's reply carries `schedule_app` on the matching op,
// and staffScheduleAppNote() turns it into the one sentence the rename/remove/restore
// banners actually show — replacing the old, now-false "the schedule app still has their
// own spelling" line.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

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

// ── staffScheduleAppNote: lift it and RUN it against every shape the mini can send ──
function liftNote() {
  const ctx = {};
  new Function('ctx', `${grab('staffScheduleAppNote')}\nctx.note=staffScheduleAppNote;`)(ctx);
  return ctx.note;
}
const note = liftNote();

ok('⛔ no schedule_app in the reply at all (op not eligible) → nothing to say', note(undefined, 'rename', 'Diego Campos') === '');
ok('rename: renamed:true → the bespoke confirmation line', note({ renamed: true, before: 'Diego', after: 'Diego Campos' }, 'rename', 'Diego Campos') === 'Renamed in the schedule app too.');
ok('rename: no_account → the bespoke "no account" line, exactly as Jarvis wrote it', note({ renamed: false, reason: 'no_account', message: 'whatever the mini said' }, 'rename', 'Diego Campos') === 'Not in the schedule app — they don’t have an account.');
// ⚠️ 11/20/26, Jarvis's review catch: on a RENAME, "ambiguous" means the schedule app
// found two accounts under the OLD name (still on file there) — `name` passed in here is
// the NEW spelling, so building a sentence out of it named the wrong person entirely.
// Fix: use the server's own `message`, which already says it correctly.
ok('⛔ rename: ambiguous uses the server\'s own message, NEVER the (new) name this call was passed — that name is the wrong person for an ambiguous OLD-name match', note({ renamed: false, reason: 'ambiguous', message: 'The schedule app has two Diego accounts — nothing changed there.' }, 'rename', 'Diego Campos') === 'The schedule app has two Diego accounts — nothing changed there.');
ok('…and never falls back to empty if the server message is missing', note({ renamed: false, reason: 'ambiguous' }, 'rename', 'Diego Campos') === 'The schedule app has two matching accounts — nothing changed there.');
ok('⛔ rename: an unlisted reason (not_employee/unreachable/anything future) falls back to the server\'s own message, never silently blank', note({ renamed: false, reason: 'unreachable', message: 'Could not reach the schedule app.' }, 'rename', 'Diego Campos') === 'Could not reach the schedule app.');
ok('…same for not_employee', note({ renamed: false, reason: 'not_employee', message: 'Not an employee record.' }, 'rename', 'Diego') === 'Not an employee record.');

ok('status: changed:true, active:false → "turned off"', note({ changed: true, active: false, name: 'Diego Campos' }, 'status', 'Diego Campos') === 'Their schedule app account is turned off.');
ok('status: changed:true, active:true → "turned back on"', note({ changed: true, active: true, name: 'Diego Campos' }, 'status', 'Diego Campos') === 'Their schedule app account is turned back on.');
ok('status: no_account uses the same bespoke line as rename', note({ changed: false, reason: 'no_account', message: 'x' }, 'status', 'Diego Campos') === 'Not in the schedule app — they don’t have an account.');
ok('status: ambiguous names the person too', note({ changed: false, reason: 'ambiguous', message: 'x' }, 'status', 'Diego Campos') === 'The schedule app has two Diego Campos accounts — nothing changed there.');
ok('⛔ status: an unlisted reason also falls back to the server message', note({ changed: false, reason: 'unreachable', message: 'Could not reach it.' }, 'status', 'Diego') === 'Could not reach it.');

// ── staffRename: the result is captured and surfaced, old false claim is gone ──────
const renameFn = grab('staffRename');
ok('⛔ the old "the schedule app still has their own spelling" line is gone — it stopped being true the moment this mini build shipped', !/still has their own spelling/.test(renameFn));
ok('⛔ staffRename captures the write result (not discarding it with a bare if(!await...)) so schedule_app is reachable', /const r=await staffWriteOp\(\{op:'update',pid:p\.pid,patch:\{name\}\}\);\s*\n\s*if\(!r\)return;/.test(renameFn));
ok('…and feeds it through staffScheduleAppNote (the new name is passed but no longer used to build the ambiguous sentence — see the fix above)', /staffScheduleAppNote\(r\.schedule_app,'rename',name\)/.test(renameFn));

// ── staffRestore: result captured, note shown on BOTH branches (class-clear and not) ──
const restoreFn = grab('staffRestore');
ok('⛔ staffRestore captures the status-write result', /const r=await staffWriteOp\(\{op:'status',pid:p\.pid,status:'active'\}\);\s*\n\s*if\(!r\)return;/.test(restoreFn));
ok('⛔ the schedule_app note is appended on the class-clear branch', /staffScheduleAppNote\(r\.schedule_app,'status',p\.name\)/.test(restoreFn) && /no employee class.*\+\(sa\?' '\+sa:''\)/.test(restoreFn));
ok('⛔ …and on the plain "Put back" branch too — restoring without a class clear must not lose the note', /'Put back\.'\+\(sa\?' '\+sa:''\)/.test(restoreFn));

// ── staffRemove: result captured, note appended to whatever regNote already says ───
const removeFn = grab('staffRemove');
ok('⛔ staffRemove captures the removed-status write result', /const r=await staffWriteOp\(\{op:'status',pid:p\.pid,status:'removed'\}\);\s*\n\s*if\(!r\)return;/.test(removeFn));
ok('⛔ the schedule_app note is appended, not overwriting whatever the register-side messaging already set', /staffS\.regNote=\(staffS\.regNote\?staffS\.regNote\+' ':/.test(removeFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
