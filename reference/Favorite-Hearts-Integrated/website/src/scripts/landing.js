const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const approach=document.querySelector('#approach');
const reviews=[
  [
    "It felt good to talk openly about family, our values, and the future we wanted. We could take the time to get to know each other.",
    "Nethmi & Kavindu · Sample review"
  ],
  [
    "Living in different countries did not mean wanting different things. Our conversations helped us imagine a life together.",
    "Anjali & Dilan · Sample review"
  ],
  [
    "We appreciated having space to make our own choices, with our families supporting us along the way.",
    "Tharushi & Sameera · Sample review"
  ]
];
const carousel=document.querySelector('#reviews'),wrap=carousel.querySelector('.quote-wrap'),pause=document.querySelector('#pause');let current=0,timer,paused=reduceMotion.matches,hovering=false,inView=false;
function renderReview(index){current=(index+reviews.length)%reviews.length;document.querySelector('#quote').textContent=reviews[current][0];const credit=document.querySelector('#quote-credit');credit.textContent=reviews[current][1];document.querySelectorAll('.review-indicators span').forEach((dot,i)=>dot.classList.toggle('active',i===current));wrap.classList.remove('switching');void wrap.offsetWidth;wrap.classList.add('switching')}
function schedule(){clearInterval(timer);if(!paused&&!hovering&&inView&&!document.hidden)timer=setInterval(()=>renderReview(current+1),7000)}
function step(n){renderReview(current+n);schedule()}
function pauseLabel(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play automatic slides':'Pause automatic slides')};pauseLabel();pause.addEventListener('click',()=>{paused=!paused;pauseLabel();schedule()});carousel.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hovering=true;schedule()}});carousel.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){hovering=false;schedule()}});carousel.addEventListener('focusin',e=>{if(e.target!==pause){paused=true;pauseLabel();schedule()}});carousel.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();step(e.key==='ArrowLeft'?-1:1)}});
let pointerStart=null;wrap.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0){pointerStart={x:e.clientX,y:e.clientY};clearInterval(timer);wrap.setPointerCapture(e.pointerId)}});wrap.addEventListener('pointerup',e=>{if(!pointerStart)return;const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;pointerStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))step(dx<0?1:-1);else schedule()});wrap.addEventListener('pointercancel',()=>{pointerStart=null;schedule()});document.addEventListener('visibilitychange',schedule);
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;schedule()},{threshold:.25}).observe(carousel);else{inView=true;schedule()}

function homeMotionChanged(event){if(event.matches){paused=true;pauseLabel();schedule();}}
if(reduceMotion.addEventListener)reduceMotion.addEventListener('change',homeMotionChanged);else reduceMotion.addListener?.(homeMotionChanged);
