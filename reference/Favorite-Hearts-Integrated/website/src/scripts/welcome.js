/** Visitor preferences are opened only through the footer control. */
(() => {
  'use strict';
  const modal = document.querySelector('#welcome-dialog');
  const form = document.querySelector('#welcome-form');
  const country = document.querySelector('#welcome-country');
  const reopen = document.querySelector('.visitor-preferences');
  if (!modal || !form || !country) return;
  const preferenceKey = 'fh-visitor-preferences';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(preferenceKey)); } catch (_) { /* Storage is optional. */ }
  const valid = saved && ['en','si'].includes(saved.language) && [...country.options].some(option => option.value === saved.country);
  if (valid) { country.value = saved.country; form.elements.language.value = saved.language; }
  const languageNote = () => { document.querySelector('#language-note').hidden = form.elements.language.value !== 'si'; };
  function updateLabel() {
    if (reopen) reopen.querySelector('span').textContent = (form.elements.language.value === 'si' ? 'සිංහල' : 'English') + ' · ' + country.selectedOptions[0].textContent;
  }
  function open() {
    window.FH?.setMenu(false);
    languageNote();
    if (modal.open) return;
    modal.showModal();
    document.body.classList.add('welcoming');
    document.querySelector('#welcome-title').focus({preventScroll:true});
  }
  form.addEventListener('change', languageNote);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const preferences = {language:form.elements.language.value, country:country.value};
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch (_) {}
    updateLabel(); modal.close();
    document.dispatchEvent(new CustomEvent('fh:preferences', {detail:preferences}));
  });
  modal.addEventListener('close', () => document.body.classList.remove('welcoming'));
  reopen?.addEventListener('click', open);
  updateLabel();
  // Never interrupt arrival, including legacy ?welcome=1 links.
})();
