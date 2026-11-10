#!/usr/bin/env python3
"""Signs a synthetic sandbox member in through the real sign-in screen and saves the Playwright storage state, so
capture.py can screenshot signed-in member screens. Sandbox only: the sandbox API prints sign-in codes to its
console instead of sending them; this script waits until that code is written to --code-file.

  python scripts/ui-parity/sandbox-login.py --email bina@sandbox.test --code-file code.txt --state member-state.json
"""
import argparse
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base', default='http://localhost:5184/app/')
    p.add_argument('--email', required=True)
    p.add_argument('--code-file', required=True)
    p.add_argument('--state', required=True)
    p.add_argument('--wait', type=int, default=300)
    a = p.parse_args()
    code_file = Path(a.code_file)
    code_file.unlink(missing_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(locale='en-US')
        # A returning visitor: language and country already chosen, so the sign-in form shows (not the first step).
        context.add_init_script("localStorage.setItem('fh-visitor-preferences', JSON.stringify({language: 'en', country: 'LK'}))")
        page = context.new_page()
        page.goto(a.base)
        page.get_by_label(re.compile('^Email address')).fill(a.email)
        page.get_by_role('button', name=re.compile('^Send me a code')).click()
        print('code requested; waiting for', code_file, flush=True)
        deadline = time.time() + a.wait
        while not code_file.exists() and time.time() < deadline:
            time.sleep(1)
        code = code_file.read_text().strip()
        page.keyboard.type(code) if page.locator('input:focus').count() else page.locator('input').first.type(code)
        for _ in range(30):
            if any('session' in c['name'] for c in context.cookies()):
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(2000)
        print('signed in at', page.url, flush=True)
        context.storage_state(path=a.state)
        browser.close()


if __name__ == '__main__':
    main()
