// MAIL SEARCH IN TWO PASSES — Vinny 11/24/26: "its taking a really long time to search something on
// the sbc". The quick pass (sender / recipient / subject) shows at once; on SBCGlobal (no text
// index) the server says more:true and the message-text pass is added when it lands. RUN, with a
// fake server.
//
//     node tools/check-mail-search.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
const grab = (name) => { let i = src.indexOf('async function ' + name + '('); if (i === -1) i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { j = k; break; } } } return src.slice(i, j + 1); };

function world(answers) {
  const ctx = { calls: [], paints: [], gates: {} };
  ctx.mailx = { search: 'blue', acct: 'sbc', searchResults: null };
  new Function('ctx', `
    const mailx=ctx.mailx;
    function renderMailListRegion(){ctx.paints.push({n:(mailx.searchResults||[]).length,quick:mailx.searching,text:!!mailx.searchingText});}
    async function mailFetch(url){
      ctx.calls.push(url);
      const mode=(/mode=(\\w+)/.exec(url)||[])[1];
      if(ctx.gates[mode])await ctx.gates[mode];
      const a=ctx.answers[mode];
      return {ok:a.ok!==false,json:async()=>a.body};
    }
    ${grab('mailDoSearch')}
    ctx.run=mailDoSearch;
  `)(Object.assign(ctx, { answers }));
  return ctx;
}
const M = (uid, d) => ({ uid, subject: 'S' + uid, date: new Date(2026, 10, d).toISOString() });
{
  let release; const w = world({ quick: { body: { messages: [M(1, 10), M(4, 2)], more: true } }, text: { body: { messages: [M(2, 18), M(1, 10)] } } });
  w.gates.text = new Promise((r) => { release = r; });
  const p = w.run();
  await new Promise((r) => setTimeout(r, 0));
  ok('⛔ the quick pass asks for mode=quick and its results SHOW before the text pass answers', /mode=quick/.test(w.calls[0]) && w.mailx.searchResults.length === 2 && w.mailx.searching === false);
  ok('…with "still searching message text" on while the text pass runs', w.mailx.searchingText === true && /mode=text/.test(w.calls[1]));
  release(); await p;
  ok('⛔ the text pass\'s matches are ADDED to the quick ones (no duplicate, none lost), newest first', w.mailx.searchResults.map((m) => m.uid).join() === '2,1,4');
  ok('…and the "still searching" line goes away', w.mailx.searchingText === false);
}
{
  const w = world({ quick: { body: { messages: [M(1, 10)], more: false } }, text: { body: { messages: [M(9, 20)] } } });
  await w.run();
  ok('a mailbox with its own index (Gmail: more:false) makes ONE call', w.calls.length === 1 && w.mailx.searchResults.length === 1);
}
{
  let release; const w = world({ quick: { body: { messages: [M(1, 10)], more: true } }, text: { body: { messages: [M(7, 20)] } } });
  w.gates.text = new Promise((r) => { release = r; });
  const p = w.run(); await new Promise((r) => setTimeout(r, 0));
  w.mailx.search = 'green';   // he typed something else meanwhile
  release(); await p;
  ok('⛔ an older search\'s text results never land on a newer search', !w.mailx.searchResults.some((m) => m.uid === 7));
}
{
  const w = world({ quick: { body: { messages: [], more: true } }, text: { body: { messages: [M(3, 5)] } } });
  await w.run();
  ok('nothing in sender/subject, found in the text → it shows', w.mailx.searchResults.map((m) => m.uid).join() === '3');
}
{
  const w = world({ quick: { ok: false, body: { error: 'search failed', detail: 'timeout' } }, text: { body: { messages: [] } } });
  await w.run();
  ok('a failed quick pass says so and does not start a text pass', /Search failed — timeout/.test(w.mailx.searchErr) && w.calls.length === 1);
}
ok('the header says "still searching message text…" while the text pass runs', /still searching message text…/.test(src));
ok('the smart folders and the wedding hub keep the original complete search (no mode)', (src.match(/mailFetch\('\/mail\/search\?acct='\+encodeURIComponent\(a\.id\)\+'&q='\+encodeURIComponent\(t(?:\.q)?\)\)/g) || []).length === 2);
console.log(bad ? `\n${bad} FAILED` : '\nall good'); process.exit(bad ? 1 : 0);
