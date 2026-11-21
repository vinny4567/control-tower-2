// NO ACTION IN TIPS OR STAFF MAY MOVE THE SCROLL — Vinny, 11/20/26: "make sure it doesnt snap
// me back up after pressing something in the dropdown, that seems to be a reoccuring theme."
//
//     node tools/check-scroll-guard.mjs
//
// One helper, posRedrawKeepScroll, holds every scroller that can carry the position (the view's
// own scroller, the POS pane around #pos-body, #viewport, the window) across a redraw that
// REPLACES those nodes. tipsRedraw / staffRedrawAll are the only ways Tips and Staff redraw the
// whole area. The guard half of this file fails if a new redraw path skips them.
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

// ── a fake page where a redraw REPLACES every scroller node, as innerHTML / renderViewport do ──
function page() {
  const mk = (top) => ({ scrollTop: top });
  const dom = { inner: mk(640), pane: mk(1200), viewport: mk(0), win: 300, redraws: 0 };
  const posBody = { get firstElementChild() { return dom.inner; }, parentElement: { closest: () => dom.pane }, set innerHTML(v) { dom.inner = mk(0); dom.pane = mk(0); dom.redraws++; } };
  const document = { getElementById: (id) => id === 'pos-body' ? posBody : id === 'viewport' ? dom.viewport : null };
  const window = { get scrollY() { return dom.win; }, scrollTo: (x, y) => { dom.win = y; } };
  const ctx = {};
  new Function('ctx', 'document', 'window', 'dom', `
    function tipsHTML(){return '<div>sheet</div>';}
    function renderViewport(){dom.viewport={scrollTop:0};dom.inner={scrollTop:0};dom.pane={scrollTop:0};dom.win=0;dom.redraws++;}
    ${grab('posScrollers')}${grab('posRedrawKeepScroll')}${grab('tipsRedraw')}${grab('staffRedrawAll')}${grab('posRedraw')}${grab('posKeepScroll')}
    ctx.tipsRedraw=tipsRedraw;ctx.staffRedrawAll=staffRedrawAll;ctx.posRedraw=posRedraw;ctx.posKeepScroll=posKeepScroll;
  `)(ctx, document, window, dom);
  ctx.dom = dom;
  return ctx;
}

{
  const p = page(); const before = { inner: p.dom.inner, pane: p.dom.pane };
  p.tipsRedraw();
  ok('fixture: a Tips redraw really REPLACES the scroller nodes (not the same objects any more)', p.dom.redraws === 1 && p.dom.inner !== before.inner && p.dom.pane !== before.pane);
  ok('⛔ tipsRedraw puts the view\'s own scroller back where it was', p.dom.inner.scrollTop === 640);
  ok('⛔ …and the POS pane around it', p.dom.pane.scrollTop === 1200);
  ok('⛔ …and the window', p.dom.win === 300);
}
{
  const p = page(); p.dom.viewport.scrollTop = 250;
  p.staffRedrawAll();
  ok('⛔ a full Staff rebuild (renderViewport) keeps #viewport, the POS pane, the inner scroller and the window', p.dom.viewport.scrollTop === 250 && p.dom.pane.scrollTop === 1200 && p.dom.inner.scrollTop === 640 && p.dom.win === 300);
}

// ── the WHOLE POS area (Vinny, 11/20/26: "after adjusting the gelato price it snapped") ──────
// posRedraw is what Menu items' sync / settle / drag / every other POS edit redraws with. It
// used to find its scroller as "the first element under #viewport that overflows" — which at a
// short iPad height is the SIDEBAR, so the list snapped to the top (reproduced at 1024×400:
// 4804 → 0). Now it is the same role-based helper as everything else.
{
  const p = page(); p.dom.viewport.scrollTop = 250;
  p.posRedraw();
  ok('⛔ posRedraw (Menu items, Discounts, Printers, Grazie…) keeps the POS pane, the inner scroller, #viewport and the window', p.dom.pane.scrollTop === 1200 && p.dom.inner.scrollTop === 640 && p.dom.viewport.scrollTop === 250 && p.dom.win === 300);
  const q = page();
  q.posKeepScroll(() => { q.dom.pane = { scrollTop: 0 }; q.dom.inner = { scrollTop: 0 }; });
  ok('⛔ posKeepScroll (the price box path) is the same helper and holds the pane too', q.dom.pane.scrollTop === 1200 && q.dom.inner.scrollTop === 640);
  ok('⛔ scrollers are found by ROLE — the "first element that overflows" lookup (which found the sidebar) is gone', !/function posScroller\(/.test(src) && !/scrollHeight>/.test(grab('posScrollers')));
}

// ── the department dropdown, end to end: write → staffLoad(true) → the Tips redraw it does ──
{
  const load = grab('staffLoad');
  ok('⛔ after a Staff write, staffLoad catches Tips up through tipsRedraw (the keep-scroll helper), not a raw innerHTML swap', /if\(tipsActive\(\)\)tipsRedraw\(\);/.test(load) && !/innerHTML=tipsHTML\(\)/.test(load));
  const dept = grab('tipSetDept');
  ok('…the dropdown itself only writes, then lets that path redraw — and a refusal redraws through the helper too', /staffWriteOp\(/.test(dept) && /if\(!r\)tipsRedraw\(\);/.test(dept) && !/renderViewport|innerHTML/.test(dept));
}

// ── THE GUARD: no Tips or Staff function redraws the area without the helper ────────────────
// Every top-level function whose name starts tip/tips/staff, comments stripped (a comment that
// mentions renderViewport() must not count either way).
{
  const strip = (code) => code.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [...src.matchAll(/^(?:async )?function ((?:tips?|staff|pos)[A-Za-z0-9_$]*)\(/gm)].map(m => m[1]);
  // the helpers themselves, and posSec: switching POS SECTION opens the new page at its top
  // on purpose — restoring the old page's scroll would land you mid-way down a different page.
  const helpers = new Set(['tipsRedraw', 'staffRedrawAll', 'posRedraw', 'posRedrawKeepScroll', 'posKeepScroll', 'posSec', 'posRerenderList']);
  const offenders = [];
  for (const n of new Set(names)) {
    if (helpers.has(n)) continue;
    const body = strip(grab(n));
    if (/getElementById\('pos-body'\)\.innerHTML\s*=/.test(body)) offenders.push(n + ' (writes #pos-body directly)');
    if (/getElementById\('viewport'\)\.innerHTML\s*=/.test(body)) offenders.push(n + ' (writes #viewport directly)');
    if (/(^|[^A-Za-z0-9_$.])renderViewport\(\)/.test(body)) offenders.push(n + ' (bare renderViewport())');
    if (/getElementById\('pos-items-body'\)\.innerHTML\s*=/.test(body)) offenders.push(n + ' (writes the item list directly — use posRerenderList)');
  }
  ok(`⛔ every Tips/Staff/POS redraw goes through the keep-scroll helper (${names.length} functions scanned)` + (offenders.length ? ' — offenders: ' + offenders.join(', ') : ''), names.length > 300 && offenders.length === 0);
  ok('…posRerenderList itself holds the place while it swaps the list', /posRedrawKeepScroll\(\(\)=>\{el\.innerHTML=posItemsBodyHTML\(\);\}\)/.test(grab('posRerenderList')));
  ok('…and posSec is the ONE deliberate full redraw (navigation to another page)', /renderViewport\(\)/.test(grab('posSec')));
  ok('…and the helpers themselves are the ONLY direct writers', /vp\.innerHTML=tipsHTML\(\)/.test(grab('tipsRedraw')) && /posRedrawKeepScroll\(\(\)=>renderViewport\(\)\)/.test(grab('staffRedrawAll')));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
