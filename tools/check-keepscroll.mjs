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

// 11/20/26: posKeepScroll, posRedraw and the Tips/Staff redraws all go through ONE helper,
// posRedrawKeepScroll (the old "first element that overflows" lookup found the SIDEBAR at a
// short iPad height and the list snapped to the top). Every rule below is about that helper.
const brace = (from) => { const i = src.indexOf(from); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };
const fn = brace('function posRedrawKeepScroll(');
ok('posKeepScroll exists at all, and IS the shared helper', fn.length > 40 && /function posKeepScroll\(fn\)\{posRedrawKeepScroll\(fn\);\}/.test(src));

// ---- ⚠️ THE REGRESSION -----------------------------------------------------------
// It used to resolve the scroller ONCE, before fn(). renderViewport() replaces the
// tab's contents, so that element is detached by the time the scroll is put back, and
// setting scrollTop on a detached node is a silent no-op — it only appeared to work
// when the match happened to be #viewport, which survives an innerHTML swap.
ok('⚠️ the scrollers are looked up through a function, not captured once',
   /posScrollers\(\)\.forEach\(\(\[k,el\]\)=>\{before\[k\]=el\.scrollTop;\}\)/.test(fn));
const puts = fn.slice(fn.indexOf('const put='));
ok('⚠️ and the restore re-finds them AFTER the rebuild, by role', /posScrollers\(\)\.forEach\(\(\[k,el\]\)=>\{if\(before\[k\]!=null/.test(puts));
ok('⛔ by ROLE — never "the first element that overflows" (that found the sidebar on a short iPad)', !/scrollHeight>e\.clientHeight/.test(brace('function posScrollers(')) && !/function posScroller\(/.test(src));
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
ok('…and the caret is put back on the rebuilt box (data-pf), without scrolling to it', /data-pf/.test(fn) && /preventScroll:true/.test(fn));

// Every path that rebuilds after an edit has to go through it.
for (const [what, near] of [
  ['a price edit', 'function posSetPrice('],
  ['a discount rate edit', "kvPush('ct_pos_disc_rates'"],
]) {
  // the whole function when `near` starts one (a fixed 900-char window went blind the
  // moment a comment grew the function), else a window around the call site
  const i = src.indexOf(near);
  let body = src.slice(i, i + 900);
  if (i > 0 && near.startsWith('function ')) { let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { body = src.slice(i, k + 1); break; } } } }
  ok(`${what} keeps your place`, i > 0 && body.includes('posKeepScroll('));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
