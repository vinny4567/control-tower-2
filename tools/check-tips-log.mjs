// TIP-OUT LOG VIEW — read-only, top right of the Tips tab (check-tips-log).
//
//     node tools/check-tips-log.mjs
//
// Vinny: "the tipout log in the calculator now i want in the tip sheet, top right." One
// card per entry, newest first: date, employee count, source (Calculator/Register), a
// PRACTICE badge, draft labelled. ▶ expands servers/bartenders/runners/pools/direct. ×
// deletes via the scheduler's own DELETE, with a confirm. Never writes into
// tipsState.cells — this is a window onto the log, not another pull.
//
// RUN, not read — lifts the real functions and exercises them against built fixtures.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grab = (name, from) => {
  let i = (from != null) ? from : src.indexOf('async function ' + name + '(');
  if (i === -1 || from == null) { const j = src.indexOf('function ' + name + '('); if (i === -1 || (from == null && j !== -1 && j < (i === -1 ? Infinity : i))) i = j; }
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
// tipMoney is defined twice (an early generic helper, then a Tips-specific redeclaration);
// function redeclaration means the LAST one is what actually runs — grab that one.
const grabLast = (name) => {
  const i = src.lastIndexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};

function world({ logEntries = null, fetchReturns = null, confirmAnswer = true, deleteOk = true, fetchThrows = false } = {}) {
  if (fetchReturns == null) fetchReturns = logEntries || [];
  const calls = { fetches: [], confirms: [], alerts: [], redraws: 0 };
  const ctx = {};
  new Function('ctx', `
    let TIP_NAME_ALIASES={}, TIP_ROSTER_CANON={};
    ${grab('tipNormKey')}
    ${grab('tipCanon')}
    ${grabLast('tipMoney')}
    ${grab('esc')}
    const TIPS_LOG_URL='x'; const TIPS_LOG_KEY=()=>'';
    let tipsState={logOpen:false,logEntries:${JSON.stringify(logEntries)},logExpanded:{},logLoading:false,logFailed:false};
    const POS='pos',TIPS='tips';let activeTab=POS;let posS={sec:'tips'};
    function tipsActive(){return activeTab===POS&&posS.sec===TIPS;}
    const document={getElementById(id){ctx.calls.redraws++;return {set innerHTML(v){},get innerHTML(){return '';}};}};
    function tipsHTML(){return '';}   // stub — this file tests the Log functions, not the whole render
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function alert(msg){ctx.calls.alerts.push(msg);}
    const fetch=async (url,opts)=>{
      ctx.calls.fetches.push({url,opts});
      if(${fetchThrows})throw new Error('network down');
      if(opts&&opts.method==='DELETE')return {ok:${deleteOk}};
      return {json:async()=>({log:${JSON.stringify(fetchReturns)}})};
    };
    ${grab('tipsLogEmployeeCount')}
    ${grab('tipsLogSorted')}
    ${grab('tipsLogFetch')}
    ${grab('tipsLogRedraw')}
    ${grab('tipsLogOpen')}
    ${grab('tipsLogClose')}
    ${grab('tipsLogToggleEntry')}
    ${grab('tipsLogDelete')}
    ${grab('tipsLogBtnHTML')}
    ${grab('tipsLogEntryHTML')}
    ${grab('tipsLogPanelHTML')}
    ctx.count=tipsLogEmployeeCount;ctx.sorted=tipsLogSorted;ctx.fetchLog=tipsLogFetch;
    ctx.open=tipsLogOpen;ctx.close=tipsLogClose;ctx.toggle=tipsLogToggleEntry;ctx.del=tipsLogDelete;
    ctx.btn=tipsLogBtnHTML;ctx.entryHtml=tipsLogEntryHTML;ctx.panel=tipsLogPanelHTML;
    ctx.getState=()=>tipsState;
  `)(ctx);
  ctx.calls = calls;
  return ctx;
}

// ── employee count dedupes across roles, through the same canon chain as everywhere else ──
{
  const w = world({});
  const e = { servers: [{ name: 'Amy Server' }], bartenders: [{ name: 'Bob Bar' }], direct: [{ name: 'Amy Server' }] };
  ok('employee count dedupes a server who also has a direct tip — counted once', w.count(e) === 2);
}
{
  const w = world({});
  ok('an entry with nobody at all → 0, not a throw', w.count({}) === 0);
}

// ── sorting: newest date first, savedAt as the tiebreak for same-date entries ───────────
{
  const w = world({ logEntries: [
    { date: '11/2/2026', savedAt: '2026-11-02T10:00:00Z' },
    { date: '11/5/2026', savedAt: '2026-11-05T10:00:00Z' },
    { date: '11/3/2026', savedAt: '2026-11-03T09:00:00Z' },
    { date: '11/3/2026', savedAt: '2026-11-03T20:00:00Z' },
  ] });
  w.getState().logEntries = w.getState().logEntries; // already set via constructor
  const order = w.sorted().map(e => e.date + '@' + e.savedAt);
  ok('⛔ entries sort newest-date first, and same-date entries break ties by the newer savedAt', JSON.stringify(order) === JSON.stringify(['11/5/2026@2026-11-05T10:00:00Z', '11/3/2026@2026-11-03T20:00:00Z', '11/3/2026@2026-11-03T09:00:00Z', '11/2/2026@2026-11-02T10:00:00Z']));
}

// ── the panel renders nothing when closed, and something when open ─────────────────────
{
  const w = world({ logEntries: [] });
  ok('⛔ the panel renders nothing at all while closed — not even an empty shell', w.panel() === '');
}
{
  const w = world({ logEntries: [] });
  w.getState().logOpen = true;
  ok('open with an empty log says so, rather than looking broken', /No log entries/.test(w.panel()));
}
{
  const w = world({ logEntries: null });
  w.getState().logOpen = true;
  w.getState().logLoading = true;
  ok('a loading state reads as loading, not as an empty log', /Loading/.test(w.panel()));
}
{
  const w = world({});
  w.getState().logOpen = true;
  w.getState().logFailed = true;
  ok('⛔ a failed fetch is reported, never silently read as "no entries"', /not reach|could not reach|⚠/i.test(w.panel()));
}

// ── each card shows date / employee count / source / badges, collapsed by default ──────
{
  const w = world({});
  const e = { id: 7, date: '11/4/2026', servers: [{ name: 'Amy Server' }], practice: true, draft: true };
  const html = w.entryHtml(e, 0);
  ok('card shows the date', html.includes('11/4/2026'));
  ok('card shows the employee count', /1 employee/.test(html));
  ok('card defaults to Calculator when no source is given', /Calculator/.test(html));
  ok('⛔ a practice entry is badged PRACTICE, visibly — never silently indistinguishable from a real night', /PRACTICE/.test(html));
  ok('a draft entry is labelled draft', /draft/.test(html));
  ok('⛔ collapsed by default — the detail block is not in the markup until expanded', !/Servers:/.test(html));
}
{
  const w = world({});
  w.getState().logExpanded[7] = true;
  const html = w.entryHtml({ id: 7, date: '11/4/2026', servers: [{ name: 'Amy Server', remaining: 50 }], source: 'register' }, 0);
  ok('expanded shows the servers detail line with the name and figure', /Servers:/.test(html) && /Amy Server/.test(html) && /50\.00/.test(html));
  ok('an explicit register source is honored, not defaulted to Calculator', /Register/.test(html));
}

// ── toggling an entry flips its OWN expanded flag and redraws, nothing else ─────────────
{
  const w = world({});
  w.toggle(7);
  ok('toggling expands the entry', w.getState().logExpanded[7] === true);
  w.toggle(7);
  ok('toggling again collapses it', w.getState().logExpanded[7] === false);
  ok('toggling triggers a redraw', w.calls.redraws > 0);
}

// ── open/close: fetches once, caches, close does not clear the cache ────────────────────
{
  const w = world({ logEntries: null, fetchReturns: [{ date: '11/4/2026' }] });
  await w.open();
  ok('opening sets logOpen', w.getState().logOpen === true);
  ok('opening with no cached entries fetches the log', w.calls.fetches.length === 1);
  ok('…and the fetched entries land in state', w.getState().logEntries.length === 1);
  const before = w.calls.fetches.length;
  await w.open();
  ok('⛔ opening again with entries already cached does not re-fetch', w.calls.fetches.length === before);
  w.close();
  ok('closing clears logOpen', w.getState().logOpen === false);
  ok('⛔ closing does not clear the cached entries — reopening should not have to refetch', w.getState().logEntries.length === 1);
}
{
  const w = world({ logEntries: null, fetchThrows: true });
  await w.open();
  ok('⛔ a fetch failure on open is recorded as logFailed, not silently treated as an empty log', w.getState().logFailed === true);
}

// ── delete: confirms, calls the real DELETE endpoint with id+key, refuses without ok ────
{
  const w = world({ logEntries: [{ id: 7, date: '11/4/2026' }] });
  await w.del(7, '11/4/2026');
  ok('delete asks for confirmation first', w.calls.confirms.length === 1);
  const del = w.calls.fetches.find(f => f.opts && f.opts.method === 'DELETE');
  ok('⛔ the delete call hits the real tipout-log endpoint with the entry id and the key, as DELETE', !!del && /id=7/.test(del.url) && /key=/.test(del.url));
  ok('a successful delete re-fetches the log afterward', w.calls.fetches.length === 2);
}
{
  const w = world({ logEntries: [{ id: 7 }], confirmAnswer: false });
  await w.del(7, '11/4/2026');
  ok('⛔ declining the confirm sends no request at all', w.calls.fetches.length === 0);
}
{
  const w = world({ logEntries: [{ id: 7 }], deleteOk: false });
  await w.del(7, '11/4/2026');
  ok('⛔ a refused delete alerts rather than silently doing nothing', w.calls.alerts.length === 1);
  ok('…and does not re-fetch on a refusal (only one call, the DELETE itself)', w.calls.fetches.length === 1);
}
{
  const w = world({ logEntries: [{ id: 7 }], fetchThrows: true });
  await w.del(7, '11/4/2026');
  ok('⛔ a network failure on delete also alerts, not silently swallowed', w.calls.alerts.length === 1);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
