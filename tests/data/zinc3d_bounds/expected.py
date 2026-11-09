#!/usr/bin/env python3
"""The bounds tests/t0/zinc3d_bounds.sh expects, computed here from the files and not by zinc:3d: the OBJ export of tests/data/zinc3d_gltf (its
vertices, world space) and model.glb (each mesh's vertices read from the binary chunk; the box of their box's 8 corners through the node
matrices, as three.js's Box3.setFromObject; the sphere about the box's centre through the farthest vertex, moved by the matrix, its radius
times the largest scale, merged as three.js's Sphere.union). The .zmesh the asset build makes from the GLB is flattened: its bounds are the
OBJ's. Prints one line per case: name, min xyz, max xyz, centre xyz, radius."""
import json, math, os, struct, sys

data = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'zinc3d_gltf', 'assets')

def fit(pts):
    lo = [min(p[i] for p in pts) for i in range(3)]; hi = [max(p[i] for p in pts) for i in range(3)]
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]
    return lo, hi, c, max(math.dist(p, c) for p in pts)

class Acc:
    def __init__(s): s.lo = [math.inf] * 3; s.hi = [-math.inf] * 3; s.c = None; s.r = -1
    def box(s, lo, hi):
        for i in range(3): s.lo[i] = min(s.lo[i], lo[i]); s.hi[i] = max(s.hi[i], hi[i])
    def sphere(s, c, r):
        if s.r < 0: s.c, s.r = list(c), r; return
        d = math.dist(c, s.c)
        if d + r <= s.r: return
        if d + s.r <= r: s.c, s.r = list(c), r; return
        R = (d + s.r + r) / 2
        s.c = [s.c[i] + (c[i] - s.c[i]) * (R - s.r) / d for i in range(3)]; s.r = R
    def line(s, name): return name + ' ' + ' '.join(f'{v:.5f}' for v in s.lo + s.hi + s.c + [s.r])

def mul(a, b): return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]
def point(m, p): return [m[12 + r] + sum(m[k * 4 + r] * p[k] for k in range(3)) for r in range(3)]
def trs(t, q, s):
    x, y, z, w = q
    return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
            2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
            2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]

# the OBJ export (and the .zmesh): two meshes at the identity
obj = Acc()
for name in ('base.obj', 'top.obj'):
    pts = [[float(v) for v in l.split()[1:4]] for l in open(os.path.join(data, name)) if l.startswith('v ')]
    lo, hi, c, r = fit(pts); obj.box(lo, hi); obj.sphere(c, r)
print(obj.line('obj'))

# the GLB
raw = open(os.path.join(data, 'model.glb'), 'rb').read()
jlen = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + jlen]); binary = raw[20 + jlen + 8:]
def positions(mesh):
    a = doc['accessors'][doc['meshes'][mesh]['primitives'][0]['attributes']['POSITION']]; v = doc['bufferViews'][a['bufferView']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [list(struct.unpack_from('<3f', binary, o + 12 * i)) for i in range(a['count'])]
def glb(root, name):
    acc = Acc()
    def walk(n, parent):
        node = doc['nodes'][n]
        local = node['matrix'] if 'matrix' in node else trs(node.get('translation', [0, 0, 0]), node.get('rotation', [0, 0, 0, 1]), node.get('scale', [1, 1, 1]))
        m = mul(parent, local)
        if 'mesh' in node:
            lo, hi, c, r = fit(positions(node['mesh']))
            corners = [point(m, [(lo, hi)[(k >> i) & 1][i] for i in range(3)]) for k in range(8)]
            acc.box([min(p[i] for p in corners) for i in range(3)], [max(p[i] for p in corners) for i in range(3)])
            acc.sphere(point(m, c), r * max(math.sqrt(sum(m[col * 4 + i] ** 2 for i in range(3))) for col in range(3)))
        for k in node.get('children', []): walk(k, m)
    for n in doc['scenes'][doc.get('scene', 0)]['nodes']: walk(n, root)
    print(acc.line(name))
glb(trs([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]), 'glb')
print(obj.line('zmesh'))
# the GLB's root node turned a quarter about y, moved by (1, 2, 3) and scaled by 2 along x: its own transform applies
s = math.sin(math.pi / 4)
glb(trs([1, 2, 3], [0, s, 0, math.cos(math.pi / 4)], [2, 1, 1]), 'moved')
