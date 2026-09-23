// EVERYTHING THE BACK OFFICE SAVES MUST EITHER PUBLISH, OR SAY WHY NOT.
//
//     node tools/check-publish-covers.mjs
//
// ⚠️ THIS IS THE ONE THAT SHOULD HAVE EXISTED FIRST.
//
// posBuildLive carries a HAND-MAINTAINED list of edit types, so every new kind of
// back-office edit has to be remembered and added to it. Three times it was not, and
// every time the failure was the same and silent: the edit saved, the screen showed it,
// Publish said it went, and the register never heard. In order —
//
//   · a wine RENAME saved to ct_pos_mod_names, which nothing read
//   · MOD PRICES published fine and the register never applied them to its mod pages
//   · a NEW FOOD MOD saved, drew a row marked "new", and never rode the publish at all
//
// Vinny, 9/23, after the third: "get this publish button down correctly it has never
// once been consistent." He is right, and the fix is not a fourth patch — it is this
// check. Every ct_pos_* store the back office writes must be accounted for: carried in
// the publish, or listed below as deliberately local with a reason. Add a new store and
// forget it, and this fails by name.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${t}`); };

// Every key the POS back office pushes to the cloud.
const written = [...new Set([...html.matchAll(/kvPush\('(ct_pos_[a-z_]+)'/g)].map((m) => m[1]))].sort();
ok('found the back office stores (' + written.length + ')', written.length >= 10);

// What posBuildLive actually reads. Taken from the function itself rather than a list
// kept beside it — a list beside it is the thing that goes stale.
const build = html.slice(html.indexOf('function posBuildLive()'),
                         html.indexOf('async function posPublishSend'));
const groups = html.slice(html.indexOf('function posBuildGroups()'),
                          html.indexOf('function posBuildGroups()') + 2600);
const published = build + groups;

// store -> the variable posBuildLive would have to touch for it to travel.
const VAR = {
  ct_pos_prices: 'posPriceOf', ct_pos_routing: 'posRoutedTo', ct_pos_mod_names: 'posModNames',
  ct_pos_deleted_items: 'posDeletedItems', ct_pos_new_items: 'posNewItems',
  ct_pos_new_mods: 'posNewMods', ct_pos_disc_rates: 'posDiscRates',
  ct_pos_group_mods: 'posGroupMods', ct_pos_new_groups: 'posNewGroups',
  ct_pos_group_attach: 'posGroupAttach', ct_pos_group_detach: 'posGroupDetach',
  ct_pos_group_names: 'posGroupNames', ct_pos_choice_edits: 'posChoiceEdits',
  ct_pos_choice_cuts: 'posChoiceCuts', ct_pos_choice_order: 'posChoiceOrder',
  ct_pos_deleted_groups: 'posDeletedGroups', ct_pos_deleted_mods: 'posDeletedMods',
  ct_pos_mod_letters: 'posModLetters',
  ct_pos_deleted_mods: 'posDeletedMods',
};

// Deliberately NOT published — each with the reason, because "we meant to" is the only
// thing separating this list from the bug it exists to catch.
const LOCAL_ONLY = {
  ct_pos_print_classes: 'print classes are the mini\'s own table; the register never reads them',
  ct_pos_section_adds: 'which section a back-office screen shows an item in — a back-office view, not a register one',
  ct_pos_item_group_order: 'the order groups are LISTED in the back office, not the order the register asks them',
};

for (const key of written) {
  if (LOCAL_ONLY[key]) {
    ok(`${key} is deliberately local — ${LOCAL_ONLY[key]}`, true);
    continue;
  }
  const v = VAR[key];
  ok(`⚠️ ${key} reaches the register` + (v ? '' : ' — NO VARIABLE MAPPED, add it to VAR or LOCAL_ONLY'),
     !!v && published.includes(v));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
