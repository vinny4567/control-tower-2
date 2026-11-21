// ONE ROW PER STAFF PERSON — Jarvis/Vinny, 11/20/26.
//
//     node tools/check-tips-one-row.mjs
//
// Vinny on two Priscillas: "just delete la gace and keep lagace" — he means ONE Priscilla, not
// deleting her money. Two stored spellings that resolve to the same Staff person are shown as
// one row on Tips and Hours, summed, and exported as ONE person under ONE Worker ID. Stored keys
// stay raw: every edit still writes a real stored spelling. RUN, not read — the real tipsHTML,
// hoursHTML, cell editor, live refresh and CSV builder, against built fixtures.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let bad = 0;
const ok = (t, c) => { if (!c) bad++; console.log((c ? '  ok  ' : '  FAIL') + '  ' + t); };

const grabConst = (name) => { const i = src.indexOf('const ' + name + '='); if (i === -1) throw new Error('missing const ' + name); return src.slice(i, src.indexOf(';', i) + 1); };
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
const grabLast = (name) => { const i = src.lastIndexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { j = k; break; } } } return src.slice(i, j + 1); };

function world({ people = {}, aliases = {}, cells = {}, hours = {}, empIds = {}, busserSplit = {}, confirmAnswer = true, readOnly = false, writeOk = true } = {}) {
  const ctx = { calls: { confirms: [], saves: 0, moveSaves: 0 } };
  new Function('ctx', `
    ${grabConst('TIP_SECTIONS')}
    ${grabConst('TIP_SEC_LABEL')}
    ${grabConst('TIP_SECTION_FROM_DEPT')}
    ${grabConst('TIP_DEPT_CHOICES')}
    let staffS={people:${JSON.stringify(people)},aliases:${JSON.stringify(aliases)},readOnly:${JSON.stringify(readOnly)}};
    ${grabConst('STAFF_DEPARTMENTS')}
    ctx.calls.writes=[];ctx.calls.redraws=0;
    // the mini: applies the patch, and staffWriteOp's own re-pull lands it in staffS
    async function staffWriteOp(op){ctx.calls.writes.push(op);if(!${JSON.stringify(writeOk)})return null;const k=Object.keys(staffS.people).find(x=>staffS.people[x].pid===op.pid);Object.assign(staffS.people[k],op.patch);return {};}
    function tipsRedraw(){ctx.calls.redraws++;}
    let tipsState={loaded:true,view:'tips',start:new Date(2026,10,2),end:new Date(2026,10,15),
      cells:${JSON.stringify(cells)},hours:${JSON.stringify(hours)},empIds:${JSON.stringify(empIds)},
      busserSplit:${JSON.stringify(busserSplit)},busserSplitByDay:{},adds:{},hoursOut:{},ignoreSet:{}};
    const POS='pos',TIPS='tips';let activeTab=POS,posS={sec:'tips'};function tipsActive(){return true;}
    const els={};
    const document={getElementById(id){if(id==='pos-body')return els['pos-body']=els['pos-body']||{innerHTML:''};return els[id]||null;},createElement(){return {style:{},querySelector(){return null;},set innerHTML(v){this._h=v;},get innerHTML(){return this._h;}};},body:{appendChild(){}}};
    ctx.els=els;
    let tipEdit={};
    function confirm(m){ctx.calls.confirms.push(m);return ${JSON.stringify(confirmAnswer)};}
    function tipsSaveSoon(){ctx.calls.saves++;} function tipsSaveHoursSoon(){ctx.calls.saves++;} function tipsSaveMoves(){ctx.calls.moveSaves++;}
    function tipsRerender(){} function tipsSetStatus(){} function tipCellClearHighlight(){} function tipCellEditorEl(){return ctx.popup=ctx.popup||{style:{},querySelector(){return null;}};}
    const setTimeout=()=>{};
    const window={innerWidth:1000,innerHeight:800};
    const esc=(s)=>(s||'').toString();
    const staffDisplayMark=()=>'';const staffFlagHTML=()=>'';const tipsToggleHTML=()=>'';const tipsImportBtnHTML=()=>'';const tipsPosBtnHTML=()=>'';const tipsCsvBtnHTML=()=>'';const tsChecksHTML=()=>'';
    ${grab('staffKeyOf')}${grab('staffEmployed')}${grab('staffResolveForTips')}${grab('staffDisplayName')}
    ${grab('staffFlagIgnored')}${grab('tipNotAPerson')}${grab('tipPersonHasHoursThisPeriod')}
    ${grab('tipBaseSection')}${grab('tipEffSection')}${grab('tipBusserSplit')}${grab('tipBusserDay')}${grab('tipBusserSplitPeople')}${grab('tipBusserPoolDay')}
    ${grab('tipRowTotals')}${grab('tipStaffLive')}${grab('tipPersonHasTipsThisPeriod')}${grab('tipSectionPeople')}${grab('tipHasTips')}${grab('tipsGrandTotals')}
    ${grab('tipEnsureRange')}${grab('tipDays')}${grab('tipDayLabel')}${grab('tipISO')}${grab('tipId')}${grab('tipCell')}${grab('tipSetComp')}${grab('tipCellComps')}${grab('tipNum')}${grab('tipCompsHTML')}${grabLast('tipMoney')}
    ${grab('tipPaychexId')}${grab('tipIdBadgeHTML')}${grab('csvEsc')}${grab('tipHours')}
    ${grab('tipPersonKey')}${grab('tipGroupNames')}${grab('tipGroupFor')}${grab('tipRegisterGroups')}${grab('tipGroupDayCell')}${grab('tipGroupTotals')}${grab('tipEditTarget')}${grab('tipCellEditGroup')}${grab('tipSetDept')}
    ${grab('tipsHTML')}${grab('tipsPaychexCsv')}${grab('tipCellEdit')}${grab('tipEditSet')}${grab('tipRefreshCell')}${grab('tipRefreshRow')}${grab('tipsUpdateGrand')}
    ${grab('hoursSrc')}${grab('isRestEmp')}${grab('tipHoursPosPay')}${grab('tipHoursPersonTot')}${grab('tipHoursGroupTot')}${grab('hoursHTML')}
    ${grab('tipNormKey')}${grab('tipHoursDelPerson')}${grab('tipHoursDelGroup')}
    ctx.tips=()=>{tipsState.view='tips';return tipsHTML();};ctx.hours=()=>hoursHTML();ctx.csv=tipsPaychexCsv;ctx.grand=tipsGrandTotals;
    ctx.editGroup=tipCellEditGroup;ctx.edit=()=>tipEdit;ctx.set=tipEditSet;ctx.setDept=tipSetDept;ctx.delGroup=tipHoursDelGroup;ctx.st=()=>tipsState;
  `)(ctx);
  return ctx;
}
const P = (key, name, extra = {}) => ({ [key]: { key, name, active: true, ...extra } });
const rowsNamed = (html, label) => html.split('>' + label + '<').length - 1;
const rowHtml = (html, label) => { const i = html.indexOf('>' + label + '<'); return i < 0 ? '' : html.slice(i, html.indexOf('</tr>', i)); };
const paidOf = (tr) => { const m = tr.match(/id="tp-[^"]+"[^>]*>([^<]*)</); return m ? m[1] : null; };

// The shape that started it: Staff has Priscilla Lagace, aliased from "priscilla la gace" AND
// (after the carry-over) "priscill lagace". The calculator wrote one spelling, MICROS the other.
const people = { ...P('priscilla lagace', 'Priscilla Lagace', { pid: 'p1', department: 'server', paychex_id: '455' }) };
const aliases = { 'priscilla la gace': 'priscilla lagace', 'priscill lagace': 'priscilla lagace' };
const cells = { 'Priscilla La Gace': { '11/3': { p: 100 } }, 'Priscill Lagace': { '11/5': { p: 60, u: 15 } } };
const hours = { 'Priscill Lagace': { Server: { h: 20, r: 9, src: 'rest' } }, 'Priscilla La Gace': { Wedding: { h: 6, r: 25, src: 'wed' } } };

// ── Jarvis's push-gate case: two spellings, money on different days ───────────────────────
{
  const sepW = world({ cells, hours });   // NO Staff at all → nothing to merge with, two people
  const sepGrand = sepW.grand();
  const w = world({ people, aliases, cells, hours });
  const html = w.tips();
  ok('⛔ ONE row on Tips for the two spellings, under the Staff name', rowsNamed(html, 'Priscilla Lagace') === 1 && !html.includes('>Priscill Lagace<') && !html.includes('>Priscilla La Gace<'));
  const tr = rowHtml(html, 'Priscilla Lagace');
  ok('⛔ its Paid total is the SUM of both spellings ($160)', paidOf(tr) === '$160.00');
  ok('…its 11/3 cell carries the first spelling\'s $100 and its 11/5 cell the other\'s $60', tr.includes('100') && tr.includes('60'));
  // On Tips the live Staff name is itself a member (every live person is listed), so the row is
  // keyed by the STAFF spelling and carries the two stored spellings as "+2".
  ok('the row is keyed by the Staff spelling and says it holds the two stored spellings', /onchange="tipSetDept\('Priscilla Lagace'/.test(tr) && /\+2 spellings/.test(tr));
  ok('⛔ the grand total is unchanged by merging ($160 paid, $15 unpaid either way)', JSON.stringify(w.grand()) === JSON.stringify(sepGrand) && w.grand().paid === 160 && w.grand().upt === 15);
  const out = w.csv(), lines = out.csv.split('\n').slice(1);
  ok('⛔ ONE person in the CSV — every line under one Worker ID (455)', out.people.length === 1 && lines.length > 0 && lines.every(l => l.split(',')[1] === '455'));
  ok('…tips summed onto ONE base line ($160 tips, $15 unpaid)', lines.filter(l => l.split(',')[6] !== '').length === 1 && lines.some(l => l.split(',')[6] === '160.00' && l.split(',')[7] === '15.00'));
  ok('…and both spellings\' hours exported (20h @ $9 and 6h @ $25) — one line per rate, as always', lines.some(l => /,20\.00,9,/.test(l)) && lines.some(l => /,6\.00,25,/.test(l)));
  ok('…printed with the Staff name', lines.every(l => l.split(',')[2] === 'Priscilla Lagace'));
  const hh = w.hours();
  ok('⛔ ONE summary row on Hours for the person', rowsNamed(hh, 'Priscilla Lagace') === 1);
  const hid = w.st().rowGroups['Priscill Lagace'].primary.replace(/[^a-z0-9]/gi, '_');   // the row's ids are keyed by its own stored spelling
  ok('…with summed hours (26) and pay ($330 = 20×9 + 6×25)', new RegExp('id="hreg-' + hid + '"[^>]*>26<').test(hh) && new RegExp('id="hpt-' + hid + '"[^>]*>\\$330\\.00<').test(hh));
  ok('…each position row still edits ITS OWN stored spelling, tagged with it', /tipHoursInput\('Priscill Lagace','Server'/.test(hh) && /tipHoursInput\('Priscilla La Gace','Wedding'/.test(hh) && /\(as Priscill Lagace\)|\(as Priscilla La Gace\)/.test(hh));
  ok('⛔ the stored keys are untouched (still two raw spellings in cells and hours)', Object.keys(w.st().cells).sort().join('|') === 'Priscill Lagace|Priscilla La Gace' && Object.keys(w.st().hours).length === 2);
}

// ── editing a merged row writes a REAL stored spelling, and refreshes the merged row ──────
{
  const w = world({ people, aliases, cells, hours });
  w.tips();
  w.editGroup('Priscilla La Gace', '11/5');   // the row's own spelling; 11/5 is held by the OTHER spelling
  ok('⛔ a click on a day held by the other spelling edits THAT spelling', w.edit().name === 'Priscill Lagace');
  w.editGroup('Priscilla La Gace', '11/9');   // nobody holds 11/9
  ok('⛔ a click on an EMPTY day writes under the Staff spelling — new entries land on the master name', w.edit().name === 'Priscilla Lagace');
  w.editGroup('Priscilla La Gace', '11/5');
  w.els['tp-Priscilla_La_Gace'] = { textContent: '' };
  w.els['tc-Priscilla_La_Gace-11_5'] = { innerHTML: '' };
  const primary = w.st().rowGroups['Priscill Lagace'].primary;
  w.els['tp-' + primary.replace(/[^a-z0-9]/gi, '_')] = { textContent: '' };
  w.els['tc-' + primary.replace(/[^a-z0-9]/gi, '_') + '-11_5'] = { innerHTML: '' };
  w.set('p', '80');
  ok('⛔ the edit landed on the stored spelling that held it', w.st().cells['Priscill Lagace']['11/5'].p === 80 && w.st().cells['Priscilla La Gace']['11/3'].p === 100);
  ok('⛔ the merged row\'s Paid total refreshes to the SUM ($180), not just the edited spelling', w.els['tp-' + primary.replace(/[^a-z0-9]/gi, '_')].textContent === '$180.00');
  ok('…and the day cell shows the merged figure', /80/.test(w.els['tc-' + primary.replace(/[^a-z0-9]/gi, '_') + '-11_5'].innerHTML));
}
{
  // two spellings BOTH holding money on the same day: the row's own spelling is edited, and the
  // editor says what else is there instead of silently summing it in
  const w = world({ people, aliases, cells: { 'Priscilla La Gace': { '11/3': { p: 100 } }, 'Priscill Lagace': { '11/3': { p: 40 } } } });
  w.tips();
  const primary = w.st().rowGroups['Priscill Lagace'].primary;
  w.editGroup(primary, '11/3');
  ok('two spellings on one day → the row\'s own spelling is edited', w.edit().name === primary);
  ok('…and the editor names the other amount, "not edited here"', /not edited here/.test(w.popup && w.popup.innerHTML || ''));
}

// ── THE ROW'S DROPDOWN SETS THE STAFF DEPARTMENT (Vinny: "can i move people to their department
// right from here?") — one write through staffWriteOp; the row moves because the department did ──
const deptSection = (html, label) => { const i = html.indexOf('>' + label + '<'); if (i < 0) return null; const m = [...html.slice(0, i).matchAll(/<tr style="background:var\(--surface2\)">\s*<th[^>]*>([^<]+)<\/th>/g)]; return m.length ? m[m.length - 1][1] : null; };
{
  // Jarvis's test: picking Bar on a NO DEPARTMENT YET row
  const w = world({ people: { ...P('priscilla lagace', 'Priscilla Lagace', { pid: 'p1', paychex_id: '455' }) }, aliases, cells });
  let html = w.tips();
  const before = { sec: deptSection(html, 'Priscilla Lagace'), paid: paidOf(rowHtml(html, 'Priscilla Lagace')), grand: JSON.stringify(w.grand()) };
  ok('fixture: the person starts in NO DEPARTMENT YET', before.sec === 'NO DEPARTMENT YET' && before.paid === '$160.00');
  await w.setDept('Priscilla Lagace', 'bartender');
  ok('⛔ ONE write, through staffWriteOp, setting department on the Staff person the row resolves to', w.calls.writes.length === 1 && w.calls.writes[0].op === 'update' && w.calls.writes[0].pid === 'p1' && w.calls.writes[0].patch.department === 'bartender');
  html = w.tips();
  ok('⛔ the row moves to BARTENDERS — every spelling with it, still ONE row', deptSection(html, 'Priscilla Lagace') === 'BARTENDERS' && rowsNamed(html, 'Priscilla Lagace') === 1);
  ok('⛔ …with the same figures', paidOf(rowHtml(html, 'Priscilla Lagace')) === before.paid);
  ok('⛔ …and the grand total unchanged', JSON.stringify(w.grand()) === before.grand);
  ok('⛔ nothing is written to the retired per-sheet moves', w.st().moves === undefined);
}
{
  const w = world({ people: { ...P('amy server', 'Amy Server', { pid: 'a1', department: 'server' }) }, cells: { 'Amy Server': { '11/3': { p: 10 } } } });
  await w.setDept('Amy Server', '');
  ok('"—" CLEARS the department (null, not an empty string)', w.calls.writes.length === 1 && w.calls.writes[0].patch.department === null);
  await w.setDept('Amy Server', '');
  ok('picking what is already saved sends nothing', w.calls.writes.length === 1);
  await w.setDept('Amy Server', 'kitchen');
  ok('Kit → kitchen', w.calls.writes[1].patch.department === 'kitchen');
  await w.setDept('Amy Server', 'not-a-department');
  ok('⛔ a value that is not a real department is never sent as one (clears instead)', w.calls.writes[2].patch.department === null);
}
{
  const w = world({ people: { ...P('amy server', 'Amy Server', { pid: 'a1', department: 'server' }) }, cells: { 'Amy Server': { '11/3': { p: 10 } } }, writeOk: false });
  await w.setDept('Amy Server', 'busser');
  ok('a refused write redraws, so the dropdown shows what is actually saved', w.calls.redraws === 1 && w.st() && true);
}
{
  const w = world({ people, aliases, cells: { ...cells, 'Mike Fornero': { '11/3': { p: 50 } } } });
  const html = w.tips();
  ok('⛔ an unlinked ⚑ name shows NO department dropdown — its fix is the ⚑ link first', !/onchange="tipSetDept\('Mike Fornero'/.test(rowHtml(html, 'Mike Fornero')));
  await w.setDept('Mike Fornero', 'server');
  ok('…and even called directly, nothing is written for it', w.calls.writes.length === 0);
}
{
  const w = world({ people: { ...P('amy server', 'Amy Server', { pid: 'a1', department: 'server' }) }, cells: { 'Amy Server': { '11/3': { p: 10 } } }, readOnly: true });
  ok('⛔ read-only (mini unreachable): the dropdown is disabled, same as Staff', /<select title="Department — saved on Staff" disabled/.test(rowHtml(w.tips(), 'Amy Server')));
}
{
  const w = world({ people: { ...P('amy server', 'Amy Server', { pid: 'a1', department: 'server' }) }, cells: { 'Amy Server': { '11/3': { p: 10 } } } });
  const tr = rowHtml(w.tips(), 'Amy Server');
  ok('the dropdown offers Srv/Bar/Bus/Run/Wed/Kit/— and shows the saved department', ['Srv', 'Bar', 'Bus', 'Run', 'Wed', 'Kit', '—'].every(l => tr.includes('>' + l + '<')) && /value="server" selected/.test(tr));
}

// ── taking the person out of a period removes every spelling, behind ONE confirm ──────────
{
  const w = world({ people, aliases, cells, hours });
  w.hours();
  const primary = w.st().rowGroups['Priscill Lagace'].primary;
  w.delGroup(primary);
  ok('⛔ one confirm, naming every spelling', w.calls.confirms.length === 1 && /Priscill Lagace/.test(w.calls.confirms[0]) && /Priscilla La Gace/.test(w.calls.confirms[0]));
  ok('⛔ both spellings\' hours and tips are gone from the period', !w.st().hours['Priscill Lagace'] && !w.st().hours['Priscilla La Gace'] && !w.st().cells['Priscill Lagace'] && !w.st().cells['Priscilla La Gace']);
  ok('…and both are remembered as taken out (the wedding pull can\'t re-add either)', w.st().hoursOut['Priscill Lagace'] && w.st().hoursOut['Priscilla La Gace']);
}
{
  const w = world({ people, aliases, cells, hours, confirmAnswer: false });
  w.hours();
  w.delGroup(w.st().rowGroups['Priscill Lagace'].primary);
  ok('declining the confirm removes nothing', Object.keys(w.st().cells).length === 2 && Object.keys(w.st().hours).length === 2);
}

// ── what must NOT merge ──────────────────────────────────────────────────────────────────
{
  // two DIFFERENT Staff people never merge, even with similar names
  const w = world({ people: { ...P('ann lee', 'Ann Lee', { pid: 'a1', department: 'server' }), ...P('anne lee', 'Anne Lee', { pid: 'a2', department: 'server' }) }, cells: { 'Ann Lee': { '11/3': { p: 10 } }, 'Anne Lee': { '11/3': { p: 20 } } } });
  const html = w.tips();
  ok('⛔ two different Staff people stay two rows', rowsNamed(html, 'Ann Lee') === 1 && rowsNamed(html, 'Anne Lee') === 1);
}
{
  // a name Staff can't resolve is its own row (nothing to merge it with until it's linked)
  const w = world({ people, aliases, cells: { ...cells, 'Mike Fornero': { '11/3': { p: 50 } } } });
  const html = w.tips();
  ok('an unmatched name stays its own row, beside the merged one', rowsNamed(html, 'Mike Fornero') === 1 && rowsNamed(html, 'Priscilla Lagace') === 1);
}

// ── one person, one Worker ID — and it comes ONLY from Staff ──────────────────────────────
{
  // no Staff ID; the old list had IDs for the spellings (MICROS numbers) → ignored, person left off, named once
  const w = world({ people: { ...P('priscilla lagace', 'Priscilla Lagace', { pid: 'p1', department: 'server' }) }, aliases, cells, empIds: { 'Priscill Lagace': '455', 'Priscilla La Gace': '409' } });
  const out = w.csv();
  ok('⛔ no Staff ID → the person is LEFT OFF (old-list 455/409 never used), and named ONCE, not once per spelling', out.people.length === 0 && !/,455,|,409,/.test(out.csv) && out.skipped.length === 1);
}
{
  // Staff has the ID → every spelling exports under it, as one person
  const w = world({ people: { ...P('priscilla lagace', 'Priscilla Lagace', { pid: 'p1', department: 'server', paychex_id: '455' }) }, aliases, cells, empIds: { 'Priscill Lagace': '13' } });
  const out = w.csv(), lines = out.csv.split('\n').slice(1);
  ok('Staff\'s ID covers every spelling (one person, one Worker ID — the old 13 never appears)', out.people.length === 1 && lines.length > 0 && lines.every(l => l.split(',')[1] === '455'));
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
