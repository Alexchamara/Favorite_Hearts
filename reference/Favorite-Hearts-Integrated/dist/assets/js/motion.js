/** Shared reveal/drawing lifecycle. Artwork is preserved; triggers are independently tested. */
(() => {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const circle = document.querySelector('#approach');
  const science = document.querySelector('.labs-opening');
  const arrow = document.querySelector('.mission-draw-arrow');
  const drawings = [
    circle && {target:circle.querySelector('h2'),root:circle,className:'drawing'},
    science && {target:science.querySelector('h1'),root:science,className:'drawing'},
    arrow && {target:arrow,root:arrow,className:'is-drawn'}
  ].filter(item=>item && item.target);
  function showDrawings() { drawings.forEach(item=>item.root.classList.add(item.className)); }
  if (media.matches || !('IntersectionObserver' in window)) { showDrawings(); return; }
  const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    drawings.filter(item=>item.target===entry.target).forEach(item=>item.root.classList.add(item.className));
    observer.unobserve(entry.target);
  }),{threshold:0.08});
  const nodes = new Set(document.querySelectorAll('main [data-reveal],main .section>h2,main .section>.label,main .offset>p,main .offset>.pill,.story h1,.story-summary,.legal-intro h1,.newsroom-intro h1'));
  drawings.forEach(item=>nodes.add(item.target));
  nodes.forEach(node=>{
    // SVG artwork must not be translated; its mask/path performs the drawing.
    if (node!==arrow) node.classList.add('fh-reveal');
    observer.observe(node);
  });
  const finish = event=>{if(event.matches){nodes.forEach(node=>node.classList.add('is-visible'));showDrawings();observer.disconnect();}};
  if (media.addEventListener) media.addEventListener('change',finish); else media.addListener?.(finish);
})();
