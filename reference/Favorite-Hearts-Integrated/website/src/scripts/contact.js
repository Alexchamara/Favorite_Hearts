// Enforce exclusive disclosure on browsers without native details grouping.
const contactQuestions=[...document.querySelectorAll('.contact-questions details')];
contactQuestions.forEach(item=>{
 const summary=item.querySelector('summary');
 summary.addEventListener('click',()=>{
  if(!item.open)contactQuestions.forEach(other=>{if(other!==item)other.open=false});
 });
 item.addEventListener('toggle',()=>{
  if(item.open)contactQuestions.forEach(other=>{if(other!==item)other.open=false});
 });
});

const contactMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
if(!contactMotion.matches&&'IntersectionObserver' in window){
 const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');reveal.unobserve(entry.target)}}),{threshold:.08});
 document.querySelectorAll('.contact-intro h1,.contact-intro>p:last-child,.contact-card,.contact-guide>div:first-child,.contact-questions details').forEach(el=>{el.classList.add('contact-reveal');reveal.observe(el)});
 contactMotion.addEventListener?.('change',e=>{if(e.matches){document.querySelectorAll('.contact-reveal').forEach(el=>el.classList.add('is-visible'));reveal.disconnect()}});
}
