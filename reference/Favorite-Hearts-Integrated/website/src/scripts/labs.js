const allPosts=document.querySelector('#all-posts'),extraCards=[...document.querySelectorAll('.advice-card')].slice(3);
allPosts.addEventListener('click',()=>{const expanded=allPosts.getAttribute('aria-expanded')!=='true';extraCards.forEach(card=>card.hidden=!expanded);allPosts.setAttribute('aria-expanded',String(expanded));allPosts.textContent=expanded?'Show fewer':'All posts';if(expanded)extraCards[0].querySelector('a').focus({preventScroll:true})});


// Keep an available stock photograph visible if the external photo cannot load.
document.querySelectorAll('img[data-stock-fallback]').forEach(img=>{const fallback=()=>{if(img.dataset.stockFallback){const src=img.dataset.stockFallback;delete img.dataset.stockFallback;img.srcset='';img.src=src;img.alt='A couple enjoying a moment together'}};img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback()});
