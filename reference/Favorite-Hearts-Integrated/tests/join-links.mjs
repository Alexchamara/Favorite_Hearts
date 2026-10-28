import {JSDOM} from 'jsdom';
import {readFileSync,readdirSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=new URL('../dist/',import.meta.url).pathname;
const config=readFileSync(root+'assets/js/site-config.js','utf8');
const script=readFileSync(root+'assets/js/site.js','utf8').replace('document.currentScript.src','"https://preview.test/assets/js/site.js"').replaceAll('location.assign(', 'window.__navigate(');
let count=0;
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='matrimony')walk(p);continue;}if(!p.endsWith('index.html'))continue;const dom=new JSDOM(readFileSync(p,'utf8'),{runScripts:'outside-only',url:'https://preview.test/'+path.relative(root,p),pretendToBeVisual:true});const w=dom.window;w.matchMedia=()=>({matches:true});let target;w.__navigate=url=>target=url;w.eval(config);w.eval(script);for(const button of w.document.querySelectorAll('.start')){target=null;button.click();assert.equal(target,'https://preview.test/matrimony/index.html',p);count++;}w.close();}}
walk(root);console.log('PASS '+count+' join-button click handlers across all website pages.');
