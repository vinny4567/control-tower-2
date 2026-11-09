// PRINT CLASSES ARE THE BACK OFFICE'S, AND NOBODY ELSE'S.
//
//     node tools/check-printclasses.mjs
//
// Two Micros classes — 103 All Kitchen Printer and 108 Main / Pizza — came across with
// the catalogue import and were listed in the back office badged "in the register",
// read-only, with no delete. That badge was the untrue part: no printer is installed
// yet, so nothing was routing anywhere. They only looked set up.
//
// Vinny, 11/8/26: "old micros print classes were pulled and setup already, i want to
// wipe those and go off of the back office only."
//
// So they are gone from pos-catalog.json AND the two code paths that read them are
// gone, because emptying the data alone would let a later hand-edit of that file put
// them back in the dropdown with nobody noticing. The catalogue is hand-maintained and
// committed; there is no importer in this repo to regenerate it.
//
// ⚠️ WHAT THIS FILE IS REALLY GUARDING: routing is stored as PRINTER NAMES
// (posRouting: itemKey -> ['Main','Pizza']), never as a class id. A class is only the
// picker. That is what made the wipe safe, and it is also what would make a future
// change to store class IDs instead quietly dangerous — delete a class then and you
// strand every item pointing at it. If that ever changes, this file should fail.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cat = JSON.parse(readFileSync(new URL('../pos-catalog.json', import.meta.url), 'utf8'));

let bad = 0;
const ok = (what, cond) => { if (!cond) bad++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };
const fn = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? i + 4000 : j);
};

// ── the wipe ─────────────────────────────────────────────────────────────────
ok('the catalogue carries no print classes', Array.isArray(cat.print_classes) && cat.print_classes.length === 0);
ok('…and the key is still there as an empty list, not deleted (an absent key reads as "never had any")',
   Object.prototype.hasOwnProperty.call(cat, 'print_classes'));
ok('neither Micros class is anywhere in the catalogue',
   !JSON.stringify(cat).includes('All Kitchen Printer'));
ok('nothing in the page reads the catalogue\'s print_classes any more',
   !/\.print_classes/.test(src.replace(/ct_pos_print_classes/g, '')));
// The BADGE markup, not the phrase: "in the register" is ordinary prose in a dozen
// comments about where the menu files live, and matching on the phrase failed on the
// comment that explains this very removal.
ok('the "in the register" badge is gone with them', !/>in the register<\/span>/.test(src));

// posNewClasses is HIS list and must survive all of the above — it is a different
// thing that happens to share a name.
ok('his own classes still save and load under ct_pos_print_classes',
   src.includes("kvPush('ct_pos_print_classes',posNewClasses") && src.includes("kvGet('ct_pos_print_classes')"));

// ── the dropdown is built from his classes only ──────────────────────────────
const opts = fn('posRouteOptions');
ok('posRouteOptions exists', !!opts);
ok('it starts from an empty list, not from the catalogue', /const out=\[\];/.test(opts));
ok('it offers his classes', /for\(const c of posNewClasses\)/.test(opts));
ok('…a single-printer route per real printer', /for\(const p of posPrinters\(\)\)/.test(opts));
ok('…and an explicit "prints nowhere", so unrouted is a choice rather than a blank',
   /id:'none',label:'— prints nowhere —'/.test(opts));
ok('no class is labelled "(new)" any more — they are all his, so the word said nothing',
   !/\(new\)/.test(opts));

// ── one list of printers, not two ────────────────────────────────────────────
// The stats row reads the catalogue's printers; the chips used to read a hardcoded
// constant, and the two had already drifted — the constant still carried Expo, which
// Angeli's stopped printing to on 8/28/26 and which the catalogue never listed.
ok('the printer list comes from the catalogue, with the constant only as a fallback',
   /const posPrinters=\(\)=>\(\(posS\.cat&&posS\.cat\.printers\)\|\|POS_PRINTERS\)/.test(src));
const consts = (src.match(/const POS_PRINTERS=\[([^\]]*)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
ok(`the fallback was found (${consts.join(', ')})`, consts.length > 0);
ok('…and it matches the catalogue exactly, so the fallback cannot offer a printer the real list lacks',
   JSON.stringify(consts) === JSON.stringify(cat.printers));
ok('Expo is offered by neither', !consts.includes('Expo') && !(cat.printers || []).includes('Expo'));
ok('nothing in the catalogue routes to Expo, which is why dropping it strands nothing',
   !(cat.items || []).some((i) => (i.printers || []).includes('Expo')));

// A printer that no longer exists must still show on a class that already carries it,
// or the class keeps routing there with no chip left to untick.
const chips = (src.match(/const posClassChips=\(pc\)=>\{[\s\S]{0,260}?\};/) || [''])[0];
ok('a class still shows a printer the list no longer has, so a dead route stays visible',
   /\.filter\(p=>!live\.includes\(p\)\)/.test(chips));

// ── the section does not read as broken when empty ───────────────────────────
const html = fn('posClassesHTML');
ok('an empty list says so instead of showing a lone button', /No print classes yet/.test(html));

// ── the invariant the wipe rested on ─────────────────────────────────────────
ok('⚠️ routing is still stored as printer names, not class ids', /itemKey -> \['Main','Pizza'\]/.test(src));
ok('…and posSetRoute writes the option\'s PRINTERS onto the item', /posRouting\[key\]=opt\.printers/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
