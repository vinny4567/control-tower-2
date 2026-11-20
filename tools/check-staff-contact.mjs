// CONTACT: email, birthday, address — Vinny's call 11/20/26. Collected at sign-up,
// live only on the mini (never in ct_staff or its cloud mirror), shown on the Staff row
// and the pending card, never in a list view or export. Every sign-up path (QR/PIN/
// invite) now reaches pending, tagged `via`.
//
//     node tools/check-staff-contact.mjs
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
const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing const ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
};

// ── staffEdit: email / birthday branches ────────────────────────────────────────────
function editWorld({ people = {}, writeOpResult = {} } = {}) {
  const calls = { writeOps: [] };
  const ctx = {};
  new Function('ctx', `
    let staffS = { people: ${JSON.stringify(people)} };
    async function staffWriteOp(op){ctx.calls.writeOps.push(op);return ${JSON.stringify(writeOpResult)};}
    ${grab('staffRegisterPatch')}
    const STAFF_DEPARTMENTS=['server','bartender','busser','runner','kitchen','events'];
    function staffTouch(p){}
    function staffRefresh(){}
    function staffPushRegister(){return Promise.resolve();}
    function staffPushPaychex(){return Promise.resolve();}
    ${grab('staffEdit')}
    ctx.edit = staffEdit;
  `)(ctx);
  ctx.calls = calls;
  return ctx;
}
{
  const w = editWorld({ people: { k: { key: 'k', pid: 'p1' } } });
  await w.edit('k', 'email', ' Amy@Example.com ');
  ok('email is trimmed and sent as typed', w.calls.writeOps[0].patch.email === 'Amy@Example.com');
}
{
  const w = editWorld({ people: { k: { key: 'k', pid: 'p1', email: 'x@y.com' } } });
  await w.edit('k', 'email', '');
  ok('⛔ an emptied email box clears it (sent as null)', w.calls.writeOps[0].patch.email === null);
}
{
  const w = editWorld({ people: { k: { key: 'k', pid: 'p1' } } });
  await w.edit('k', 'birthday', '1990-05-14');
  ok('birthday is sent as the date-input value, untouched', w.calls.writeOps[0].patch.birthday === '1990-05-14');
}
{
  const w = editWorld({ people: { k: { key: 'k', pid: 'p1', birthday: '1990-05-14' } } });
  await w.edit('k', 'birthday', '');
  ok('⛔ an emptied birthday box clears it (sent as null)', w.calls.writeOps[0].patch.birthday === null);
}

// ── staffSaveAddress: one write for all four fields ─────────────────────────────────
function addrWorld({ people = {} } = {}) {
  const calls = { writeOps: [] };
  const ctx = {};
  const fields = { street: '', city: '', state: '', zip: '' };
  new Function('ctx', 'fields', `
    let staffS = { people: ${JSON.stringify(people)} };
    async function staffWriteOp(op){ctx.calls.writeOps.push(op);return {};}
    const document = {
      getElementById(id){
        const m = /^staff-addr-(street|city|state|zip)-/.exec(id);
        if(!m) return null;
        const key = m[1];
        return { get value(){return fields[key];}, set value(v){fields[key]=v;}, disabled:false };
      }
    };
    ${grab('staffSaveAddress')}
    ctx.save = staffSaveAddress;
  `)(ctx, fields);
  ctx.calls = calls;
  ctx.fields = fields;
  return ctx;
}
{
  const w = addrWorld({ people: { k: { key: 'k', pid: 'p1' } } });
  Object.assign(w.fields, { street: '123 Main St', city: 'Chicago', state: 'il', zip: '60601' });
  await w.save('k');
  ok('⛔ one write op for all four fields together, not one per field', w.calls.writeOps.length === 1);
  ok('state is upper-cased before sending', w.calls.writeOps[0].patch.address.state === 'IL');
  ok('the full object is sent as typed otherwise', w.calls.writeOps[0].patch.address.street === '123 Main St' && w.calls.writeOps[0].patch.address.zip === '60601');
}
{
  // all four blank → clears (null), not an object of empty strings
  const w = addrWorld({ people: { k: { key: 'k', pid: 'p1', address: { street: 'Old', city: 'Old', state: 'OL', zip: '00000' } } } });
  await w.save('k');
  ok('⛔ leaving every field blank clears the address (sent as null)', w.calls.writeOps[0].patch.address === null);
}
{
  // a partial fill is sent AS-IS — the mini validates completeness, not this page
  const w = addrWorld({ people: { k: { key: 'k', pid: 'p1' } } });
  w.fields.street = '123 Main St';
  await w.save('k');
  ok('a partial address is sent as typed — the mini is the one that refuses an incomplete object', w.calls.writeOps[0].patch.address.street === '123 Main St' && w.calls.writeOps[0].patch.address.city === '');
}

// ── staffDetail: the CONTACT column exists, is wired, and is never in the list row ──
const detailFn = grab('staffDetail');
ok('a CONTACT column renders Email, Birthday and Address', /CONTACT/.test(detailFn) && /Email/.test(detailFn) && /Birthday/.test(detailFn) && /Address/.test(detailFn));
ok("email wires to staffEdit('…','email',…)", /staffEdit\('\$\{esc\(k\)\}','email'/.test(detailFn));
ok("birthday wires to staffEdit('…','birthday',…), as a date input", /type="date"/.test(detailFn) && /staffEdit\('\$\{esc\(k\)\}','birthday'/.test(detailFn));
ok('address has its own Save button, calling staffSaveAddress — not staffEdit per keystroke', /staffSaveAddress\('\$\{esc\(k\)\}'\)/.test(detailFn));
const bodyFn = grab('staffBodyHTML');
ok('⛔ the list row never reads email/birthday/address — contact fields exist only in the expanded detail', !/p\.email|p\.birthday|p\.address/.test(bodyFn.replace(/staffDetail\(p\)/, '')));

// ── pending card: email/birthday/address shown, never editable from the card ────────
const VIA = grabConst('STAFF_PENDING_VIA_LABELS');
ok('⛔ via labels cover exactly qr/pin/invite, the three sign-up paths Jarvis named', /qr:'QR code'/.test(VIA) && /pin:'PIN pad'/.test(VIA) && /invite:'invite link'/.test(VIA));

function addrLineWorld() {
  const ctx = {};
  new Function('ctx', `${grab('staffPendingAddrLine')}ctx.line=staffPendingAddrLine;`)(ctx);
  return ctx;
}
{
  const w = addrLineWorld();
  ok('a full address renders street · city, state · zip', w.line({ street: '123 Main St', city: 'Chicago', state: 'IL', zip: '60601' }) === '123 Main St · Chicago, IL · 60601');
  ok('a missing address renders nothing, not a string of dots', w.line(null) === '');
  ok('a partial address (city only) renders just that, no stray separators', w.line({ city: 'Chicago' }) === 'Chicago');
}

const rowFn = grab('staffPendingRowHTML');
ok('⛔ the pending row shows email/birthday/address so Vinny can check them before approving', /row\.email/.test(rowFn) && /row\.birthday/.test(rowFn) && /staffPendingAddrLine\(row\.address\)/.test(rowFn));
ok("the 'via' tag is shown on the row", /STAFF_PENDING_VIA_LABELS\[row\.extra&&row\.extra\.via\]/.test(rowFn));
ok('⛔ nothing on the pending row is editable — no onchange/staffEdit anywhere near the contact fields, only the New/Same-as/Reject buttons', !/onchange=.*email|onchange=.*birthday/.test(rowFn));

// RUN it — the computed `via`/contact values must actually reach the rendered HTML,
// not just be computed and discarded.
function rowWorld() {
  const ctx = {};
  new Function('ctx', `
    const STAFF_DEPARTMENT_LABELS={server:'Server',bartender:'Bartender',busser:'Busser',runner:'Runner',kitchen:'Kitchen',events:'Events'};
    ${grabConst('STAFF_PENDING_VIA_LABELS')}
    ${grab('staffPendingAddrLine')}
    function esc(s){return(s||'').toString();}
    function staffPendingMatches(){return [];}
    ${grab('staffPendingAgo')}
    ${grab('staffPendingRowHTML')}
    ctx.html=staffPendingRowHTML;
  `)(ctx);
  return ctx;
}
{
  const w = rowWorld();
  const html = w.html({ pid: 'p1', name: 'Pat Pin', extra: { via: 'pin' } });
  ok('⛔ a PIN-pad sign-up actually renders "PIN pad" in the card, not just computes it', /PIN pad/.test(html));
}
{
  const w = rowWorld();
  const html = w.html({ pid: 'p1', name: 'Ivy Invite', extra: { via: 'invite' } });
  ok('an invite-link sign-up renders "invite link"', /invite link/.test(html));
}
{
  const w = rowWorld();
  const html = w.html({ pid: 'p1', name: 'Quinn QR', email: 'q@x.com', birthday: '1995-01-01', address: { street: '1 Main', city: 'Chicago', state: 'IL', zip: '60601' } });
  ok('email/birthday/address actually render in the card', /q@x\.com/.test(html) && /1995-01-01/.test(html) && /1 Main/.test(html));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
