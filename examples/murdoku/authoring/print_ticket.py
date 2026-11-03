#!/usr/bin/env python3
"""Print an investigation as a till receipt on an ESC/POS printer (Epson TM-T20III, 576 dots): zinc captures src/ticket.ts, this sends the dots.

  authoring/print_ticket.py --seed 7919 --level 1 --host ticket-printer.local     # the ESP32 bridge of ~/Lab/ticket-printer, or a networked printer
  authoring/print_ticket.py --preview ticket.png                                  # nothing printed
"""
import argparse, os, pathlib, socket, subprocess, tempfile
from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parents[1]
WIDTH, CANVAS_HEIGHT, BAND = 576, 3000, 128   # dots; a band is one GS v 0 command


def capture(seed, level):
    """The receipt as a 1-bit image, cut under its last black dot."""
    with tempfile.TemporaryDirectory() as out:
        env = dict(os.environ, MURDOKU_SEED=str(seed), MURDOKU_LEVEL=str(level))
        zinc = os.environ.get('ZINC', str(ROOT.parents[1] / 'build/zinc'))
        subprocess.run([zinc, 'capture', str(ROOT / 'src/ticket.ts'), '--frames', '2', '--size', f'{WIDTH}x{CANVAS_HEIGHT}', '--out', out], env=env, check=True, stdout=subprocess.DEVNULL)
        image = Image.open(pathlib.Path(out) / 'frame-2.png').convert('L').point(lambda v: 255 if v > 150 else 0).convert('1', dither=Image.Dither.NONE)
    return trim(image)


def trim(image):
    return image.crop((0, 0, WIDTH, ImageChops.invert(image.convert('L')).getbbox()[3] + 8))


def escpos(image):
    """Init, raster bands (a set bit prints), feed to the cutter, partial cut."""
    x = image.width // 8
    data = bytearray(b'\x1b@')
    packed = ImageChops.invert(image.convert('L')).convert('1', dither=Image.Dither.NONE).tobytes()   # PIL packs MSB first, like the printer
    for top in range(0, image.height, BAND):
        rows = min(BAND, image.height - top)
        data += b'\x1dv0\x00' + bytes([x & 255, x >> 8, rows & 255, rows >> 8]) + packed[top * x:(top + rows) * x]
    return bytes(data + b'\x1bd\x04\x1dV\x01')


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--seed', type=int, default=7919)
    a.add_argument('--level', type=int, default=0, choices=[0, 1, 2])
    a.add_argument('--host', help='printer or bridge, raw TCP')
    a.add_argument('--port', type=int, default=9100)
    a.add_argument('--preview', help='write the PNG')
    a.add_argument('--out', help='write the ESC/POS bytes')
    args = a.parse_args()
    if not (args.host or args.preview or args.out):
        a.error('say where it goes: --host, --preview or --out')
    image = capture(args.seed, args.level)
    print(f'{image.height} dots = {image.height / 8:.0f} mm of paper')
    if args.preview:
        image.save(args.preview)
    data = escpos(image)
    if args.out:
        pathlib.Path(args.out).write_bytes(data)
    if args.host:
        with socket.create_connection((args.host, args.port), timeout=10) as s:
            s.sendall(data)


if __name__ == '__main__':
    main()
