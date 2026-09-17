// Does the back-office key go to the right place, and does a 401 say the right thing?
//
//     node tools/check-backoffice-token.mjs
//
// These checks exist because all three of the things below have been wrong at least
// once in one evening: the key went to whatever address was typed into the connection
// card, the error blamed the key when the key was fine, and a lock shipped that broke
// three tabs nobody had listed. The rules are read straight out of index.html, so this
// fails when somebody edits the real thing rather than passing against a copy.
//
// ⚠️ Read this if you are about to write a throwaway test: the rest of this evening's
// checks lived in a temp directory and were deleted with it. A test that is not in the
// repo is a test that does not exist.
import { readFileSync } from 'node:fs';
const html = readFileSync('/Users/ernest/control-tower-2/index.html', 'utf8');
const ok=(t,c)=>console.log((c?'  ok  ':'  FAIL')+'  '+t);
const grab=(start,end)=>html.slice(html.indexOf(start), html.indexOf(end));
const src = grab('const posTrustedHost=','function posSaveConn');

const store={};
const ctx={ localStorage:{getItem:k=>store[k]||null}, posS:{srv:'https://mini.tail0739ce.ts.net:4320'},
  posFetch:()=>{}, posToken:()=>'', URL, RegExp, console, JSON, Object };
const F=new Function('ctx','with(ctx){'+src+'\nreturn {posTrustedHost,posBackOfficeAuth,posAuthNote,posOfficeToken};}')(ctx);

ok('the tailnet host is trusted', F.posTrustedHost('https://mini.tail0739ce.ts.net:4320'));
ok('localhost is trusted', F.posTrustedHost('http://localhost:4320'));
ok('A LAN IP IS NOT — the key is withheld', !F.posTrustedHost('http://192.168.1.60:4320'));
ok('nor is somebody else’s host', !F.posTrustedHost('https://evil.example.com'));

// no key at all
ok('no key → nothing to send', F.posBackOfficeAuth('https://m.ts.net') === null);
store['ct_kv_key']='sync-v';
ok('the sync key is sent while migrating',
   F.posBackOfficeAuth('https://m.ts.net')['x-sync-token'] === 'sync-v');
store['ct_office_key']='office-v';
const h=F.posBackOfficeAuth('https://m.ts.net');
ok('once the office key exists, ONLY that is sent',
   h['x-office-token']==='office-v' && !h['x-sync-token']);
ok('and never to an untrusted address', F.posBackOfficeAuth('http://192.168.1.60:4320') === null);

// the three faces of a 401
ctx.posS.srv='http://192.168.1.60:4320';
ok('a withheld key says SO, not "refused"', /not sent to/.test(F.posAuthNote()));
ctx.posS.srv='https://mini.tail0739ce.ts.net:4320';
ok('a key present but rejected says refused', /refused/.test(F.posAuthNote()));
delete store['ct_office_key']; delete store['ct_kv_key'];
ok('no key at all says no key', /no back-office key/.test(F.posAuthNote()));
