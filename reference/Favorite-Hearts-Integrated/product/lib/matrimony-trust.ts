export type Seat='manager'|'candidate'|'reviewer';
export type CheckState={phone:boolean,document:'not_started'|'pending'|'approved'|'rejected',selfie:boolean,note:string,submittedAt?:string,challenge?:{expires:number,attempts:number}};
export type Trust={manager:CheckState,candidate:CheckState};
export type Access={status:'none'|'invited'|'active'|'revoked',expiresAt?:string,candidateJoined?:boolean,permissions:{edit:boolean,interests:boolean,privateDetails:boolean,horoscope?:boolean}};
export const blankCheck=():CheckState=>({phone:false,document:'not_started',selfie:false,note:''});
export const blankTrust=():Trust=>({manager:blankCheck(),candidate:blankCheck()});
export const blankAccess=():Access=>({status:'none',permissions:{edit:true,interests:true,privateDetails:true,horoscope:true}});
export function seatFor(s:any,seat:Seat='manager'):Seat{if(!['manager','candidate','reviewer'].includes(seat))throw new Error('Choose a valid demo access role.');return seat==='reviewer'?'reviewer':s.ownershipTransfer?.status==='approved'&&seat==='manager'?'manager':s.me.role==='Self'?'candidate':seat;}
export function badges(s:any){const t:Trust=s.trust||blankTrust();return {manager:s.me.role!=='Self'&&t.manager.phone&&t.manager.document==='approved',candidateConfirmed:s.me.role!=='Self'&&s.consentStatus==='confirmed',candidateIdentity:t.candidate.phone&&t.candidate.document==='approved'&&t.candidate.selfie};}
const need=(v:unknown,msg:string)=>{if(!v)throw new Error(msg)};
export function trustAction(s:any,a:any,seat:Seat,now=Date.now()){
 s.trust ||= blankTrust();s.access ||= blankAccess();const candidate=seat==='candidate';const manager=seat==='manager';
 switch(a.type){
 case 'candidateContact':need(manager&&s.me.role!=='Self','Only the manager can edit invitation contact details.');need(s.access.status!=='active','The connected candidate controls their identity; contact cannot be replaced.');need(!a.email||/^\S+@\S+\.\S+$/.test(a.email),'Enter a valid candidate email.');need(!a.phone||/^\+?[0-9]{9,15}$/.test(String(a.phone).replace(/[\s()-]/g,'')),'Enter a valid candidate phone.');s.me.candidateEmail=String(a.email||'').trim().slice(0,150);s.me.candidatePhone=String(a.phone||'').replace(/[\s()-]/g,'').slice(0,40);if(s.access.status==='invited')s.access={...blankAccess(),status:'none'};return true;
 case 'inviteCandidate':need(manager&&s.me.role!=='Self','Only the profile manager can invite the candidate.');need(s.access.status!=='active','The candidate is already connected and controls access.');need(a.confirm===true,'Confirm the candidate email or phone before inviting.');need(/^\S+@\S+\.\S+$/.test(s.me.candidateEmail)||/^\+?[0-9]{9,15}$/.test(s.me.candidatePhone||''),'Add the candidate email or phone first.');s.access={...blankAccess(),status:'invited',expiresAt:new Date(now+48*3600000).toISOString()};s.consentStatus='pending';return true;
 case 'joinCandidate':need(candidate&&s.access.status==='invited'&&Date.parse(s.access.expiresAt||'')>now,'This invitation is unavailable or expired. Ask the manager to renew it.');need(s.trust.candidate.phone,'Complete your own sample phone check below first.');need(a.confirm===true,'Review and approve the profile and manager first.');s.access.status='active';s.access.candidateJoined=true;s.consentStatus='confirmed';return true;
 case 'declineInvitation':need(candidate&&s.access.status==='invited','No invitation is awaiting a response.');s.access.status='revoked';s.consentStatus='declined';s.me.visible=false;s.published=false;return true;
 case 'permissions':need(candidate&&s.access.status==='active'&&(s.trust.candidate.phone||s.trust.candidate.selfie),'Verify at least your phone or selfie before setting permissions.');s.access.permissions={edit:!!a.permissions?.edit,interests:!!a.permissions?.interests,privateDetails:!!a.permissions?.privateDetails,horoscope:!!a.permissions?.horoscope};return true;
 case 'restoreCandidateConsent':need(candidate&&s.me.role!=='Self'&&(s.access.candidateJoined||s.access.status==='active'),'Only the previously connected candidate can restore consent.');need(a.confirm===true,'Review your profile before restoring consent.');s.consentStatus='confirmed';s.me.visible=false;s.published=false;return true;
 case 'removeManager':need(candidate&&s.access.status==='active','Only the connected candidate may remove the manager.');need(a.confirm===true,'Confirm removal of manager access.');s.access.candidateJoined=true;s.access.status='revoked';s.access.permissions={edit:false,interests:false,privateDetails:false,horoscope:false};return true;
 case 'revokeCandidateConsent':need(candidate&&s.me.role!=='Self','Only the candidate can withdraw consent.');s.consentStatus='declined';s.me.visible=false;s.published=false;return true;
 case 'verificationPhoneStart':{const person=a.person;need(['manager','candidate'].includes(person)&&seat===person,'Complete your own phone check.');const c=s.trust[person];c.challenge={expires:now+600000,attempts:0};return true;}
 case 'verificationPhoneConfirm':{const person=a.person;need(['manager','candidate'].includes(person)&&seat===person,'Complete your own phone check.');const c=s.trust[person];need(c.challenge&&c.challenge.expires>now,'Start a new sample phone check.');need(a.code==='246810','Use the displayed demo code 246810. No SMS is sent.');c.phone=true;delete c.challenge;return true;}
 case 'verificationSubmit':{const person=a.person;need(['manager','candidate'].includes(person)&&seat===person,'Submit only your own verification.');const c=s.trust[person];need(c.phone,'Complete the phone check first.');need(c.document!=='pending'&&c.document!=='approved','This submission is already pending or approved.');need(a.sample===true,'This preview accepts sample verification only.');c.document='pending';c.selfie=person==='candidate'&&a.selfie===true;c.submittedAt=new Date(now).toISOString();c.note='Sample checks only. No identity document collected.';return true;}
 case 'verificationReview':{need(seat==='reviewer','Open the private review workspace to review verification.');need(['manager','candidate'].includes(a.person),'Choose a verification subject.');const c=s.trust[a.person];need(c.document==='pending','This submission is not awaiting review.');need(['approved','rejected'].includes(a.decision),'Choose a review decision.');need(a.decision!=='rejected'||String(a.note||'').trim(),'Explain what needs to be corrected.');c.document=a.decision;c.note=String(a.note||'Sample evidence reviewed.').slice(0,300);if(a.decision==='rejected')c.selfie=false;return true;}
 }
 return false;
}
export function canManageHoroscope(s:any,seat:Seat){return seat==='reviewer'||s.me.role==='Self'&&!(s.ownershipTransfer?.status==='approved'&&seat==='manager')||seat==='manager'&&(s.access?.status==='active'?!!s.access.permissions.horoscope:s.access?.status!=='revoked'&&s.plan!=='essential'&&Date.parse(s.planExpires||'')>Date.now()&&s.trust?.manager.phone&&s.trust?.manager.document==='approved');}
export function requirePermission(s:any,a:any,seat:Seat){
 if(seat==='reviewer')return;
 need(!(s.ownershipTransfer?.status==='approved'&&seat==='manager'),'Manager access has been removed.');
 if(s.me.role==='Self')return;
 const access:Access=s.access||blankAccess();
 if(seat==='candidate'){
  const allowed=['joinCandidate','declineInvitation','verificationPhoneStart','verificationPhoneConfirm','verificationSubmit','permissions','removeManager','requestOwnership','revokeCandidateConsent','restoreCandidateConsent','payment'];
  need(allowed.includes(a.type),'Candidate access is limited to invitation, verification and manager permissions.');
  if(['joinCandidate','declineInvitation'].includes(a.type))return;
  if(access.status==='invited'&&['verificationPhoneStart','verificationPhoneConfirm','verificationSubmit'].includes(a.type)){need(Date.parse(access.expiresAt||'')>Date.now(),'This invitation has expired. Ask the manager to renew it.');return;}
  need(access.status==='active'||access.status==='revoked'&&access.candidateJoined,'Accept the candidate invitation first.');
  if(a.type==='payment')need(s.ownershipTransfer?.status==='requested','Request ownership transfer first.');return;
 }
 need(access.status!=='revoked','The candidate has removed manager access.');
 if(a.type==='requestOwnership')throw new Error('Only the candidate may request ownership.');
 if(['horoscope','compatibilityRequest','compatibilityConsent','compatibilityWithdraw'].includes(a.type)){need(canManageHoroscope(s,seat),'Ask the candidate to allow horoscope information and requests.');return;}
 if(access.status==='active'){
  need(a.type!=='deleteProfile','Only the candidate may delete the connected profile.');
  if(a.type==='profile')need(!['name','age','role','manager','candidateEmail'].some(k=>s.me[k]!==a.profile?.[k]),'The candidate controls identity and manager changes.');
  if(['profile','draft','coverVisibility','privacy','contact','photoUpload'].includes(a.type))need(access.permissions.edit,'The candidate has not granted profile and photo editing.');
  if(['interest','accept','decline','withdraw','reopen','revokeConnection'].includes(a.type))need(access.permissions.interests,'Ask the candidate for interest-management permission.');
 }
 need(a.type!=='candidateConsent','Only the candidate can give this consent.');
}

export function birthMissing(b:any,now=Date.now()):string[]{const missing:string[]=[];const d=String(b?.date||'');const stamp=Date.parse(d);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==d||stamp>=now)missing.push('valid past birth date');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b?.time||'')))missing.push('birth time');if(!String(b?.place||'').trim())missing.push('birthplace');if(!['exact','approximate'].includes(b?.accuracy))missing.push('exact or approximate birth-time accuracy');try{if(!b?.timezone)throw new Error();new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{missing.push('valid birth timezone');}return missing;}
export function compatibilityState(n:any,actor:string,other:string){const c=n.interests.find((i:any)=>(i.from===actor&&i.to===other)||(i.from===other&&i.to===actor));const r=c?.astrology;if(!r)return {status:'not_requested',method:'',mine:false,theirs:false,missing:[] as string[]};const mine=!!r.consents[actor],theirs=!!r.consents[other];const missing:string[]=[];for(const id of [actor,other]){const s=n.accounts[id];missing.push(...birthMissing(s.horoscope).map(label=>s.me.name+': '+label));}return {status:!mine||!theirs?'awaiting_consent':missing.length?'needs_details':'ready_for_calculation',method:r.method,mine,theirs,missing,approximate:[actor,other].some(id=>n.accounts[id].horoscope?.accuracy==='approximate')};}
export const astrologyMethods=['Ashta Kuta','Tamil Porutham','Sri Lankan Porondam · practitioner review'];

export function canReadShared(s:any,seat:Seat){if(seat==='reviewer')return true;if(s.ownershipTransfer?.status==='approved'&&seat==='manager')return false;if(s.me.role==='Self')return true;return seat==='manager'&&(s.access?.status==='active'?!!s.access.permissions.privateDetails:s.access?.status!=='revoked');}
