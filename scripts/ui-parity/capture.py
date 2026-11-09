#!/usr/bin/env python3
"""Screenshots for the demo-UI parity work (branch feat/demo-ui-parity).

Captures the reference demo and this repo's apps at the same widths, language, theme and motion settings so
compare.py can diff them. Development tool only: it needs Playwright (pip install playwright Pillow;
playwright install chromium) and is never part of a build.

  python scripts/ui-parity/capture.py --target ref  --set public --out shots/ref
  python scripts/ui-parity/capture.py --target prod --set public --out shots/prod
  python scripts/ui-parity/capture.py --target ref  --set member --out shots/ref
  python scripts/ui-parity/capture.py --target prod --set member --out shots/prod --state member-state.json

Servers (.claude/launch.json names): reference-demo (:8080, reference/Favorite-Hearts-Integrated/dist),
website-dev (:4321), walkthrough-api (:8798) + walkthrough-member (:5184, sandbox data only).

--inter points at a folder with Inter-{Regular,Medium,SemiBold,Bold}.woff2. The demo asks for Inter but ships no
font file, so without it the reference falls back to the machine's system font. Passing the folder makes the
reference render with Inter, as the member app will once it self-hosts the font (decision B1).
The reference demo's sample accounts are used only to reach its screens for screenshots; nothing from them is
copied into the app.
"""
import argparse
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

WIDTHS = [320, 390, 768, 1024, 1440]
HEIGHT = {320: 720, 390: 844, 768: 1024, 1024: 768, 1440: 900}

PUBLIC_ROUTES = [
    '/', '/pricing/', '/mission/', '/labs/', '/newsroom/',
    '/newsroom/a-thoughtful-beginning/', '/newsroom/matrimony-with-more-heart/',
    '/newsroom/respect-in-every-introduction/', '/newsroom/belonging-across-borders/',
    '/newsroom/an-honest-profile/', '/newsroom/beyond-the-checklist/',
    '/newsroom/before-marriage/', '/newsroom/family-and-your-voice/',
    '/newsroom/a-first-conversation/', '/newsroom/across-borders-on-the-same-page/',
    '/contact/', '/help/', '/trust-and-safety/', '/security/', '/terms/', '/privacy/',
]

# Demo-only furniture hidden in reference member screenshots: the sample-account toolbar and the simulation notices.
REF_HIDE = '.m-preview-note,.ma-demo-actions,[data-sonner-toaster]{display:none!important}'

BASES = {
    ('ref', 'public'): 'http://localhost:8080',
    ('prod', 'public'): 'http://localhost:4321',
    ('ref', 'member'): 'http://localhost:8080/matrimony/',
    ('prod', 'member'): 'http://localhost:5184/app/',
}


def slug(route):
    return re.sub(r'[^a-z0-9]+', '-', route.strip('/').lower()).strip('-') or 'home'


def inter_css(folder):
    faces = []
    for weight, name in ((400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'), (700, 'Bold')):
        uri = Path(folder, f'Inter-{name}.woff2').resolve().as_uri()
        faces.append(f"@font-face{{font-family:Inter;font-weight:{weight};font-style:normal;src:url('{uri}') format('woff2')}}")
    return '\n'.join(faces)


def settle(page):
    try:
        page.wait_for_load_state('networkidle', timeout=8000)
    except Exception:
        pass  # pages that keep a request open (dev-server sockets, status polling) never go idle
    page.evaluate('document.fonts.ready.then(() => true)')
    page.wait_for_timeout(250)


def shoot(page, out, name, width, rows, full_page=True):
    path = out / f'{name}__{width}.png'
    settle(page)
    page.screenshot(path=str(path), full_page=full_page, animations='disabled', caret='hide')
    height = page.evaluate('document.documentElement.scrollHeight')
    overflow = page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    rows.append({'name': name, 'width': width, 'png': path.name, 'height': height, 'h_overflow': overflow})
    print(f'{name:40s} {width:5d}  h={height}{"  OVERFLOW-X" if overflow else ""}')


def new_page(browser, width, args, state=None):
    context = browser.new_context(
        viewport={'width': width, 'height': HEIGHT[width]}, device_scale_factor=1,
        reduced_motion='reduce', locale='en-US', color_scheme=args.scheme,
        storage_state=state, service_workers='block',
    )
    if args.inter:
        css = inter_css(args.inter)
        context.add_init_script(
            "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');"
            f"s.textContent={json.dumps(css)};document.head.appendChild(s)}});"
        )
    return context, context.new_page()


def click_named(page, name):
    """Clicks a visible button or link by accessible name, opening the More menu first when it is hidden there."""
    target = page.get_by_role('button', name=re.compile('^' + re.escape(name))).or_(
        page.get_by_role('link', name=re.compile('^' + re.escape(name))))
    visible = [t for t in target.all() if t.is_visible()]
    if not visible:
        more = page.get_by_role('button', name=re.compile('^More options'))
        if more.count() and more.first.is_visible():
            more.first.click()
            page.wait_for_timeout(300)
            visible = [t for t in target.all() if t.is_visible()]
    if not visible:
        raise RuntimeError(f'no visible control named {name!r}')
    visible[0].click()
    page.wait_for_timeout(400)


def public(browser, args, out, rows):
    base = BASES[(args.target, 'public')]
    for route in args.route or PUBLIC_ROUTES:
        for width in args.widths:
            context, page = new_page(browser, width, args)
            try:
                # The reference's serve.mjs answers "/" with 403 (its root check drops the trailing slash).
                path = '/index.html' if args.target == 'ref' and route == '/' else route
                page.goto(base + path, wait_until='domcontentloaded', timeout=30000)
                shoot(page, out, slug(route), width, rows)
            except Exception as exc:
                rows.append({'name': slug(route), 'width': width, 'error': str(exc)})
                print('ERROR', route, width, exc)
            context.close()


def ref_member(browser, args, out, rows):
    base = BASES[('ref', 'member')]
    for width in args.widths:
        context, page = new_page(browser, width, args)
        steps = [
            ('m-entry-locale', None),
            ('m-entry-signup', lambda: (page.fill('input[name=country]', 'Sri Lanka'),
                                        page.click('[data-action=locale-next]'))),
            ('m-entry-login', lambda: page.click('[data-action=login]')),
            ('m-discover-free', lambda: page.evaluate("document.querySelector('[data-action=demo]').click()")),
            # The demo's own toolbar button marks its sample accounts paid, verified and published, so the locked
            # tabs open (reference screenshots only; the toolbar itself is hidden by REF_HIDE).
            ('m-discover', lambda: page.evaluate(
                "[...document.querySelectorAll('.m-preview-note button')].find(b=>b.textContent.startsWith('Load paid demo ads')).click()")),
            ('m-interests', lambda: click_named(page, 'Interests')),
            ('m-connected', lambda: click_named(page, 'Mutually connected')),
            ('m-saved', lambda: click_named(page, 'Shortlist')),
            ('m-profile', lambda: click_named(page, 'Profile')),
            ('m-trust', lambda: click_named(page, 'Trust & access')),
            ('m-membership', lambda: click_named(page, 'Membership')),
            ('m-privacy', lambda: click_named(page, 'Privacy & safety')),
            ('m-contact', lambda: click_named(page, 'Contact us')),
            ('m-admin', lambda: page.evaluate(
                "[...document.querySelectorAll('.m-preview-note button')].find(b=>b.textContent==='Review workspace').click()")),
        ]
        context.add_init_script(
            "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');"
            f"s.textContent={json.dumps(REF_HIDE)};document.head.appendChild(s)}});")
        page.goto(base, wait_until='domcontentloaded')
        for name, action in steps:
            try:
                if action:
                    action()
                shoot(page, out, name, width, rows)
            except Exception as exc:
                rows.append({'name': name, 'width': width, 'error': str(exc)})
                print('ERROR', name, width, str(exc).splitlines()[0])
        context.close()


def prod_member(browser, args, out, rows):
    base = BASES[('prod', 'member')]
    signed_out = ['m-entry-signin']
    signed_in = [
        ('m-dashboard', ''), ('m-discover', 'browse'), ('m-interests', 'requests'),
        ('m-connected', 'connections'), ('m-saved', 'shortlist'), ('m-trust', 'verify'), ('m-invite', 'invite'),
    ]
    for width in args.widths:
        context, page = new_page(browser, width, args)
        page.goto(base, wait_until='domcontentloaded')
        shoot(page, out, signed_out[0], width, rows)
        context.close()
        if not args.state:
            continue
        context, page = new_page(browser, width, args, state=args.state)
        for name, path in signed_in:
            try:
                page.goto(base + path, wait_until='domcontentloaded')
                shoot(page, out, name, width, rows)
            except Exception as exc:
                rows.append({'name': name, 'width': width, 'error': str(exc)})
                print('ERROR', name, width, str(exc).splitlines()[0])
        context.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--target', choices=['ref', 'prod'], required=True)
    p.add_argument('--set', dest='set_', choices=['public', 'member'], required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--route', action='append', help='public route(s); repeatable')
    p.add_argument('--widths', type=int, nargs='+', default=WIDTHS)
    p.add_argument('--scheme', choices=['light', 'dark'], default='light')
    p.add_argument('--inter', help='folder holding Inter-*.woff2 (member set)')
    p.add_argument('--state', help='Playwright storage state of a signed-in sandbox member (prod member set)')
    args = p.parse_args()
    if args.set_ == 'public':
        args.inter = None
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        {'public': public, 'member': ref_member if args.target == 'ref' else prod_member}[args.set_](browser, args, out, rows)
        browser.close()
    manifest = out / f'manifest-{args.set_}.json'
    manifest.write_text(json.dumps(rows, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
