// RUN EVERY CHECK IN THIS FOLDER.
//
//     node tools/check-all.mjs
//
// ⚠️ A CRASH IS A FAILURE, NOT A SKIP. check-publish-shape sat broken for a whole
// session because nothing ran it: a global joined the publish payload, the sandbox in
// that file did not get it, and the ReferenceError went to a terminal nobody was
// reading. The publish kept working; its shape simply stopped being checked. The count
// below is the tell — a file reporting zero assertions did not pass, it never ran.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = new URL('.', import.meta.url);
const files = readdirSync(dir).filter((f) => f.startsWith('check-') && f !== 'check-all.mjs').sort();

let bad = 0, total = 0;
for (const f of files) {
  let out = '', crashed = false;
  try {
    out = execFileSync('node', [new URL(f, dir).pathname], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    crashed = !/\n\d+ FAILED|all good/.test(out);
  }
  const n = (out.match(/^ {2}ok /gm) || []).length;
  const fails = (out.match(/^ {2}FAIL/gm) || []).length;
  total += n;
  const broke = crashed || fails;
  if (broke) bad++;
  console.log(`  ${broke ? 'FAIL' : 'ok  '}  ${f.padEnd(30)} ${String(n).padStart(3)} checks${
    crashed ? '  ⚠️  CRASHED — the rest of this file never ran' : fails ? `  ${fails} failed` : ''}`);
  if (broke) console.log(out.split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 6).map((l) => '        ' + l).join('\n'));
}
console.log(`\n${files.length} files, ${total} assertions`);
process.exit(bad ? 1 : 0);
