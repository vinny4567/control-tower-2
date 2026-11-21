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

// ── ONE-TIME BOOT SCRUB of copies already sitting in this device's localStorage ──────────────
{
  const store = {
    ct_staff: JSON.stringify({ people: { amy: { key: 'amy', name: 'Amy', pid: 'p1', email: 'a@x.com', birthday: '1990-01-01', address: { street: '1 Main' }, register: { pin_set: true } } }, jobs: { Server: { rate: 9 } }, at: 5 }),
    ct_staff_mirror: JSON.stringify({ v: { people: { bob: { key: 'bob', name: 'Bob', email: 'b@x.com' } } }, at: 7 }),
    ct_clean: JSON.stringify({ people: { cal: { key: 'cal', name: 'Cal', pid: 'p3' } } }),
    other_app: JSON.stringify({ people: { dee: { name: 'Dee', email: 'd@x.com' } } }),   // not ours (no ct_ prefix)
    ct_notjson: '{not json',
    ct_liq_items: JSON.stringify({ v: [1, 2, 3], at: 1 }),
  };
  const before = { ...store };
  let writes = 0;
  const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { writes++; store[k] = String(v); } };
  const fns = new Function('localStorage', `${grab('staffStripPersonal')}\n${grab('staffScrubLocalPersonal')}\nreturn {staffScrubLocalPersonal};`)(localStorage);
  const n = fns.staffScrubLocalPersonal();
  const staff = JSON.parse(store.ct_staff).people.amy;
  ok('⛔ ct_staff: email, birthday and address are scrubbed from the copy already on the device', !('email' in staff) && !('birthday' in staff) && !('address' in staff));
  ok('…everything else on the record (and the rest of the blob) survives', staff.name === 'Amy' && staff.pid === 'p1' && staff.register.pin_set === true && JSON.parse(store.ct_staff).jobs.Server.rate === 9 && JSON.parse(store.ct_staff).at === 5);
  ok('⛔ any other ct_* local copy of staff records ({v:{people}} KV mirror shape) is scrubbed too', !('email' in JSON.parse(store.ct_staff_mirror).v.people.bob) && JSON.parse(store.ct_staff_mirror).at === 7);
  ok('a copy with nothing personal is left byte-for-byte alone (not rewritten)', store.ct_clean === before.ct_clean);
  ok('a non-ct_ key is never touched', store.other_app === before.other_app);
  ok('non-JSON and non-staff ct_ values are skipped, not thrown on', store.ct_notjson === before.ct_notjson && store.ct_liq_items === before.ct_liq_items);
  ok('exactly the two dirty copies were rewritten, and it reports that', n === 2 && writes === 2);
  const again = fns.staffScrubLocalPersonal();
  ok('idempotent: a second run finds nothing to do and writes nothing', again === 0 && writes === 2);
}
ok('⛔ it actually RUNS on boot (a top-level call, not just a definition)', /\nstaffScrubLocalPersonal\(\);\n/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
