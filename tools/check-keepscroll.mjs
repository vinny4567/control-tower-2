// WORKING DOWN A LIST MUST NOT THROW AWAY YOUR PLACE.
//
//     node tools/check-keepscroll.mjs
//
// The job on the items tab is to go down nine hundred rows typing prices. Every edit
// rebuilds the tab — the gap counters and the publish state at the top are read off the
// same data — and the rebuild kept costing the scroll position, so every single price
// sent Vinny back to the top. It has regressed once already. This is why.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (what, cond) => { if (!cond) bad++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

const fn = src.slice(src.indexOf('function posKeepScroll('),
                     src.indexOf('const posMoney='));
ok('posKeepScroll exists at all', fn.length > 40);

// ---- ⚠️ THE REGRESSION -----------------------------------------------------------
// It used to resolve the scroller ONCE, before fn(). renderViewport() replaces the
// tab's contents, so that element is detached by the time the scroll is put back, and
// setting scrollTop on a detached node is a silent no-op — it only appeared to work
// when the match happened to be #viewport, which survives an innerHTML swap.
ok('⚠️ the scroller is looked up through a function, not captured once',
   /const find\s*=\s*\(\)\s*=>/.test(fn));
const puts = fn.slice(fn.indexOf('const put='));
ok('⚠️ and the restore re-finds it AFTER the rebuild', /const sc\s*=\s*find\(\)/.test(puts));
ok('the rebuild really does run between the two', /\n\s*fn\(\);/.test(fn));

// ---- THE PAGE SCROLL COUNTS TOO --------------------------------------------------
// Replacing the innerHTML of a tall container collapses its height for an instant; the
// browser clamps the page scroll to the new maximum and the position is gone before
// anything is put back. Indistinguishable from the inner scroller losing its place.
ok('the window position is remembered', /window\.scrollY/.test(fn));
ok('and restored', /window\.scrollTo\(0,\s*win\)/.test(fn));

// ---- AND AGAIN AFTER LAYOUT ------------------------------------------------------
// Height comes back a frame later. Until it does, anything set above the briefly
// shorter maximum is clamped straight back down.
ok('⚠️ the restore is repeated after a frame', /requestAnimationFrame\(put\)/.test(fn));

// Every path that rebuilds after an edit has to go through it.
for (const [what, near] of [
  ['a price edit', 'function posSetPrice('],
  ['a discount rate edit', "kvPush('ct_pos_disc_rates'"],
]) {
  const i = src.indexOf(near);
  ok(`${what} keeps your place`, i > 0 && src.slice(i, i + 900).includes('posKeepScroll('));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
