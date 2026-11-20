// "WAITING FOR APPROVAL" — new-hire sign-ups from the register QR.
//
//     node tools/check-staff-pending.mjs
//
// The register's New-hire QR -> schedule-app sign-up lands PENDING on the mini within
// ~2 minutes; it never touches ct_staff on its own. This card is the one place that
// decides New person / Same as… / Reject. RUN, not read — and NEVER MERGES ON ITS OWN:
// every mutation here is gated behind a confirm() AND the mini's own POST succeeding.
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

// A tiny world: every real staffPending* function + staffKeyOf + esc, a swappable
// posSrv/posS/confirm/prompt/alert, and a recorder for everything that happened.
function world({ staffPeople = {}, srvSet = true, readOnly = false, pendingResponse, decideResponses = {}, confirmAnswer = true, promptAnswer } = {}) {
  const calls = { posts: [], alerts: [], confirms: [], prompts: [], saves: 0, redraws: 0, loads: 0 };
  const ctx = {};
  new Function('ctx', `
    let staffS = { people: ${JSON.stringify(staffPeople)}, aliases: {}, readOnly: ${JSON.stringify(readOnly)} };
    Object.keys(staffS.people).forEach(k=>{if(!staffS.people[k].key)staffS.people[k].key=k;});
    let posS = { srv: ${srvSet ? "'http://fake'" : 'null'} };
    ${grab('staffKeyOf')}
    function esc(s){return(s||'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    function staffTouch(p){if(p)p.at=1;return p}
    function staffSave(){ctx.calls.saves++;}
    function staffRefresh(){}
    function staffRedraw(){ctx.calls.redraws++;}
    // staffPendingDecide now re-pulls the projection on success — stubbed as a no-op that
    // just counts calls; staffS.people is already the thing this harness's assertions read,
    // so a real refresh-and-replace isn't needed to exercise the pending functions' OWN logic.
    async function staffLoad(force){ctx.calls.loads++;}
    function posAuthNote(){return '⚠ the register refused this browser\\'s back-office key';}
    const posCardCss='';
    async function posSrv(path,opts){
      ctx.calls.posts.push({path,opts});
      if(path.indexOf('/api/people/pending')===0){
        if(${JSON.stringify(pendingResponse)}===null) throw new Error('network down');
        return ${JSON.stringify(pendingResponse)};
      }
      if(path.indexOf('/api/people/decide')===0){
        const body=JSON.parse(opts.body);
        const key=body.pid+':'+body.as;
        const r=(${JSON.stringify(decideResponses)})[key]||(${JSON.stringify(decideResponses)})['*'];
        if(r===undefined)return {ok:true,status:200,body:{}};
        if(r===null)throw new Error('network down');
        return r;
      }
      return {ok:true,status:200,body:{}};
    }
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function prompt(msg){ctx.calls.prompts.push(msg);return ${JSON.stringify(promptAnswer)};}
    function alert(msg){ctx.calls.alerts.push(msg);}
    ${grab('staffPidToPerson')}
    ${grab('staffPendingMatches')}
    ${grab('staffPendingLoad')}
    ${grab('staffPendingDecide')}
    ${grab('staffPendingRow')}
    ${grab('staffPendingDrop')}
    ${grab('staffPendingNew')}
    ${grab('staffPendingLinkTo')}
    ${grab('staffPendingLinkPrompt')}
    ${grab('staffPendingReject')}
    ${grab('staffPendingAgo')}
    ${grab('staffPendingRowHTML')}
    ${grab('staffPendingCardHTML')}
    let staffPendingS={loaded:false,loading:false,people:null,err:''};
    ctx.load=staffPendingLoad;ctx.new=staffPendingNew;ctx.linkTo=staffPendingLinkTo;
    ctx.linkPrompt=staffPendingLinkPrompt;ctx.reject=staffPendingReject;ctx.row=staffPendingRowHTML;
    ctx.card=staffPendingCardHTML;ctx.ago=staffPendingAgo;ctx.matches=staffPendingMatches;
    ctx.getStaffS=()=>staffS;ctx.getPendingS=()=>staffPendingS;ctx.setPending=(p)=>{staffPendingS.people=p;staffPendingS.loaded=true;};
  `)(ctx);
  ctx.calls = calls;
  return ctx;
}

const person = (name, extra = {}) => ({ key: '', name, sources: {}, at: 0, ...extra });
const pendingRow = (pid, name, extra = {}) => ({ pid, name, phone: '555-0100', department: 'restaurant', positions: ['Server'], flags: [], extra: {}, ...extra });

// ── LOAD: quiet without a register, honest about 401, parses several response shapes ──
{
  const w = world({ srvSet: false, pendingResponse: { ok: true, status: 200, body: { pending: [] } } });
  await w.load();
  ok('⛔ no register configured yet — stays quiet, no fetch attempted', w.calls.posts.length === 0);
  ok('…and never marks itself loaded, so a later connect can still load it', w.getPendingS().loaded === false);
}
{
  const w = world({ pendingResponse: { ok: false, status: 401, body: {} } });
  await w.load();
  ok('a 401 is read as a refusal, via the same posAuthNote every other register call uses', /refused/.test(w.getPendingS().err));
}
{
  const w = world({ pendingResponse: { ok: true, status: 200, body: { pending: [pendingRow('p1', 'A')] } } });
  await w.load();
  ok('parses the {pending:[...]} response shape', w.getPendingS().people.length === 1);
}
{
  const w = world({ pendingResponse: { ok: true, status: 200, body: { people: [pendingRow('p1', 'A')] } } });
  await w.load();
  ok('…and the {people:[...]} shape', w.getPendingS().people.length === 1);
}
{
  const w = world({ pendingResponse: { ok: true, status: 200, body: [pendingRow('p1', 'A')] } });
  await w.load();
  ok('…and a bare array', w.getPendingS().people.length === 1);
}
{
  const w = world({ pendingResponse: null });
  await w.load();
  ok('a network failure is reported, not silently treated as "nobody pending"', /Could not reach/.test(w.getPendingS().err) && w.getPendingS().people === null);
}

// ── POSSIBLE MATCHES: resolved to a real name, never a bare id ─────────────────────
{
  const w = world({ staffPeople: { 'ava austin': person('Ava Austin', { pid: 'abc' }) } });
  const matches = w.matches(pendingRow('p1', 'A Sign-Up', { flags: ['possible_match:abc'] }));
  ok('⛔ a possible_match flag resolves to the real Staff name, not the bare pid', matches.length === 1 && matches[0].person.name === 'Ava Austin');
}
{
  const w = world({});
  const matches = w.matches(pendingRow('p1', 'A Sign-Up', { flags: ['possible_match:nobody-home'] }));
  ok('a possible_match pointing at nobody known is dropped, not shown as a dangling suggestion', matches.length === 0);
}

// ── NEW PERSON: the worked path ─────────────────────────────────────────────────────
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'New Hire', { positions: ['Busser'], department: 'events' })] }) });
  await w.load();
  await w.new('p1');
  const S = w.getStaffS();
  const p = S.people['new hire'];
  ok('⛔ a brand-new record is created, keyed by staffKeyOf, carrying the mini\'s own pid (never a second minted id)',
     !!p && p.pid === 'p1');
  ok('…phone, positions and department all carried across', p.phone === '555-0100' && p.positions.join(',') === 'Busser' && p.department === 'events');
  ok('…and the source is recorded', !!p.sources && !!p.sources.hireQR);
  ok('the decide POST was sent with as:"new"', w.calls.posts.some((c) => c.path === '/api/people/decide' && JSON.parse(c.opts.body).as === 'new'));
  ok('the row is dropped from the pending list once approved', !w.getPendingS().people.some((r) => r.pid === 'p1'));
  ok('⛔ a successful decide re-pulls the projection, same as staffWriteOp (not just the local gap-fill)', w.calls.loads === 1);
}

// ── READ-ONLY GATES APPROVAL TOO, same as staffWriteOp (11/20/26, Jarvis) ──────────
{
  const w = world({ readOnly: true, pendingResponse: ok1({ pending: [pendingRow('p1', 'New Hire')] }) });
  await w.load();
  await w.new('p1');
  ok('⛔ while read-only, New person sends no decide POST at all', !w.calls.posts.some((c) => c.path === '/api/people/decide'));
  ok('…and says plainly that changes happen at the restaurant', w.calls.alerts.some((m) => /Changes can be made at the restaurant/.test(m)));
}

// ── NEW PERSON refuses a name collision with a DIFFERENT pid — "Same as…" territory ──
{
  const w = world({
    staffPeople: { 'dana smith': person('Dana Smith', { pid: 'existing-pid', phone: '555-9999' }) },
    pendingResponse: ok1({ pending: [pendingRow('new-pid', 'Dana Smith')] }),
  });
  await w.load();
  await w.new('new-pid');
  ok('⛔ a name collision with an existing, DIFFERENT person refuses rather than overwriting their row',
     w.getStaffS().people['dana smith'].phone === '555-9999' && w.calls.saves === 0);
  ok('…and tells him to use Same as… instead', w.calls.alerts.some((m) => /Same as/.test(m)));
}

// ── NEW PERSON: Cancel means cancel, and a refused decide writes nothing locally ────
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'New Hire')] }), confirmAnswer: false });
  await w.load();
  await w.new('p1');
  ok('⛔ declining the confirm adds nobody', !w.getStaffS().people['new hire'] && w.calls.saves === 0);
}
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'New Hire')] }), decideResponses: { '*': { ok: false, status: 500, body: {} } } });
  await w.load();
  await w.new('p1');
  ok('⛔ a decide POST that fails adds nobody locally — the mini and this page must agree',
     !w.getStaffS().people['new hire'] && w.calls.saves === 0);
}

// ── SAME AS: aliases only, re-points a dangling chain, never gap-fills other fields ──
{
  const w = world({
    staffPeople: { 'target person': person('Target Person', { pid: 'target-pid', phone: '555-1111' }) },
    pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling', { phone: '555-2222' })] }),
  });
  await w.load();
  await w.linkTo('p1', 'target person');
  const target = w.getStaffS().people['target person'];
  ok('⛔ the alias is written, pointing the sign-up spelling at the target', w.getStaffS().aliases['signup spelling'] === 'target person');
  ok('⛔ the target\'s OWN phone is untouched — Same as aliases, it does not gap-fill fields', target.phone === '555-1111');
  const decideCall = w.calls.posts.find((c) => c.path === '/api/people/decide');
  ok('the decide POST names the TARGET\'s pid, not a local key', JSON.parse(decideCall.opts.body).target === 'target-pid');
}
{
  const w = world({
    staffPeople: { 'target person': person('Target Person', { pid: 'target-pid' }) },
    pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling')] }),
  });
  await w.load();
  w.getStaffS().aliases['old alias'] = 'signup spelling';   // a chain that pointed at this sign-up's own key
  await w.linkTo('p1', 'target person');
  ok('⛔ a prior alias chain pointing at the sign-up\'s own key is re-pointed to the target, not left dangling',
     w.getStaffS().aliases['old alias'] === 'target person');
}
{
  const w = world({
    staffPeople: { 'target person': person('Target Person', { pid: 'target-pid' }) },
    pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling')] }),
    decideResponses: { '*': { ok: false, status: 500, body: {} } },
  });
  await w.load();
  await w.linkTo('p1', 'target person');
  ok('⛔ a failed decide POST writes no alias', w.getStaffS().aliases['signup spelling'] === undefined);
}

// ── SAME AS (search): typed-name resolution, same discipline as staffMergeInto ─────
{
  const w = world({
    staffPeople: { 'target person': person('Target Person', { pid: 'target-pid' }) },
    pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling')] }),
    promptAnswer: 'Target Person',
  });
  await w.load();
  await w.linkPrompt('p1');
  ok('typing the right name resolves and aliases it', w.getStaffS().aliases['signup spelling'] === 'target person');
}
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling')] }), promptAnswer: null });
  await w.load();
  await w.linkPrompt('p1');
  ok('⛔ cancelling the prompt does nothing', Object.keys(w.getStaffS().aliases).length === 0);
}
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling')] }), promptAnswer: 'Nobody By This Name' });
  await w.load();
  await w.linkPrompt('p1');
  ok('⛔ a typo\'d target refuses rather than guessing', w.calls.alerts.some((m) => /exactly as it appears/.test(m)));
}

// ── REJECT ───────────────────────────────────────────────────────────────────────────
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'Not A Real Hire')] }) });
  await w.load();
  await w.reject('p1');
  ok('reject posts as:"reject" and drops the row', w.calls.posts.some((c) => c.path === '/api/people/decide' && JSON.parse(c.opts.body).as === 'reject'));
  ok('…and removes it from the pending list', !w.getPendingS().people.some((r) => r.pid === 'p1'));
}
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'Not A Real Hire')] }), decideResponses: { '*': { ok: false, status: 500, body: {} } } });
  await w.load();
  await w.reject('p1');
  ok('⛔ a failed reject POST leaves the row in the pending list, not silently dropped', w.getPendingS().people.some((r) => r.pid === 'p1'));
}
{
  const w = world({ pendingResponse: ok1({ pending: [pendingRow('p1', 'Not A Real Hire')] }), confirmAnswer: false });
  await w.load();
  await w.reject('p1');
  ok('⛔ declining the confirm on Reject does nothing — no decide call, row stays', w.calls.posts.filter((c) => c.path === '/api/people/decide').length === 0 && w.getPendingS().people.some((r) => r.pid === 'p1'));
}

// ── SAME AS does not gap-fill even when the target is MISSING the field entirely ──
{
  const w = world({
    staffPeople: { 'target person': person('Target Person', { pid: 'target-pid' }) }, // no phone at all
    pendingResponse: ok1({ pending: [pendingRow('p1', 'Signup Spelling', { phone: '555-3333' })] }),
  });
  await w.load();
  await w.linkTo('p1', 'target person');
  ok('⛔ Same as never gap-fills — the target stays with NO phone, even though they had none and the sign-up did',
     w.getStaffS().people['target person'].phone === undefined);
}

// ── RENDER: every button present, possible matches shown, the card self-hides when empty ──
{
  const w = world({
    staffPeople: { 'ava austin': person('Ava Austin', { pid: 'abc' }) },
    pendingResponse: ok1({ pending: [pendingRow('p1', 'A Sign-Up', { flags: ['possible_match:abc'] })] }),
  });
  await w.load();
  const html = w.card();
  ok('New person / Same as (search) / Reject all appear', /New person/.test(html) && /search/.test(html) && /Reject/.test(html));
  ok('a possible-match suggestion renders by NAME', /Same as Ava Austin/.test(html));
}
{
  const w = world({ pendingResponse: ok1({ pending: [] }) });
  await w.load();
  ok('⛔ an empty pending list renders no visible card — quiet on a normal day', !/Waiting for approval/.test(w.card()));
  ok('…but still carries id="staff-pending" for staffRefresh to find', /id="staff-pending"/.test(w.card()));
}
{
  const w = world({ pendingResponse: { ok: false, status: 401, body: {} } });
  await w.load();
  ok('an error state offers a retry', /Try again/.test(w.card()));
}

ok('staffPendingAgo: just-now / minutes / hours / days', (() => {
  const w = world({});
  const now = Date.now();
  return w.ago(new Date(now - 10 * 1000).toISOString()) === 'just now'
    && w.ago(new Date(now - 5 * 60 * 1000).toISOString()) === '5m ago'
    && w.ago(new Date(now - 3 * 3600 * 1000).toISOString()) === '3h ago'
    && w.ago(new Date(now - 2 * 86400 * 1000).toISOString()) === '2d ago';
})());

function ok1(body) { return { ok: true, status: 200, body }; }

// ── WIRING: a real call site, and staffRefresh actually reaches this card ─────────
const postStaffFn = grab('posStaffHTML');
ok('posStaffHTML triggers the pending load and renders the card at the TOP, before the stat row',
   /staffPendingLoad\(\);/.test(postStaffFn) && postStaffFn.indexOf('staffPendingCardHTML()') < postStaffFn.indexOf("posStat('People'"));
const refreshFn = grab('staffRefresh');
ok('⛔ staffRefresh updates #staff-pending too — it lives outside #staff-body, same as #staff-dupes',
   /getElementById\('staff-pending'\)/.test(refreshFn) && /staffPendingCardHTML\(\)/.test(refreshFn));

// ── DEPARTMENT: the restaurant/events classification the new-hire flow carries ─────
// ⚠️ 11/20/26 — staffEdit's department branch now writes through the mini (staffWriteOp),
// not a plain local field, since the mini is the sole writer. staffMergeInto no longer
// gap-fills ANY field locally (that moved server-side into the mini's own merge op) — see
// check-staff-mergeinto.mjs for that assertion now.
const editFn = grab('staffEdit');
ok('staffEdit has a department branch, writing it through the mini',
   /if\(f==='department'\)\{\s*\n\s*await staffWriteOp\(\{op:'update',pid:p\.pid,patch:\{department:v\|\|null\}\}\);/.test(editFn));
const detailFn = grab('staffDetail');
ok('staffDetail renders a Department dropdown with Restaurant/Events options', /Department/.test(detailFn) && /value="restaurant"/.test(detailFn) && /value="events"/.test(detailFn));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
