// THE TAB BAR'S ORDER, AND THE ONE THING ITS ORDER BREAKS.
//
//     node tools/check-tabbar.mjs
//
// ▥ Split sits FIRST, ahead of Dashboard (Vinny, 11/8/26) — it is an action you reach
// for, not a place you go, and at the far end of eleven tabs it scrolled off the iPad.
// The ＋ stays last.
//
// ⚠️ THE MOVE HAS A COST THAT IS INVISIBLE UNTIL SPLIT IS ON. The split tab carries
// `active` whenever split is open, so with it in first position the bar holds TWO
// `.tab.active` elements and the split one comes first in the DOM. The keep-the-active-
// tab-in-view line at the end of renderTabs() does a bare querySelector, which takes
// the FIRST match — so it would scroll the bar to the split tab at position 0 and leave
// the tab you are actually on off-screen. Measured in the browser, split on, POS
// active: `:not(.tab-split)` lands the bar at 782px with POS in view; without it the
// bar snaps to 0. Split OFF behaves identically either way, which is exactly why this
// would never show up in ordinary use — and why it is asserted here instead.
//
// The old arrangement got that scoping for free: every switchTab tab came before the
// split tab, so the first `.tab.active` in the DOM was always the real one. Whoever
// reorders these tabs next inherits the problem, not the luck.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (what, cond) => { if (!cond) bad++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

const start = src.indexOf('function renderTabs(');
ok('renderTabs exists', start > 0);
const end = src.indexOf('\n// ═══', start);
const fn = src.slice(start, end > start ? end : start + 6000);

// ── the order ────────────────────────────────────────────────────────────────
const at = (needle) => fn.indexOf(needle);
ok('the ▥ split tab is still in the bar', at('tab-split') > 0 && at('▥') > 0);
// Counted on the rendered class, not the bare word: the word also appears in this
// function's own comment and in the `:not(.tab-split)` selector below.
ok('there is exactly ONE of it (a second one would be a second `.tab.active`)',
   fn.split('class="tab tab-split').length - 1 === 1);
ok('it comes FIRST — before Dashboard', at('tab-split') < at('📊 Dashboard'));
ok('…and before every switchTab tab, not just Dashboard',
   at('tab-split') < at('switchTab'));
ok('Dashboard is still the first tab you can switch TO', at('📊 Dashboard') < at('📧 Email'));

// ＋ last. Compared against the last `class="tab` of any kind, so adding a tab after it
// fails here rather than quietly burying it.
const lastTabDecl = fn.lastIndexOf('class="tab');
ok('the ＋ add-panel tab is still last', at('tab-add') > 0 && fn.indexOf('tab-add') >= lastTabDecl - 6);

// ── what the order breaks ────────────────────────────────────────────────────
ok('⚠️ the keep-in-view selector SKIPS the split tab, so split-on does not yank the bar to 0',
   /querySelector\('#tab-list \.tab\.active:not\(\.tab-split\)'\)/.test(fn));
ok('…and there is no bare `.tab.active` querySelector left anywhere',
   !/querySelector\('#tab-list \.tab\.active'\)/.test(src));
ok('the split tab is the thing that can be active besides a real tab, so it is still marked from splitState',
   /tab tab-split \$\{splitState\(\)\.on\?'active':''\}/.test(fn));
ok('and it still toggles rather than switching tabs', /class="tab tab-split[^"]*"[^>]*onclick="splitToggle\(\)"/.test(fn));

// ── it is still reachable ────────────────────────────────────────────────────
// Being first is the whole point of the move; a hidden first tab is no better than a
// buried last one. The narrow-screen rule is deliberate (the side pane cannot fit), so
// this asserts the breakpoint still only applies there.
// The media query body has nested braces, so it is read to the end of its line rather
// than matched with a [^}] run — that pattern passed on nothing and would have reported
// a rule that had been deleted as present.
const narrow = (src.match(/@media \(max-width:820px\)\{.*/) || [''])[0];
ok('split is hidden only on narrow screens, where the side pane cannot fit anyway',
   narrow.includes('.tab-split{display:none}'));
ok('…and that rule was actually found, not matched against an empty string',
   narrow.length > 60);
ok('the bar still scrolls, so a long tab list cannot strand anything',
   src.includes("el.scrollLeft+=e.deltaY") && src.includes('tab-nav-l') && src.includes('tab-nav-r'));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
