const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('.accordion-item button').forEach(button=>button.addEventListener('click',()=>{
 const opening=button.getAttribute('aria-expanded')!=='true';
 document.querySelectorAll('.accordion-item button').forEach(other=>{const open=other===button&&opening;other.setAttribute('aria-expanded',String(open));const panel=document.getElementById(other.getAttribute('aria-controls'));panel.classList.toggle('open',open);panel.inert=!open});
}));
const track=document.querySelector('.principles-track'),cards=[...track.querySelectorAll('.principle')];
let active=0,scrollFrame;
function updatePrinciples(){const left=track.getBoundingClientRect().left;active=cards.reduce((best,card,i)=>Math.abs(card.getBoundingClientRect().left-left)<Math.abs(cards[best].getBoundingClientRect().left-left)?i:best,0);document.querySelectorAll('.principle-dashes span').forEach((d,i)=>d.classList.toggle('active',i===active));scrollFrame=null}
function goTo(index){index=Math.max(0,Math.min(cards.length-1,index));track.scrollTo({left:track.scrollLeft+cards[index].getBoundingClientRect().left-track.getBoundingClientRect().left,behavior:reduced.matches?'instant':'smooth'})}
track.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updatePrinciples)},{passive:true});window.addEventListener('resize',updatePrinciples);
track.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();goTo(e.key==='Home'?0:e.key==='End'?cards.length-1:active+(e.key==='ArrowRight'?1:-1))}});
let drag=null;track.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,left:track.scrollLeft,index:active};track.setPointerCapture(e.pointerId);track.classList.add('dragging')}});track.addEventListener('pointermove',e=>{if(drag)track.scrollLeft=drag.left+drag.x-e.clientX});
function endDrag(e){if(!drag)return;const dx=drag.x-e.clientX,index=drag.index;drag=null;track.classList.remove('dragging');goTo(Math.abs(dx)>45?index+(dx>0?1:-1):index)}
track.addEventListener('pointerup',endDrag);track.addEventListener('pointercancel',()=>{drag=null;track.classList.remove('dragging');goTo(active)});updatePrinciples();


// Draw once when the arrow reaches the viewport; respect reduced motion.
const missionArrow=document.querySelector('.mission-draw-arrow');
if(!reduced.matches)missionArrow.classList.add('arrow-ready');
const valueNumbers=[...document.querySelectorAll('.value-number')];
let fillFrame=null;
function numberFillProgress(top,height,viewport){return Math.max(0,Math.min(1,(viewport*.92-top)/(height*.65+viewport*.12)))}
function updateNumberFills(){
 valueNumbers.forEach(number=>{
  if(number.classList.contains('is-filled'))return;
  const rect=number.getBoundingClientRect();const progress=reduced.matches?1:numberFillProgress(rect.top,rect.height,window.innerHeight);
  number.style.setProperty('--number-empty',`${((1-progress)*100).toFixed(2)}%`);
  if(progress>=1)number.classList.add('is-filled');
 });fillFrame=null;
}
function queueNumberFills(){if(fillFrame===null)fillFrame=requestAnimationFrame(updateNumberFills)}
valueNumbers.forEach(number=>number.classList.add('fill-enabled'));
window.addEventListener('scroll',queueNumberFills,{passive:true});window.addEventListener('resize',queueNumberFills);
reduced.addEventListener?.('change',event=>{if(event.matches)missionArrow.classList.remove('arrow-ready');queueNumberFills()});updateNumberFills();

// Keep an available stock photograph visible if the external photo cannot load.
document.querySelectorAll('img[data-stock-fallback]').forEach(img=>{const fallback=()=>{if(img.dataset.stockFallback){const src=img.dataset.stockFallback;delete img.dataset.stockFallback;img.srcset='';img.src=src;img.alt='A couple enjoying a moment together'}};img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback()});
