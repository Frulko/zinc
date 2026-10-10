#!/usr/bin/env python3
"""The art of the table Twilight Fair, made from nothing: the images and the models of assets/tables/twilight-fair/art/.

A funfair at dusk: a sky that goes from night to embers, strings of bulbs, a carousel, a big wheel. Everything is drawn or
built here, by code, with the canvas and the model builder of tidal_lock_art.py (this script imports them: it holds only
what this table looks like). The painting of the playfield is laid out from the table file: the canopy of the carousel is
drawn around the bumpers, the stalls behind the targets, a pad under each light, where table.json puts them; without a
table file yet (the table is being made in the editor) it paints the sky and the ground alone, and is run again later.

usage: twilight_fair_art.py [--only name,name...]
needs python3 with Pillow (PIL); the text is set in Inter (lib/fonts, SIL Open Font License)."""
import json, math, os, random, sys
from PIL import Image, ImageDraw
from tidal_lock_art import Canvas, Model, PX, SS, ball, mix, palette, rgb, stars, vertical

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, '..', 'assets', 'tables', 'twilight-fair')
OUT = os.path.join(TABLE, 'art')
NIGHT, PLUM, ROSE, EMBER, GOLD, CREAM, RED, GROUND = '#17123a', '#4a1f5c', '#b03a5a', '#f0863a', '#ffcf5a', '#fff0c8', '#d8342c', '#241420'
DUSK = [(0, rgb(NIGHT)), (0.3, rgb(PLUM)), (0.5, rgb(ROSE)), (0.62, rgb(EMBER)), (0.7, rgb('#5a2a2a')), (1, rgb(GROUND))]


def sky(w, h, k, stops=DUSK, seed=5, n=160):
    c = Canvas(w, h, k, (0, 0, 0))
    c.im = vertical(c.im.size, stops)
    c.d = ImageDraw.Draw(c.im)
    c.glow(lambda l: stars(l, w, h * 0.4, n, seed), 0.12, 1.4)
    return c


def stripes(c, x, y, r, n, a, b, r0=0.0):
    """A round canopy seen from above: wedges of two colours."""
    for i in range(n):
        a0, a1 = math.tau * i / n, math.tau * (i + 1) / n
        c.poly([(x + math.cos(a0) * r0, y + math.sin(a0) * r0), (x + math.cos(a0) * r, y + math.sin(a0) * r), (x + math.cos(a1) * r, y + math.sin(a1) * r), (x + math.cos(a1) * r0, y + math.sin(a1) * r0)],
               fill=rgb(a if i % 2 == 0 else b))


def garland(c, pts, colors, r=0.32):
    """A string with a bulb at each point, lit."""
    c.line(pts, rgb('#3a2030'), 0.08)
    c.glow(lambda l: [l.circle(x, y, r * 1.6, fill=rgb(colors[i % len(colors)])) for i, (x, y) in enumerate(pts)], 0.5, 1.3)
    for i, (x, y) in enumerate(pts):
        c.circle(x, y, r, fill=rgb(colors[i % len(colors)]))


def wheel_drawing(c, x, y, r, color, width):
    """The big wheel seen from the front: rim, spokes, a gondola at the end of each."""
    c.circle(x, y, r, outline=color, width=width)
    c.circle(x, y, r * 0.78, outline=color, width=width * 0.6)
    for i in range(12):
        a = math.tau * i / 12
        c.line([(x, y), (x + math.cos(a) * r, y + math.sin(a) * r)], color, width * 0.6)
        c.box(x + math.cos(a) * r - r * 0.07, y + math.sin(a) * r, r * 0.14, r * 0.12, r=r * 0.03, fill=color)
    c.poly([(x, y), (x - r * 0.5, y + r * 1.25), (x - r * 0.4, y + r * 1.25)], fill=color)
    c.poly([(x, y), (x + r * 0.5, y + r * 1.25), (x + r * 0.4, y + r * 1.25)], fill=color)


def playfield(t):
    W, H = 51, 107
    c = sky(W, H, PX * SS)
    # the fair on the skyline: the big wheel, tents, and the ground with its paths
    wheel_drawing(c, 36.5, 51, 9.5, rgb('#2a1430'), 0.22)
    for x, w, h in ((3, 9, 7), (13, 7, 5), (24, 10, 8)):
        c.poly([(x, 66), (x + w / 2, 66 - h), (x + w, 66)], fill=rgb('#2a1430'))
        c.box(x + w * 0.1, 66, w * 0.8, 3, fill=rgb('#2a1430'))
    for i in range(14):
        c.line([(25.5 + (i - 6.5) * 0.9, 69), (25.5 + (i - 6.5) * 6.5, 107)], rgb('#3a2030'), 0.12)
    garland(c, [(2 + i * 2.35, 68.2 + math.sin(i * 0.9) * 0.5) for i in range(21)], [GOLD, CREAM, '#ff9a5a'], 0.22)
    if t is not None:
        # the carousel: its canopy round the bumpers, a ring under each
        pops = [b['at'] for b in t.get('bumpers', [])]
        if pops:
            cx, cy = sum(p[0] for p in pops) / len(pops), sum(p[1] for p in pops) / len(pops)
            reach = max(math.hypot(p[0] - cx, p[1] - cy) for p in pops) + 5
            stripes(c, cx, cy, reach, 16, '#7a1f2c', '#5a1826', r0=1.2)
            c.circle(cx, cy, reach, outline=rgb(GOLD), width=0.25)
            garland(c, [(cx + math.cos(math.tau * i / 20) * (reach - 0.9), cy + math.sin(math.tau * i / 20) * (reach - 0.9)) for i in range(20)], [GOLD, CREAM], 0.2)
            for p in pops:
                c.circle(p[0], p[1], 3.9, fill=rgb('#3a1020'), outline=rgb(CREAM), width=0.18)
            c.text(cx, cy + reach + 1.3, 'CAROUSEL', 1.1, rgb(CREAM), spacing=0.35)
        # a dark pad under each light of the playfield, so that its glow reads; a stall behind each row of targets
        for l in t.get('lights', []):
            if l.get('z', 0) == 0:
                c.circle(l['at'][0], l['at'][1], l.get('size', 1.1) + 0.35, fill=rgb('#1c0e1c'), outline=rgb('#5a3a4a'), width=0.08)
        for k in t.get('kickers', []):
            c.circle(k['at'][0], k['at'][1], k.get('radius', 1.7) + 1.6, fill=rgb('#1c0e1c'), outline=rgb(GOLD), width=0.2)
            c.text(k['at'][0], k['at'][1] + 4.6, 'HIGH STRIKER', 0.8, rgb(GOLD), spacing=0.15)
        drops = [g for g in t.get('targets', []) if g.get('kind') == 'drop']
        if drops:
            ys = [g['at'][1] for g in drops]
            c.text(drops[0]['at'][0] - 2.6, (min(ys) + max(ys)) / 2, 'COCONUT SHY', 0.8, rgb(CREAM), angle=90, spacing=0.15)
        ducks = [g for g in t.get('targets', []) if g.get('kind', 'standup') == 'standup' and g.get('z', 0) == 0]
        if ducks:
            ys = [g['at'][1] for g in ducks]
            c.text(ducks[0]['at'][0] + 2.6, (min(ys) + max(ys)) / 2, 'DUCK POND', 0.8, rgb(CREAM), angle=-90, spacing=0.15)
        for r_ in t.get('rollovers', []):
            x, y = (r_['a'][0] + r_['b'][0]) / 2, (r_['a'][1] + r_['b'][1]) / 2
            c.box(x - 1.5, y - 4, 3, 8, r=1.2, outline=rgb('#7a4a6a'), width=0.1)
    c.glow(lambda l: (l.text(23.85, 84.6, 'TWILIGHT', 2.5, rgb(EMBER), spacing=0.45), l.text(23.85, 88.4, 'FAIR', 2.9, rgb(EMBER), spacing=1.3)), 0.5, 1.5)
    c.text(23.85, 84.6, 'TWILIGHT', 2.5, rgb(CREAM), spacing=0.45)
    c.text(23.85, 88.4, 'FAIR', 2.9, rgb(GOLD), spacing=1.3)
    return c.im.resize((int(W * PX), int(H * PX)), Image.LANCZOS)


def cap():
    """The cap of a bumper: the top of a little carousel."""
    c = Canvas(8, 8, 32 * SS, rgb(RED))
    stripes(c, 4, 4, 4.2, 12, RED, CREAM)
    c.circle(4, 4, 1.1, fill=rgb(GOLD), outline=rgb('#7a4a10'), width=0.12)
    c.circle(4, 4, 3.85, outline=rgb(GOLD), width=0.22)
    return c.im.resize((256, 256), Image.LANCZOS)


def flipper():
    c = Canvas(8.5, 1.8, 30 * SS, rgb(CREAM))
    c.box(0.3, 0.6, 7.9, 0.6, r=0.3, fill=rgb(RED))
    return c.im.resize((255, 54), Image.LANCZOS)


def planks(w, h, size, n, a, b, title=None):
    """A floor of boards, the long way down the image."""
    c = Canvas(w, h, 20 * SS, rgb(a))
    rnd = random.Random(7)
    for i in range(n):
        c.box(i * w / n, 0, w / n - 0.08, h, fill=mix(rgb(a), rgb(b), rnd.random()))
    if title:
        c.text(w / 2, h * 0.5, title, w * 0.085, rgb(CREAM), spacing=w * 0.02)
    return c.im.resize(size, Image.LANCZOS)


def tent():
    """The cloth of the tent, wrapped round its cone: stripes."""
    c = Canvas(8, 8, 16, rgb(CREAM))
    for i in range(0, 8, 2):
        c.box(i, 0, 1, 8, fill=rgb(RED))
    return c.im.resize((128, 128), Image.LANCZOS)


def backglass(w, h):
    k = 2
    c = sky(w / 10, h / 10, 10 * k, n=int(w * h / 1600), seed=9)
    W, H = w / 10, h / 10
    wheel_drawing(c, W * 0.74, H * 0.5, min(W * 0.2, H * 0.3), rgb('#1c0e1c'), 0.25)
    garland(c, [(i * W / 24, H * 0.72 + math.sin(i * 0.8) * 0.6) for i in range(25)], [GOLD, CREAM, '#ff9a5a'], 0.3)
    c.box(0, H * 0.74, W, H * 0.26, fill=rgb('#1c0e1c'))
    return c.im.resize((w, h), Image.LANCZOS)


def banner(w, h):
    """The backboard and the apron: red boards with the name of the fair in bulbs' colours."""
    c = Canvas(w / 20, h / 20, 20 * SS, rgb('#5a1826'))
    W, H = w / 20, h / 20
    c.box(0.3, 0.3, W - 0.6, H - 0.6, r=0.5, outline=rgb(GOLD), width=0.15)
    c.glow(lambda l: l.text(W / 2, H / 2, 'TWILIGHT FAIR', H * 0.42, rgb(EMBER), spacing=H * 0.08), 0.5, 1.4)
    c.text(W / 2, H / 2, 'TWILIGHT FAIR', H * 0.42, rgb(CREAM), spacing=H * 0.08)
    return c.im.resize((w, h), Image.LANCZOS)


def wheel_model():
    """The big wheel: two rims on their spokes, a gondola hung at each, on a stand. It stands across the table, facing the player."""
    m = Model()
    R, n = 5.0, 12
    for side in (-0.5, 0.5):
        for i in range(n):
            a0, a1 = math.tau * i / n, math.tau * (i + 1) / n
            x0, z0, x1, z1 = math.cos(a0) * R, 6.2 + math.sin(a0) * R, math.cos(a1) * R, 6.2 + math.sin(a1) * R
            m.box(min(x0, x1) - 0.12, side - 0.12, min(z0, z1) - 0.12, max(x0, x1) + 0.12, side + 0.12, max(z0, z1) + 0.12, '#e8ecf4')
    for i in range(n):
        a = math.tau * i / n
        x, z = math.cos(a) * R, 6.2 + math.sin(a) * R
        m.box(x - 0.55, -0.45, z - 0.9, x + 0.55, 0.45, z - 0.1, ['#ff5a4a', '#ffcf7a', '#f4a020', '#e8ecf4'][i % 4])
    m.box(-0.5, -0.7, 5.7, 0.5, 0.7, 6.7, '#b8862a')
    for x in (-3.2, 3.2):
        m.box(min(x, x * 0.25) - 0.15, -0.9, 0, max(x, x * 0.25) + 0.15, -0.6, 0.5, '#6a4a2a')
        m.box(x * 0.2 - 0.2, -0.85, 0, x * 0.2 + 0.2, -0.6, 6.2, '#6a4a2a')
        m.box(x * 0.2 - 0.2, 0.6, 0, x * 0.2 + 0.2, 0.85, 6.2, '#6a4a2a')
    return m


def booth_model():
    """The ticket booth: a hut with a counter and a striped roof."""
    m = Model()
    m.box(-1.6, -1.3, 0, 1.6, 1.3, 2.6, '#c98848')
    m.box(-1.75, 1.3, 1.3, 1.75, 1.7, 1.5, '#6a4a2a')
    m.box(-1.0, 1.25, 1.5, 1.0, 1.35, 2.3, '#ffcf7a')
    for i in range(4):
        m.box(-1.9 + i * 0.95, -1.6, 2.6, -0.95 + i * 0.95, 1.9, 2.95 - 0.02 * i, '#ff5a4a' if i % 2 == 0 else '#e8ecf4')
    return m


def main():
    args = sys.argv[1:]
    only = args[1].split(',') if len(args) == 2 and args[0] == '--only' else None
    if args and only is None:
        sys.exit(__doc__)
    file = os.path.join(TABLE, 'table.json')
    t = json.load(open(file)) if os.path.exists(file) else None
    os.makedirs(OUT, exist_ok=True)
    images = {
        'playfield.jpg': lambda: playfield(t), 'cap.png': cap, 'flipper.png': flipper, 'ball.jpg': ball, 'tent.png': tent, 'palette.png': palette,
        'deck.jpg': lambda: planks(14, 18, (280, 360), 9, '#8a5a34', '#6a4226', 'BANDSTAND'), 'backglass.jpg': lambda: backglass(680, 800),
        'backglass-wide.jpg': lambda: backglass(800, 200), 'apron.jpg': lambda: banner(932, 80), 'backboard.jpg': lambda: banner(1108, 280),
    }
    for name, m in {'wheel.obj': wheel_model(), 'booth.obj': booth_model()}.items():
        if only and name.split('.')[0] not in only:
            continue
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(m.text())
        print(f'{name}  {len(m.f)} faces  {os.path.getsize(os.path.join(OUT, name))} bytes')
    for name, make in images.items():
        if only and name.split('.')[0] not in only:
            continue
        path, im = os.path.join(OUT, name), make()
        if name.endswith('.jpg'):
            im.save(path, quality=86, optimize=True)
        else:
            im.save(path, optimize=True)
        print(f'{name}  {im.size[0]} x {im.size[1]}  {os.path.getsize(path)} bytes')


if __name__ == '__main__':
    main()
