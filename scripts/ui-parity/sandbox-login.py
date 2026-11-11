#!/usr/bin/env python3
"""Logs a synthetic sandbox member in through the real Log in screen and saves the Playwright storage state, so
capture.py can screenshot signed-in member screens. Sandbox only: the sandbox API prints the test members' password
(new on every start) to its console.

  python scripts/ui-parity/sandbox-login.py --email bina@sandbox.test --password <from the API console> --state member-state.json
"""
import argparse
import re

from playwright.sync_api import sync_playwright


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base', default='http://localhost:5184/app/')
    p.add_argument('--email', required=True)
    p.add_argument('--password', required=True)
    p.add_argument('--state', required=True)
    a = p.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(locale='en-US')
        # A returning visitor: language and country already chosen, so the entry opens on Log in.
        context.add_init_script("localStorage.setItem('fh-visitor-preferences', JSON.stringify({language: 'en', country: 'LK'}))")
        page = context.new_page()
        page.goto(a.base)
        page.get_by_label(re.compile('^(Email address|Email or phone number)')).fill(a.email)
        page.get_by_label(re.compile('^Password')).fill(a.password)
        submit = page.locator('.ma-panel form button[type=submit]')
        page.wait_for_function("!document.querySelector('.ma-panel form button[type=submit]').disabled", timeout=20000)
        submit.click()
        for _ in range(30):
            if any('session' in c['name'] for c in context.cookies()):
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(2000)
        print('logged in at', page.url, flush=True)
        context.storage_state(path=a.state)
        browser.close()


if __name__ == '__main__':
    main()
