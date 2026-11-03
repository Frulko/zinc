#!/usr/bin/env python3
"""An investigation as a two-page A4 PDF (the plan and the testimonies, the solution on the back): zinc captures src/sheet.ts at 300 dpi.

  authoring/print_sheet.py enquete.pdf --seed 7919 --level 1
  authoring/print_sheet.py enquete.pdf --mono        # for a black and white printer
"""
import argparse, os, pathlib, subprocess, tempfile, zlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
A4 = (2480, 3508)   # at 300 dpi


def write_pdf(path, pages):
    """Pages as lossless images, 300 dpi on A4 (Pillow's PDF would make them JPEG, which smears text and thin lines)."""
    objects = {1: b'<< /Type /Catalog /Pages 2 0 R >>'}
    kids = []
    for i, page in enumerate(pages):
        n = 3 + i * 3
        kids.append(f'{n} 0 R')
        objects[n] = f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2 841.92] /Contents {n + 1} 0 R /Resources << /XObject << /I {n + 2} 0 R >> >> >>'.encode()
        draw = b'q 595.2 0 0 841.92 0 0 cm /I Do Q'
        objects[n + 1] = b'<< /Length %d >>\nstream\n%s\nendstream' % (len(draw), draw)
        data = zlib.compress(page.tobytes(), 9)
        space = '/DeviceGray' if page.mode == 'L' else '/DeviceRGB'
        objects[n + 2] = f'<< /Type /XObject /Subtype /Image /Width {page.width} /Height {page.height} /ColorSpace {space} /BitsPerComponent 8 /Filter /FlateDecode /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream'
    objects[2] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()
    out = bytearray(b'%PDF-1.4\n')
    offsets = {}
    for n in sorted(objects):
        offsets[n] = len(out)
        out += b'%d 0 obj\n' % n + objects[n] + b'\nendobj\n'
    table = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1) + b''.join(b'%010d 00000 n \n' % offsets[n] for n in sorted(objects))
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, table)
    pathlib.Path(path).write_bytes(out)


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('pdf')
    a.add_argument('--seed', type=int, default=7919)
    a.add_argument('--level', type=int, default=0, choices=[0, 1, 2])
    a.add_argument('--mono', action='store_true')
    args = a.parse_args()
    with tempfile.TemporaryDirectory() as out:
        env = dict(os.environ, MURDOKU_SEED=str(args.seed), MURDOKU_LEVEL=str(args.level), MURDOKU_MONO='1' if args.mono else '0')
        zinc = os.environ.get('ZINC', str(ROOT.parents[1] / 'build/zinc'))
        subprocess.run([zinc, 'capture', str(ROOT / 'src/sheet.ts'), '--frames', '2,4', '--size', f'{A4[0]}x{A4[1]}', '--out', out], env=env, check=True, stdout=subprocess.DEVNULL)
        pages = [Image.open(pathlib.Path(out) / f'frame-{n}.png').convert('L' if args.mono else 'RGB') for n in (2, 4)]
    # ponytail: the pages are pictures, sharp at 300 dpi; a vector PDF needs a PDF writer in the engine (PDFium's edit API) and only matters above 300 dpi.
    write_pdf(args.pdf, pages)


if __name__ == '__main__':
    main()
