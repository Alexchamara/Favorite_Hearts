#!/usr/bin/env python3
"""Adds or changes member app texts for the demo-UI parity work, following owner decision T-1 (9 Nov 2026):

  new text       English added, Sinhala left blank, key listed under "new" in i18n/waiting/si.json
  changed text   English replaced; the earlier Sinhala is kept and the key listed under "englishChanged" (with the
                 English before), unless its {placeholders} or <tags> changed, then the Sinhala is blanked and the key
                 listed as new

Input is a JSON file: {"add": [["key", "English", "after.key"], ...], "change": {"key": "New English", ...}}

  python3 scripts/ui-parity/texts.py texts.json
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'packages/shared/src/i18n'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=OrderedDict)


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def marks(text):
    return sorted(re.findall(r'\{\w+\}', text) + re.findall(r'</?\w+/?>', text))


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    en, si = load(ROOT / 'en/app.json'), load(ROOT / 'si/app.json')
    waiting_path = ROOT / 'waiting/si.json'
    waiting = load(waiting_path)
    for key, english in spec.get('change', {}).items():
        if key not in en:
            sys.exit(f'{key}: not in English')
        before = en[key]
        if before == english:
            continue
        en[key] = english
        if si.get(key, '').strip() and marks(si[key]) == marks(english) and key not in waiting['new']:
            waiting['englishChanged'].setdefault(key, before)
        else:
            si[key] = ''
            waiting['englishChanged'].pop(key, None)
            if key not in waiting['new']:
                waiting['new'].append(key)
    for key, english, after in spec.get('add', []):
        if key in en:
            sys.exit(f'{key}: already exists')
        if after not in en:
            sys.exit(f'{after}: not in English')
        out = OrderedDict()
        for k, v in en.items():
            out[k] = v
            if k == after:
                out[key] = english
        en = out
        si[key] = ''
        waiting['new'].append(key)
    si = OrderedDict((k, si[k]) for k in en if k in si)
    waiting['new'] = sorted(set(waiting['new']))
    waiting['englishChanged'] = OrderedDict(sorted(waiting['englishChanged'].items()))
    dump(ROOT / 'en/app.json', en)
    dump(ROOT / 'si/app.json', si)
    dump(waiting_path, waiting)
    print(f"added {len(spec.get('add', []))}, changed {len(spec.get('change', {}))}; waiting: {len(waiting['new'])} new, {len(waiting['englishChanged'])} changed")


if __name__ == '__main__':
    main()
