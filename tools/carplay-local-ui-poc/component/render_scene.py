"""Offline CP layer snapshot renderer; no Apple source or artwork is included."""
import base64
import io
import math
from xml.sax.saxutils import escape

import numpy as np
from PIL import Image


def png_uri(data):
    return 'data:image/png;base64,' + base64.b64encode(data).decode()


def rgba(c):
    return tuple(c[k] for k in ('r', 'g', 'b', 'a'))


def color(c):
    r, g, b, a = rgba(c)
    return f'rgb({r*255:.5f},{g*255:.5f},{b*255:.5f})', a


class Renderer:
    def __init__(self, archive):
        self.archive = archive
        self.defs = []
        self.assets = set()
        self.approximations = set()

    def definition(self, tag, body, attrs=''):
        name = f'd{len(self.defs)}'
        self.defs.append('')
        self.defs[int(name[1:])] = f'<{tag} id="{name}" {attrs}>{body}</{tag}>'
        return name

    def paint(self, layer):
        fill, fa = color(layer['fillColor'])
        stroke, sa = color(layer['strokeColor'])
        cap = ['butt', 'round', 'square'][layer.get('lineCap', 0)]
        return f'fill="{fill}" fill-opacity="{fa}" stroke="{stroke}" stroke-opacity="{sa}" stroke-width="{layer["lineWidth"]}" stroke-linecap="{cap}"'

    def path(self, layer):
        parts = []
        commands = layer.get('path', {}).get('commands', [])
        for command in commands:
            op, a = command['op'], command['args']
            if op in ('moveTo', 'lineTo'):
                parts.append(('M' if op == 'moveTo' else 'L') + f'{a[0]["x"]},{a[0]["y"]}')
            elif op == 'closeSubpath':
                parts.append('Z')
            elif op == 'ellipseInRect':
                r = a[0]; x, y = r['origin']['x'], r['origin']['y']; w, h = r['size']['width'], r['size']['height']
                parts.append(f'M{x},{y+h/2} a{w/2},{h/2} 0 1 0 {w},0 a{w/2},{h/2} 0 1 0 {-w},0 Z')
            elif op == 'arcTo':
                center, radius, start, end, clockwise = a
                delta = (end-start) % (2*math.pi)
                if clockwise:
                    delta -= 2*math.pi
                lo, hi = layer['strokeStart'], layer['strokeEnd']
                count = max(1, math.ceil(abs(delta*(hi-lo))*radius/2))
                for i in range(count+1):
                    angle = start+delta*(lo+(hi-lo)*i/count)
                    x, y = center['x']+radius*math.cos(angle), center['y']-radius*math.sin(angle)
                    parts.append(('M' if i == 0 else 'L')+f'{x:.5f},{y:.5f}')
                self.approximations.add('Arcs sampled at at most two pixels per segment')
            elif op in ('quadTo', 'cubeTo'):
                parts.append(('Q' if op == 'quadTo' else 'C') + ' '.join(f'{p["x"]},{p["y"]}' for p in a))
            else:
                raise ValueError(f'Unsupported path command: {op}')
        return f'<path d="{" ".join(parts)}" {self.paint(layer)}/>'

    def gradient(self, layer, w, h):
        if layer.get('type') != 2:
            raise ValueError('Only conical gradients are exercised by this component')
        start, end = layer['startPoint'], layer['endPoint']
        yy, xx = np.mgrid[0:math.ceil(h), 0:math.ceil(w)]
        base = math.atan2(end['y']-start['y'], end['x']-start['x'])
        values = ((np.arctan2(yy+.5-start['y']*h, xx+.5-start['x']*w)-base)/(2*math.pi)) % 1
        stops = sorted(layer['stops'], key=lambda s: s['position'])
        pixels = np.stack([np.interp(values, [s['position'] for s in stops], [rgba(s['color'])[i] for s in stops]) for i in range(4)], axis=-1)
        out = io.BytesIO(); Image.fromarray(np.uint8(np.clip(pixels*255, 0, 255))).save(out, format='PNG')
        self.approximations.add('Conical gradient direction is inferred, not compared with Apple renderer')
        return f'<image width="{w}" height="{h}" href="{png_uri(out.getvalue())}"/>'

    def layer(self, l):
        if l['hidden'] or l['opacity'] == 0:
            return ''
        bounds = l['bounds']; w, h = bounds['size']['width'], bounds['size']['height']
        bx, by = bounds['origin']['x'], bounds['origin']['y']
        anchor, position, t = l['anchorPoint'], l['position'], l['transform']
        # CP uses anchor-relative transforms and bounds origins for glyph portals.
        transform = f'translate({position["x"]},{position["y"]}) matrix({t["a"]} {t["b"]} {t["c"]} {t["d"]} {t["tx"]} {t["ty"]}) translate({-anchor["x"]*w-bx},{-anchor["y"]*h-by})'
        content = []
        bg, alpha = color(l['backgroundColor'])
        if alpha:
            content.append(f'<rect x="{bx}" y="{by}" width="{w}" height="{h}" fill="{bg}" fill-opacity="{alpha}"/>')
        if l['kind'] == 'shape':
            content.append(self.path(l))
        elif l['kind'] == 'gradient':
            content.append(self.gradient(l, w, h))
        elif l['kind'] == 'image' and 'texture' in l:
            path = l['texture']['path']; self.assets.add(path)
            image = Image.open(io.BytesIO(self.archive.read(path))).convert('RGBA')
            tint = rgba(l['tint'])
            if tint != (1, 1, 1, 1):
                image = Image.fromarray(np.uint8(np.asarray(image)*np.array(tint)))
            out = io.BytesIO(); image.save(out, format='PNG')
            content.append(f'<image x="{bx}" y="{by}" width="{w}" height="{h}" href="{png_uri(out.getvalue())}"/>')
        content.extend(self.layer(c) for c in l.get('children', []))
        body = ''.join(content)
        if l.get('maskToBounds'):
            clip = self.definition('clipPath', f'<rect x="{bx}" y="{by}" width="{w}" height="{h}"/>')
            body = f'<g clip-path="url(#{clip})">{body}</g>'
        if 'mask' in l:
            mask_body = self.layer(l['mask'])
            mask = self.definition('mask', mask_body, 'maskUnits="userSpaceOnUse" x="-4096" y="-4096" width="8192" height="8192" style="mask-type:alpha"')
            body = f'<g mask="url(#{mask})">{body}</g>'
        blend = l.get('blendMode', 2)
        style = ''
        if blend == 11:
            self.approximations.add('PLUSLIGHTER exported as screen blend')
            style = 'style="mix-blend-mode:screen"'
        elif blend not in (2, 21):
            raise ValueError(f'Unsupported blend mode {blend}')
        return f'<g transform="{transform}" opacity="{l["opacity"]}" {style} data-name="{escape(l["name"])}">{body}</g>'

    def render(self, scene):
        body = self.layer(scene)
        return '<svg xmlns="http://www.w3.org/2000/svg" width="660" height="660" viewBox="0 0 660 660"><rect width="660" height="660" fill="#080a0c"/><defs>'+''.join(self.defs)+'</defs>'+body+'</svg>'
