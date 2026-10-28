const resourceQuestions=[...document.querySelectorAll('.resource-questions details')];
resourceQuestions.forEach(item=>{item.querySelector('summary').addEventListener('click',()=>{if(!item.open)resourceQuestions.forEach(other=>{if(other!==item)other.open=false})});item.addEventListener('toggle',()=>{if(item.open)resourceQuestions.forEach(other=>{if(other!==item)other.open=false});window.FH.updateHeader()})});
const resourceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
if(!resourceMotion.matches&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('[data-reveal],.resource-intro h1,.resource-band>h2,.resource-end h2').forEach(el=>{el.classList.add('resource-reveal');observer.observe(el)});resourceMotion.addEventListener?.('change',e=>{if(e.matches){document.querySelectorAll('.resource-reveal').forEach(el=>el.classList.add('is-visible'));observer.disconnect()}})}


const currencyToggle=document.querySelector('#currency-toggle');
if(currencyToggle){
 function setCurrency(){const diaspora=currencyToggle.checked;document.querySelectorAll('[data-price-local]').forEach(price=>price.textContent=diaspora?price.dataset.priceDiaspora:price.dataset.priceLocal);document.querySelectorAll('.plan-currency').forEach(currency=>currency.textContent=diaspora?'USD':'LKR');document.querySelector('#currency-local').classList.toggle('selected',!diaspora);document.querySelector('#currency-overseas').classList.toggle('selected',diaspora);document.querySelector('#market-description').textContent=diaspora?'For Sri Lankans living overseas. Prices shown in USD.':'For members based in Sri Lanka. Prices shown in LKR.';}
 try{const preferences=JSON.parse(localStorage.getItem('fh-visitor-preferences'));currencyToggle.checked=!!preferences?.country&&preferences.country!=='LK'}catch{}
 document.addEventListener('fh:preferences',event=>{currencyToggle.checked=event.detail.country!=='LK';setCurrency()});currencyToggle.addEventListener('change',setCurrency);setCurrency();
}
