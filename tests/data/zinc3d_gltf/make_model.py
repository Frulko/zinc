#!/usr/bin/env python3
"""Writes the model of tests/t1/zinc3d_gltf.sh (ZN-658) into assets/: model.glb (two meshes, an embedded PNG texture, a hierarchy of three nodes
in TRS and matrix form) and its OBJ export (base.obj, top.obj: the same triangles with the world transforms applied) plus checker.png.
Run it again only to change the model; the test reads the files it wrote."""
import json, math, os, struct, zlib

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(out, exist_ok=True)

# ---- the texture: an 8 x 8 checkerboard of 2 x 2 cells
A, B = (224, 112, 32), (240, 232, 208)
rows = b''.join(b'\0' + bytes(c for x in range(8) for c in (A if (x // 2 + y // 2) % 2 else B)) for y in range(8))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
open(os.path.join(out, 'checker.png'), 'wb').write(png)

# ---- the meshes: a textured cube (24 vertices) and a pyramid with one colour per face (16 vertices)
def cube():
    pos, nrm, uv, idx = [], [], [], []
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)),
             ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    for n, u, v in faces:
        b = len(pos)
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            pos.append(tuple(0.5 * (n[i] + su * u[i] + sv * v[i]) for i in range(3)))
            nrm.append(n); uv.append(((su + 1) / 2, (1 - sv) / 2))
        idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    return pos, nrm, uv, [], idx
def pyramid():
    apex, base = (0, 0.6, 0), [(-0.5, -0.3, 0.5), (0.5, -0.3, 0.5), (0.5, -0.3, -0.5), (-0.5, -0.3, -0.5)]
    colors = [(0.9, 0.2, 0.2), (0.2, 0.8, 0.3), (0.2, 0.4, 0.9), (0.9, 0.8, 0.2), (0.6, 0.6, 0.6)]
    pos, nrm, col, idx = [], [], [], []
    def tri_normal(a, b, c):
        u = [b[i] - a[i] for i in range(3)]; v = [c[i] - a[i] for i in range(3)]
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); l = math.sqrt(sum(x * x for x in n))
        return tuple(x / l for x in n)
    for f in range(4):
        a, b = base[f], base[(f + 1) % 4]; n = tri_normal(a, b, apex); k = len(pos)
        pos += [a, b, apex]; nrm += [n] * 3; col += [colors[f]] * 3; idx += [k, k + 1, k + 2]
    k = len(pos); pos += base[::-1]; nrm += [(0, -1, 0)] * 4; col += [colors[4]] * 4; idx += [k, k + 1, k + 2, k, k + 2, k + 3]
    return pos, nrm, [], col, idx

# ---- the nodes: group (rotation about x) > base (translation, rotation about y; the cube) > top (a matrix; the pyramid)
def quat(axis, deg):
    s = math.sin(math.radians(deg) / 2)
    return tuple(a * s for a in axis) + (math.cos(math.radians(deg) / 2),)
def trs(t, q, s):   # column-major 4 x 4
    x, y, z, w = q
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [r[0][0] * s, r[1][0] * s, r[2][0] * s, 0, r[0][1] * s, r[1][1] * s, r[2][1] * s, 0, r[0][2] * s, r[1][2] * s, r[2][2] * s, 0, t[0], t[1], t[2], 1]
def mul(a, b): return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]
group = trs((0, 0, 0), quat((1, 0, 0), 15), 1)
base = trs((0, -0.4, 0), quat((0, 1, 0), 30), 1)
top = trs((0, 1.05, 0), quat((1, 0, 0), 20), 0.6)

# ---- the GLB: one buffer (the cube's attributes and indices, the pyramid's, the PNG)
bin_, views, accs = bytearray(), [], []
def add(data, target=None):
    while len(bin_) % 4: bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)} | ({'target': target} if target else {}))
    bin_.extend(data); return len(views) - 1
def acc(values, kind, comps):
    flat = [c for v in values for c in (v if comps > 1 else (v,))]
    if kind == 'idx': view = add(struct.pack(f'<{len(flat)}H', *flat), 34963); ct = 5123
    else: view = add(struct.pack(f'<{len(flat)}f', *flat), 34962); ct = 5126
    a = {'bufferView': view, 'componentType': ct, 'count': len(values), 'type': {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[comps]}
    if kind == 'pos': a |= {'min': [min(v[i] for v in values) for i in range(3)], 'max': [max(v[i] for v in values) for i in range(3)]}
    accs.append(a); return len(accs) - 1
meshes = []
for (pos, nrm, uv, col, idx), mat in ((cube(), 0), (pyramid(), 1)):
    attrs = {'POSITION': acc(pos, 'pos', 3), 'NORMAL': acc(nrm, 'v', 3)}
    if uv: attrs['TEXCOORD_0'] = acc(uv, 'v', 2)
    if col: attrs['COLOR_0'] = acc(col, 'v', 3)
    meshes.append({'primitives': [{'attributes': attrs, 'indices': acc(idx, 'idx', 1), 'material': mat}]})
img = add(png)
doc = {
    'asset': {'version': '2.0', 'generator': 'zinc tests/data/zinc3d_gltf/make_model.py'},
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'name': 'group', 'rotation': list(quat((1, 0, 0), 15)), 'children': [1]},
              {'name': 'base', 'translation': [0, -0.4, 0], 'rotation': list(quat((0, 1, 0), 30)), 'mesh': 0, 'children': [2]},
              {'name': 'top', 'matrix': top, 'mesh': 1}],
    'meshes': meshes,
    'materials': [{'name': 'checker', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}},
                  {'name': 'painted', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1]}}],
    'textures': [{'source': 0}], 'images': [{'bufferView': img, 'mimeType': 'image/png'}],
    'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
}
while len(bin_) % 4: bin_.append(0)
js = json.dumps(doc, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(os.path.join(out, 'model.glb'), 'wb').write(glb)

# ---- the OBJ export: world positions and normals (uniform scales: the rotation part turns the normals), v flipped (OBJ's origin is bottom-left)
def point(m, p): return [sum(m[k * 4 + r] * (p[k] if k < 3 else 1) for k in range(4)) for r in range(3)]
def normal(m, n):
    v = [sum(m[k * 4 + r] * n[k] for k in range(3)) for r in range(3)]; l = math.sqrt(sum(x * x for x in v))
    return [x / l for x in v]
def obj(name, m, mesh):
    pos, nrm, uv, col, idx = mesh
    lines = [f'# {name}: the {name} node of model.glb in world space']
    for i, p in enumerate(pos):
        w = point(m, p)
        lines.append('v ' + ' '.join(f'{x:.6f}' for x in w) + (' ' + ' '.join(f'{c:.6f}' for c in col[i]) if col else ''))
    lines += ['vt ' + f'{u:.6f} {1 - v:.6f}' for u, v in uv]
    lines += ['vn ' + ' '.join(f'{x:.6f}' for x in normal(m, n)) for n in nrm]
    ref = (lambda i: f'{i + 1}/{i + 1}/{i + 1}') if uv else (lambda i: f'{i + 1}//{i + 1}')
    lines += ['f ' + ' '.join(ref(i) for i in idx[t:t + 3]) for t in range(0, len(idx), 3)]
    open(os.path.join(out, name + '.obj'), 'w').write('\n'.join(lines) + '\n')
obj('base', mul(group, base), cube())
obj('top', mul(mul(group, base), top), pyramid())
