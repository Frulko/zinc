#!/usr/bin/env python3
"""The art of the table Tidal Lock, made again from nothing: the images and the models of assets/tables/tidal-lock/art/.

Everything is drawn or built here, by code: the painting of the playfield (space, the gas giant, the hull of the
station, the lanes, the legends), the images of the pieces, and the modelled pieces as OBJ files. Nothing is fetched
or copied from a game. The painting is laid out from the table file itself: the pads under the lights, the rings of
the bumpers, the docking ring, the lane strips are drawn where table.json puts those elements, so a table that is
retuned gets its art back by running this again.

usage: tidal_lock_art.py [--only name,name...]
needs python3 with Pillow (PIL); the text is set in Inter (lib/fonts, SIL Open Font License)."""
import json, math, os, random, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, '..', 'assets', 'tables', 'tidal-lock')
OUT = os.path.join(TABLE, 'art')
FONTS = os.path.join(HERE, '..', '..', '..', 'lib', 'fonts')
PX = 20    # pixels of the playfield image per centimetre of table
SS = 2     # drawn twice as large, then reduced: smooth edges


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def font(cm, k, bold=True):
    return ImageFont.truetype(os.path.join(FONTS, 'Inter-Bold.ttf' if bold else 'Inter-Regular.ttf'), max(6, int(cm * k)))


class Canvas:
    """A picture drawn in centimetres of table: (0, 0) its top left corner, x to the right, y down."""

    def __init__(self, w, h, k, color):
        self.k = k
        self.im = Image.new('RGB', (int(w * k), int(h * k)), color)
        self.d = ImageDraw.Draw(self.im)

    def p(self, pts):
        return [(x * self.k, y * self.k) for x, y in pts]

    def poly(self, pts, fill=None, outline=None, width=0.0):
        self.d.polygon(self.p(pts), fill=fill)
        if outline:
            self.line(pts + [pts[0]], outline, width)

    def line(self, pts, color, width):
        self.d.line(self.p(pts), fill=color, width=max(1, int(width * self.k)), joint='curve')

    def circle(self, x, y, r, fill=None, outline=None, width=0.0):
        k = self.k
        self.d.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill=fill, outline=outline, width=max(1, int(width * k)) if outline else 0)

    def arc(self, x, y, r, a0, a1, color, width):
        k = self.k
        self.d.arc([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], a0, a1, fill=color, width=max(1, int(width * k)))

    def box(self, x, y, w, h, r=0.0, fill=None, outline=None, width=0.0):
        k = self.k
        self.d.rounded_rectangle([x * k, y * k, (x + w) * k, (y + h) * k], radius=r * k, fill=fill, outline=outline, width=max(1, int(width * k)) if outline else 0)

    def text(self, x, y, s, cm, color, angle=0.0, bold=True, spacing=0.0, anchor='mm'):
        """A legend centred on (x, y), `cm` tall, turned by `angle` degrees (counter-clockwise), its letters `spacing` cm apart."""
        f = font(cm, self.k, bold)
        gap = spacing * self.k
        widths = [f.getlength(c) for c in s]
        w, h = int(sum(widths) + gap * (len(s) - 1)) + 8, int(cm * self.k * 1.5) + 8
        layer = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(layer)
        cx = 4
        for c, cw in zip(s, widths):
            d.text((cx, h / 2), c, fill=255, font=f, anchor='lm')
            cx += cw + gap
        if angle:
            layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
        self.im.paste(Image.new('RGB', layer.size, color), (int(x * self.k - layer.size[0] / 2), int(y * self.k - layer.size[1] / 2)), layer)

    def glow(self, draw, radius, strength=1.0):
        """Draws with `draw(canvas)` on a black layer, blurs it and adds it as light: what is drawn glows."""
        layer = Canvas(self.im.size[0] / self.k, self.im.size[1] / self.k, self.k, (0, 0, 0))
        draw(layer)
        halo = layer.im.filter(ImageFilter.GaussianBlur(radius * self.k))
        if strength != 1.0:
            halo = halo.point(lambda v: min(255, int(v * strength)))
        self.im = ImageChops.screen(self.im, halo)
        self.d = ImageDraw.Draw(self.im)

    def paste(self, other, x, y, mask=None):
        self.im.paste(other, (int(x * self.k), int(y * self.k)), mask)
        self.d = ImageDraw.Draw(self.im)


def vertical(size, stops):
    """An image of `size` whose colour goes down through `stops`: (fraction, colour) rows."""
    w, h = size
    col = Image.new('RGB', (1, 256))
    for i in range(256):
        t = i / 255
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                col.putpixel((0, i), mix(c0, c1, (t - t0) / max(1e-9, t1 - t0)))
                break
    return col.resize((w, h), Image.BILINEAR)


def stars(c, w, h, n, seed):
    r = random.Random(seed)
    for _ in range(n):
        x, y, m = r.uniform(0, w), r.uniform(0, h), r.random() ** 3
        tint = r.choice([(255, 255, 255), (200, 220, 255), (255, 235, 200), (190, 240, 255)])
        v = 0.25 + 0.75 * m
        c.circle(x, y, 0.035 + 0.07 * m, fill=tuple(int(t * v) for t in tint))


def banded(size, bands, seed, wave):
    """The clouds of a gas giant: horizontal bands of `bands` colours with unequal widths, their edges waved and softened."""
    w, h = size
    r = random.Random(seed)
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    y = 0
    while y < h:
        t = r.uniform(0.02, 0.085) * h
        base = r.choice(bands)
        d.rectangle([0, y, w, y + t], fill=mix(base, r.choice(bands), r.uniform(0, 0.35)))
        # streaks inside the band
        for _ in range(6):
            sy, sx = y + r.uniform(0, t), r.uniform(0, w)
            d.ellipse([sx, sy - t * 0.08, sx + r.uniform(0.05, 0.3) * w, sy + t * 0.08], fill=mix(base, r.choice(bands), 0.5))
        y += t
    # the edges of the bands wave: the picture is pulled up and down along x
    cells, mesh = 24, []
    for i in range(cells):
        x0, x1 = i * w // cells, (i + 1) * w // cells
        d0, d1 = wave * h * math.sin(i * 0.9 + seed), wave * h * math.sin((i + 1) * 0.9 + seed)
        mesh.append(((x0, 0, x1, h), (x0, d0, x0, h + d0, x1, h + d1, x1, d1)))
    return im.transform((w, h), Image.MESH, mesh, Image.BILINEAR).filter(ImageFilter.GaussianBlur(h * 0.004))


def planet(radius_px, bands, seed, light=(0.55, -0.45), tilt=-14):
    """A gas giant seen from space: its bands, the dark of its limb, and its night side away from `light`."""
    n = radius_px * 2
    clouds = banded((n * 2, n * 2), bands, seed, 0.012).rotate(tilt, resample=Image.BICUBIC).crop((n // 2, n // 2, n // 2 + n, n // 2 + n))
    # the limb: darker towards the edge of the disc
    limb = Image.radial_gradient('L').resize((n, n), Image.BILINEAR).point(lambda v: 255 - int(255 * (v / 255) ** 2.6))
    # the day side: a large soft disc of light, off centre towards the star
    day = Image.new('L', (n, n), 0)
    off = (int(light[0] * radius_px), int(light[1] * radius_px))
    big = Image.radial_gradient('L').resize((int(n * 1.7), int(n * 1.7)), Image.BILINEAR).point(lambda v: max(0, 255 - int(v * 1.55)))
    day.paste(big, (n // 2 - big.size[0] // 2 + off[0], n // 2 - big.size[1] // 2 + off[1]))
    shade = ImageChops.multiply(limb, day.point(lambda v: 38 + int(v * 0.85)))
    lit = ImageChops.multiply(clouds, Image.merge('RGB', (shade, shade, shade)))
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).ellipse([1, 1, n - 2, n - 2], fill=255)
    return lit, mask


def hazard(c, pts, width, a=(240, 190, 40), b=(24, 24, 30)):
    """A band of slanted stripes along the line through `pts` (two points)."""
    (x0, y0), (x1, y1) = pts
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy * width / 2, ux * width / 2
    c.poly([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], fill=b)
    step, t = width * 1.1, 0.0
    while t < L:
        e = min(L, t + step / 2)
        s0, s1 = t + width * 0.5, e + width * 0.5
        c.poly([(x0 + ux * t + nx, y0 + uy * t + ny), (x0 + ux * e + nx, y0 + uy * e + ny),
                (x0 + ux * min(L, s1) - nx, y0 + uy * min(L, s1) - ny), (x0 + ux * min(L, s0) - nx, y0 + uy * min(L, s0) - ny)], fill=a)
        t += step


def light_outline(l, grow):
    """The outline of a light of the table as the game draws it (round, arrow or bar), `grow` cm larger all round, as polygons."""
    x, y, s, a = l['at'][0], l['at'][1], l.get('size', 1.1), math.radians(l.get('angle', -90))
    c, sn = math.cos(a), math.sin(a)
    at = lambda along, across: (x + along * c - across * sn, y + along * sn + across * c)
    shape = l.get('shape', 'round')
    if shape == 'round':
        return [[(x + math.cos(i * math.pi / 16) * (s + grow), y + math.sin(i * math.pi / 16) * (s + grow)) for i in range(32)]]
    if shape == 'arrow':
        g = grow
        return [[at(s + g * 1.6, 0), at(-g, s * 0.75 + g * 1.5), at(-g, -s * 0.75 - g * 1.5)], [at(g, s * 0.3 + g), at(-s - g, s * 0.3 + g), at(-s - g, -s * 0.3 - g), at(g, -s * 0.3 - g)]]
    return [[at(s + grow, s * 0.28 + grow), at(-s - grow, s * 0.28 + grow), at(-s - grow, -s * 0.28 - grow), at(s + grow, -s * 0.28 - grow)]]


# ---------------------------------------------------------------- the playfield
SPACE_TOP, SPACE_MID, SPACE_LOW = rgb('#0a1030'), rgb('#191546'), rgb('#07192e')
CYAN, AMBER, PINK, VIOLET, STEEL = rgb('#66f0ff'), rgb('#ffb347'), rgb('#ff5f8a'), rgb('#9f8cff'), rgb('#8fa0c8')
GIANT = [rgb('#c9743a'), rgb('#e0a868'), rgb('#a85428'), rgb('#f0d0a0'), rgb('#8a4424'), rgb('#d89050'), rgb('#b8683a')]


def playfield(t):
    W, H = t['playfield'].get('width', 51), t['playfield'].get('length', 107)
    k = PX * SS
    c = Canvas(W, H, k, SPACE_TOP)
    c.im = vertical(c.im.size, [(0, SPACE_TOP), (0.45, SPACE_MID), (0.8, SPACE_LOW), (1, rgb('#040a16'))])
    c.d = ImageDraw.Draw(c.im)

    # ---- space: clouds of gas, then stars
    def nebula(l):
        r = random.Random(7)
        for color, n in ((rgb('#5a2a8a'), 5), (rgb('#1a5a8a'), 5), (rgb('#8a2a5a'), 3), (rgb('#126a6a'), 4)):
            for _ in range(n):
                x, y, s = r.uniform(0, W), r.uniform(0, H), r.uniform(5, 13)
                l.d.ellipse([(x - s) * k, (y - s * 0.6) * k, (x + s) * k, (y + s * 0.6) * k], fill=tuple(int(v * 0.5) for v in color))
    c.glow(nebula, 4.5)
    stars(c, W, H, 1500, 11)
    c.glow(lambda l: stars(l, W, H, 90, 12), 0.18, 1.6)

    # ---- the gas giant, low in the sky behind the bumpers, and the orbits around it
    gx, gy, gr = 14.5, 43.5, 19.0
    disc, mask = planet(int(gr * k), GIANT, 5)
    c.glow(lambda l: l.circle(gx, gy, gr + 0.3, fill=(120, 60, 30)), 1.6)   # its air, lit at the limb
    c.paste(disc, gx - gr, gy - gr, mask)
    def orbits(l):
        for rx, ry, w in ((27, 8.5, 0.16), (33, 11.5, 0.1), (40, 15, 0.08)):
            o = Image.new('RGB', l.im.size, (0, 0, 0))
            d = ImageDraw.Draw(o)
            n = 160
            pts = [(gx + math.cos(i * 2 * math.pi / n) * rx, gy + math.sin(i * 2 * math.pi / n) * ry) for i in range(n + 1)]
            a = math.radians(-24)
            pts = [((gx + (x - gx) * math.cos(a) - (y - gy) * math.sin(a)) * k, (gy + (x - gx) * math.sin(a) + (y - gy) * math.cos(a)) * k) for x, y in pts]
            # the far half passes behind the planet: only the near half is drawn over it
            for i in range(0, n, 2):
                behind = n * 0.5 < i < n and math.hypot(pts[i][0] / k - gx, pts[i][1] / k - gy) < gr
                if not behind:
                    d.line(pts[i:i + 2], fill=mix(CYAN, (255, 255, 255), 0.2), width=max(1, int(w * k)))
            l.im = ImageChops.lighter(l.im, o)
            l.d = ImageDraw.Draw(l.im)
    c.glow(orbits, 0.25, 1.2)
    orbits(c)

    # ---- the station: hull plates around the dock, in the upper right
    dock = t['kickers'][0]
    dx, dy = dock['at']
    hull = [(31.5, 5), (50.5, 5), (50.5, 35.5), (41.2, 35.5), (41.2, 33), (38, 33), (31.5, 24)]
    plate = Image.new('RGB', c.im.size, rgb('#1c2740'))
    pd = ImageDraw.Draw(plate)
    r = random.Random(3)
    for gxi in range(0, int(W), 3):
        for gyi in range(0, 40, 2):
            shade = r.uniform(-0.12, 0.12)
            base = mix(rgb('#243352'), rgb('#3a4a70'), 0.5 + shade * 3)
            x0 = gxi + (1.5 if (gyi // 2) % 2 else 0)
            pd.rectangle([x0 * k, gyi * k, (x0 + 3) * k - 3, (gyi + 2) * k - 3], fill=base)
            for bx, by in ((0.25, 0.25), (2.6, 0.25), (0.25, 1.6), (2.6, 1.6)):
                pd.ellipse([(x0 + bx) * k, (gyi + by) * k, (x0 + bx + 0.14) * k, (gyi + by + 0.14) * k], fill=mix(base, (0, 0, 0), 0.45))
    hm = Image.new('L', c.im.size, 0)
    ImageDraw.Draw(hm).polygon(c.p(hull), fill=255)
    c.glow(lambda l: l.poly(hull, fill=(20, 40, 70)), 1.2)
    c.im.paste(plate, (0, 0), hm)
    c.d = ImageDraw.Draw(c.im)
    c.line(hull + [hull[0]], rgb('#5a6c98'), 0.14)
    hazard(c, [(31.9, 24.3), (38.1, 32.6)], 1.0)
    # the docking ring
    for rr, w, col in ((4.6, 0.12, STEEL), (3.5, 0.3, AMBER), (2.5, 0.1, STEEL)):
        c.circle(dx, dy, rr, outline=col, width=w)
    for i in range(24):
        a = i * math.pi / 12
        c.line([(dx + math.cos(a) * 3.8, dy + math.sin(a) * 3.8), (dx + math.cos(a) * (4.4 if i % 2 else 4.2), dy + math.sin(a) * (4.4 if i % 2 else 4.2))], STEEL, 0.08)
    c.text(dx + 4.6, dy - 6.2, 'DOCK', 1.25, AMBER, spacing=0.25)
    c.text(41.6, 13.2, 'TL-7', 1.5, rgb('#51618c'), spacing=0.2)
    c.text(35.4, 16.3, 'LOCK', 0.8, rgb('#ff9a5a'), angle=52, spacing=0.12)

    # ---- the top lanes: a strip per lane and its letter
    lanes = [r_ for r_ in t['rollovers'] if r_.get('group') == 'lanes']
    for i, ln in enumerate(lanes):
        x0, x1, y = ln['a'][0], ln['b'][0], ln['a'][1]
        c.box(x0 + 0.1, y - 5.2, x1 - x0 - 0.2, 9.4, r=1.2, fill=rgb('#0c1d3c'), outline=mix(CYAN, SPACE_TOP, 0.45), width=0.1)
        c.text((x0 + x1) / 2, y - 3.2, 'TUG'[i % 3], 1.9, mix(CYAN, (255, 255, 255), 0.15))
    c.text(23.85, 7.6, 'OPEN THE LANES', 0.85, mix(CYAN, SPACE_TOP, 0.25), spacing=0.14)

    # ---- the bumpers: the rocks of the sweep, each on its ring
    for b in t['bumpers']:
        bx, by = b['at']
        c.circle(bx, by, 4.1, fill=rgb('#141c38'), outline=rgb('#3c5aa0'), width=0.12)
        for i in range(16):
            a = i * math.pi / 8
            c.line([(bx + math.cos(a) * 3.1, by + math.sin(a) * 3.1), (bx + math.cos(a) * 3.9, by + math.sin(a) * 3.9)], rgb('#6fd0ff'), 0.1)

    # ---- the legends of the shots
    c.text(31.4, 63.5, 'CARGO RAMP', 1.05, rgb('#7fb8ff'), angle=90, spacing=0.2)
    for i in range(2):
        y = 72.6 + i * 2.6
        c.poly([(36, y - 1.1), (37.5, y + 0.6), (36.6, y + 0.6), (36, y), (35.4, y + 0.6), (34.5, y + 0.6)], fill=mix(rgb('#5fa8ff'), SPACE_LOW, 0.25 + i * 0.2))
    c.text(10.4, 51.4, 'SHIELDS', 1.0, rgb('#ffd866'), angle=90, spacing=0.18)
    c.text(43.85, 47, 'TURBINE', 0.85, rgb('#c0ff7a'), angle=90, spacing=0.14)
    c.text(44.5, 60.4, 'RELAYS', 0.7, rgb('#66f0ff'), spacing=0.12)
    c.text(23.85, 46.6, 'ASTEROID SWEEP', 0.8, rgb('#ffe0b0'), spacing=0.14)

    # ---- the ranks: a ladder
    ranks = [l for l in t['lights'] if l.get('group') == 'ranks']
    if ranks:
        ys = [l['at'][1] for l in ranks]
        x = ranks[0]['at'][0]
        c.box(x - 3.2, min(ys) - 3.3, 6.4, max(ys) - min(ys) + 5.2, r=1.0, fill=rgb('#0e1230'), outline=mix(VIOLET, SPACE_MID, 0.35), width=0.12)
        c.text(x, min(ys) - 1.9, 'RANK', 0.9, VIOLET, spacing=0.2)

    # ---- the slingshots, the lanes beside them, the name of the table
    for sgn, wall in ((1, 'slingBodyLeft'), (-1, 'slingBodyRight')):
        w = [w_ for w_ in t['walls'] if w_['id'] == wall][0]
        c.poly([tuple(p[:2]) for p in w['points']], fill=rgb('#1a1030'), outline=mix(PINK, SPACE_LOW, 0.3), width=0.12)
    for x in (6.5, 41.2):
        for i in range(3):
            y = 73.5 + i * 2.4
            c.poly([(x, y + 1.0), (x + 0.9, y), (x + 0.35, y), (x + 0.35, y - 0.9), (x - 0.35, y - 0.9), (x - 0.35, y), (x - 0.9, y)], fill=mix(CYAN, SPACE_LOW, 0.45 + i * 0.12))
    for x in (2.8, 44.9):
        c.text(x, 84, 'VOID', 0.7, rgb('#ff6a6a'), angle=90, spacing=0.12)
    c.glow(lambda l: (l.text(23.85, 85.2, 'TIDAL', 2.7, rgb('#3aa0ff'), spacing=0.5), l.text(23.85, 89.0, 'LOCK', 2.7, rgb('#3aa0ff'), spacing=0.9)), 0.5, 1.5)
    c.text(23.85, 85.2, 'TIDAL', 2.7, rgb('#d8f0ff'), spacing=0.5)
    c.text(23.85, 89.0, 'LOCK', 2.7, rgb('#d8f0ff'), spacing=0.9)
    c.text(23.85, 96.4, 'SHOOT AGAIN', 0.62, rgb('#ff7a7a'), spacing=0.12)

    # ---- the shooter lane: chevrons up to the gate
    lane_x = (t['plunger']['at'][0] + 0.0)
    for i in range(22):
        y = 94 - i * 2.9
        c.poly([(lane_x, y - 0.9), (lane_x + 1.1, y + 0.5), (lane_x + 0.55, y + 0.5), (lane_x, y - 0.15), (lane_x - 0.55, y + 0.5), (lane_x - 1.1, y + 0.5)], fill=mix(AMBER, SPACE_LOW, 0.2 + 0.5 * i / 22))

    # ---- the lights: a dark pad and a rim under each, so that an insert sits in the board
    for l in t['lights']:
        if l.get('z', 0) != 0:
            continue
        for outline in light_outline(l, 0.42):
            c.poly(outline, fill=rgb('#070a16'))
        for outline in light_outline(l, 0.2):
            c.poly(outline, fill=mix(rgb(l.get('color', '#ffcc33')), (0, 0, 0), 0.72))
    # the holes of rollovers: a bright slot mark each side
    for r_ in t['rollovers']:
        (ax, ay), (bx, by) = r_['a'], r_['b']
        c.line([(ax, ay), (bx, by)], rgb('#05070f'), 0.9)

    # ---- the corners outside the arch: the dark of the cabinet
    out = Image.new('L', c.im.size, 255)
    od = ImageDraw.Draw(out)
    arch = [w_ for w_ in t['walls'] if w_['id'] == 'outer'][0]['points']
    cx, cy, rad = (arch[1][0] + arch[2][0]) / 2, arch[1][1], (arch[2][0] - arch[1][0]) / 2
    od.rectangle([arch[1][0] * k, cy * k, arch[2][0] * k, H * k], fill=0)
    od.ellipse([(cx - rad) * k, (cy - rad) * k, (cx + rad) * k, (cy + rad) * k], fill=0)
    c.im.paste(Image.new('RGB', c.im.size, rgb('#0a0d18')), (0, 0), out)
    c.d = ImageDraw.Draw(c.im)

    # ---- the edges fall into shadow
    edge = Image.radial_gradient('L').resize(c.im.size, Image.BILINEAR).point(lambda v: 255 - int(max(0, v - 150) * 0.9))
    c.im = ImageChops.multiply(c.im, Image.merge('RGB', (edge, edge, edge)))
    return c.im.resize((int(W * PX), int(H * PX)), Image.LANCZOS)


def lit_playfield(base, t):
    """The playfield with every light on: around each light, out to its `glow`, the light's colour is added and the
    painting brightens. At that distance nothing is left of either, so a pool of light joins the unlit board without an edge."""
    glow = Image.new('RGB', base.size, (0, 0, 0))
    lift = Image.new('L', base.size, 0)
    lights = [l for l in t['lights'] if l.get('glow', 0) > 0 and l.get('z', 0) == 0]
    for i, l in enumerate(lights):
        for m in lights[i + 1:]:
            if math.hypot(l['at'][0] - m['at'][0], l['at'][1] - m['at'][1]) < l['glow'] + m['glow'] - 0.01:
                print(f"  the pools of {l['id']} and {m['id']} overlap: each will show the other lit")
        n = int(l['glow'] * PX) * 2
        fall = Image.radial_gradient('L').resize((n, n), Image.BILINEAR).point(lambda v: int(255 * (1 - v / 255) ** 1.7))
        at = (int(l['at'][0] * PX) - n // 2, int(l['at'][1] * PX) - n // 2)
        color = rgb(l.get('color', '#ffcc33'))
        halo = Image.new('RGB', base.size, (0, 0, 0))
        halo.paste(Image.merge('RGB', [fall.point(lambda v, c=ch: int(v * c / 255 * 0.8)) for ch in color]), at)
        glow = ImageChops.add(glow, halo)
        one = Image.new('L', base.size, 0)
        one.paste(fall, at)
        lift = ImageChops.lighter(lift, one)
    brighter = ImageChops.multiply(base, Image.merge('RGB', (lift, lift, lift)))
    return ImageChops.add(ImageChops.add(base, brighter), glow)


def tessellate(points):
    """A path of the table as straight stretches: [x, y] rows, [x, y, bulge] when the stretch to the next point is an arc
    (the same rule as the game's geometry.ts)."""
    out = []
    for p, q in zip(points, points[1:]):
        out.append((p[0], p[1]))
        bulge = p[2] if len(p) > 2 else 0
        if not bulge:
            continue
        dx, dy = q[0] - p[0], q[1] - p[1]
        chord = math.hypot(dx, dy)
        nx, ny, half = dy / chord, -dx / chord, chord / 2
        sag = bulge * half
        r = (half * half + sag * sag) / (2 * abs(sag))
        kk = sag - (r if sag > 0 else -r)
        cx, cy = (p[0] + q[0]) / 2 + nx * kk, (p[1] + q[1]) / 2 + ny * kk
        ax, ay = (p[0] + q[0]) / 2 + nx * sag, (p[1] + q[1]) / 2 + ny * sag
        turn, vx, vy = 4 * math.atan(abs(bulge)), p[0] - cx, p[1] - cy

        def mid(sign):
            a = sign * turn / 2
            return (cx + vx * math.cos(a) - vy * math.sin(a) - ax) ** 2 + (cy + vx * math.sin(a) + vy * math.cos(a) - ay) ** 2
        way = 1 if mid(1) < mid(-1) else -1
        pieces = max(2, math.ceil(turn / math.radians(4)))
        for j in range(1, pieces):
            a = way * turn * j / pieces
            out.append((cx + vx * math.cos(a) - vy * math.sin(a), cy + vx * math.sin(a) + vy * math.cos(a)))
    out.append((points[-1][0], points[-1][1]))
    return out


def ramp(t):
    """The image of the solid ramp, laid over the box around it as the game lays it: a band of plastic along its path,
    lighter in the middle, with chevrons that point the way up."""
    r = [x for x in t['ramps'] if x.get('style', 'solid') == 'solid'][0]
    path, half = tessellate(r['points']), r.get('width', 3.6) / 2 + min(0.3, r.get('width', 3.6) * 0.1)
    x0, x1 = min(x for x, _ in path) - half, max(x for x, _ in path) + half
    y0, y1 = min(y for _, y in path) - half, max(y for _, y in path) + half
    k = PX * SS
    c = Canvas(x1 - x0, y1 - y0, k, rgb('#12336e'))
    local = [(x - x0, y - y0) for x, y in path]
    for width, color in ((half * 2 + 0.6, rgb('#12336e')), (half * 2 - 0.5, rgb('#1d56b0')), (half * 1.1, rgb('#2a70d8'))):
        c.line(local, color, width)
        for x, y in (local[0], local[-1]):
            c.circle(x, y, width / 2, fill=color)
    # chevrons every 4 cm, pointing along the path
    d, last = 0.0, 0.0
    for (ax, ay), (bx, by) in zip(local, local[1:]):
        seg = math.hypot(bx - ax, by - ay)
        while last + 4 <= d + seg:
            last += 4
            f = (last - d) / seg
            px, py, ux, uy = ax + (bx - ax) * f, ay + (by - ay) * f, (bx - ax) / seg, (by - ay) / seg
            vx, vy = -uy, ux
            w = half * 0.62
            c.poly([(px + ux * 0.8, py + uy * 0.8), (px - ux * 0.5 + vx * w, py - uy * 0.5 + vy * w), (px - ux * 0.05 + vx * w, py - uy * 0.05 + vy * w),
                    (px + ux * 1.25, py + uy * 1.25), (px - ux * 0.05 - vx * w, py - uy * 0.05 - vy * w), (px - ux * 0.5 - vx * w, py - uy * 0.5 - vy * w)], fill=rgb('#9fd0ff'))
        d += seg
    return c.im.resize((int((x1 - x0) * PX), int((y1 - y0) * PX)), Image.LANCZOS)


def cap():
    """The cap of a bumper, seen from above: a rock ringed with warning marks, a star in its middle."""
    n = 256 * SS
    c = Canvas(10, 10, n / 10, rgb('#d8601c'))
    c.circle(5, 5, 4.9, fill=rgb('#ff8a3a'))
    for i in range(12):
        if i % 2 == 0:
            c.d.pieslice([0.2 * n / 10, 0.2 * n / 10, 9.8 * n / 10, 9.8 * n / 10], i * 30, i * 30 + 30, fill=rgb('#2a1a10'))
    c.circle(5, 5, 3.7, fill=rgb('#ffb060'))
    c.circle(5, 5, 3.3, fill=rgb('#ff7a2a'))
    star = [(5 + math.cos(i * math.pi / 8 - math.pi / 2) * (2.9 if i % 2 == 0 else 1.2), 5 + math.sin(i * math.pi / 8 - math.pi / 2) * (2.9 if i % 2 == 0 else 1.2)) for i in range(16)]
    c.poly(star, fill=rgb('#fff2d0'))
    c.circle(5, 5, 0.8, fill=rgb('#ff5a1a'))
    return c.im.resize((256, 256), Image.LANCZOS)


def flipper():
    """A flipper from above, its pivot at the left: a white bat in its rubber ring."""
    c = Canvas(8.5, 1.8, 30 * SS, rgb('#d02a48'))
    c.poly([(0.35, 0.9 - 0.62), (8.1, 0.9 - 0.2), (8.1, 0.9 + 0.2), (0.35, 0.9 + 0.62)], fill=rgb('#f4f4fa'))
    c.circle(0.9, 0.9, 0.62, fill=rgb('#f4f4fa'))
    c.circle(0.9, 0.9, 0.3, fill=rgb('#3a4868'))
    c.line([(2.2, 0.9), (7.2, 0.9)], rgb('#66c8ff'), 0.12)
    return c.im.resize((255, 54), Image.LANCZOS)


def ball():
    """The skin of the ball: bright steel with a few faint marks, so that the eye sees it roll."""
    im = vertical((256, 128), [(0, rgb('#f4f6fa')), (0.5, rgb('#c8ccd6')), (1, rgb('#8a90a0'))])
    d = ImageDraw.Draw(im)
    r = random.Random(4)
    for _ in range(26):
        x, y, w = r.uniform(0, 256), r.uniform(8, 120), r.uniform(6, 30)
        d.ellipse([x, y, x + w, y + w * 0.35], fill=mix(rgb('#9aa0b0'), rgb('#e8ecf4'), r.random()))
    return im.filter(ImageFilter.GaussianBlur(1.6))


def giant():
    """The gas giant as a map of the whole globe, for the sphere that stands in the corner of the table."""
    return banded((512, 256), GIANT, 9, 0.01)


def backglass(w, h, wide):
    """The picture behind the score: the giant's limb and the station's arm over a field of stars, dark where the text goes."""
    k = SS
    c = Canvas(w, h, k, rgb('#070b1c'))
    c.im = vertical(c.im.size, [(0, rgb('#0a1030')), (0.6, rgb('#12103a')), (1, rgb('#060a18'))])
    c.d = ImageDraw.Draw(c.im)

    def nebula(l):
        r = random.Random(21)
        for color in (rgb('#4a2a7a'), rgb('#1a4a7a'), rgb('#7a2a4a'), rgb('#124a5a')):
            for _ in range(3):
                x, y, s = r.uniform(0, w), r.uniform(0, h), r.uniform(0.12, 0.3) * max(w, h)
                l.d.ellipse([(x - s) * k, (y - s * 0.5) * k, (x + s) * k, (y + s * 0.5) * k], fill=tuple(int(v * 0.35) for v in color))
    c.glow(nebula, max(w, h) * 0.07)
    r = random.Random(22)
    for _ in range(int(w * h / 900)):
        x, y, m = r.uniform(0, w), r.uniform(0, h), r.random() ** 3
        v = 0.2 + 0.6 * m
        c.circle(x, y, 0.5 + 1.1 * m, fill=(int(255 * v), int(255 * v), int(255 * v)))
    # the giant rises in a corner
    gr = int((0.62 if not wide else 1.5) * h)
    disc, mask = planet(gr * k, GIANT, 6, light=(-0.5, -0.5), tilt=12)
    gx, gy = (w * 0.86, h * 1.18) if not wide else (w * 0.84, h * 2.0)
    c.glow(lambda l: l.circle(gx, gy, gr * 1.01, fill=(110, 55, 28)), gr * 0.05)
    c.im.paste(disc.point(lambda v: int(v * 0.8)), (int((gx - gr) * k), int((gy - gr) * k)), mask)
    c.d = ImageDraw.Draw(c.im)
    if not wide:
        # the station: an arm and a mast, as a shape against the stars
        hull, edge = rgb('#141c30'), rgb('#3a4a70')
        c.poly([(w * 0.55, -5), (w + 5, -5), (w + 5, h * 0.13), (w * 0.8, h * 0.1), (w * 0.6, h * 0.02)], fill=hull, outline=edge, width=1.5)
        for i in range(9):
            c.box(w * (0.62 + i * 0.045), h * 0.03 + i * 2.2, w * 0.022, h * 0.012, fill=mix(rgb('#ffcf7a'), hull, 0.25 if i % 3 else 0.6))
        c.line([(w * 0.92, h * 0.12), (w * 0.92, h * 0.26)], edge, 3)
        c.circle(w * 0.92, h * 0.27, 5, fill=rgb('#ff5a4a'))
        c.glow(lambda l: l.circle(w * 0.92, h * 0.27, 9, fill=rgb('#ff5a4a')), 10)
        # a frame where the game writes
        c.box(18, 18, w - 36, h - 36, r=18, outline=rgb('#2a3a66'), width=2)
        for y in (0.335, 0.465, 0.665, 0.78):
            c.line([(40, h * y), (w - 40, h * y)], rgb('#1c2a50'), 2)
    # darker where the text is read
    shade = vertical(c.im.size, [(0, (150, 150, 150)), (0.15, (175, 175, 175)), (0.7, (165, 165, 165)), (1, (235, 235, 235))]) if not wide else Image.new('RGB', c.im.size, (150, 150, 150))
    c.im = ImageChops.multiply(c.im, shade)
    return c.im.resize((w, h), Image.LANCZOS)


def deck(t):
    """The painting of the upper playfield, laid over the box around its floor: the plates of the control deck, the lift
    the ball arrives by, the pads of its lights, the way out."""
    f = t['floors'][0]
    xs, ys = [p[0] for p in f['points']], [p[1] for p in f['points']]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    c = Canvas(w, h, PX * SS, rgb('#1c2740'))
    r = random.Random(41)
    for gx in range(0, int(w) + 2, 2):
        for gy in range(0, int(h) + 2, 2):
            base = mix(rgb('#22304e'), rgb('#34446a'), r.random())
            c.box(gx + (1 if (gy // 2) % 2 else 0) - 1, gy, 1.9, 1.9, fill=base)
    k = t['kickers'][0]
    lx, ly = k['at'][0] + k.get('exit', [0, 0, 0])[0] - x0, k['at'][1] + k.get('exit', [0, 0, 0])[1] - y0
    c.circle(lx, ly, 1.9, fill=rgb('#101626'), outline=AMBER, width=0.16)
    c.text(lx + 3.4, ly - 0.2, 'LIFT', 0.75, AMBER, spacing=0.12)
    for l in t['lights']:
        if l.get('z', 0) != f.get('z', 5):
            continue
        for outline in light_outline(l, 0.35):
            c.poly([(x - x0, y - y0) for x, y in outline], fill=rgb('#070a16'))
    c.text(w * 0.56, h * 0.47, 'CONTROL', 1.1, rgb('#8fa8d8'), spacing=0.2)
    c.text(w * 0.56, h * 0.47 + 1.6, 'DECK', 1.1, rgb('#8fa8d8'), spacing=0.5)
    c.text(w * 0.46, 2.6, 'BEACONS', 0.6, CYAN, spacing=0.12)
    for wall in t['walls']:
        if wall['id'] == 'deckDrain':   # the way out: where the drain's guide ends
            cx = wall['points'][-1][0] - x0
            hazard(c, [(cx + 0.2, h - 0.45), (cx + 3.4, h - 0.45)], 0.6)
            c.poly([(cx + 1.8, h - 1.0), (cx + 2.6, h - 2.0), (cx + 2.1, h - 2.0), (cx + 2.1, h - 3.0), (cx + 1.5, h - 3.0), (cx + 1.5, h - 2.0), (cx + 1.0, h - 2.0)], fill=mix(AMBER, (0, 0, 0), 0.2))
    c.line([(0, 0), (w, 0), (w, h), (0, h), (0, 0)], rgb('#5a6c98'), 0.3)
    return c.im.resize((int(w * PX), int(h * PX)), Image.LANCZOS)


def apron():
    """The plate below the flippers, seen from above: the yard's name, warning stripes along the edge the ball leaves by."""
    c = Canvas(46.6, 4, PX * SS, rgb('#151b2e'))
    hazard(c, [(0, 0.3), (46.6, 0.3)], 0.6)
    c.line([(0, 3.85), (46.6, 3.85)], rgb('#3a4868'), 0.1)
    for x in (1.2, 45.4):
        for y in (1.3, 3.3):
            c.circle(x, y, 0.16, fill=rgb('#56658c'))
    c.text(23.3, 2.25, 'TIDAL LOCK  MINING YARD  TL-7', 1.15, rgb('#8fa8d8'), spacing=0.3)
    for x, label in ((6.5, 'KEEP CLEAR'), (40.1, 'KEEP CLEAR')):
        c.box(x - 4, 1.2, 8, 2.1, r=0.3, outline=rgb('#b8862a'), width=0.1)
        c.text(x, 2.25, label, 0.75, rgb('#e8b040'), spacing=0.12)
    return c.im.resize((932, 80), Image.LANCZOS)


def backboard():
    """The board at the back of the cabinet, facing the player: the station's lights over the name of the table."""
    w, h = 55.4, 14
    c = Canvas(w, h, PX * SS, rgb('#080c1c'))
    c.im = vertical(c.im.size, [(0, rgb('#0a1030')), (1, rgb('#181244'))])
    c.d = ImageDraw.Draw(c.im)
    stars(c, w, h, 260, 31)
    disc, mask = planet(int(16 * PX * SS), GIANT, 8, light=(0.5, -0.5), tilt=-8)
    c.im.paste(disc.point(lambda v: int(v * 0.75)), (int(-9 * PX * SS), int(2.5 * PX * SS)), mask)
    c.d = ImageDraw.Draw(c.im)
    # the station across the top: a spine with lit windows
    c.box(20, 1.2, 34, 1.5, r=0.3, fill=rgb('#1c2740'), outline=rgb('#5a6c98'), width=0.08)
    r = random.Random(32)
    for i in range(40):
        c.box(21 + i * 0.8, 1.7, 0.45, 0.5, fill=rgb('#ffcf7a') if r.random() < 0.6 else rgb('#2a3350'))
    c.glow(lambda l: l.text(w / 2 + 6, 8.2, 'TIDAL LOCK', 5.2, rgb('#3aa0ff'), spacing=1.0), 0.7, 1.6)
    c.text(w / 2 + 6, 8.2, 'TIDAL LOCK', 5.2, rgb('#e0f2ff'), spacing=1.0)
    hazard(c, [(0, 13.5), (w, 13.5)], 0.9)
    return c.im.resize((1108, 280), Image.LANCZOS)


def plastic():
    """The plate over the left slingshot, seen from above (the right one is its mirror): a red plate edged in white,
    an arrow of thrust across it."""
    c = Canvas(6, 14, 30 * SS, rgb('#7a1230'))
    c.im = vertical(c.im.size, [(0, rgb('#b01840')), (1, rgb('#5a0c24'))])
    c.d = ImageDraw.Draw(c.im)
    for i in range(5):
        y = 2.2 + i * 2.3
        c.poly([(1.0, y), (2.6, y + 1.5), (1.0, y + 1.1)], fill=rgb('#ffd0a0') if i % 2 == 0 else rgb('#ff8a5a'))
    c.text(4.1, 9.8, 'BURN', 1.0, rgb('#ffe8d0'), angle=-70, spacing=0.15)
    return c.im.resize((180, 420), Image.LANCZOS)


# the colours of the modelled pieces: one small image, one square per colour; a face names its colour by where it looks in it
PALETTE = ['#8a96b4', '#5a6688', '#2a3350', '#141a2c', '#ffcf7a', '#ff5a4a', '#66f0ff', '#e8ecf4', '#c98848', '#3a70d8', '#b8862a', '#1c2740', '#f4a020', '#6a4a2a', '#9fd0ff', '#304060']


def palette():
    im = Image.new('RGB', (64, 64))
    d = ImageDraw.Draw(im)
    for i, color in enumerate(PALETTE):
        d.rectangle([i % 4 * 16, i // 4 * 16, i % 4 * 16 + 15, i // 4 * 16 + 15], fill=rgb(color))
    return im


class Model:
    """A modelled piece, built in table axes (x right, y down the table, z up) around its own origin, written as an OBJ
    file in the axes of a model file (x right, y up, z towards the player). Faces are flat; a face takes its colour
    from the palette, or its place in an image by a rule given with it."""

    def __init__(self):
        self.v, self.vt, self.vn, self.f = [], [], [], []

    def face(self, pts, color=None, uv=None, out=None):
        """A flat face through `pts` (table points, in order round it). `out`: a point the face looks away from
        (the middle of the solid it belongs to); without it, the order of the points decides."""
        a, b, c = pts[0], pts[1], pts[2]
        n = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        if out is not None and sum(n[i] * (a[i] - out[i]) for i in range(3)) < 0:
            pts, n = pts[::-1], (-n[0], -n[1], -n[2])
        ln = math.sqrt(sum(x * x for x in n)) or 1
        # table (x, y, z) is the file's (x, z, y); that swap mirrors, so the order round the face is turned back
        self.vn.append((n[0] / ln, n[2] / ln, n[1] / ln))
        refs = []
        for p in pts[::-1]:
            self.v.append((p[0], p[2], p[1]))
            if uv is not None:
                self.vt.append(uv(p))
            else:
                i = PALETTE.index(color)
                self.vt.append(((i % 4 + 0.5) / 4, 1 - (i // 4 + 0.5) / 4))
            refs.append(f'{len(self.v)}/{len(self.vt)}/{len(self.vn)}')
        self.f.append(' '.join(refs))

    def box(self, x0, y0, z0, x1, y1, z1, color, top=None):
        m = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((0, 1, 2, 3), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([c[i] for i in q], color, out=m)
        self.face([c[4], c[5], c[6], c[7]], top or color, out=m)

    def prism(self, outline, z0, z1, side, top=None, uv=None):
        """An outline of the top view (x, y rows) raised from z0 to z1."""
        cx, cy = sum(p[0] for p in outline) / len(outline), sum(p[1] for p in outline) / len(outline)
        m = (cx, cy, (z0 + z1) / 2)
        for (ax, ay), (bx, by) in zip(outline, outline[1:] + outline[:1]):
            self.face([(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], side, uv=uv, out=m)
        self.face([(x, y, z1) for x, y in outline], top or side, uv=uv, out=m)
        self.face([(x, y, z0) for x, y in outline], side, uv=uv, out=m)

    def lathe(self, cx, cy, profile, color, segments=16, z0=0.0, inside=()):
        """A solid of revolution around the vertical through (cx, cy): [radius, height] rows from the bottom up; a
        colour per band when `color` is a list. `inside`: the bands that face the axis (the inner wall of a ring)."""
        for k, ((r0, h0), (r1, h1)) in enumerate(zip(profile, profile[1:])):
            col = color[k % len(color)] if isinstance(color, list) else color
            if k in inside:   # seen from the axis: built as a face that looks away from a point far outside it
                for s in range(segments):
                    a0, a1, am = 2 * math.pi * s / segments, 2 * math.pi * (s + 1) / segments, 2 * math.pi * (s + 0.5) / segments
                    self.face([(cx + math.cos(a0) * r0, cy + math.sin(a0) * r0, z0 + h0), (cx + math.cos(a1) * r0, cy + math.sin(a1) * r0, z0 + h0),
                               (cx + math.cos(a1) * r1, cy + math.sin(a1) * r1, z0 + h1), (cx + math.cos(a0) * r1, cy + math.sin(a0) * r1, z0 + h1)],
                              col, out=(cx + math.cos(am) * r0 * 3, cy + math.sin(am) * r0 * 3, z0 + (h0 + h1) / 2))
                continue
            for s in range(segments):
                a0, a1 = 2 * math.pi * s / segments, 2 * math.pi * (s + 1) / segments
                ring = [(cx + math.cos(a0) * r0, cy + math.sin(a0) * r0, z0 + h0), (cx + math.cos(a1) * r0, cy + math.sin(a1) * r0, z0 + h0),
                        (cx + math.cos(a1) * r1, cy + math.sin(a1) * r1, z0 + h1), (cx + math.cos(a0) * r1, cy + math.sin(a0) * r1, z0 + h1)]
                pts = [p for i, p in enumerate(ring) if not (i > 0 and math.dist(p, ring[i - 1]) < 1e-9) and not (i == 3 and math.dist(p, ring[0]) < 1e-9)]
                if len(pts) >= 3:
                    mid = (cx, cy, z0 + (h0 + h1) / 2 - (0.5 if r1 < r0 and h1 == h0 else 0) + (0.5 if r1 > r0 and h1 == h0 else 0))
                    self.face(pts, col, out=mid)

    def text(self):
        lines = ['# made by tools/tidal_lock_art.py']
        lines += [f'v {x:.4f} {y:.4f} {z:.4f}' for x, y, z in self.v]
        lines += [f'vt {u:.4f} {v:.4f}' for u, v in self.vt]
        lines += [f'vn {x:.4f} {y:.4f} {z:.4f}' for x, y, z in self.vn]
        lines += [f'f {f}' for f in self.f]
        return '\n'.join(lines) + '\n'


def plastic_model(t, wall, mirror):
    """The plate over a slingshot: the triangle of its body, a little wider, on three posts; its image from above."""
    pts = [tuple(p[:2]) for p in [w for w in t['walls'] if w['id'] == wall][0]['points']]
    cx, cy = sum(p[0] for p in pts) / 3, sum(p[1] for p in pts) / 3
    grown = [((x - cx) * 1.18, (y - cy) * 1.18) for x, y in pts]
    x0, x1 = min(p[0] for p in grown), max(p[0] for p in grown)
    y0, y1 = min(p[1] for p in grown), max(p[1] for p in grown)
    u = (lambda p: ((x1 - p[0]) / (x1 - x0), 1 - (p[1] - y0) / (y1 - y0))) if mirror else (lambda p: ((p[0] - x0) / (x1 - x0), 1 - (p[1] - y0) / (y1 - y0)))
    m = Model()
    m.prism(grown, 2.45, 2.7, None, uv=u)
    return m, (round(cx, 2), round(cy, 2))


def station_model():
    """The mining station: a hub with a lit band, a ring on four spokes, a mast with a beacon and a dish."""
    m = Model()
    m.lathe(0, 0, [(0, 0), (1.5, 0), (1.9, 0.6), (1.9, 1.5), (1.5, 2.0), (1.5, 2.9), (1.1, 3.4), (0, 3.4)], ['#2a3350', '#8a96b4', '#ffcf7a', '#8a96b4', '#5a6688', '#8a96b4', '#5a6688'], 14)
    m.lathe(0, 0, [(2.9, 0.9), (3.5, 0.9), (3.5, 1.5), (2.9, 1.5), (2.9, 0.9)], ['#1c2740', '#9fd0ff', '#5a6688', '#304060'], 18, inside=(3,))
    for a in range(4):
        c, s = math.cos(a * math.pi / 2 + 0.4), math.sin(a * math.pi / 2 + 0.4)
        x0, y0, x1, y1 = c * 1.7, s * 1.7, c * 3.0, s * 3.0
        nx, ny = -s * 0.18, c * 0.18
        m.prism([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], 1.05, 1.35, '#5a6688')
    m.box(-0.09, -0.09, 3.4, 0.09, 0.09, 5.6, '#e8ecf4')
    m.lathe(0, 0, [(0, 5.6), (0.22, 5.75), (0, 5.95)], '#ff5a4a', 8)
    m.lathe(0.75, 0.3, [(0, 3.4), (0.1, 3.9), (0.55, 4.25), (0.5, 4.3), (0, 3.95)], ['#e8ecf4', '#e8ecf4', '#8a96b4', '#5a6688'], 10)
    return m


def tug_model():
    """A tug: a blunt hull, a bridge with a window, two engines and their glow, a grapple arm ahead."""
    m = Model()
    hull = [(-1.6, -0.9), (0.9, -0.9), (1.7, -0.35), (1.7, 0.35), (0.9, 0.9), (-1.6, 0.9)]
    m.prism(hull, 0.35, 1.15, '#f4a020', top='#c98848')
    m.box(-0.5, -0.55, 1.15, 0.7, 0.55, 1.65, '#e8ecf4', top='#8a96b4')
    m.box(0.7, -0.4, 1.25, 0.76, 0.4, 1.55, '#66f0ff')
    for side in (-1, 1):
        m.box(-2.2, side * 0.55 - 0.3, 0.45, -1.4, side * 0.55 + 0.3, 1.05, '#5a6688')
        m.box(-2.3, side * 0.55 - 0.2, 0.55, -2.2, side * 0.55 + 0.2, 0.95, '#66f0ff')
        m.box(-1.2, side * 1.05 - 0.12, 0.0, 1.0, side * 1.05 + 0.12, 0.35, '#2a3350')
    m.box(1.7, -0.08, 0.65, 2.6, 0.08, 0.81, '#8a96b4')
    m.box(2.5, -0.35, 0.6, 2.66, 0.35, 0.86, '#ffcf7a')
    return m


def main():
    args = sys.argv[1:]
    only = args[1].split(',') if len(args) == 2 and args[0] == '--only' else None
    if args and only is None:
        sys.exit(__doc__)
    t = json.load(open(os.path.join(TABLE, 'table.json')))
    os.makedirs(OUT, exist_ok=True)
    base = [None]

    def board():
        base[0] = playfield(t)
        return base[0]
    images = {
        'playfield.jpg': board, 'playfield-lit.jpg': lambda: lit_playfield(base[0] or board(), t), 'ramp.jpg': lambda: ramp(t), 'cap.png': cap,
        'flipper.png': flipper, 'ball.jpg': ball, 'giant.jpg': giant, 'backglass.jpg': lambda: backglass(680, 800, False),
        'backglass-wide.jpg': lambda: backglass(800, 200, True), 'deck.jpg': lambda: deck(t), 'apron.jpg': apron, 'backboard.jpg': backboard, 'plastic.png': plastic, 'palette.png': palette,
    }
    left, left_at = plastic_model(t, 'slingBodyLeft', False)
    right, right_at = plastic_model(t, 'slingBodyRight', True)
    models = {'plastic-left.obj': left, 'plastic-right.obj': right, 'station.obj': station_model(), 'tug.obj': tug_model()}
    for name, m in models.items():
        if only and name.split('.')[0] not in only:
            continue
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(m.text())
        print(f'{name}  {len(m.f)} faces  {os.path.getsize(os.path.join(OUT, name))} bytes')
    if not only:
        print(f'the plates of the slingshots stand at {left_at} and {right_at}')
    for name, make in images.items():
        if only and name.split('.')[0] not in only:
            continue
        path = os.path.join(OUT, name)
        im = make()
        if name.endswith('.jpg'):
            im.save(path, quality=86, optimize=True)
        else:
            im.save(path, optimize=True)
        print(f'{name}  {im.size[0]} x {im.size[1]}  {os.path.getsize(path)} bytes')


if __name__ == '__main__':
    main()
