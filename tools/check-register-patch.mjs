// patch.register REPLACES THE WHOLE OBJECT ON THE MINI — never send a partial one.
//
//     node tools/check-register-patch.mjs
//
// Confirmed by Jarvis 11/20/26: a patch.register with just {role} or {drawer} wipes every
// other register field that person had. The one exception is emp_id — omit it to KEEP
// whatever the mini already has, send it explicitly (a value, or null) only to change it.
// staffRegisterPatch is the one place that builds this object; every call site must use it,
// never construct patch.register by hand.
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

let staffRegisterPatch = null;
try {
  staffRegisterPatch = new Function(`${grab('staffRegisterPatch')}\nreturn staffRegisterPatch;`)();
} catch (e) { ok('staffRegisterPatch lifts and runs: ' + e.message, false); }

if (staffRegisterPatch) {
  // ── THE FULL OBJECT, NOT A PARTIAL ONE ───────────────────────────────────────────────
  const p = { register: { role: 'server', pin_set: true, drawer: true, access: true } };
  const patch = staffRegisterPatch(p, { role: 'manager' });
  ok('⛔ every OTHER existing register field survives in the patch, not just the one being changed',
     patch.pin_set === true && patch.drawer === true && patch.access === true);
  ok('…and the changed field is the new value', patch.role === 'manager');

  // ── emp_id: OMIT TO KEEP, EXPLICIT TO CHANGE ────────────────────────────────────────
  const withEmpId = { register: { role: 'server', emp_id: 42 } };
  ok('⛔ emp_id is OMITTED from the patch when the caller does not mention it (the mini\'s own "omit = keep" rule)',
     !('emp_id' in staffRegisterPatch(withEmpId, { role: 'manager' })));
  ok('…but IS carried when the caller explicitly sets it',
     staffRegisterPatch(withEmpId, { role: 'manager', emp_id: 99 }).emp_id === 99);
  ok('…and null explicitly clears it (not the same as omitting)',
     staffRegisterPatch(withEmpId, { emp_id: null }).emp_id === null);

  // ── WT-LOCAL ANNOTATIONS NEVER GET WRITTEN BACK ─────────────────────────────────────
  const withLocalCruft = { register: { role: 'server', mini: { active: true, role: 'server' }, pin_pending: true } };
  const stripped = staffRegisterPatch(withLocalCruft, { role: 'manager' });
  ok('⛔ the register-drift comparison cache (`mini`) is never sent back to the mini', !('mini' in stripped));
  ok('⛔ the local "waiting on the pin endpoint" flag is never sent back either', !('pin_pending' in stripped));

  // ── EDGE CASES: no register at all, no overrides ───────────────────────────────────
  ok('a person with no register object at all does not throw, returns just the override',
     (() => { try { return JSON.stringify(staffRegisterPatch({}, { role: 'server' })) === '{"role":"server"}'; } catch (e) { return false; } })());
  ok('no overrides at all just returns the existing register, cleaned of local-only fields',
     (() => { const r = staffRegisterPatch({ register: { role: 'server', mini: {} } }); return r.role === 'server' && !('mini' in r); })());
}

// ── EVERY LIVE CALL SITE USES THE HELPER, NONE BUILD patch.register BY HAND ───────────
ok('⛔ nothing in this file still builds a bare patch:{register:{...}} — every call site goes through staffRegisterPatch',
   !/patch:\{register:\{(?!.*staffRegisterPatch)/.test(src.replace(/function staffRegisterPatch[\s\S]*?\n\}/, '')));

const editFn = grab('staffEdit');
ok('staffEdit\'s role branch uses staffRegisterPatch', /patch:\{register:staffRegisterPatch\(p,\{role:p\.register\.role\}\)\}/.test(editFn));
ok('staffEdit\'s drawer branch uses staffRegisterPatch', /patch:\{register:staffRegisterPatch\(p,\{drawer:p\.register\.drawer\}\)\}/.test(editFn));

const restoreFn = grab('staffRestore');
ok('staffRestore\'s class-clear uses staffRegisterPatch', /patch:\{register:staffRegisterPatch\(p,\{role:null\}\)\}/.test(restoreFn));

const retireFn = grab('staffRetireRoles');
ok('staffRetireRoles uses staffRegisterPatch for its bulk role move', /patch:\{register:staffRegisterPatch\(p,\{role:to\}\)\}/.test(retireFn));

const pinFn = grab('staffSetPin');
ok('⛔ staffSetPin ALSO writes patch.register (pin_set) to the mini, not just /api/employees/pin',
   /staffWriteOp\(\{op:'update',pid:p\.pid,patch:\{register:staffRegisterPatch\(p,\{pin_set:true/.test(pinFn));
ok('⛔ emp_id is carried in that patch ONLY when the pin call just created the employee (wasNewEmpId)',
   /wasNewEmpId&&p\.register\.emp_id!=null/.test(pinFn));
ok('⛔ staffSetPin never puts the retired plaintext signin field into the register patch',
   !/staffRegisterPatch\(p,\{[^}]*signin/.test(pinFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
