/** Shared navigation, surface colours, dialogs and keyboard behaviour. */
(() => {
  'use strict';
  const header = document.querySelector('header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#navigation');
  if (!header || !toggle || !nav) return;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let menuOpen = false, closeTimer;
  const background = [...document.querySelectorAll('main, footer')];
  function setMenu(open) {
    menuOpen = open;
    clearTimeout(closeTimer);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    header.classList.toggle('menu-closing', !open);
    background.forEach(element => { element.inert = open; });
    if (open) {
      nav.hidden = false;
      nav.inert = false;
      header.classList.add('menu-open');
      document.body.classList.add('locked');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (menuOpen) nav.classList.add('menu-visible');
      }));
    } else {
      nav.classList.remove('menu-visible');
      nav.inert = true;
      const finish = () => {
        if (menuOpen) return;
        nav.hidden = true;
        header.classList.remove('menu-open', 'menu-closing');
        document.body.classList.remove('locked');
      };
      if (reduced()) finish(); else closeTimer = setTimeout(finish, 650);
    }
  }
  toggle.addEventListener('click', () => setMenu(!menuOpen));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') { setMenu(false); toggle.focus(); }
    if (event.key === 'Tab') {
      const items = [...header.querySelectorAll('a[href],button:not([disabled])'), ...nav.querySelectorAll('a[href],button:not([disabled])')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  const themes = [...document.querySelectorAll('[data-theme]')];
  const photos = [...document.querySelectorAll('.hero,.photo,.mission-cover,.mission-photo,.labs-cover,.labs-photo,.story-cover')];
  let frame = 0;
  function updateHeader() {
    const y = header.offsetHeight / 2;
    const crosses = element => { const rect = element.getBoundingClientRect(); return rect.top <= y && rect.bottom > y; };
    const surface = photos.some(crosses) ? 'photo' : ([...themes].reverse().find(crosses)?.dataset.theme === 'dark' ? 'dark' : 'light');
    header.classList.toggle('solid', surface === 'light');
    header.classList.toggle('dark', surface === 'dark');
    header.classList.toggle('over-photo', surface === 'photo');
    frame = 0;
  }
  window.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(updateHeader); }, {passive:true});
  ['resize','load','pageshow'].forEach(event => window.addEventListener(event, updateHeader));
  const rootUrl = window.FH_OFFLINE_ROOT ? new URL(window.FH_OFFLINE_ROOT) : new URL('../../', document.currentScript.src);
  const localUrl = path => new URL((path.endsWith('/') ? path+'index.html' : path).replace(/^\//,''), rootUrl).href;
  window.FH = {updateHeader, setMenu, localUrl};
  updateHeader();
  const dialog = document.querySelector('#dialog');
  function openDialog(heading, paragraph, contact = false) {
    setMenu(false);
    document.querySelector('#dialog-title').textContent = heading;
    const content = document.querySelector('#dialog-content');
    content.replaceChildren();
    const p = document.createElement('p'); p.textContent = paragraph; content.append(p);
    if (contact) {
      const link = document.createElement('a'); link.className = 'pill'; link.href = localUrl('/contact/'); link.textContent = 'Contact our team'; content.append(link);
    }
    if (!dialog.open) dialog.showModal();
  }
  document.querySelectorAll('.start').forEach(button => button.addEventListener('click', () => {
    if (window.FH_CONFIG.registrationUrl) location.assign(localUrl(window.FH_CONFIG.registrationUrl));
    else openDialog('Your beginning starts here.', 'Talk to our team about membership and when registration will be available.', true);
  }));
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => openDialog(button.dataset.page, 'Our team can help you find the information you need.', true)));
  document.querySelectorAll('[data-social]').forEach(button => button.addEventListener('click', () => {
    const url = window.FH_CONFIG.social[button.dataset.social];
    if (url) location.assign(url);
    else openDialog('Find Favorite Hearts', 'Contact our team for the verified link to our official ' + button.dataset.social + ' page.', true);
  }));
  dialog?.querySelector('.close')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
})();
