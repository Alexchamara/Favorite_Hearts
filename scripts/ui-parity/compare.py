#!/usr/bin/env python3
"""Diffs two folders of screenshots made by capture.py (same names) for the demo-UI parity work.

  python scripts/ui-parity/compare.py shots/ref shots/prod shots/diff [--prefix m-]

Uses the same measures as the clone kit's compare_images.py (mean absolute difference, share of pixels whose
grey-level difference is above 12), but pages of different heights are compared over their shared top area and the
height difference is reported, instead of refusing. For each pair it writes <name>__<width>.png into the output
folder: reference | this repo | amplified difference, side by side, and a summary report.md sorted worst first.
Development tool only (needs Pillow).
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageStat

THRESHOLD = 12


def measure(ref, cand):
    w, h = min(ref.width, cand.width), min(ref.height, cand.height)
    a, b = ref.crop((0, 0, w, h)), cand.crop((0, 0, w, h))
    diff = ImageChops.difference(a, b)
    mae = sum(ImageStat.Stat(diff).mean) / 3
    grey = diff.convert('L').point(lambda v: 255 if v > THRESHOLD else 0)
    changed = ImageStat.Stat(grey).mean[0] / 255
    return diff, mae, changed


def strip(ref, cand, diff, max_height):
    h = min(max(ref.height, cand.height), max_height)
    w = ref.width
    sheet = Image.new('RGB', (w * 3 + 16, h), (255, 0, 255))
    sheet.paste(ref.crop((0, 0, w, min(h, ref.height))), (0, 0))
    sheet.paste(cand.crop((0, 0, min(w, cand.width), min(h, cand.height))), (w + 8, 0))
    sheet.paste(ImageEnhance.Contrast(diff).enhance(4).crop((0, 0, diff.width, min(h, diff.height))), (2 * w + 16, 0))
    return sheet


def main():
    p = argparse.ArgumentParser()
    p.add_argument('reference')
    p.add_argument('candidate')
    p.add_argument('output')
    p.add_argument('--prefix', default='', help='only names starting with this')
    p.add_argument('--max-height', type=int, default=4000, help='crop side-by-side sheets to this height')
    a = p.parse_args()
    ref_dir, cand_dir, out = Path(a.reference), Path(a.candidate), Path(a.output)
    out.mkdir(parents=True, exist_ok=True)
    rows, missing = [], []
    for ref_path in sorted(ref_dir.glob(f'{a.prefix}*.png')):
        cand_path = cand_dir / ref_path.name
        if not cand_path.exists():
            missing.append(ref_path.name)
            continue
        ref = Image.open(ref_path).convert('RGB')
        cand = Image.open(cand_path).convert('RGB')
        diff, mae, changed = measure(ref, cand)
        strip(ref, cand, diff, a.max_height).save(out / ref_path.name)
        rows.append((changed, mae, ref_path.name, ref.size, cand.size))
    rows.sort(reverse=True)
    lines = ['| Screenshot | Changed px | Mean diff | Ref size | Repo size | Height Δ |', '| --- | ---: | ---: | --- | --- | ---: |']
    for changed, mae, name, rs, cs in rows:
        lines.append(f'| {name} | {changed * 100:.2f}% | {mae:.2f} | {rs[0]}×{rs[1]} | {cs[0]}×{cs[1]} | {cs[1] - rs[1]:+d} |')
    if missing:
        lines += ['', 'No repo screenshot for: ' + ', '.join(missing)]
    lines += ['', f'Changed px = share of the shared area whose grey-level difference is above {THRESHOLD}/255.']
    (out / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
