#!/usr/bin/env python3
"""Computed-style comparison for the demo-UI parity work: opens the reference demo and the member app at one width,
runs the same setup on each (e.g. open the More sheet), then prints the computed styles of matching elements side by
side, showing only properties that differ. Used to write exact parity rules instead of eyeballing screenshots.

  python scripts/ui-parity/styles.py --state member-state.json --width 390 --view more
"""
import argparse
import json

from playwright.sync_api import sync_playwright

PROPS = ['display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'width', 'height', 'min-height',
         'margin', 'padding', 'border', 'border-radius', 'background-color', 'background-image', 'color',
         'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'box-shadow',
         'outline', 'position', 'top', 'right', 'bottom', 'left']

# name: (demo selector, app selector)
VIEWS = {
    'more': {
        'sheet': ('.m-more-sheet', '.m-more-sheet'),
        'title': ('.m-more-sheet [data-slot=sheet-title]', '.m-more-sheet [data-slot=sheet-title]'),
        'description': ('.m-more-sheet [data-slot=sheet-description]', '.m-more-sheet [data-slot=sheet-description]'),
        'header': ('.m-more-sheet [data-slot=sheet-header]', '.m-more-sheet [data-slot=sheet-header]'),
        'language': ('.m-more-sheet .fh-language', '.m-more-sheet .fh-language'),
        'language-label': ('.m-more-sheet .fh-language span', '.m-more-sheet .fh-language span'),
        'select': ('.m-more-sheet .fh-language select', '.m-more-sheet .fh-language select'),
        'theme': ('.m-more-sheet .m-menu-theme', '.m-more-sheet .m-menu-theme'),
        'nav': ('.m-more-sheet nav', '.m-more-sheet nav'),
        'row': ('.m-more-sheet nav button', '.m-more-sheet nav a'),
        'row-icon': ('.m-more-sheet nav button svg', '.m-more-sheet nav a svg'),
        'bottom': ('.m-more-sheet .m-menu-bottom', '.m-more-sheet .m-menu-bottom'),
        'logout': ('.m-more-sheet .m-menu-logout', '.m-more-sheet .m-menu-logout'),
        'close': ('.m-more-sheet > button:last-child', '.m-more-sheet > button:last-child'),
    },
    'shell': {
        'app': ('.m-app', '.m-app'),
        'header': ('.m-header', '.m-header'),
        'brand': ('.m-brand', '.m-brand'),
        'brand-disc': ('.m-brand > span:first-child', '.m-brand > span:first-child'),
        'more-button': ('.m-more-button', '.m-more-button'),
        'main': ('.m-main', '.m-main'),
        'kicker': ('.m-page-heading .m-kicker', '.m-page-heading .m-kicker'),
        'h1': ('.m-page-heading h1', '.m-page-heading h1'),
        'lead': ('.m-page-heading p', '.m-page-heading p'),
        'dock': ('.m-floating-nav', '.m-floating-nav'),
        'dock-item': ('.m-floating-nav button:not(.selected)', '.m-floating-nav button:not(.selected)'),
        'dock-selected': ('.m-floating-nav button.selected', '.m-floating-nav button.selected'),
        'footer': ('.m-footer', '.m-footer'),
        'secondary-btn': ('.m-page-heading .m-btn.m-secondary', '.m-page-heading .m-btn.m-secondary'),
    },
}

READ = """(sels) => Object.fromEntries(Object.entries(sels).map(([name, sel]) => {
  const el = document.querySelector(sel);
  if (!el) return [name, null];
  const cs = getComputedStyle(el);
  return [name, Object.fromEntries(%s.map(p => [p, cs.getPropertyValue(p)]))];
}))""" % json.dumps(PROPS)


def demo(page, view):
    page.goto('http://localhost:8080/matrimony/')
    page.fill('input[name=country]', 'Sri Lanka')
    page.click('[data-action=locale-next]')
    page.evaluate("document.querySelector('[data-action=demo]').click()")
    page.wait_for_timeout(1200)
    page.add_style_tag(content='.m-preview-note,[data-sonner-toaster]{display:none!important}')
    if view == 'more':
        page.click('.m-more-button')
        page.wait_for_timeout(700)


def app(page, view):
    page.goto('http://localhost:5184/app/browse')
    page.wait_for_timeout(2500)
    if view == 'more':
        page.click('.m-more-button')
        page.wait_for_timeout(700)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--state', required=True)
    p.add_argument('--width', type=int, default=1440)
    p.add_argument('--view', choices=list(VIEWS), default='shell')
    p.add_argument('--inter', help='folder with Inter-*.woff2, injected into the demo as in capture.py')
    a = p.parse_args()
    sels = VIEWS[a.view]
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        out = {}
        for side, setup, state in (('demo', demo, None), ('app', app, a.state)):
            ctx = b.new_context(viewport={'width': a.width, 'height': 900}, storage_state=state, reduced_motion='reduce')
            if side == 'demo' and a.inter:
                from capture import inter_css
                ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');"
                                    f"s.textContent={json.dumps(inter_css(a.inter))};document.head.appendChild(s)}});")
            page = ctx.new_page()
            setup(page, a.view)
            out[side] = page.evaluate(READ, {k: v[0 if side == 'demo' else 1] for k, v in sels.items()})
            ctx.close()
        b.close()
    for name in sels:
        d, r = out['demo'][name], out['app'][name]
        if d is None or r is None:
            print(f'== {name}: missing in {"demo" if d is None else "app"}')
            continue
        diffs = [(k, d[k], r[k]) for k in PROPS if d[k] != r[k]]
        print(f'== {name}' + ('  (same)' if not diffs else ''))
        for k, dv, rv in diffs:
            print(f'   {k:16s} demo: {dv[:70]:70s} app: {rv[:70]}')


if __name__ == '__main__':
    main()
