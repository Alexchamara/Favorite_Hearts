/**
 * Visitor preferences are opened only through the footer control. The language is the page's own: choosing the other
 * one opens this page in it (the header's language link). The choice is saved for the member app too
 * (apps/member lib/i18n.tsx reads fh-visitor-preferences).
 */
(() => {
  'use strict';
  const modal = document.querySelector('#welcome-dialog');
  const form = document.querySelector('#welcome-form');
  const country = document.querySelector('#welcome-country');
  const reopen = document.querySelector('.visitor-preferences');
  if (!modal || !form || !country) return;
  const preferenceKey = 'fh-visitor-preferences';
  const read = () => { try { return JSON.parse(localStorage.getItem(preferenceKey)) || {}; } catch (_) { return {}; } };
  const save = changes => { try { localStorage.setItem(preferenceKey, JSON.stringify({...read(), ...changes})); } catch (_) { /* Storage is optional. */ } };
  const saved = read();
  if ([...country.options].some(option => option.value === saved.country)) country.value = saved.country;
  const otherPage = document.querySelector('.language-link');
  document.querySelectorAll('.language-link, .menu-language').forEach(link => link.addEventListener('click', () => save({language: link.hreflang})));
  function updateLabel() {
    if (reopen) reopen.querySelector('span').textContent = FH_TEXT('web.js.thisLanguage') + ' · ' + country.selectedOptions[0].textContent;
  }
  function open() {
    window.FH?.setMenu(false);
    form.elements.language.value = FH_LANG;
    if (modal.open) return;
    modal.showModal();
    document.body.classList.add('welcoming');
    document.querySelector('#welcome-title').focus({preventScroll:true});
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const preferences = {language:form.elements.language.value, country:country.value};
    save(preferences);
    if (preferences.language !== FH_LANG && otherPage) { location.assign(otherPage.href); return; }
    updateLabel(); modal.close();
    document.dispatchEvent(new CustomEvent('fh:preferences', {detail:preferences}));
  });
  modal.addEventListener('close', () => document.body.classList.remove('welcoming'));
  reopen?.addEventListener('click', open);
  updateLabel();
  // Never interrupt arrival, including legacy ?welcome=1 links.
})();
