import {horoscopeConsiderations,cleanSocials} from './matrimony-profile-options';
import {blankContext,localPreferences,validateContext,validateLocalPreferences} from './matrimony-discovery';
import {profiles as existingProfiles, initialState as baseState, applyAction as baseAction} from './domain';

export const members=existingProfiles.map((p,i)=>({...p,
  intent:['Marriage in 1–2 years','Marriage in 1–2 years','Marriage in 2–3 years','Ready for marriage','Marriage in 1–2 years','Marriage in 1–2 years'][i],
  education:['B.Arch · University of Moratuwa','BSc Computer Science','MSc Marketing','BSc Civil Engineering','BA Design','BA Audio Production'][i],
  religion:['Buddhist','Buddhist','Christian','Buddhist','Hindu','Buddhist'][i],
  marital:'Never married',height:[163,160,165,178,175,173][i],
  family:['A close-knit family in Colombo. Independence and family time both matter to me.','My mother is helping with introductions. Every decision is mine.','My family lives in Sri Lanka; we stay close across the distance.','My father is helping me find someone who shares my values.','My family values kindness, learning, and a welcoming home.','My guardian helps with introductions while I focus on work.'][i],
  values:[['Kindness','Growth','Family'],['Family','Honesty','Learning'],['Independence','Kindness','Adventure'],['Family','Balance','Honesty'],['Learning','Kindness','Creativity'],['Creativity','Family','Honesty']][i],
  privatePhoto:i===1||i===5,relocation:i===2||i===4?'Open to relocating':'Let’s discuss',
  horoscopeAvailable:i!==2&&i!==4,
}));
export const memberships=[
 {id:'essential',name:'Free membership',price:0,description:'Browse, edit and verify at your own pace.',features:['Create and edit your profile','Browse and filter published profiles','Save 3 shortlists, or 20 after phone/NIC approval','Publish free after phone/NIC approval','Verified free accounts receive anonymous interests']},
 {id:'matrimony',name:'Matrimony membership',price:2990,description:'Unlock introductions and private mutual connections.',features:['Send and accept interests','Browse verified published ads','Send, receive, accept or decline interests','Mutual private-detail access after acceptance','Shortlist, filters and consent-based contact sharing']},
 {id:'boost',name:'Profile boost',price:700,description:'24 hours of boosted placement after approval.',features:['Highlighted Boosted placement','Starts after receipt approval','Does not change membership or privacy']},
 {id:'ownership-transfer',name:'Take ownership of my account',price:1500,description:'One-time ownership transfer after payment approval.',features:['Remove the previous manager','Become self-managed','Keep your existing membership expiry']},
];
export const blankProfile=()=>({...baseState().me,name:'',age:28,city:'',job:'',bio:'',mode:'matrimony',role:'Self',manager:'',consent:false,visible:true,gender:'',country:'Sri Lanka',education:'',religion:'Prefer not to say',marital:'',height:'',language:'Sinhala, English',timeline:'Marriage in 1–2 years',family:'',relocation:'Open to discussing',values:['Kindness','Family'] as string[],candidateEmail:'',candidatePhone:'',familyInfo:{motherName:'',motherJob:'',fatherName:'',fatherJob:'',sisters:[] as string[],brothers:[] as string[]},incomeLevel:'Prefer not to say',hobbies:[] as string[],horoscopeConsideration:'Prefer not to say',socials:[] as {platform:string,url:string}[],agreement:false,context:blankContext()});
export const defaultPreferences=()=>({gender:'Women',minAge:24,maxAge:35,location:'Everywhere',religion:'Any faith',language:'Any language',timeline:'Any timeline',verified:false,...localPreferences()});
export const initialMatrimony=()=>({...baseState(),me:blankProfile(),draft:null as any,preferences:defaultPreferences(),consentStatus:'not_started',requests:[] as any[],photo:null as any,horoscope:{date:'',time:'',place:'',sign:'',note:'',accuracy:'unknown',timezone:'Asia/Colombo'},audit:[] as any[]});
export type MatrimonyState=ReturnType<typeof initialMatrimony>;
function requireThat(test:unknown,message:string):asserts test {if(!test)throw new Error(message)}
const text=(value:unknown,max=200)=>String(value??'').trim().slice(0,max);
export function isActive(s:MatrimonyState){return s.onboarded&&s.me.visible&&s.consentStatus!=='declined'}
export function applyMatrimony(input:MatrimonyState,a:any):MatrimonyState {
 let s=structuredClone(input);const now=new Date().toISOString();const p=members.find(x=>x.id===a.id);
 if(s.planExpires&&Date.parse(s.planExpires)<Date.now()){s.plan='essential';s.planExpires=null}
 if(['interest','accept','chatStart','message','request','save'].includes(a.type))requireThat(isActive(s),'Complete your profile, confirm sharing permissions, and resume visibility first.');
 switch(a.type){
 case 'draft': s.draft=a.draft;return s;
 case 'profile': {
  const m=a.profile;requireThat(m&&m.mode==='matrimony','This account is for Matrimony.');requireThat(m.agreement===true,'Confirm the candidate is 18+ and you are authorized to publish this profile.');
  requireThat(['Self','Mother','Father','Guardian','Family member','Authorized person'].includes(m.role),'Choose who manages this profile.');
  requireThat(['Man','Woman'].includes(m.gender),'Select the candidate’s gender.');
  requireThat(text(m.job)&&text(m.education),'Add occupation and education.');
  requireThat(m.height!==''&&m.height!=null&&Number.isInteger(Number(m.height))&&Number(m.height)>=100&&Number(m.height)<=230,'Choose a height between 100 and 230 cm, before saving.');
  requireThat(text(m.bio,600).length>=20,'Tell us a little more about the candidate (at least 20 characters).');
  requireThat(!m.candidateEmail||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.candidateEmail),'Enter a valid candidate email, or leave it empty for now.');
  requireThat(['Never married','Divorced','Widowed','Separated'].includes(m.marital),'Choose marital status.');
  requireThat(!m.hobbies||Array.isArray(m.hobbies)&&m.hobbies.length<=6,'Choose up to six hobbies.');
  const hobbies=[...new Set<string>((m.hobbies||[]).map((v:any)=>text(v,50)).filter(Boolean))];
  requireThat(horoscopeConsiderations.includes(m.horoscopeConsideration||'Prefer not to say'),'Choose your horoscope matching preference.');
  const socials=cleanSocials(m.socials);
  const fi=m.familyInfo||{};const familyInfo={motherName:text(fi.motherName,80),motherJob:text(fi.motherJob,100),fatherName:text(fi.fatherName,80),fatherJob:text(fi.fatherJob,100),sisters:Array.isArray(fi.sisters)?fi.sisters.slice(0,12).map((v:any)=>text(v,100)):[],brothers:Array.isArray(fi.brothers)?fi.brothers.slice(0,12).map((v:any)=>text(v,100)):[]};
  const changed=s.me.name!==text(m.name,60)||s.me.age!==Number(m.age)||s.me.role!==m.role||s.me.manager!==text(m.manager,60)||s.me.candidateEmail!==text(m.candidateEmail);
  const checked=baseAction(s,{type:'profile',profile:{...m,role:m.role==='Mother'||m.role==='Father'||m.role==='Family member'?'Parent':m.role,consent:m.role==='Self'||m.consent}});
  s={...s,...checked,me:{...blankProfile(),...checked.me,role:m.role,gender:m.gender,country:text(m.country,80),education:text(m.education),religion:text(m.religion,50),marital:text(m.marital,50),height:text(m.height,5),language:text(m.language,80),timeline:text(m.timeline,80),family:text(m.family,600),relocation:text(m.relocation,80),values:Array.isArray(m.values)?m.values.slice(0,5).map((v:any)=>text(v,25)):[],candidateEmail:text(m.candidateEmail),candidatePhone:text(m.candidatePhone,40),familyInfo,incomeLevel:text(m.incomeLevel,80),hobbies,socials,horoscopeConsideration:m.horoscopeConsideration||'Prefer not to say',agreement:true,context:validateContext(m.context,m.country)}};
  s.consentStatus=m.role==='Self'?'confirmed':changed?'pending':s.consentStatus;if(s.consentStatus==='declined')s.me.visible=false;s.draft=null;
  s.audit.unshift({id:crypto.randomUUID(),at:now,text:s.consentStatus==='pending'?'Managed profile saved; candidate confirmation is optional.':'Profile updated.'});return s;
 }
 case 'candidateConsent': requireThat(s.me.role!=='Self'&&s.consentStatus==='pending','No candidate consent is awaiting a response.');requireThat(['confirmed','declined'].includes(a.decision),'Choose a consent decision.');s.consentStatus=a.decision;s.me.visible=a.decision==='confirmed';s.audit.unshift({id:crypto.randomUUID(),at:now,text:`Candidate consent ${a.decision} (simulation).`});return s;
 case 'requestConsent':requireThat(s.me.role!=='Self','Self-managed profiles do not need a manager invitation.');s.consentStatus='pending';return s;
 case 'preferences': {
  const prefs=a.preferences;requireThat(['Everywhere','Sri Lanka','Living abroad'].includes(prefs.location),'Choose a valid location scope.');requireThat(Number.isInteger(+prefs.minAge)&&+prefs.minAge>=18&&+prefs.maxAge<=100&&+prefs.minAge<=+prefs.maxAge,'Choose a valid age range from 18 to 100.');
  requireThat(['Women','Men','Everyone'].includes(prefs.gender),'Choose who to discover.');

  s.preferences={...defaultPreferences(),gender:prefs.gender,minAge:+prefs.minAge,maxAge:+prefs.maxAge,location:text(prefs.location),religion:text(prefs.religion),language:text(prefs.language),timeline:text(prefs.timeline),verified:!!prefs.verified,...validateLocalPreferences(prefs)};return s;
 }
 case 'withdraw':requireThat(s.interests[a.id]==='sent','Only pending interests can be withdrawn.');delete s.interests[a.id];return s;
 case 'request': {
  requireThat(p&&!s.blocked.includes(a.id),'Profile unavailable.');requireThat(['photo','contact','horoscope'].includes(a.kind),'Choose an access type.');
  requireThat(s.interests[a.id]==='matched','Accept an interest before requesting private information.');
  if(a.kind==='horoscope'){requireThat(s.plan==='matrimony','Horoscope requests are included in Matrimony Circle.');requireThat(p.horoscopeAvailable,'This member has not offered horoscope details.');}
  requireThat(!s.requests.some(r=>r.profile===a.id&&r.kind===a.kind&&r.direction==='outgoing'&&r.status!=='declined'),'An access request already exists.');
  s.requests.unshift({id:crypto.randomUUID(),profile:a.id,kind:a.kind,status:'pending',direction:'outgoing',at:now});return s;
 }
 case 'demoIncomingRequest':requireThat(p&&s.interests[a.id]==='matched'&&!s.blocked.includes(a.id),'Choose a mutual connection.');requireThat(['photo','contact','horoscope'].includes(a.kind),'Unknown request type.');requireThat(!s.requests.some(r=>r.profile===a.id&&r.kind===a.kind&&r.direction==='incoming'&&r.status!=='declined'),'A request already exists.');s.requests.unshift({id:crypto.randomUUID(),profile:a.id,kind:a.kind,status:'pending',direction:'incoming',at:now});return s;
 case 'requestReview': {
  const r=s.requests.find(r=>r.id===a.id);requireThat(r&&r.status==='pending','This request has already been reviewed.');requireThat(!s.blocked.includes(r.profile),'This member is blocked.');requireThat(['approved','declined'].includes(a.decision),'Choose a decision.');r.status=a.decision;r.reviewedAt=now;return s;
 }
 case 'revoke':{const r=s.requests.find(r=>r.id===a.id);requireThat(r?.direction==='incoming'&&r.status==='approved','There is no access to revoke.');r.status='revoked';return s;}
 case 'horoscope':requireThat(a.details&&typeof a.details==='object','Enter birth details.');s.horoscope={date:text(a.details.date,20),time:text(a.details.time,20),place:text(a.details.place,80),sign:text(a.details.sign,50),note:text(a.details.note,500),accuracy:['exact','approximate','unknown'].includes(a.details.accuracy)?a.details.accuracy:'unknown',timezone:text(a.details.timezone,80)};return s;
 case 'block':s.requests=s.requests.filter(r=>r.profile!==a.id);break;
 case 'chatEnd':s.requests=s.requests.map(r=>r.profile===s.activeChat?{...r,status:'revoked'}:r);break;
 case 'privacy': if(a.key==='visible'&&a.value)requireThat(s.consentStatus!=='declined','This candidate has withdrawn consent. Only the candidate can restore it.');break;
 case 'selfieReview':requireThat(a.decision!=='rejected'||text(a.note),'Give the member a reason to retry.');break;
 case 'report':requireThat(text(a.reason).length>=3,'Choose a report reason.');break;
 case 'deleteProfile':requireThat(a.confirm==='DELETE','Type DELETE to close this demo profile.');return initialMatrimony();
 }
 return {...s,...baseAction(s,a)} as MatrimonyState;
}
