// Does Publish always emit a blob the mini will ACCEPT?
//
//     node tools/check-publish-shape.mjs
//
// The mini's relay (angelis-pos server/menu.js, valid()) checks the top level only:
// `items` must be an object, `deleted` and `added` must be arrays. If any of the three
// is missing it rejects the WHOLE blob and keeps serving the last good copy — SILENTLY.
// Not stale, no error, nothing in the UI: the publish simply never lands.
//
// That makes a leaner payload the most dangerous kind of tidy-up anybody could do here
// (a "rename-only" blob, say). This is the check that turns an agreement between two
// sessions into something the repo enforces.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ok = (t, c) => console.log((c ? '  ok  ' : '  FAIL') + '  ' + t);

const grab = (name) => {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
};

// The mini's own rule, copied here deliberately rather than imported — if the relay
// ever tightens it, this line is what somebody edits, and the checks below then say
// which publishes would stop landing.
const miniAccepts = (o) => !!o && typeof o === 'object'
  && o.items && typeof o.items === 'object'
  && Array.isArray(o.deleted) && Array.isArray(o.added);

const state = {
  rows: [], modNames: {}, deleted: [], added: [],
  groups: { groups: {}, attach: {}, detach: {}, gone: [] },
};
const ctx = {
  posAllRows: () => state.rows,
  posEntered: (r) => r.entered, posPriceOf: (r) => r.newCents,
  posRerouted: (r) => !!r.rerouted, posRoutedTo: (r) => r.routes,
  posModNames: state.modNames,
  posDeletedItems: state.deleted, posNewItems: state.added,
  posBuildGroups: () => state.groups,
  posS: { cat: { generated_at: '2026-09-17' } },
  Object, Date, Array, String, JSON, console,
};
const build = new Function('ctx', 'with(ctx){' + grab('posBuildLive') + '\nreturn posBuildLive;}')(ctx);

// 1. the empty case — nothing edited at all
let b = build();
ok('an empty publish is still ACCEPTED by the mini', miniAccepts(b));
ok('  items is an object', b.items && typeof b.items === 'object');
ok('  deleted is an array', Array.isArray(b.deleted));
ok('  added is an array', Array.isArray(b.added));

// 2. a rename ONLY — the payload that would be most tempting to slim down
state.rows = [{ key: 'm:RED WINE BOTTLE:Mezzacorona Cab — BTL', name: 'Mezzacorona Cab — BTL', cents: 3200 }];
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezzacorona Cabernet';
b = build();
ok('A RENAME-ONLY publish is accepted', miniAccepts(b));
ok('and the rename is in it', b.items['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'].name === 'Mezzacorona Cabernet');
ok('under the ORIGINAL key — never a new one',
   Object.keys(b.items).every((k) => k.endsWith('Mezzacorona Cab — BTL')));

// 3. renaming to the same name is not an edit
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezzacorona Cab — BTL';
b = build();
ok('renaming something to what it already was publishes nothing',
   Object.keys(b.items).length === 0);

// 4. a price and a rename together
state.modNames['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'] = 'Mezza Cab';
state.rows[0].entered = true; state.rows[0].newCents = 3400;
b = build();
const e = b.items['m:RED WINE BOTTLE:Mezzacorona Cab — BTL'];
ok('a rename and a reprice travel together', e.name === 'Mezza Cab' && e.cents === 3400);
ok('and the blob is still accepted', miniAccepts(b));

// 5. the thing the mini needs that is easiest to drop by accident
ok('the blob names its catalog so the register knows what it sits on', 'base' in b);
ok('every publish carries a timestamp', typeof b.at === 'number' && b.at > 0);
