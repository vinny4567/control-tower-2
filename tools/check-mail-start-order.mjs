// START ORDER ON A PLAIN EMAIL — Vinny 11/24/26, with a customer's own order email: "this is the
// kind of thing i want the start order button for."
//
//     node tools/check-mail-start-order.mjs
//
// The button used to show only on the website's catering-form submission. A customer who just
// writes "We would like to place a catering order for December 2nd…" now gets it too: the sender
// is the name, the details that can be read reliably go in their own fields, the delivery time
// and address go at the top of the notes, and the whole email follows verbatim — the catering
// form's own order reader (ctImportItemsFromText) turns that into items. RUN, not read.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };
const grab = (name) => {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
  }
  return src.slice(i, j + 1);
};
const line = (re) => src.match(re)[0];

const ctx = { confirms: [], sent: [] };
new Function('ctx', `
  ${line(/const MAIL_SUB_LABELS=\[[\s\S]*?\]\];/)}
  ${line(/const MAIL_MONTHS=\[[^\]]+\];/)}
  ${grab('mailIsSubmission')}${grab('mailPlain')}${grab('mailSubRowsFromHtml')}${grab('mailSubRowsFromText')}
  ${grab('mailCleanSub')}${grab('mailParseSubmission')}
  ${grab('mailBodyOnly')}${grab('mailFindDate')}${grab('mailParseFreeform')}${grab('mailOrderMsg')}
  ctx.isSub=mailIsSubmission;ctx.free=mailParseFreeform;ctx.sub=mailParseSubmission;ctx.pick=mailOrderMsg;ctx.date=mailFindDate;
`)(ctx);

// A customer's order email, in the same shape as the real one on Vinny's screenshot — every
// identifying detail (name, address, email, phone) is MADE UP: this repo is public.
const ORDER = {
  from: 'Jane Sample', fromAddr: 'jane@example.com', date: '2026-11-23T17:31:00.000Z', subject: 'Catering order',
  text: `Hello,

We would like to place a catering order for December 2nd. This is a delivery order for 1:45 pm to 100 N. Main Street, Suite 200, Naperville, IL 60540. We would like our order to include....

Appetizers
  * Stuffed Mushrooms – 2 dozen (24 pieces)
  * Bruschetta – 2 dozen (24 pieces)
  * Bacon-Wrapped Dates – 1 dozen (12 pieces)
  * Peppadew Peppers- 1 dozen (12 pieces)
Salad
  * Angeli's Special Salad – Small bowl
Entrées
  * Chicken Parmigiana – 14 pieces
  * Meatballs – 15 pieces
  * Italian Sausage & Peppers – Half pan
  * Baked Mostaccioli Bolognese – Half pan

Thank you,
Jane Sample
630-555-0142

On Sun, Nov 22, 2026 at 3:02 PM Angeli's <catering@example.com> wrote:
> Thanks for reaching out — the menu is attached.`,
};
{
  const d = ctx.free(ORDER);
  ok('a plain order email is NOT mistaken for a website-form submission', !ctx.isSub(ORDER));
  ok('⛔ the name is the SENDER — "Jane Sample"', d.name === 'Jane Sample');
  ok('…the email is the sender\'s address', d.email === 'jane@example.com');
  ok('⛔ "December 2nd", sent 11/23/2026 → 2026-12-02', d.date === '2026-12-02' && /December 2nd/.test(d.raw.dateText));
  ok('⛔ "a delivery order" → Delivery (the form presses its Delivery button)', d.service === 'Delivery');
  ok('the phone in her signature is read', d.phone === '630-555-0142');
  ok('⛔ the delivery time and address head the notes: "Delivery: 1:45 pm to 100 N. Main Street, Suite 200, Naperville, IL 60540"',
     d.notes.split('\n')[0] === 'Delivery: 1:45 pm to 100 N. Main Street, Suite 200, Naperville, IL 60540');
  ok('⛔ the WHOLE order follows verbatim — every item and quantity, for the form\'s order reader', ['Stuffed Mushrooms – 2 dozen (24 pieces)', 'Peppadew Peppers- 1 dozen (12 pieces)', "Angeli's Special Salad – Small bowl", 'Chicken Parmigiana – 14 pieces', 'Baked Mostaccioli Bolognese – Half pan'].every((x) => d.notes.includes(x)));
  ok('⛔ …but not the quoted earlier thread ("On … wrote:")', !/wrote:/.test(d.notes) && !/menu is attached/.test(d.notes));
  ok('no guest count is invented when she gave none', d.guests === '');
}
// ── the date rule: next one on or after the day it was sent ─────────────────────────────────
{
  ok('"January 5th" sent in November is NEXT year', ctx.date('party on January 5th', '2026-11-23T12:00:00Z').date === '2027-01-05');
  ok('"Nov 23" sent on Nov 23 is today, not next year', ctx.date('for Nov 23', '2026-11-23T15:00:00').date === '2026-11-23');
  ok('a written year wins: "December 2, 2027"', ctx.date('on December 2, 2027', '2026-11-23T12:00:00Z').date === '2027-12-02');
  ok('"12/2" reads as December 2', ctx.date('order for 12/2 please', '2026-11-23T12:00:00Z').date === '2026-12-02');
  ok('"12/2/26" → 2026-12-02', ctx.date('order for 12/2/26', '2026-11-23T12:00:00Z').date === '2026-12-02');
  ok('the FIRST date in the email is the one used', ctx.date('for Dec 2nd (we close Dec 20)', '2026-11-23T12:00:00Z').date === '2026-12-02');
  ok('no date → empty, never a guess', ctx.date('Can you send me the menu?', '2026-11-23T12:00:00Z').date === '');
}
{
  const t = ctx.free({ from: 'A B', text: 'Please deliver at 12:30 pm to 1200 W. Ogden Ave, Naperville, IL 60563.' });
  ok('⛔ a time before the address never becomes its house number ("12:30 pm to 1200 W. Ogden Ave…")', t.notes.split('\n')[0] === 'Delivery: 12:30 pm to 1200 W. Ogden Ave, Naperville, IL 60563');
  const d = ctx.free({ from: 'Tom Lee', fromAddr: 't@x.com', date: '2026-11-23T12:00:00Z', text: 'Hi, we need food for 40 people, pick up at 11:30am on Saturday Dec 5.' });
  ok('pickup + guests + time: "Pickup: 11:30am", 40 guests', d.service === 'Pickup' && d.guests === '40' && d.notes.startsWith('Pickup: 11:30am'));
}
{
  const d = ctx.free({ from: 'orders@corp.com', fromAddr: 'orders@corp.com', text: 'Lunch for 12.' });
  ok('a sender with no display name leaves the name empty (never the address as a name)', d.name === '' && d.email === 'orders@corp.com');
}
// ── the website's form submission keeps its own, exact reader ───────────────────────────────
{
  const SUB = { subject: 'Catering Submission', fromAddr: 'site@angelis.com',
    text: 'Name: Jo Smith\nEmail: jo@x.com\nPhone: 630-555-1111\nDate of Event: 12/12/2026\nCheckbox List: Delivery\nAdditional food (Ala carte menu) / Requests: 2 trays ziti\nBest Time to Call: noon' };
  ok('a website submission is still a submission', ctx.isSub(SUB));
  const d = ctx.sub(SUB);
  ok('…and is still read by its labels (name, date, service from the form, not the sender)', d.name === 'Jo Smith' && d.date === '2026-12-12' && d.service === 'Delivery');
  ok('⛔ mailStartOrder picks the submission reader for a submission and the free-form one otherwise',
     /const d=mailIsSubmission\(m\)\?mailParseSubmission\(m\):mailParseFreeform\(m\);/.test(grab('mailStartOrder')));
}
// ── which message, and when the button shows ────────────────────────────────────────────────
{
  const ours = { fromSelf: true, text: 'Here is your quote' };
  const follow = { from: 'Jane Sample', fromAddr: 'jane@example.com', text: 'Also add bread please' };
  ok('⛔ in a thread, the FIRST message the customer sent is the order (not our reply, not their follow-up)', ctx.pick([ours, ORDER, follow]) === ORDER);
  ok('a website submission anywhere in the thread wins', ctx.pick([ORDER, { subject: 'Catering Submission', text: 'x' }]).subject === 'Catering Submission');
  ok('⛔ a thread that is only our own sent mail has no order — no button', ctx.pick([ours]) === null);
  const det = grab('mailDetailHTML');
  ok('⛔ the Email tab shows Start Order on any email a customer sent', /const startBtn=mailOrderMsg\(msgs\)/.test(det));
  ok('…and the wedding hub thread view the same', /\$\{mailOrderMsg\(\(wed\.mailView\.thread&&wed\.mailView\.thread\.messages\)\|\|\[\]\)\?'<button/.test(src));
  ok('both buttons start from that same message', /const m=mailOrderMsg\(msgs\);\s*if\(m\)mailStartOrder\(m\)/.test(grab('mailStartOrderCurrent')) && /const m=mailOrderMsg\(msgs\);\s*if\(m\)mailStartOrder\(m\)/.test(grab('wedStartOrderCurrent')));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
