// ENROLLING AN iPAD.
//
//     node tools/check-stations.mjs
//
// ⚠️ THE MANAGER APPROVES A CODE READ OFF THE DEVICE IN THEIR HAND — NEVER A ROW.
// The name and hint on a claim are supplied by whatever made it, so anything on the wifi
// can file a claim calling itself "Bar" and sit in the waiting list looking legitimate.
// Tapping the convincing row is how it gets approved. Typing the code off the physical
// iPad cannot approve a different device, because the code IS the binding.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const html = src.slice(src.indexOf('function posStationsHTML('), src.indexOf('const POS_SECTIONS='));
const fn = src.slice(src.indexOf('async function posApproveStation('), src.indexOf('function posStationsHTML('));

// ---- ⚠️ THE ONE THAT MATTERS ------------------------------------------------------
ok('⚠️ approval takes a typed CODE', /id="station-code"/.test(html));
ok('⚠️ and the waiting list has NO approve control on its rows',
   !/posApproveStation\(/.test(html.slice(html.indexOf('waiting'))));
ok('the approve call sends only the code, never a row identity',
   /JSON\.stringify\(\{code\}\)/.test(fn));
ok('and the screen says why, in words a manager will read',
   /Do not approve a device you are not holding/.test(html));
ok('a device that names itself is described as doing exactly that',
   /its own\s*\n?\s*claim about itself|claim about itself/.test(html));

// A six-digit code, checked before anything is sent.
ok('a short code is refused here rather than at the mini', /code\.length!==6/.test(fn));
ok('and non-digits cannot be smuggled in', fn.includes("replace(/\\D/g,'')"));

// ---- failures are named ----------------------------------------------------------
ok('an expired or reused code explains itself', /expires after ten minutes/.test(fn));
ok('an unreachable register says nothing was approved', /nothing was approved/.test(fn));

// ---- the readiness view, which is the point of the whole thing --------------------
// "Never seen" before a cutover is a question; after one it is an outage.
ok('enrolled registers are counted', /posStat\('Registers'/.test(html));
ok('and how many have actually checked in', /posStat\('Checked in'/.test(html));
ok('⚠️ a device approved but never seen is called out', /never seen/.test(html));
ok('before a cutover, not after', /before a cutover, not after/.test(html));

// The warnings the mini supplies are shown rather than dropped.
ok('a duplicate-name claim is flagged', /duplicate_name/.test(html));
ok('and where it is asking from is shown', /source_ip/.test(html));

ok('the section is reachable', /\['stations','Registers'\]/.test(src));
ok('and loads when opened', /if\(s==='stations'\)posLoadStations\(\)/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
