import {JSDOM} from 'jsdom';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=new URL('../dist/',import.meta.url).pathname;
let pages=0,joins=0,links=0;
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){walk(p);continue;}if(!p.endsWith('.html'))continue;const dom=new JSDOM(readFileSync(p,'utf8'),{url:'https://example.test/'+path.relative(root,p)});const d=dom.window.document;pages++;
for(const el of d.querySelectorAll('[src],a[href],link[rel=stylesheet],link[rel=icon]')){const value=el.getAttribute('src')||el.getAttribute('href');if(!value||/^(https?:|data:|mailto:|tel:|#)/.test(value))continue;let target=path.resolve(path.dirname(p),decodeURI(value.split(/[?#]/)[0]));assert.ok(existsSync(target),`${p}: missing ${value}`);links++;}
if(!p.includes('/matrimony/')&&!p.endsWith('404.html')){const c=d.querySelectorAll('.start');assert.ok(c.length>0,'Join CTA '+p);joins+=c.length;}
dom.window.close();}}
walk(root);
const config=readFileSync(root+'assets/js/site-config.js','utf8');assert.match(config,/matrimony\/index.html/);
assert.match(readFileSync(root+'assets/js/site.js','utf8'),/location.assign\(localUrl\(window.FH_CONFIG.registrationUrl\)\)/);
const inputs=JSON.parse(readFileSync(new URL('../docs/bundle-inputs.json',import.meta.url)));assert.ok(!inputs.some(x=>/dating-preview|dating\.tsx|dating-network/.test(x)));
assert.ok(!readFileSync(root+'matrimony/assets/app.js','utf8').includes('openFavoriteDating'));
console.log(`PASS ${pages} HTML pages, ${joins} linked join controls, ${links} local asset/navigation targets; matrimony-only bundle.`);
for(const suite of ['join-links','matrimony-accounts','matrimony-publish','trust-edit-ui','access-policy','invitation-policy','delegation-transfer','oct09-policy','v7-policy'])execFileSync(process.execPath,[new URL(suite+'.mjs',import.meta.url).pathname],{stdio:'inherit'});
console.log('All integrated demo checks passed. DOM simulation only; no visual browser verification.');
