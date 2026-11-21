// A $0 PRICE IS A REAL PRICE — Vinny, 11/20/26, GELATO PLATTER: "i just tried to delete it to
// take the price off, the price for that comes from the mods."
//
//     node tools/check-pos-zero-price.mjs
//
// Emptying the price box used to DELETE the override, so the register's own $3.00 came straight
// back — the second time "take the price off" failed that way. Now clearing it and typing 0 both
// save cents:0, which publishes; the register rings $0 + the mods (POS-UI confirmed). RUN, not read.
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
const grabConst = (name) => { const i = src.indexOf('const ' + name + '='); return src.slice(i, src.indexOf('\n', i)); };

const PLATTER = { key: 'm:Dessert:GELATO PLATTER', name: 'GELATO PLATTER', cat: 'Dessert', cents: 300, no: 2, groups: ['Platter flavors'] };
function world(prices = {}) {
  const ctx = { pushes: [] };
  new Function('ctx', `
    let posPrices=${JSON.stringify(prices)};
    function kvPush(k,v){ctx.pushes.push({k,v:JSON.parse(JSON.stringify(v))});}
    function posKeepScroll(fn){fn();} function posRerenderList(){} function renderViewport(){}
    ${grabConst('posEntered')}
    ${grabConst('posPriceOf')}
    ${grab('posSetPrice')}
    ${grab('posPriceCell')}
    function posEnc(s){return encodeURIComponent(s);}
    ctx.set=posSetPrice;ctx.cell=posPriceCell;ctx.prices=()=>posPrices;ctx.priceOf=posPriceOf;ctx.entered=posEntered;
  `)(ctx);
  return ctx;
}
const enc = encodeURIComponent(PLATTER.key);

{
  const w = world();
  w.set(enc, '');
  ok('⛔ EMPTYING the box saves a real $0 override (cents:0), not "go back to the register\'s $3.00"', w.prices()[PLATTER.key] === 0);
  ok('…the row now reads $0, not the built-in 3.00', w.priceOf(PLATTER) === 0 && w.entered(PLATTER));
  ok('…and the box shows 0.00 — visibly taken, not a blank that looks like nothing happened', /value="0\.00"/.test(w.cell(PLATTER)));
  ok('…and it is saved where the publish reads it', w.pushes.length === 1 && w.pushes[0].k === 'ct_pos_prices' && w.pushes[0].v[PLATTER.key] === 0);
}
{
  const w = world();
  w.set(enc, '0');
  ok('typing 0 saves the same cents:0', w.prices()[PLATTER.key] === 0);
  w.set(enc, '4.50');
  ok('a normal price still saves', w.prices()[PLATTER.key] === 450);
  w.set(enc, '$0.00');
  ok('"$0.00" typed with the sign is 0 too', w.prices()[PLATTER.key] === 0);
}
{
  // a $0 override against a built-in $3.00 is a CHANGE, so it publishes
  const live = grab('posBuildLive');
  ok('⛔ posBuildLive publishes an entered price whenever it differs from the built-in — 0 included (no falsy test on the price)',
     /if\(posEntered\(r\)&&posPriceOf\(r\)!==r\.cents\)o\.cents=posPriceOf\(r\);/.test(live));
  const w = world({ [PLATTER.key]: 0 });
  const o = {}; if (w.entered(PLATTER) && w.priceOf(PLATTER) !== PLATTER.cents) o.cents = w.priceOf(PLATTER);
  ok('⛔ so GELATO PLATTER publishes as items[\'m:Dessert:GELATO PLATTER\'].cents === 0', o.cents === 0);
}
{
  // the settle step only drops an override that EQUALS the built-in price — never a $0 one over $3.00
  const prune = grab('posPruneOrphans');
  ok('⛔ the settle step drops a price only when it equals the built-in one (a $0 override over $3.00 stays)',
     /if\(it&&it\.cents===cents\)drop\(posPrices,k,'ct_pos_prices'\);/.test(prune));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
