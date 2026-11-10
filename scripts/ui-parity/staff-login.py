#!/usr/bin/env python3
"""Signs a sandbox staff account in through the real staff screens and saves the Playwright storage state, so the
staff workspace can be screenshotted. Sandbox only: the sandbox API prints the staff password (new on every start)
to its console. On the first sign-in after a start, two-step login is not on yet, so this script turns it on through
the real set-up screen and answers with an authenticator code computed from the key the screen shows.

  python scripts/ui-parity/staff-login.py --email owner@sandbox.test --password <from the API console> --state staff-state.json
"""
import argparse
import base64
import hashlib
import hmac
import re
import struct
import time

from playwright.sync_api import sync_playwright


def totp(secret: str) -> str:
    key = base64.b32decode(secret.upper() + '=' * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack('>Q', int(time.time()) // 30), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base', default='http://localhost:5184/app/staff')
    p.add_argument('--email', required=True)
    p.add_argument('--password', required=True)
    p.add_argument('--state', required=True)
    a = p.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(locale='en-US')
        context.add_init_script("localStorage.setItem('fh-visitor-preferences', JSON.stringify({language: 'en', country: 'LK'}))")
        page = context.new_page()
        page.goto(a.base)
        page.get_by_label('Email').fill(a.email)
        page.get_by_label('Password').fill(a.password)
        submit = page.get_by_role('button', name='Sign in', exact=True)
        for _ in range(60):
            if submit.is_enabled():
                break
            page.wait_for_timeout(500)
        submit.click()
        page.wait_for_timeout(2500)
        if page.get_by_text('Turn on two-step login').count():
            page.get_by_label('Confirm your password').fill(a.password)
            page.get_by_role('button', name='Start').click()
            key = page.locator('code.font-mono')
            key.wait_for()
            secret = key.inner_text().strip()
            page.get_by_label('I have saved my backup codes.').check()
            page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]').first.fill(totp(secret))
            page.get_by_role('button', name='Turn on two-step login').click()
            page.wait_for_timeout(2500)
        elif page.get_by_text('Code from your authenticator app').count():
            raise SystemExit('two-step login is already on for this account; restart the sandbox API for a fresh one')
        print('workspace' if page.get_by_text('Trust deserves attention.').count() else 'NOT signed in', page.url, flush=True)
        context.storage_state(path=a.state)
        browser.close()


if __name__ == '__main__':
    main()
