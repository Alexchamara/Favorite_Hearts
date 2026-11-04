/**
 * Pricing page (OWNER-DECISIONS section 2): the plans and their LKR and USD prices come from the live catalogue the
 * owner manages in the app (GET /api/v1/plans), so this page never shows a price members would not pay. Plan names and
 * descriptions are the owner's own text, so the cards are built with textContent, never as HTML. They are shown as the
 * owner wrote them; the page's own words come from FH_TEXT (site.js) in the page's language.
 */
(() => {
  'use strict';
  const section = document.querySelector('[data-plans]');
  if (!section) return;
  const carousel = section.querySelector('.pricing-carousel');
  const track = section.querySelector('.pricing-track');
  const dashes = section.querySelector('.pricing-dashes');
  const status = section.querySelector('#plans-status');
  const toggle = document.querySelector('#currency-toggle');
  const api = ((window.FH_CONFIG && window.FH_CONFIG.apiUrl) || '').replace(/\/$/, '');
  const icons = [
    ['M12 20S3 14.5 3 8.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1C21 14.5 12 20 12 20Z'],
    ['m12 2 2.6 6.8L22 12l-7.4 3.2L12 22l-2.6-6.8L2 12l7.4-3.2Z'],
    ['m3 7 5 4 4-7 4 7 5-4-2 12H5Z', 'M6 22h12'],
  ];
  let plans = [];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const amount = (minor) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
  const term = (months) => FH_TEXT('web.js.pricing.months', { count: months });
  const limits = (plan) =>
    plan.monthlyRequestCap === null
      ? FH_TEXT('web.js.pricing.unlimited', { daily: plan.dailyRequestCap })
      : FH_TEXT('web.js.pricing.limits', { daily: plan.dailyRequestCap, monthly: plan.monthlyRequestCap });

  function icon(index) {
    const wrap = el('span', 'plan-icon');
    wrap.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const d of icons[index % icons.length]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    wrap.append(svg);
    return wrap;
  }

  function card(plan, currency, index) {
    const article = el('article', 'plan-card');
    article.setAttribute('aria-label', FH_TEXT('web.js.pricing.planLabel', { name: plan.name }));
    const top = el('div', 'plan-topline');
    top.append(el('p', 'label', 'Favorite Hearts'), icon(index));
    article.append(top, el('h3', '', plan.name));
    if (plan.description) article.append(el('p', 'plan-tagline', plan.description));
    const price = plan.prices.find((p) => p.currency === currency);
    const line = el('p', 'plan-price');
    if (price) line.append(el('span', 'plan-currency', currency), document.createTextNode(' '), el('span', '', amount(price.amountMinor)));
    else line.append(el('span', 'plan-currency', FH_TEXT('web.js.pricing.notOffered', { currency })));
    article.append(line, el('p', 'plan-period', term(plan.termMonths)));
    const list = el('ul');
    for (const text of [limits(plan), FH_TEXT('web.js.pricing.interested'), FH_TEXT('web.js.pricing.accept'), FH_TEXT('web.js.pricing.contact')]) {
      list.append(el('li', '', text));
    }
    article.append(list, el('p', 'plan-selection', FH_TEXT('web.js.pricing.choose')));
    return article;
  }

  function render() {
    const currency = toggle && toggle.checked ? 'USD' : 'LKR';
    track.replaceChildren(...plans.map((plan, i) => card(plan, currency, i)));
    dashes.replaceChildren(
      ...plans.map((plan, i) => {
        const button = el('button');
        button.type = 'button';
        button.setAttribute('aria-label', FH_TEXT('web.js.pricing.show', { name: plan.name }));
        button.setAttribute('aria-current', String(i === 0));
        const mark = el('span');
        mark.setAttribute('aria-hidden', 'true');
        button.append(mark);
        return button;
      }),
    );
    carousel.dispatchEvent(new CustomEvent('fh:cards'));
  }

  function setMarket() {
    const diaspora = Boolean(toggle && toggle.checked);
    document.querySelector('#currency-local')?.classList.toggle('selected', !diaspora);
    document.querySelector('#currency-overseas')?.classList.toggle('selected', diaspora);
    const description = document.querySelector('#market-description');
    if (description) {
      description.textContent = diaspora
        ? FH_TEXT('web.js.pricing.overseas')
        : FH_TEXT('web.js.pricing.local');
    }
    if (plans.length) render();
  }

  if (toggle) {
    try {
      const saved = JSON.parse(localStorage.getItem('fh-visitor-preferences'));
      toggle.checked = Boolean(saved && saved.country && saved.country !== 'LK');
    } catch (_) {
      // The saved preference is optional.
    }
    toggle.addEventListener('change', setMarket);
    document.addEventListener('fh:preferences', (event) => {
      toggle.checked = event.detail.country !== 'LK';
      setMarket();
    });
  }
  setMarket();

  fetch(`${api}/api/v1/plans`, { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((body) => {
      plans = Array.isArray(body.plans) ? body.plans : [];
      if (!plans.length) throw new Error('no plans on sale');
      status.hidden = true;
      carousel.hidden = false;
      render();
    })
    .catch(() => {
      status.textContent = FH_TEXT('web.js.pricing.failed');
    });
})();
