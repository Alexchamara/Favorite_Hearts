#!/usr/bin/env python3
"""Public-site interaction states for the demo-UI parity work: menu overlay, welcome (language/country) dialog,
the generic dialog, and the newsroom / help filters. Same settings as capture.py.

  python scripts/ui-parity/capture_states.py --target ref  --out shots/ref
  python scripts/ui-parity/capture_states.py --target prod --out shots/prod
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from capture import HEIGHT, WIDTHS, shoot

BASE = {'ref': 'http://localhost:8080', 'prod': 'http://localhost:4321'}
HOME = {'ref': '/index.html', 'prod': '/'}


def states(target):
    home = HOME[target]
    return [
        # First visit: the welcome dialog opens by itself.
        ('s-welcome', home, None, False),
        ('s-menu', home, "document.querySelector('.menu-toggle').click()", True),
        ('s-dialog', '/mission/', "document.querySelector('.pill.start, button.pill').click()", True),
        ('s-newsroom-product', '/newsroom/',
         "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Product').click()", True),
        ('s-newsroom-search', '/newsroom/',
         "(()=>{const i=document.querySelector('input[type=search],input');i.value='family';"
         "i.dispatchEvent(new Event('input',{bubbles:true}))})()", True),
        ('s-help-search', '/help/',
         "(()=>{const i=document.querySelector('input[type=search],input');i.value='photo';"
         "i.dispatchEvent(new Event('input',{bubbles:true}))})()", True),
    ]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--target', choices=['ref', 'prod'], required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--widths', type=int, nargs='+', default=WIDTHS)
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for name, path, script, returning in states(a.target):
            for width in a.widths:
                context = browser.new_context(viewport={'width': width, 'height': HEIGHT[width]}, device_scale_factor=1,
                                              reduced_motion='reduce', locale='en-US', color_scheme='light')
                page = context.new_page()
                try:
                    if returning:
                        # A returning visitor: preferences already chosen, so the welcome dialog stays closed.
                        page.goto(BASE[a.target] + HOME[a.target])
                        page.evaluate("(()=>{const f=document.querySelector('#welcome-form');"
                                      "if(f&&document.querySelector('#welcome-dialog')?.open)f.requestSubmit()})()")
                        page.wait_for_timeout(300)
                    page.goto(BASE[a.target] + path)
                    page.wait_for_timeout(600)
                    if script:
                        page.evaluate(script)
                        page.wait_for_timeout(700)
                    shoot(page, out, name, width, rows, full_page=False)
                except Exception as exc:
                    rows.append({'name': name, 'width': width, 'error': str(exc)})
                    print('ERROR', name, width, str(exc).splitlines()[0])
                context.close()
        browser.close()
    (out / 'manifest-states.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
