import {productHtml} from './fixture.mjs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('CSS'))errors.push(e.cause?.stack||e.message)});vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(productHtml().replace(/<style>[\s\S]*?<\/style>/g,''),{runScripts:'dangerously',url:'https://preview.test',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})}});
const w=dom.window,d=w.document;w.openFavoriteLanding=()=>{};const wait=(n=35)=>new Promise(r=>setTimeout(r,n));let checks=0;
function expect(text){assert.ok(d.querySelector('#favorite-hearts-product').textContent.includes(text),'Expected '+text);checks++}
async function click(text,{exact=true,trap=false,root=d.querySelector('#favorite-hearts-product')}={}){const b=[...root.querySelectorAll('button')].find(b=>exact?b.textContent.trim()===text:b.textContent.includes(text));assert.ok(b,'Missing button '+text);assert.equal(b.disabled,false,'Disabled '+text);if(trap)b.addEventListener('click',e=>e.stopPropagation(),{once:true});b.click();await wait();}
async function field(label,value){const l=[...d.querySelectorAll('.m-field')].find(l=>l.querySelector('span')?.textContent===label);assert.ok(l,'Missing field '+label);const el=l.querySelector('input,select,textarea');const proto=el.tagName==='SELECT'?w.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await wait();}
async function picker(key,values){d.querySelector('[data-action="picker:'+key+'"]').click();await wait();const wheels=[...d.querySelectorAll('.fh-wheel')];for(let i=0;i<values.length;i++){const b=[...wheels[i].querySelectorAll('button')].find(b=>b.textContent===values[i]);assert.ok(b,'picker option '+values[i]);b.click();}await click('Done');checks++;}
async function enter(){w.openFavoriteMatrimony();await wait();await click('Continue');}
async function signout(){d.querySelector('.m-more-button').click();await wait();await click('Log out');}
async function reactField(label,value){const el=[...d.querySelectorAll('.m-field')].find(l=>l.querySelector('span')?.textContent.trim()===label)?.querySelector('input,textarea');assert.ok(el,label);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();}

async function setInput(el,value){assert.ok(el);const proto=el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await wait();}
const badge=(id)=>d.querySelector('[data-badge="'+id+'"]');
try{
await wait();await enter();await click('Explore sample accounts');await wait(100);
const actor=d.querySelector('[aria-label="Preview account"]').value;
let a=w.__heartsNetwork.accounts[actor];a.me.role='Mother';a.me.manager='Parent Test';a.me.candidateEmail='candidate@example.test';a.consentStatus='pending';a.plan='matrimony';a.planExpires=new Date(Date.now()+86400000).toISOString();
await click('Refresh status');await setInput(d.querySelector('[aria-label="Demo access role"]'),'manager');
// Same value does not trigger a role change; navigate through menu.
d.querySelector('.m-more-button').click();await wait();await click('Trust & access');
let sections=[...d.querySelectorAll('.m-trust-section')];assert.ok(sections[0].textContent.includes('Manager verification'));assert.ok(sections[1].textContent.includes('candidate workspace'));checks+=2;
assert.equal(d.querySelectorAll('.m-verification-badge').length,3);assert.equal(badge('manager').dataset.state,'empty');checks+=2;
await click('Start sample phone check');await setInput(d.querySelector('[aria-label="Demo phone code"]'),'246810');await click('Confirm code');await click('Submit sample evidence');assert.equal(badge('manager').dataset.state,'pending');assert.ok(badge('manager').textContent.includes('Awaiting admin review'));checks+=2;
a=w.__heartsNetwork.accounts[actor];a.trust.manager.document='approved';await click('Refresh status');assert.equal(badge('manager').dataset.state,'approved');checks++;
await click('Prepare candidate invitation');await click('Confirm');await click('Open candidate’s demo invitation');await wait(100);
sections=[...d.querySelectorAll('.m-trust-section')];assert.ok(sections[0].textContent.includes('STEP 1'));assert.ok(sections[1].textContent.includes('STEP 2'));assert.ok(sections[1].querySelector('.m-invitation-accept'));checks+=3;
const accept=()=>[...d.querySelectorAll('button')].find(b=>b.textContent==='Accept invitation');assert.ok(accept().disabled);checks++;
await click('Start sample phone check');await setInput(d.querySelector('[aria-label="Demo phone code"]'),'246810');await click('Confirm code');d.querySelector('.m-invitation-accept input').click();await wait();assert.equal(accept().disabled,false);checks++;
await click('Accept invitation');assert.equal(w.__heartsNetwork.accounts[actor].access.status,'active');assert.equal(w.__heartsNetwork.accounts[actor].trust.candidate.document,'not_started');assert.equal(badge('confirmation').dataset.state,'approved');checks+=3;
// Identity remains available after acceptance.
d.querySelector('.m-trust-steps input[type=checkbox]').click();await wait();await click('Submit sample evidence');assert.equal(badge('identity').dataset.state,'pending');checks++;
// Existing profiles can jump to a section and save without revisiting every step.
await setInput(d.querySelector('[aria-label="Demo access role"]'),'manager');await click('Profile');await click('Edit profile');assert.equal(d.querySelectorAll('.m-step-labels button:disabled').length,0);assert.equal(d.querySelector('.m-header .ma-theme'),null);checks+=2;
await setInput(d.querySelector('[aria-label="Height"]'),'172');await click('Save and discover');assert.equal(w.__heartsNetwork.accounts[actor].me.height,'172');assert.equal(d.querySelector('.m-onboarding'),null);checks+=2;
await click('Profile');await click('Edit profile');await click('Your story');await click('Save and finish later');assert.equal(d.querySelector('.m-onboarding'),null);expect('Edit profile');checks++;
assert.equal(d.querySelector('.m-header .ma-theme'),null);checks++;
d.querySelector('.m-more-button').click();await wait();const theme=d.querySelector('.m-menu-theme');assert.ok(theme);const before=d.querySelector('.m-more-sheet').dataset.theme;theme.click();await wait();assert.notEqual(d.querySelector('.m-more-sheet').dataset.theme,before);assert.ok(d.querySelector('.m-menu-bottom .m-menu-logout'));checks+=3;
assert.deepEqual(errors,[]);console.log('PASS',checks,'ordered verification, badges, phone-only acceptance, quick edits, height and menu assertions');
}finally{dom.window.close()}
