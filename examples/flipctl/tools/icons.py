"""Turns flipctl-slint's alpha-mask icons into black (-k) and white (-w) inked copies: zinc:ui images have no tint."""
import sys, pathlib
from PIL import Image
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
for f in src.glob('*.png'):
    a = Image.open(f).convert('RGBA').split()[3]
    for tag, v in (('k', 0), ('w', 255)):
        Image.merge('RGBA', (Image.new('L', a.size, v),) * 3 + (a,)).save(dst / f'{f.stem}-{tag}.png')
