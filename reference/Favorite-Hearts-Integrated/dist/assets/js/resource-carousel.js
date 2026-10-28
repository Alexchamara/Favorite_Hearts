// Independent controllers keep scroll indicators local to each carousel.
(()=>{
 document.querySelectorAll('.security-carousel').forEach(root=>{
  const track=root.querySelector('.principles-track'),slides=[...track.querySelectorAll('.principle')],dots=[...root.querySelectorAll('.principle-dashes span')];
  if(!slides.length)return;
  let active=0,drag=null;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function update(){
   const edge=track.getBoundingClientRect().left;
   let nearest=0,distance=Infinity;
   slides.forEach((slide,index)=>{const delta=Math.abs(slide.getBoundingClientRect().left-edge);if(delta<distance){distance=delta;nearest=index}});
   active=nearest;
   dots.forEach((dot,index)=>{const current=index===active;dot.classList.toggle('active',current);dot.setAttribute('data-active',String(current));dot.style.setProperty('width',current?'52px':'26px','important');dot.style.setProperty('background-color',current?'#71377d':'#ccc','important')});
   root.dataset.activeSlide=String(active);
  }
  function go(index){index=Math.max(0,Math.min(slides.length-1,index));track.scrollTo({left:track.scrollLeft+slides[index].getBoundingClientRect().left-track.getBoundingClientRect().left,behavior:reduced()?'auto':'smooth'});}
  track.addEventListener('scroll',update,{passive:true});track.addEventListener('scrollend',update);track.addEventListener('touchmove',()=>requestAnimationFrame(update),{passive:true});track.addEventListener('touchend',()=>{update();setTimeout(update,150);setTimeout(update,500)},{passive:true});
  track.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:e.key==='End'?slides.length-1:active+(e.key==='ArrowRight'?1:-1))}});
  track.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,left:track.scrollLeft,index:active};track.setPointerCapture(e.pointerId);track.classList.add('dragging')}});
  track.addEventListener('pointermove',e=>{if(drag){track.scrollLeft=drag.left+drag.x-e.clientX;update()}});
  track.addEventListener('pointerup',e=>{if(!drag)return;const dx=drag.x-e.clientX,index=drag.index;drag=null;track.classList.remove('dragging');go(Math.abs(dx)>45?index+(dx>0?1:-1):index)});
  track.addEventListener('pointercancel',()=>{drag=null;track.classList.remove('dragging');update()});
  if('IntersectionObserver'in window){const observer=new IntersectionObserver(update,{root:track,threshold:[0,.25,.5,.75,1]});slides.forEach(slide=>observer.observe(slide));}
  if('ResizeObserver'in window)new ResizeObserver(update).observe(track);
  window.addEventListener('resize',update);window.addEventListener('pageshow',update);update();
 });
})();
