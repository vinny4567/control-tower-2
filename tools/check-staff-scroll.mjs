// SCROLL POSITION ON A STAFF WRITE — Vinny, 11/20/26: "deleting someone from the staff
// list snaps me back up to the top of the page."
//
//     node tools/check-staff-scroll.mjs
//
// Root cause: staffLoad's success path redrew via renderViewport(), which replaces the
// WHOLE #viewport — including the POS content pane that actually holds the scroll — so
// the pane (and its scrollTop) was rebuilt from scratch on EVERY staff write (every
// staffWriteOp calls staffLoad(true) after success). Fix: a scoped refresh per section
// (staffRefresh() for Staff, posJobRatesRefresh() for Job rates), same pattern already
// proven elsewhere in this file (staffRefresh only ever touches #staff-body).
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

// ── SOURCE: the success path uses scoped refreshes, never a full renderViewport() ──
const staffLoadFn = grab('staffLoad');
// Isolate just the success branch (up to the first `return;` after the mini read), so a
// fix applied only to the OTHER (read-only fallback) branch doesn't false-pass this.
const successBranch = staffLoadFn.slice(0, staffLoadFn.indexOf('staffReconcileJobNums();'));
ok('⛔ the success path refreshes Staff with staffRefresh() (scroll-preserving), not renderViewport()',
   /if\(activeTab===POS&&posS\.sec==='staff'\)staffRefresh\(\);/.test(successBranch));
ok('⛔ …and Job rates with its own scoped refresh, same reason',
   /if\(activeTab===POS&&posS\.sec==='jobrates'\)posJobRatesRefresh\(\);/.test(successBranch));
ok('⛔ the success path never calls the whole-viewport renderViewport() for staff/jobrates at all',
   !/renderViewport\(\)/.test(successBranch.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')));

// ── RUN: the real staffRefresh() preserves the ancestor pane's scrollTop ────────────
function world({ staffBodyHtml = '<div>list</div>' } = {}) {
  const ctx = {};
  new Function('ctx', `
    function staffBodyHTML(){return ${JSON.stringify(staffBodyHtml)};}
    function staffDupesHTML(){return '';}
    function staffPendingCardHTML(){return '';}
    function staffFillDeptHTML(){return '';}
    ${grab('staffRefresh')}
    ctx.run = staffRefresh;
  `)(ctx);
  return ctx;
}
{
  // Simulate the real DOM shape: a scrollable POS pane (inline overflow-y, the thing
  // staffRefresh's .closest('[style*="overflow-y"]') is written to find) containing
  // #staff-body, which a staff write replaces.
  const pane = { style: { overflowY: 'auto' }, scrollTop: 480, attrs: { style: 'flex:1;overflow-y:auto' } };
  const staffBody = { id: 'staff-body', innerHTML: '<div>old list</div>', parent: pane };
  // Minimal DOM stand-in: closest() walks via .parent; getAttribute reads the fake attr.
  staffBody.closest = (sel) => {
    let n = staffBody.parent;
    while (n) { if (sel.includes('overflow-y') && n.attrs && /overflow-y/.test(n.attrs.style || '')) return n; n = n.parent; }
    return null;
  };
  Object.defineProperty(staffBody, 'style', { value: {} });
  const els = { 'staff-body': staffBody, 'staff-dupes': null, 'staff-pending': null, 'staff-filldept': null, viewport: { scrollTop: 0 } };
  const document_ = { getElementById: (id) => els[id] || null };
  const w = world();
  // staffRefresh references the global `document` — construct it in the same scope.
  const run = new Function('document', 'staffDupesHTML', 'staffPendingCardHTML', 'staffFillDeptHTML', 'staffBodyHTML',
    `${grab('staffRefresh')}\nreturn staffRefresh;`
  )(document_, () => '', () => '', () => '', () => '<div>new list</div>');
  run();
  ok('⛔ the ancestor pane (the actual scrollable element) keeps its scrollTop across the refresh', pane.scrollTop === 480);
  ok('…and the body itself is the one that actually re-rendered', staffBody.innerHTML === '<div>new list</div>');
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
