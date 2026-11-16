// Does the Menu-items dropdown tell the truth about register buttons?
//
//     node tools/check-buttons.mjs
//
// Vinny asked to have his menu categories connected to the actual buttons on the
// register. The first step is saying which ones already are — and the failure mode of
// that step is not a crash, it is a CONFIDENT WRONG ANSWER. The design brief for this
// work invented a category ('Baked') that does not exist in the Watch Tower; if this
// screen invents a button, Vinny reorganises his menu around a mapping nobody has.
//
// So the invariant under test is a three-state one, which no regex can express:
//
//   undefined  the register's export is not on the page → SAY NOTHING. Do not annotate,
//              and above all do not flag categories as having no button.
//   null       the export IS here and nothing opens this category → flag it.
//   string     the export says which button opens it.
//
// The middle state is the dangerous one to lose: collapse `undefined` into `null` and
// every category on the page gets flagged "no register button opens these" the moment
// pos-buttons.json is missing — which is its state right now, before the register
// session exports it. That reads as "your menu is not wired up" about a menu that is
// entirely wired up.
//
// The functions are RUN, not grepped, for that reason.
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
let bad = 0;

const cut = (a, b, what) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j <= i) { ok(`ANCHOR: ${what} still found in index.html`, false); return ''; }
  return src.slice(i, j);
};
const WINE = cut('const POS_WINE_SECTIONS=', 'const posPublishAs=', 'the wine sections');
const BTN  = cut('let posButtons=null;', 'function posPendingCount(', 'the button mapper and the dropdown');

// Parsed by STRUCTURE, never by heading wording. The first draft of this file asserted
// the literal strings "Opens from a register button" and "Modifiers (not register
// buttons)", so rewording a heading turned it red — and a check that screams for a
// reword teaches whoever meets it to delete the clause. What matters is which option
// sits in which group, and that the groups are distinct.
const groups = (html) => [...html.matchAll(/<optgroup label="([^"]*)">([\s\S]*?)<\/optgroup>/g)]
  .map((m) => ({ label: m[1], vals: [...m[2].matchAll(/value="([^"]*)"/g)].map((x) => x[1]) }));
const loose = (html) => [...html.replace(/<optgroup[\s\S]*?<\/optgroup>/g, '')
  .matchAll(/value="([^"]*)"/g)].map((x) => x[1]);
const groupOf = (html, val) => (groups(html).find((g) => g.vals.includes(val)) || {}).label;

let S = null;
if (WINE && BTN) {
  try {
    S = new Function(`
      const POS_HIDDEN_CATS=new Set(['Wine','DISCOUNTS']);
      const esc=(v)=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const posS={catFilter:'all'};
      const posRedraw=()=>{};
      ${WINE}
      ${BTN}
      return {posButtonFor,posCatOptions,POS_WINE_SECTIONS,POS_GROUPS_CAT,posS,
              set buttons(b){posButtons=b},get buttons(){return posButtons}};`)();
  } catch (e) { ok('the lifted mapper evaluates: ' + e.message, false); }
}
ok('the button mapper and the dropdown lift and run', !!(S && S.posButtonFor));
if (!S || !S.posButtonFor) { console.log(`\n${bad} FAILED`); process.exit(1); }

// ── 1. NO EXPORT YET: say nothing, flag nothing. This is today's real state.
S.buttons = null;
ok('with no pos-buttons.json, a category’s button is UNKNOWN (undefined), not "none" (null)',
   S.posButtonFor('Pasta') === undefined);
const cats = ['Appetizers', 'Pasta', 'GOLF', 'Food Mods', 'Wine', 'DISCOUNTS', 'Specials'];
const blind = S.posCatOptions(cats);
ok('…so no category is put in a "nothing opens these" group',
   groups(blind).length === 1 && (groups(blind)[0].vals || []).includes(S.POS_GROUPS_CAT));
ok('…and the sellable categories are left UNGROUPED, so the dropdown reads as it does today',
   loose(blind).includes('Pasta') && loose(blind).includes('Specials'));
ok('…and no category carries a button annotation', !/rail #/.test(blind));

// ── 2. THE MODIFIERS GROUPING, which needs no export at all.
{
  const g = groups(blind).find((x) => x.vals.includes(S.POS_GROUPS_CAT));
  ok('Food Mods and Mod groups share one group of their own, apart from the sellable categories',
     !!g && g.vals.includes('Food Mods') && g.vals.includes(S.POS_GROUPS_CAT)
     && !g.vals.includes('Pasta') && !g.vals.includes('Appetizers'));
  ok('…and neither is left loose among the sellable categories',
     !loose(blind).includes('Food Mods') && !loose(blind).includes(S.POS_GROUPS_CAT));
}
ok('Mod groups is offered exactly once', (blind.match(/Mod groups/g) || []).length === 1);
ok('…and still offered when no catalogue row is a Food Mod',
   (S.posCatOptions(['Pasta']).match(/Mod groups/g) || []).length === 1);
ok('the hidden categories never reach the dropdown',
   !blind.includes('>Wine<') && !blind.includes('DISCOUNTS'));

// ── 3. WITH AN EXPORT: the real five-structure shape, as menu.js actually holds it.
S.buttons = {
  food: ['N/A BEVS', 'Appetizers', 'Soup & Salad', 'Chicken', 'Pasta', 'Specials'],
  bar: [{ cat: 'N/A BEVS' }, { cat: 'VODKA' }, { cat: 'GIN' }, { cat: 'CORDIALS' }],
  openers: [{ cat: 'BEER', label: 'BEER', where: 'bar top' },
            { cat: 'RED WINE', label: 'RED WINE', where: 'bar bottom' },
            { cat: 'GOLF', label: 'GOLF', where: 'food bottom' }],
};
ok('a food category reports its FOOD rail position, 1-based', S.posButtonFor('Pasta') === 'FOOD rail #5');
ok('a bar category reports its LIQUOR rail position', S.posButtonFor('GIN') === 'LIQUOR rail #3');
ok('a rail entry spelled as a plain string works the same as an object',
   S.posButtonFor('Appetizers') === 'FOOD rail #2' && S.posButtonFor('VODKA') === 'LIQUOR rail #2');
ok('a bottom/top button reports itself and where it sits',
   S.posButtonFor('GOLF') === 'GOLF button (food bottom)');
ok('a category the export does not mention is NONE (null), not unknown',
   S.posButtonFor('Pizza') === null);
// Deliberate tolerance, tested on purpose: this reader guessed `extra` before the
// exporter existed, so an older hand-made file still resolves rather than silently
// flagging five buttons as unwired. Removing it is a regression, not a cleanup.
ok('a legacy file spelling the openers `extra` still resolves',
   (() => { const keep = S.buttons;
            S.buttons = { food: [], bar: [], extra: [{ cat: 'BEER', label: 'BEER' }] };
            const r = S.posButtonFor('BEER'); S.buttons = keep; return r === 'BEER button'; })());

// ── 4. THE FOUR WINE SECTIONS are Watch Tower display sections of TWO register
// categories — Vinny's answer #2. Each must name the button AND which page it opens.
ok('a wine GLASS section points at its register button and the glass page',
   S.posButtonFor('RED WINE GLASS') === 'RED WINE button (bar bottom), glass page');
ok('…and the BOTTLE section at the bottle page of the SAME button',
   S.posButtonFor('RED WINE BOTTLE') === 'RED WINE button (bar bottom), bottle page');
ok('…and a wine section whose register category has no button is NONE, not a false button',
   S.posButtonFor('WHITE WINE GLASS') === null);
ok('…and with no export at all a wine section is UNKNOWN, not NONE',
   (() => { const keep = S.buttons; S.buttons = null;
            const r = S.posButtonFor('RED WINE GLASS'); S.buttons = keep; return r === undefined; })());

// ── 5. THE GROUPED DROPDOWN.
const shown = S.posCatOptions(['Appetizers', 'Pasta', 'GOLF', 'Pizza', 'Food Mods', 'Wine']);
ok('once the export is here, the wired categories are gathered into a group of their own',
   !!groupOf(shown, 'Pasta') && !loose(shown).includes('Pasta'));
ok('…annotated with the button that opens them', shown.includes('Pasta  —  FOOD rail #5'));
ok('an unwired category goes in a DIFFERENT group from a wired one',
   !!groupOf(shown, 'Pizza') && groupOf(shown, 'Pizza') !== groupOf(shown, 'Pasta'));
ok('…and not in with the modifiers either — three distinct groups',
   groupOf(shown, 'Pizza') !== groupOf(shown, S.POS_GROUPS_CAT)
   && new Set(groups(shown).map((g) => g.label)).size === 3);
ok('…and the unwired group is the one that warns, whatever it is worded as',
   /[⚠!]/.test(String(groupOf(shown, 'Pizza'))));
ok('every option still carries a plain value the filter can use, annotation or not',
   /<option value="Pasta"/.test(shown) && /<option value="Pizza"/.test(shown));
// Asked properly: set the filter and look. (This assertion first shipped with a
// `|| true` on the end, which made it green for every possible input.)
S.posS.catFilter = 'Pizza';
const sel = S.posCatOptions(['Pasta', 'Pizza']);
S.posS.catFilter = 'all';
ok('the category currently filtered on is still marked selected, annotation or not',
   /<option value="Pizza"\s+selected/.test(sel) && !/<option value="Pasta"\s+selected/.test(sel));

// ── 6. PROVENANCE: the export has to come from structures that still exist in the
// register's source. Skips cleanly on a machine without the register repo.
const MENU = new URL('../../angelis-pos/pos/src/menu.js', import.meta.url);
if (!existsSync(MENU)) {
  console.log('  --   angelis-pos not on this machine — rail provenance not checked');
} else {
  const m = readFileSync(MENU, 'utf8');
  for (const name of ['RAIL_ORDER', 'BAR_CATS', 'BAR_TOP', 'BAR_FUNCS', 'FOOD_FUNCS'])
    ok(`the register still exports ${name} for the exporter to read`,
       new RegExp(`export const ${name}\\s*=`).test(m));
  // ⛔ STRIP THE COMMENTS BEFORE TESTING ANY OF THIS. The 'Wine' assertion below used to read
  // the raw slice, and when POS-UI actually removed 'Wine' from RAIL_ORDER (angelis-pos
  // 1693540) it kept passing — because the line they left in its place is
  //     // ('Wine' came off 11/15: it is the hidden parent of RED WINE / WHITE WINE …)
  // and a comment is not a behaviour. That is the second time in one day a regex over source
  // was satisfied by prose about the code instead of the code (the other was the send
  // receipt's `menu.buttons` pin). Any regex over a foreign file strips comments first.
  const code = (x) => String(x || '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const rail = code((m.match(/export const RAIL_ORDER = \[([\s\S]*?)\];/) || [, ''])[1]);
  ok('⚠️ RAIL_ORDER still holds the bar categories too, so it is NOT the food rail',
     /VODKA/.test(rail) && /Appetizers/.test(rail));
  // ⚠️ These two used to pin a DEFECT ("still carries Wine", "GOLF still has no cat"), as
  // tripwires to tell me when POS-UI fixed them. They both fired, which is what they were for
  // — and a pin on someone else's transient state goes stale by design. They now assert the
  // thing that must hold whichever way that file moves: THE EXPORT AND THE REGISTER AGREE.
  // The export is read here rather than reusing BTN — BTN is a SOURCE SLICE of index.html,
  // not the JSON, and `[...BTN.food]` on a string is how this crashed first time round.
  const EXPF = new URL('../pos-buttons.json', import.meta.url);
  const EXP = existsSync(EXPF) ? JSON.parse(readFileSync(EXPF, 'utf8')) : null;
  const exportCats = EXP ? [...(EXP.food || []), ...(EXP.bar || [])].map((e) => (typeof e === 'string' ? e : e.cat)) : null;
  ok(EXP ? '‘Wine’ is on neither the register’s rail order nor the export’s rails — they agree'
         : '‘Wine’ agreement not checked — no pos-buttons.json',
     !EXP || (!/'Wine'/.test(rail) === !exportCats.includes('Wine')));
  const funcs = code((m.match(/export const FOOD_FUNCS = \[([\s\S]*?)\n\];/) || [, ''])[1]);
  const openerCat = (lbl) => {
    const o = EXP && (EXP.openers || EXP.extra || EXP.other || []).find((e) => e && e.label === lbl);
    return o ? o.cat : null;
  };
  for (const lbl of ['GOLF', 'Sides']) {
    const re = new RegExp("label: '" + lbl + "'[^}]*cat: '([^']+)'");
    const hit = funcs.match(re);
    ok(`…and ${lbl} carries the same cat in FOOD_FUNCS as the export emits`
       + (hit ? ` (‘${hit[1]}’)` : ' — neither has one'),
       !EXP || (hit ? openerCat(lbl) === hit[1] : !openerCat(lbl)));
  }
}

// ── 7. THE REAL FILE, against the real catalogue. Fixtures prove the three states; this
// proves the shipped pair actually agree. The key name is the whole risk: the exporter
// calls the non-rail buttons `openers`, and this reader guessed `extra` before the file
// existed — with that mismatch BEER, GOLF, Sides and both wines (so all four wine
// sections) fall to null and get flagged "no register button opens these", which is the
// false alarm the three states were built to prevent. A blank is honest; a false alarm
// about a menu that is entirely wired up is not.
const BTNF = new URL('../pos-buttons.json', import.meta.url);
const CATF = new URL('../pos-catalog.json', import.meta.url);
if (!existsSync(BTNF)) {
  console.log('  --   pos-buttons.json not committed yet \u2014 real-file agreement not checked');
} else {
  const B = JSON.parse(readFileSync(BTNF, 'utf8'));
  S.buttons = B;
  ok('the committed pos-buttons.json has the rails and the openers the reader needs',
     Array.isArray(B.food) && Array.isArray(B.bar) && Array.isArray(B.openers) && B.openers.length > 0);
  ok('\u26a0\ufe0f the non-rail buttons are read from the key the EXPORTER owns (`openers`)',
     !!S.posButtonFor(B.openers[0].cat));
  for (const o of B.openers)
    ok(`\u2026so the ${o.cat} button resolves instead of being flagged unwired`,
       typeof S.posButtonFor(o.cat) === 'string');
  ok('a rail category still resolves to its position',
     S.posButtonFor(B.food[0].cat) === 'FOOD rail #1'
     && S.posButtonFor(B.bar[B.bar.length - 1].cat) === 'LIQUOR rail #' + B.bar.length);
  ok('\u2026and the opener label composes page and row: "(LIQUOR, top row)"',
     S.posButtonFor('BEER') === 'BEER button (LIQUOR, top row)');
  // The four WT wine sections must name the register's OWN page names.
  const wsecs = Object.keys(S.POS_WINE_SECTIONS);
  ok('all four wine sections resolve through the two wine buttons',
     wsecs.length === 4 && wsecs.every((k) => typeof S.posButtonFor(k) === 'string'));
  ok('\u2026naming the pages the register itself calls them, not a word invented here',
     S.posButtonFor('RED WINE GLASS') === 'RED WINE button (LIQUOR, bottom row), BY THE GLASS page'
     && S.posButtonFor('RED WINE BOTTLE') === 'RED WINE button (LIQUOR, bottom row), BOTTLES page');

  if (!existsSync(CATF)) {
    console.log('  --   pos-catalog.json not here \u2014 catalogue coverage not checked');
  } else {
    const cat = JSON.parse(readFileSync(CATF, 'utf8'));
    const hidden = new Set(['Wine', 'DISCOUNTS']);
    const groups = [...new Set((cat.items || []).map((i) => (i && i.group) || (i && i.cat) || ''))]
      .filter((g) => g && !hidden.has(g) && g !== 'Food Mods');
    const unwired = groups.filter((g) => S.posButtonFor(g) === null);
    ok(`EVERY category in the catalogue opens from a register button (${groups.length} checked)${
         unwired.length ? ' \u2014 UNWIRED: ' + unwired.join(', ') : ''}`,
       groups.length > 0 && unwired.length === 0);
    ok('\u2026and Specials, which no catalogue row fills, is on the rail too',
       typeof S.posButtonFor('Specials') === 'string');
    ok('\u2026while \u2018Wine\u2019 is deliberately absent from the export, so it stays hidden here',
       ![...(B.food || []), ...(B.bar || []), ...(B.openers || [])].some((e) => (e.cat || e) === 'Wine'));
  }
  S.buttons = null;
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
