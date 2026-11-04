/**
 * Snap positions are measured after layout; indicators represent reachable positions. A carousel whose cards arrive
 * later (the live plans on the pricing page) is measured again on its `fh:cards` event.
 */
(() => {
  document.querySelectorAll('.pricing-carousel').forEach(root => {
    const track = root.querySelector('.pricing-track');
    let cards = [...track.querySelectorAll('article')];
    let dots = [];
    let targets = [0], active = 0, drag = null, frame = 0;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const status = document.createElement('span');
    status.className = 'sr-only'; status.setAttribute('aria-live', 'polite'); root.append(status);
    function update() {
      frame = 0;
      active = targets.reduce((best, target, i) => Math.abs(target - track.scrollLeft) < Math.abs(targets[best] - track.scrollLeft) ? i : best, 0);
      dots.forEach((dot,i) => dot.setAttribute('aria-current', String(i === active)));
      status.textContent = targets.length > 1 ? FH_TEXT('web.js.carousel.position', { n: active + 1, count: targets.length }) : FH_TEXT('web.js.carousel.allVisible');
    }
    function measure() {
      const max = Math.max(0, track.scrollWidth - track.clientWidth);
      const edge = track.getBoundingClientRect().left;
      targets = cards.map(card => Math.max(0, Math.min(max, track.scrollLeft + card.getBoundingClientRect().left - edge - 2)))
        .filter((target,i,list) => i === 0 || Math.abs(target - list[i-1]) > 4);
      if (!targets.length) targets = [0];
      dots.forEach((dot,i) => { dot.hidden = targets.length === 1 || i >= targets.length; dot.setAttribute('aria-label', FH_TEXT('web.js.carousel.show', { n: i + 1, count: targets.length })); });
      track.tabIndex = targets.length > 1 ? 0 : -1;
      root.querySelector('.pricing-dashes').hidden = targets.length === 1;
      update();
    }
    function go(i) { i = Math.max(0,Math.min(targets.length-1,i)); track.scrollTo({left:targets[i],behavior:reduced()?'auto':'smooth'}); }
    function bindDots() { dots = [...root.querySelectorAll('.pricing-dashes button')]; dots.forEach((dot,i) => { dot.onclick = () => go(i); }); }
    bindDots();
    root.addEventListener('fh:cards', () => { cards = [...track.querySelectorAll('article')]; bindDots(); measure(); });
    track.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, {passive:true});
    track.addEventListener('scrollend',update);
    track.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); go(event.key === 'Home' ? 0 : event.key === 'End' ? targets.length-1 : active + (event.key === 'ArrowRight' ? 1 : -1));
    });
    track.addEventListener('pointerdown',event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || targets.length < 2) return;
      drag = {x:event.clientX,left:track.scrollLeft,index:active}; track.setPointerCapture(event.pointerId); track.classList.add('dragging');
    });
    track.addEventListener('pointermove',event => { if (drag) track.scrollLeft = drag.left + drag.x - event.clientX; });
    track.addEventListener('pointerup',event => {
      if (!drag) return;
      const delta = drag.x-event.clientX,index = drag.index; drag = null; track.classList.remove('dragging');
      go(Math.abs(delta)>45 ? index + (delta>0?1:-1) : index);
    });
    track.addEventListener('pointercancel',()=>{drag=null;track.classList.remove('dragging');go(active);});
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);
    ['resize','pageshow','load'].forEach(event=>window.addEventListener(event,measure));
    measure();
  });
})();
