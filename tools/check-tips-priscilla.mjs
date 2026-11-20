// ONE-TIME: PRISCILLA'S TIPS-ROSTER SPELLING, FLIPPED. ALIAS ONLY.
//
//     node tools/check-tips-priscilla.mjs
//
// Vinny: the official spelling is "Lagace" everywhere (Staff already merged this way,
// STAFF_CLEANUP_1_MERGES). The Tips roster still canonicalizes every variant TO "Priscilla
// La Gace" — backwards. This file guards the one-time fix (`tipRosterFixPriscilla`): it
// must touch ONLY the Bartender section entry and the alias map, must refuse rather than
// guess on anything unexpected, and must never go near a cell, a tip or an hours figure —
// unlike every other roster assertion in this repo, "the money is correct" here means
// "nothing financial was touched at all".
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
const grabConst = (name) => {
  const i = src.indexOf('const ' + name + '=');
  if (i === -1) throw new Error('missing ' + name);
  return src.slice(i, src.indexOf('\n];', i) + 3);
};

// A tiny world: the real function + the real validate rule + the real TIP_SECTIONS +
// TIP_ROSTER_COUNTS, a swappable kvGet/fetch/KV_TOKEN, and a recorder for confirm/writes.
function world({ storedValue, kvUnreachable = false, fetchFails = false, confirmAnswer = true, readBackValue } = {}) {
  const calls = { posts: [], confirms: [], statuses: [] };
  const ctx = {};
  new Function('ctx', `
    const TIP_SECTIONS=['Server','Bartender','Busser','Food Runner','Weddings'];
    const TIP_ROSTER_COUNTS={'Server':1,'Bartender':1,'Busser':1,'Food Runner':1,'Weddings':1};
    let tipsState={roster:{},rosterFailed:false};
    ${grab('tipNormKey')}
    ${grab('tipRosterValidate')}
    const TIPS_ROSTER_KEY='ct_tips_roster';
    const KV_URL='https://fake/api/kv/';
    const KV_FAIL={__kvFail:true};
    function kvFailed(r){return r===KV_FAIL;}
    const KV_TOKEN=()=>'fake-token';
    let readCount=0;
    async function kvGet(k){
      readCount++;
      if(${kvUnreachable})return KV_FAIL;
      // First read = the live store; second (read-back) = what got written, or a supplied override.
      if(readCount>1 && ${JSON.stringify(readBackValue !== undefined)})return {v:${JSON.stringify(readBackValue)},at:999};
      if(readCount>1 && ctx.written)return {v:ctx.written,at:999};
      return {v:${JSON.stringify(storedValue)},at:100};
    }
    async function fetch(url,opts){
      ctx.calls.posts.push({url,opts});
      if(${fetchFails})throw new Error('network down');
      ctx.written=JSON.parse(opts.body).v;
      return {ok:true,status:200};
    }
    function confirm(msg){ctx.calls.confirms.push(msg);return ${JSON.stringify(confirmAnswer)};}
    function tipsSetStatus(s,c){ctx.calls.statuses.push(s);}
    ${grab('tipRosterFixPriscilla')}
    ctx.run = tipRosterFixPriscilla;
    ctx.getWritten = () => ctx.written;
  `)(ctx, calls);
  ctx.calls = calls;
  return ctx;
}

const liveBackwards = {
  sections: {
    Server: ['Server One'], Bartender: ['Priscilla La Gace'], Busser: ['Busser One'],
    'Food Runner': ['Runner One'], Weddings: ['Wedding One'],
  },
  aliases: {
    'priscilla lagace': 'Priscilla La Gace',
    'priscill lagace': 'Priscilla La Gace',
    'priscilla la gace': 'Priscilla La Gace',
  },
};

// ── THE HAPPY PATH ──────────────────────────────────────────────────────────────────
{
  const w = world({ storedValue: liveBackwards });
  await w.run();
  const sent = w.getWritten();
  ok('⛔ the Bartender section entry is flipped to the new canonical spelling',
     sent.sections.Bartender.indexOf('Priscilla Lagace') >= 0 && sent.sections.Bartender.indexOf('Priscilla La Gace') < 0);
  ok('⛔ EVERY alias now points at the new spelling, old spelling included',
     sent.aliases['priscilla lagace'] === 'Priscilla Lagace' &&
     sent.aliases['priscill lagace'] === 'Priscilla Lagace' &&
     sent.aliases['priscilla la gace'] === 'Priscilla Lagace');
  ok('…and the identity entry for the spelling itself is present',
     sent.aliases[Object.keys(sent.aliases).find(k => sent.aliases[k] === 'Priscilla Lagace' && k === 'priscilla lagace')] === 'Priscilla Lagace');
  ok('⛔ no other section is touched', JSON.stringify(sent.sections.Server) === JSON.stringify(['Server One']));
  ok('…and no other alias key is added or removed', Object.keys(sent.aliases).length === 3);
  ok('it asks before writing', w.calls.confirms.length === 1);
  ok('…stating this touches no money', /no cell, tip or hours figure|nothing financial/i.test(w.calls.confirms[0]));
}

// ── THE IDENTITY ENTRY IS NOT JUST A SIDE EFFECT OF THE RENAME LOOP ────────────────
// A roster where nobody ever misspelled her correctly has NO 'priscilla lagace' alias key
// at all yet — the rename loop (which only touches EXISTING keys) has nothing to flip, so
// the explicit identity-add is the only thing that makes the new spelling canonical.
{
  const noIdentityYet = {
    sections: { ...liveBackwards.sections },
    aliases: { 'priscill lagace': 'Priscilla La Gace', 'priscilla la gace': 'Priscilla La Gace' },
  };
  const w = world({ storedValue: noIdentityYet });
  await w.run();
  const sent = w.getWritten();
  ok('⛔ the identity entry for the new spelling is added even when no alias key for it existed before',
     sent && sent.aliases['priscilla lagace'] === 'Priscilla Lagace');
}

// ── THE VALIDATE-BEFORE-WRITE GUARD ACTUALLY CATCHES SOMETHING ─────────────────────
// A VALID stored roster (passes the first validate) where a totally different, genuinely
// distinct person already happens to be spelled "Priscilla Lagace" in another section —
// renaming the Bartender entry collides with them ONLY after the fix, which the real
// tipRosterValidate's cross-section `seen` check must catch on the SECOND (post-fix) call.
{
  const collidesAfterFix = {
    sections: { ...liveBackwards.sections, Bartender: ['Priscilla La Gace'], Weddings: ['Priscilla Lagace'] },
    aliases: { 'priscill lagace': 'Priscilla La Gace' },   // no 'priscilla lagace' key yet — the original is valid
  };
  const w = world({ storedValue: collidesAfterFix });
  await w.run();
  ok('⛔ a fix that would create a duplicate name ACROSS sections is refused, never written',
     w.calls.posts.length === 0);
}

// ── CANCEL MEANS CANCEL ─────────────────────────────────────────────────────────────
{
  const w = world({ storedValue: liveBackwards, confirmAnswer: false });
  await w.run();
  ok('⛔ declining the confirm writes nothing', w.calls.posts.length === 0);
}

// ── IDEMPOTENT: pressing it again after the fix is already live does nothing ───────
{
  const already = {
    sections: { ...liveBackwards.sections, Bartender: ['Priscilla Lagace'] },
    aliases: { 'priscilla lagace': 'Priscilla Lagace', 'priscill lagace': 'Priscilla Lagace', 'priscilla la gace': 'Priscilla Lagace' },
  };
  const w = world({ storedValue: already });
  await w.run();
  ok('⛔ a second press recognises it is already fixed and writes nothing', w.calls.posts.length === 0);
  ok('…and never shows a confirm dialog for nothing left to do', w.calls.confirms.length === 0);
}

// ── REFUSES RATHER THAN GUESSES ─────────────────────────────────────────────────────
{
  const w = world({ kvUnreachable: true });
  await w.run();
  ok('⛔ an unreachable store writes nothing', w.calls.posts.length === 0);
}
{
  const w = world({ storedValue: { sections: { Server: [] } } }); // fails validation
  await w.run();
  ok('⛔ a store that does not validate as a usable roster writes nothing', w.calls.posts.length === 0);
}
{
  const w = world({ storedValue: liveBackwards, fetchFails: true });
  await w.run();
  ok('⛔ a failed POST is reported, not silently swallowed',
     w.calls.statuses.some(s => /NOT written/i.test(s)));
}
{
  // The read-back disagrees with what was sent — must be caught, not trusted blindly.
  const w = world({ storedValue: liveBackwards, readBackValue: liveBackwards });
  await w.run();
  ok('⛔ a read-back that does NOT show the fix is reported, not assumed to have worked',
     w.calls.statuses.some(s => /does not show the fix/i.test(s)));
}
{
  const w = world({ storedValue: liveBackwards });
  await w.run();
  ok('a read-back that DOES show the fix is reported as done',
     w.calls.statuses.some(s => /Done/.test(s)));
}

// ── NO KEY ON THIS DEVICE ───────────────────────────────────────────────────────────
{
  const fn = src.slice(src.indexOf('async function tipRosterFixPriscilla('), src.indexOf('function tipRosterFixPriscillaHTML('));
  ok('refuses outright on a device with no sync key, same as every other hand-write in this file',
     /KV_TOKEN\(\)/.test(fn) && /No sync key on this device/.test(fn));
}

// ── NEVER kvPush, SAME DISCIPLINE AS THE RETIRED SEEDER ─────────────────────────────
const fix = src.slice(src.indexOf('async function tipRosterFixPriscilla('), src.indexOf('function tipRosterFixPriscillaHTML('));
const stripc = (t) => (t || '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
ok('⛔ not kvPush (debounced, response never read) — an awaited POST instead',
   !/kvPush|kvSend\(/.test(stripc(fix)) && /await fetch\(/.test(fix) && /method:'POST'/.test(fix));
ok('…reads the status rather than assuming it worked', /if\(!resp\.ok\)/.test(fix));
ok('…token in the header, never the URL', /'x-sync-token'/.test(fix) && !/\?token=/.test(stripc(fix)));
ok('…then proves it with a fresh read, not an echo of what was sent', /const back=await kvGet\(/.test(fix));
ok('⛔ touches none of the TIPS MONEY state — no tipsState.cells/adds/hours/busserSplit anywhere in it',
   !/tipsState\.(cells|adds|hours|busserSplit)/.test(fix));
ok('it invalidates the cached roster so the next load re-fetches rather than reusing the stale copy',
   /tipsState\.roster=null/.test(fix));

// ── THE BUTTON: one-time, named for retirement like every other migration button ───
ok('a button exists, wired to the function', /onclick="tipRosterFixPriscilla\(\)"/.test(src));
ok('…and it is the ONLY caller besides the definition itself',
   (src.split('tipRosterFixPriscilla(').length - 1) === 2);  // the definition + the one onclick
ok('the button carries its own retirement note in this file\'s comments, same pattern as staff-cleanup-1/job-rate-override',
   /ONE-TIME BUTTON, same treatment as every other migration button/.test(src));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
