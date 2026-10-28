import {createRequire} from 'node:module';
import {writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../package.json',import.meta.url));const e=require('esbuild');
const f=new URL('./policy-bundle.mjs',import.meta.url);await e.build({entryPoints:[new URL('../product/lib/matrimony-network.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:f.pathname});
const {initialNetwork,applyNetwork,viewNetwork,eligible}=await import(f.href);unlinkSync(f);

let n=initialNetwork();const actor=Object.keys(n.accounts)[0];const a=n.accounts[actor];a.me.role='Mother';a.me.manager='Parent';a.me.candidateEmail='candidate@example.test';a.plan='matrimony';a.planExpires=new Date(Date.now()+86400000).toISOString();
n=applyNetwork(n,actor,{type:'inviteCandidate',confirm:true});
assert.throws(()=>applyNetwork(n,actor,{type:'verificationSubmit',person:'candidate',seat:'candidate',sample:true,selfie:true}),/phone check/);
n=applyNetwork(n,actor,{type:'verificationPhoneStart',person:'candidate',seat:'candidate'});
n=applyNetwork(n,actor,{type:'verificationPhoneConfirm',person:'candidate',seat:'candidate',code:'246810'});
const phoneOnly=applyNetwork(n,actor,{type:'joinCandidate',seat:'candidate',confirm:true});assert.equal(phoneOnly.accounts[actor].access.status,'active');assert.equal(phoneOnly.accounts[actor].trust.candidate.document,'not_started');
const pending=applyNetwork(n,actor,{type:'verificationSubmit',person:'candidate',seat:'candidate',sample:true,selfie:true});assert.equal(pending.accounts[actor].trust.candidate.document,'pending');assert.equal(pending.accounts[actor].access.status,'invited');
const accepted=applyNetwork(pending,actor,{type:'joinCandidate',seat:'candidate',confirm:true});assert.equal(accepted.accounts[actor].access.status,'active');assert.equal(accepted.accounts[actor].trust.candidate.document,'pending');
n.accounts[actor].access.expiresAt=new Date(0).toISOString();assert.throws(()=>applyNetwork(n,actor,{type:'verificationSubmit',person:'candidate',seat:'candidate',sample:true,selfie:true}),/expired/);
assert.throws(()=>applyNetwork(phoneOnly,actor,{type:'profile',seat:'manager',profile:{...phoneOnly.accounts[actor].me,height:'999'}}),/height/);
console.log('PASS 9 invitation-order, optional identity, expiry and height validation assertions');
