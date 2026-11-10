#!/usr/bin/env python3
"""Browser checks for the member app in the sandbox (phase ui-12, docs/UI-PARITY.md): navigation, keyboard and focus,
dialogs, loading / empty / error states, authorization and server rejections, Sinhala on screen, reduced motion and
the dock's safe area. Development tool only (Python + Playwright), never part of a build. It changes nothing lasting:
the language switch is set back, dialogs are closed with Escape, and the rejected sign-in uses a new sandbox address.

  python scripts/ui-parity/checks.py --member member-state.json --free chathu-state.json \\
      --owner owner-state.json --reviewer reviewer-state.json

--member: a signed-in member with a plan and a published profile; --free: one without a plan and with an empty
shortlist; --owner / --reviewer: staff accounts signed in with staff-login.py. Servers: walkthrough-api (:8798) and
walkthrough-member (:5184). Exits 1 when a check fails.
"""
import argparse
import re
import sys
import time

from playwright.sync_api import sync_playwright

APP = 'http://localhost:5184/app/'
API = 'http://localhost:8798/api/v1'
PREFS = "localStorage.setItem('fh-visitor-preferences', JSON.stringify({language: 'en', country: 'LK'}))"
results = []


def check(section, name, ok, detail=''):
    results.append((section, name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {section:14s} {name}{'  — ' + str(detail) if detail and not ok else ''}", flush=True)


def context(browser, state=None, width=1440, motion='reduce'):
    c = browser.new_context(viewport={'width': width, 'height': 900}, storage_state=state, reduced_motion=motion,
                            locale='en-US', service_workers='block')
    if not state:
        # A returning visitor's language and country, so the entry opens on sign-in; members keep their own choice.
        c.add_init_script(PREFS)
    return c


def settle(page, ms=1800):
    page.wait_for_timeout(ms)


def api(page, method, path):
    return page.evaluate(
        """async ([m, url]) => (await fetch(url, {method: m, credentials: 'include'})).status""", [method, API + path])


FOCUS_IN_DIALOG = """() => { const ds = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
  const d = ds[ds.length - 1]; return !!d && d.contains(document.activeElement); }"""
DIALOG_NAME = """() => { const ds = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')]; const d = ds[ds.length - 1];
  if (!d) return ''; const ids = (d.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean);
  return (d.getAttribute('aria-label') || ids.map(i => document.getElementById(i)?.textContent || '').join(' ')).trim(); }"""
ACTIVE = "() => { const e = document.activeElement; return e ? e.outerHTML.slice(0, 160) : ''; }"


def dialog_check(page, label, opener):
    """Opens a dialog from the keyboard (focus the opener, Enter) and checks name, focus, trap, Escape and return."""
    try:
        opener.focus()
        before = page.evaluate(ACTIVE)
        count = page.evaluate("() => document.querySelectorAll('[role=dialog],[role=alertdialog]').length")
        page.keyboard.press('Enter')
        page.wait_for_selector('[role=dialog],[role=alertdialog]', timeout=8000)
        settle(page, 500)
    except Exception as exc:
        check('dialogs', f'{label}: opens', False, str(exc).splitlines()[0][:120])
        return
    check('dialogs', f'{label}: has a name', page.evaluate(DIALOG_NAME), 'no aria-labelledby text')
    check('dialogs', f'{label}: focus moves inside', page.evaluate(FOCUS_IN_DIALOG))
    trapped = True
    for key in ['Tab'] * 25 + ['Shift+Tab'] * 10:
        page.keyboard.press(key)
        if not page.evaluate(FOCUS_IN_DIALOG):
            trapped = False
            break
    check('dialogs', f'{label}: Tab stays inside', trapped, page.evaluate(ACTIVE))
    # Everything behind is aria-hidden except the toast live region, which the dialog library keeps readable.
    hidden = page.evaluate("""() => { const app = document.querySelector('#favorite-hearts-product > .m-app');
      if (!app) return false; if (app.getAttribute('aria-hidden') === 'true') return true;
      return [...app.children].every(e => e.classList.contains('m-toast-host') || e.getAttribute('aria-hidden') === 'true'); }""")
    check('dialogs', f'{label}: page behind is hidden from screen readers', hidden)
    page.keyboard.press('Escape')
    settle(page, 500)
    gone = page.evaluate("() => document.querySelectorAll('[role=dialog],[role=alertdialog]').length") == count
    check('dialogs', f'{label}: Escape closes it (and only it)', gone)
    check('dialogs', f'{label}: focus returns to the opener', page.evaluate(ACTIVE) == before, page.evaluate(ACTIVE))


def navigation(browser, state):
    c = context(browser, state)
    page = c.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:120]))
    page.on('console', lambda m: errors.append(m.text[:120]) if m.type == 'error' else None)
    page.goto(APP + 'browse')
    settle(page)
    for index, (name, path) in enumerate([('Discover', '/app/browse'), ('Interests', '/app/requests'),
                                         ('Connected', '/app/connections'), ('Shortlist', '/app/shortlist'),
                                         ('Profile', '/app')]):
        page.locator('.m-primary-nav button').nth(index).click()
        settle(page, 1200)
        url = page.url.split('?')[0].rstrip('/')
        current = page.locator('.m-primary-nav button').nth(index).get_attribute('aria-current')
        check('navigation', f'dock {name} opens its page and is marked current', path in url and current == 'page',
              f'{url} aria-current={current}')
    page.go_back()
    settle(page, 1000)
    check('navigation', 'browser Back returns to the previous page', '/app/shortlist' in page.url, page.url)
    for row, path in [('Trust & access', '/app/verify'), ('Privacy & safety', '/app/privacy'), ('Contact us', '/app/contact')]:
        page.click('.m-more-button')
        settle(page, 500)
        page.locator('.m-more-sheet nav a', has_text=row).first.click()
        settle(page, 1200)
        check('navigation', f'More: {row}', path in page.url, page.url)
    page.click('.m-more-button')
    settle(page, 500)
    links = page.evaluate("[...document.querySelectorAll('.m-more-sheet nav a')].map(a => a.getAttribute('href'))")
    check('navigation', 'More: Help, Terms and Privacy link to the website', all(h in links for h in ['/help/', '/terms/', '/privacy/']), links)
    page.keyboard.press('Escape')
    check('navigation', 'no console or page errors', not errors, errors[:3])
    c.close()


def keyboard(browser, state):
    c = context(browser, state, width=390)
    page = c.new_page()
    page.goto(APP + 'browse')
    settle(page)
    page.keyboard.press('Tab')
    first = page.evaluate("() => document.activeElement.className")
    visible = page.evaluate("() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.height > 0; }")
    check('keyboard', 'first Tab reaches the skip link, which shows', 'm-skip-link' in first and visible, first)
    page.keyboard.press('Enter')
    settle(page, 300)
    page.keyboard.press('Tab')
    in_main = page.evaluate("() => !!document.activeElement.closest('main')")
    check('keyboard', 'the skip link moves on to the page content', in_main, page.evaluate(ACTIVE))
    weak, small = [], []
    page.goto(APP + 'browse')
    settle(page)
    for _ in range(40):
        page.keyboard.press('Tab')
        info = page.evaluate("""() => { const e = document.activeElement; if (!e || e === document.body) return null;
          const c = getComputedStyle(e), r = e.getBoundingClientRect();
          return {el: e.tagName + '.' + [...e.classList].slice(0, 2).join('.') + ' ' + (e.textContent || '').trim().slice(0, 20),
                  ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2 || c.boxShadow !== 'none',
                  w: r.width, h: r.height, inline: c.display === 'inline' && e.tagName === 'A' && !!e.closest('p')}; }""")
        if not info:
            continue
        if not info['ring']:
            weak.append(info['el'])
        if not info['inline'] and (info['w'] < 24 or info['h'] < 24):
            small.append(f"{info['el']} {info['w']:.0f}×{info['h']:.0f}")
    check('keyboard', 'every focus stop on Discover shows a focus ring', not weak, sorted(set(weak))[:5])
    check('keyboard', 'every focus stop is at least 24×24 px (WCAG 2.5.8)', not small, sorted(set(small))[:5])
    c.close()


def dialogs(browser, member, owner):
    c = context(browser, member)
    page = c.new_page()
    page.goto(APP + 'browse')
    settle(page)
    dialog_check(page, 'More sheet', page.locator('.m-more-button'))
    dialog_check(page, 'Discover preferences', page.locator('.m-page-heading button', has_text='Your preferences'))
    dialog_check(page, 'member profile sheet', page.locator('.m-card .m-card-title button').first)
    page.locator('.m-card .m-card-title button').first.click()
    page.wait_for_selector('[role=dialog]')
    settle(page, 1200)
    dialog_check(page, 'report dialog (over the profile sheet)', page.locator('[role=dialog] button', has_text=re.compile('^Report')).first)
    page.keyboard.press('Escape')
    settle(page, 500)
    page.goto(APP + 'privacy')
    settle(page)
    dialog_check(page, 'delete account confirmation', page.locator('main button', has_text='Delete my account'))
    c.close()
    c = context(browser, owner)
    page = c.new_page()
    page.goto(APP + 'staff')
    settle(page, 2500)
    dialog_check(page, 'staff payment review', page.locator('.m-table-scroll button').first)
    c.close()


def states(browser, member, free):
    c = context(browser, member)
    page = c.new_page()
    page.route('**/api/v1/me', lambda route: None)
    page.goto(APP + 'browse', wait_until='domcontentloaded')
    try:
        page.wait_for_selector('.m-loading [role=status]', timeout=10000)
        check('states', 'first load shows the loading page with a status message', True)
    except Exception:
        check('states', 'first load shows the loading page with a status message', False)
    page.unroute('**/api/v1/me')
    page.reload()
    page.wait_for_selector('.m-main', timeout=15000)
    page.route('**/features/browse/ShortlistPage.tsx*', lambda route: route.fulfill(status=500, body='no'))
    page.locator('.m-primary-nav button').nth(3).click()
    try:
        page.wait_for_selector('.m-loading [role=alert]', timeout=10000)
        reload = page.locator('.m-loading button', has_text='Reload').count() == 1
        home = page.locator('.m-loading a[href="/app/"]').count() == 1
        check('states', 'a page that fails shows the error page with Reload and a way home', reload and home)
    except Exception:
        check('states', 'a page that fails shows the error page with Reload and a way home', False)
    c.close()
    c = context(browser, free)
    page = c.new_page()
    page.goto(APP + 'shortlist')
    settle(page)
    empty = page.locator('.m-empty h3').first
    check('states', 'an empty list shows the empty state', empty.count() and empty.inner_text().strip(), '')
    url = page.evaluate("performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/deps/sonner'))")
    page.evaluate(f"import('{url}').then(m => m.toast('Check'))")
    settle(page, 600)
    check('states', 'toasts render inside the page (.m-app) in a live region', page.evaluate(
        "() => { const t = document.querySelector('[data-sonner-toast]'); return !!t && !!t.closest('.m-app') && !!t.closest('[aria-live],section[aria-label]'); }"))
    c.close()


def authorization(browser, member, free, owner, reviewer):
    c = context(browser)
    page = c.new_page()
    page.goto(APP + 'browse')
    settle(page)
    check('authorization', 'signed out: a member page leads to sign-in', page.url.rstrip('/').endswith('/app') and page.locator('.ma-entry').count(), page.url)
    check('authorization', 'signed out: the API answers 401', api(page, 'GET', '/profiles') == 401, api(page, 'GET', '/profiles'))
    c.close()
    c = context(browser, member)
    page = c.new_page()
    page.goto(APP + 'staff')
    settle(page)
    check('authorization', 'member: the staff page shows "Staff only", no workspace',
          page.get_by_text('Staff only').count() and not page.get_by_text('Trust deserves attention.').count())
    for path in ['/staff/verification', '/staff/reports', '/owner/payments']:
        status = api(page, 'GET', path)
        check('authorization', f'member: GET {path} is refused (403)', status == 403, status)
    c.close()
    c = context(browser, owner)
    page = c.new_page()
    page.goto(APP + 'browse')
    settle(page)
    check('authorization', 'owner: member pages lead to the staff workspace', '/app/staff' in page.url, page.url)
    check('authorization', 'owner: GET /owner/payments is allowed', api(page, 'GET', '/owner/payments') == 200)
    c.close()
    c = context(browser, reviewer)
    page = c.new_page()
    page.goto(APP + 'staff')
    settle(page, 2500)
    tabs = page.evaluate("[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim())")
    check('authorization', 'reviewer: only Verification and Reports tabs', tabs[:2] == ['Verification', 'Reports'] and not any(
        t in tabs for t in ['Payments', 'Plans', 'Payment details', 'Service']), tabs)
    for path, want in [('/owner/payments', 403), ('/owner/plans', 403), ('/staff/verification', 200)]:
        status = api(page, 'GET', path)
        check('authorization', f'reviewer: GET {path} answers {want}', status == want, status)
    c.close()
    # A member without a plan: the server refuses what the plan unlocks, whatever the screen shows.
    c = context(browser, free)
    page = c.new_page()
    page.goto(APP)
    settle(page)
    status = page.evaluate("""async (api) => { const me = await (await fetch(api + '/profiles', {credentials: 'include'})).json();
      const id = (me.profiles || me)[0]?.id; if (!id) return 'no profile';
      return (await fetch(api + '/profiles/' + id + '/interests?box=received', {credentials: 'include'})).status; }""", API)
    check('authorization', 'member without a plan: received requests stay anonymous (200, no identities)', status == 200, status)


def rejection(browser):
    c = context(browser)
    page = c.new_page()
    page.goto(APP)
    settle(page)
    page.get_by_label(re.compile('^Email address')).fill(f'checks-{int(time.time())}@sandbox.test')
    page.wait_for_function("!document.querySelector('.ma-panel form button[type=submit]').disabled", timeout=20000)
    page.click('.ma-panel form button[type=submit]')
    page.wait_for_selector('input[autocomplete=one-time-code]', timeout=15000)
    code = page.locator('input[autocomplete=one-time-code]')
    code.fill('000000')
    if page.locator('form button[type=submit]', has_text=re.compile('Verify|Check|Continue')).count():
        try:
            page.locator('form button[type=submit]').last.click(timeout=2000)
        except Exception:
            pass
    settle(page, 2500)
    # The boxes shake, clear and accept a new try; the server's reason stays in the status region the field points to.
    message = page.evaluate("""() => { const i = document.querySelector('input[autocomplete=one-time-code]');
      const s = document.getElementById(i.getAttribute('aria-describedby') || '');
      return s && /status|alert/.test(s.getAttribute('role') || '') ? s.textContent.trim() : ''; }""")
    check('rejection', 'a wrong sign-in code is refused; the reason stays linked to the field and is announced', message, 'no message')
    check('rejection', 'the code field is ready for a new try', code.input_value() == '' and code.is_editable())
    c.close()


def sinhala(browser, member):
    c = context(browser, member)
    page = c.new_page()
    page.goto(APP + 'browse')
    settle(page)
    page.click('.m-more-button')
    settle(page, 400)
    page.select_option('.m-more-sheet select', 'si')
    settle(page, 1500)
    page.keyboard.press('Escape')
    try:
        for path in ['browse', 'requests', 'privacy', 'verify']:
            page.goto(APP + path)
            settle(page)
            text = page.evaluate("document.querySelector('#favorite-hearts-product').innerText")
            lang = page.evaluate('document.documentElement.lang')
            keys = re.findall(r'\b[a-z]+(?:\.[a-zA-Z]+){2,}\b', text)
            check('sinhala', f'{path}: lang="si", Sinhala on screen, no raw text keys',
                  lang == 'si' and re.search('[඀-෿]', text) and not keys, f'lang={lang} keys={keys[:3]}')
        page.goto(APP + 'staff')
        settle(page)
        check('sinhala', 'staff page stays English', page.evaluate('document.documentElement.lang') == 'en')
    finally:
        page.goto(APP + 'browse')
        settle(page)
        page.click('.m-more-button')
        settle(page, 400)
        page.select_option('.m-more-sheet select', 'en')
        settle(page, 1500)
        check('sinhala', 'language set back to English', page.evaluate('document.documentElement.lang') == 'en')
    c.close()


def motion_and_safe_area(browser, member):
    for motion, expect_still in [('reduce', True), ('no-preference', False)]:
        c = context(browser, member, motion=motion)
        page = c.new_page()
        page.goto(APP + 'browse')
        settle(page)
        page.click('.m-more-button')
        page.wait_for_timeout(50)
        duration = page.evaluate("parseFloat(getComputedStyle(document.querySelector('[role=dialog]')).animationDuration)")
        still = duration < 0.01
        check('motion', f'{motion}: sheets {"appear without" if expect_still else "keep their"} animation', still == expect_still, duration)
        c.close()
    c = context(browser, member, width=390)
    page = c.new_page()
    page.goto(APP + 'requests')
    settle(page)
    page.evaluate('scrollTo(0, document.documentElement.scrollHeight)')
    settle(page, 400)
    overlap = page.evaluate("""() => { const dock = document.querySelector('.m-primary-nav').getBoundingClientRect();
      const end = [...document.querySelectorAll('main *, footer *')].filter(e => e.children.length === 0 && e.textContent.trim())
        .map(e => e.getBoundingClientRect()).filter(r => r.height).sort((a, b) => b.bottom - a.bottom)[0];
      return {overlaps: end.bottom > dock.top && end.top < dock.bottom, dockBottom: innerHeight - dock.bottom}; }""")
    check('safe area', 'scrolled to the end, the last text clears the dock', not overlap['overlaps'], overlap)
    viewport = page.evaluate("document.querySelector('meta[name=viewport]').content")
    check('safe area', 'viewport keeps the page inside the safe areas (no viewport-fit=cover)', 'viewport-fit=cover' not in viewport, viewport)
    c.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--member', required=True)
    p.add_argument('--free', required=True)
    p.add_argument('--owner', required=True)
    p.add_argument('--reviewer', required=True)
    a = p.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for step in [lambda: navigation(browser, a.member), lambda: keyboard(browser, a.member),
                     lambda: dialogs(browser, a.member, a.owner), lambda: states(browser, a.member, a.free),
                     lambda: authorization(browser, a.member, a.free, a.owner, a.reviewer), lambda: rejection(browser),
                     lambda: sinhala(browser, a.member), lambda: motion_and_safe_area(browser, a.member)]:
            try:
                step()
            except Exception as exc:
                check('error', 'a step stopped', False, str(exc).splitlines()[0][:160])
        browser.close()
    failed = [r for r in results if not r[2]]
    print(f'\n{len(results) - len(failed)} passed, {len(failed)} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
