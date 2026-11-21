// STAFF MUST NEVER WRITE PERSONAL DATA TO THE CLOUD — Jarvis's urgent catch, 11/20/26.
//
//     node tools/check-staff-no-cloud-mirror.mjs
//
// staffMirrorToCloud() used to copy the whole live projection (which carries email,
// birthday, address) into the cloud KV ct_staff after every successful mini read. The mini
// (5a18cda) already republishes ct_staff itself, without personal fields, on every write —
// so this was a second writer AND a personal-data leak. Removed entirely. The one remaining
// local write (staffSave, localStorage only) must strip email/birthday/address first.
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

// ── staffMirrorToCloud is GONE: no function definition and no call site. A history
// comment naming it (why it was removed) is fine and expected — only the live code matters.
ok('⛔ staffMirrorToCloud is no longer DEFINED anywhere', !/function staffMirrorToCloud\(/.test(src));
ok('⛔ staffMirrorToCloud is no longer CALLED anywhere', !/staffMirrorToCloud\(\)\s*;/.test(src));

// ── staffLoad's post-read success branch never pushes to the cloud ─────────────────────
const loadFn = grab('staffLoad');
ok('⛔ staffLoad never calls kvPush at all — the mini read path has no cloud writer in it', !/kvPush\(/.test(loadFn));
ok('⛔ …and the read-only-mirror fallback branch only READS the cloud (kvGet), never writes it', /kvGet\(STAFF_KEY\)/.test(loadFn) && !/kvPush\(STAFF_KEY/.test(loadFn));

// ── staffStripPersonal: RUN it — strips email/birthday/address, keeps everything else ──
let STRIP = null;
try {
  const lifted = new Function(`${grab('staffStripPersonal')}\nreturn {staffStripPersonal};`)();
  STRIP = lifted.staffStripPersonal;
} catch (e) { ok('staffStripPersonal lifts and runs: ' + e.message, false); }

if (STRIP) {
  const people = {
    amy: { key: 'amy', name: 'Amy Server', department: 'server', pid: 'p1', email: 'amy@example.com', birthday: '1990-01-01', address: { street: '1 Main St', city: 'X', state: 'IL', zip: '60000' } },
    nopersonal: { key: 'nopersonal', name: 'No Personal', pid: 'p2' },
  };
  const out = STRIP(people);
  ok('⛔ email is stripped', out.amy.email === undefined);
  ok('⛔ birthday is stripped', out.amy.birthday === undefined);
  ok('⛔ address is stripped', out.amy.address === undefined);
  ok('…while everything else on the record survives (name, department, pid)', out.amy.name === 'Amy Server' && out.amy.department === 'server' && out.amy.pid === 'p1');
  ok('a record with no personal fields to begin with is untouched otherwise', out.nopersonal.name === 'No Personal' && out.nopersonal.pid === 'p2');
  ok('⛔ the ORIGINAL object is not mutated — staffS.people (used for live editing) must keep its own email/birthday/address', people.amy.email === 'amy@example.com' && people.amy.birthday === '1990-01-01' && !!people.amy.address);
  ok('no people at all → {} , not a throw', JSON.stringify(STRIP(undefined)) === '{}');
}

// ── staffSave: the one surviving localStorage write goes through the strip first ───────
const saveFn = grab('staffSave');
ok('⛔ staffSave writes through staffStripPersonal, not the raw staffS.people', /localStorage\.setItem\(STAFF_KEY,JSON\.stringify\(\{people:staffStripPersonal\(staffS\.people\)/.test(saveFn));
ok('⛔ staffSave never calls kvPush — it is localStorage only, exactly as Jarvis described it', !/kvPush\(/.test(saveFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
