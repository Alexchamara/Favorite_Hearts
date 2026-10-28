#!/usr/bin/env python3
"""Dependency-free static build: templates, assets, metadata and search discovery."""
from pathlib import Path
import re, json, shutil, html, argparse
from urllib.parse import urlparse
from xml.sax.saxutils import escape
ROOT=Path(__file__).resolve().parent.parent
config=json.loads((ROOT/'site.config.json').read_text())
base=config['siteUrl'].rstrip('/')
if urlparse(base).scheme not in ('https','http') or not urlparse(base).netloc:raise SystemExit('Set siteUrl to an absolute website URL.')
out=ROOT/'dist'
if out.exists():shutil.rmtree(out)
out.mkdir()
assets=out/'assets';assets.mkdir()
shutil.copytree(ROOT/'src/assets',assets,dirs_exist_ok=True)
for name,folder in [('styles','css'),('scripts','js')]:shutil.copytree(ROOT/'src'/name,assets/folder)
(assets/'js/site-config.js').write_text('window.FH_CONFIG = '+json.dumps({k:config[k] for k in ['registrationUrl','social']})+';\n')
partials={f.stem:f.read_text() for f in (ROOT/'src/partials').glob('*.html')}
urls=[]
def text(value):return html.unescape(re.sub(r'<[^>]+>',' ',value)).strip()
def attr(value):return html.escape(value,quote=True)
def metadata(source,path):
 route='/' if path.as_posix()=='index.html' else '/'+path.parent.as_posix()+'/'
 url=base+route;urls.append(url)
 title=text(re.search(r'<title>(.*?)</title>',source,re.S)[1])
 description=re.search(r'<meta name="description" content="([^"]*)"',source)
 description=html.unescape(description[1]) if description else f'Explore {title} and thoughtful matrimony for Sri Lankans at home and abroad.'
 heading=re.search(r'<h1[^>]*>(.*?)</h1>',source,re.S)
 headline=text(re.sub(r'<svg.*?</svg>','',heading[1],flags=re.S)) if heading else title
 headline=re.sub(r'\s+',' ',headline)
 article=route.startswith('/newsroom/') and route!='/newsroom/'
 schema={'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':base+'/#organization','name':config['siteName'],'url':base+'/','email':config['email'],'telephone':config['telephone']},{'@type':'WebSite','@id':base+'/#website','url':base+'/','name':config['siteName'],'inLanguage':'en','publisher':{'@id':base+'/#organization'}},{'@type':'Article' if article else 'WebPage','@id':url+'#page','url':url,'name':title,'description':description,'inLanguage':'en','isPartOf':{'@id':base+'/#website'}}]}
 if article:schema['@graph'][-1].update({'headline':headline,'author':{'@type':'Organization','name':'Favorite Hearts'},'publisher':{'@id':base+'/#organization'}})
 if route!='/':
  crumbs=[{'@type':'ListItem','position':1,'name':'Home','item':base+'/'}]
  if article:crumbs.append({'@type':'ListItem','position':2,'name':'Newsroom','item':base+'/newsroom/'})
  crumbs.append({'@type':'ListItem','position':len(crumbs)+1,'name':headline,'item':url})
  schema['@graph'].append({'@type':'BreadcrumbList','itemListElement':crumbs})
 robots='index, follow, max-image-preview:large' if config['indexable'] else 'noindex, nofollow'
 tags=f'''\n<link rel="canonical" href="{attr(url)}">
<meta name="robots" content="{robots}">
<meta property="og:type" content="{'article' if article else 'website'}">
<meta property="og:site_name" content="Favorite Hearts">
<meta property="og:title" content="{attr(title)}">
<meta property="og:description" content="{attr(description)}">
<meta property="og:url" content="{attr(url)}">
<meta property="og:image" content="{base}/assets/couple.jpg">
<meta property="og:image:alt" content="A quiet moment together">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{attr(title)}">
<meta name="twitter:description" content="{attr(description)}">
<meta name="twitter:image" content="{base}/assets/couple.jpg">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace('</','<\\/')}</script>\n'''
 return source.replace('</head>',tags+'</head>')
for f in sorted((ROOT/'src/pages').rglob('*.html')):
 path=f.relative_to(ROOT/'src/pages');s=f.read_text()
 for key,value in partials.items():s=s.replace('{{ '+key+' }}',value)
 s=re.sub(r'/(\w[\w-]*\.css)(?:\?v=\d+)?',r'/assets/css/\1?v='+config['release'],s)
 s=re.sub(r'/(\w[\w-]*\.js)(?:\?v=\d+)?',r'/assets/js/\1?v='+config['release'],s)
 # Keep canonical design tokens last in the stylesheet cascade.
 s=re.sub(r'<link rel="stylesheet" href="[^"]*design-system.css[^\"]*">','',s)
 s=s.replace('</head>','<link rel="stylesheet" href="/assets/css/design-system.css?v='+config['release']+'"><link rel="stylesheet" href="/assets/css/tailwind.css?v='+config['release']+'"></head>')
 s=metadata(s,path)
 # Give layout dimensions to local photographs, keep large images lazy below the first view.
 s=re.sub(r'<img\b(.*?)>',lambda m:'<img'+m[1]+(' decoding="async"' if 'decoding=' not in m[1] else '')+'>',s,flags=re.S)
 dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(s)
(assets/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#321638"/><path d="M32 48S12 36 12 23a11 11 0 0 1 20-5 11 11 0 0 1 20 5c0 13-20 25-20 25Z" fill="none" stroke="#f1b744" stroke-width="3"/></svg>')
(out/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('<url><loc>'+escape(url)+'</loc></url>\n' for url in urls)+'</urlset>\n')
(out/'robots.txt').write_text('User-agent: *\n'+('Allow: /\nSitemap: '+base+'/sitemap.xml\n' if config['indexable'] else 'Disallow: /\n'))
(out/'404.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found — Favorite Hearts</title><style>body{margin:0;padding:12vh 8vw;background:#191919;color:white;font:18px/1.6 Arial}h1{font:normal clamp(40px,6vw,80px)/1.1 Georgia}a{display:inline-block;background:#f1b744;color:#191919;border-radius:40px;padding:16px 28px;text-decoration:none}</style><main><p>Favorite Hearts</p><h1>A little off course.</h1><p>We couldn’t find that page.</p><a href="/">Back to home</a></main></html>')
# Netlify / Cloudflare static security and cache conventions. Other hosts: see hosting docs.
(out/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https://images.pexels.com; font-src \'self\'; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'; form-action \'self\'\n/assets/*\n  Cache-Control: public, max-age=3600\n/*.html\n  Cache-Control: no-cache\n')
(out/'_redirects').write_text('/approach/ /mission/ 301\n/explore/ /labs/ 301\n/journal/* /newsroom/ 301\n/safety/ /trust-and-safety/ 301\n')
print(f'Built {len(urls)} pages into dist/; indexable={config["indexable"]}')
