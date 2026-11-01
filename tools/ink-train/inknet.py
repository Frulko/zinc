"""The tiny int8 letter net of zinc:ink (ZN-936): rasteriser, .znm reader/writer and the integer reference inference.
The C kernels in plugins/ink/native/ink.abi.cpp do the same steps in the same order; tests/t0/ink_net.sh compares them.

Input: the strokes of one mark (flat x, y arrays) -> 3 x 24 x 24 int8: ink density, and the line orientation as cos 2t and sin 2t
(orientation, not direction: an E drawn from the top or the bottom looks the same). Layers: conv 3x3 (pad 1) + ReLU + 2x2 max pool, three
times, then dense + ReLU and dense. Weights int8 per layer, biases int32, one int32 multiplier per output channel and a shift per layer
requantise the accumulator to int8 (all integer: the same bits in Python and C).

  inknet.py golden MODEL.znm DATASET.json [N]    JSON of N held-out marks: their strokes, rasters and the logits of this reference
  inknet.py stress DATASET.json [K]              the held-out marks bent K times each, harder than the training augmentation (seeded): a set
                                                 for telling a recogniser that copes with other hands from one that only knows the train writers
"""
import base64, json, math, struct, sys
import numpy as np

S = 24                 # raster side
MARGIN = 2.0
STEP = 0.5             # px between samples along a segment
WEIGHT = 0.6
MAGIC = b'ZNM1'


def raster(strokes):
    """strokes: list of flat [x, y, x, y...] -> int8 array (3, S, S). Pure IEEE double arithmetic, op for op the C version."""
    xs = [v for s in strokes for v in s[0::2]]
    ys = [v for s in strokes for v in s[1::2]]
    out = np.zeros((3, S, S), dtype=np.float64)
    if not xs:
        return out.astype(np.int8)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    side = max(x1 - x0, y1 - y0)
    if side <= 0:
        side = 1.0
    k = (S - 2 * MARGIN) / side
    cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    D = [[0.0] * (S * S) for _ in range(3)]
    Dn, C, Sg = D

    def splat(px, py, wt, c2, s2):
        px -= 0.5
        py -= 0.5
        ix, iy = math.floor(px), math.floor(py)
        fx, fy = px - ix, py - iy
        for dy, wy in ((0, 1 - fy), (1, fy)):
            for dx, wx in ((0, 1 - fx), (1, fx)):
                x, y = ix + dx, iy + dy
                if 0 <= x < S and 0 <= y < S:
                    w = wt * (wx * wy)
                    i = y * S + x
                    Dn[i] += w
                    C[i] += w * c2
                    Sg[i] += w * s2

    for s in strokes:
        n = len(s) // 2
        g = [((s[2 * i] - cx) * k + S * 0.5, (s[2 * i + 1] - cy) * k + S * 0.5) for i in range(n)]
        if n == 1:
            splat(g[0][0], g[0][1], WEIGHT, 0.0, 0.0)
            continue
        for i in range(n - 1):
            ax, ay = g[i]
            bx, by = g[i + 1]
            dx, dy = bx - ax, by - ay
            L = math.sqrt(dx * dx + dy * dy)
            if L == 0:
                continue
            ux, uy = dx / L, dy / L
            c2, s2 = ux * ux - uy * uy, 2 * ux * uy
            m = max(1, math.ceil(L / STEP))
            for j in range(m):
                t = j / m
                splat(ax + dx * t, ay + dy * t, WEIGHT, c2, s2)
        splat(g[-1][0], g[-1][1], WEIGHT, 0.0, 0.0)
    q = np.zeros((3, S * S), dtype=np.int8)
    for i in range(S * S):
        d = Dn[i]
        q[0, i] = math.floor(min(d, 1.0) * 127 + 0.5)
        den = max(d, 1.0)
        q[1, i] = math.floor(max(-1.0, min(1.0, C[i] / den)) * 127 + 0.5)
        q[2, i] = math.floor(max(-1.0, min(1.0, Sg[i] / den)) * 127 + 0.5)
    return q.reshape(3, S, S)


class Layer:
    def __init__(self, kind, cin, cout, relu, pool, w, b, mult, shift):
        self.kind, self.cin, self.cout, self.relu, self.pool = kind, cin, cout, relu, pool   # kind 0 conv3x3, 1 dense
        self.w, self.b, self.mult, self.shift = w, b, mult, shift      # w int8, b int32 (cout), mult int32 (cout), shift int


class Net:
    def __init__(self, labels, out_scale, layers):
        self.labels, self.out_scale, self.layers = labels, out_scale, layers


def write(net, path):
    out = bytearray(MAGIC)
    out += struct.pack('<IIIf', len(net.labels), S, len(net.layers), net.out_scale)
    for l in net.labels:
        e = l.encode()
        out += struct.pack('<B', len(e)) + e
    for l in net.layers:
        out += struct.pack('<BBBBHHi', l.kind, int(l.relu), int(l.pool), 0, l.cin, l.cout, l.shift)
        out += l.w.astype(np.int8).tobytes() + l.b.astype('<i4').tobytes() + l.mult.astype('<i4').tobytes()
    open(path, 'wb').write(bytes(out))
    return bytes(out)


def read(path):
    d = open(path, 'rb').read()
    assert d[:4] == MAGIC
    nl, side, nlay, scale = struct.unpack_from('<IIIf', d, 4)
    assert side == S
    at = 4 + 16
    labels = []
    for _ in range(nl):
        n = d[at]
        labels.append(d[at + 1:at + 1 + n].decode())
        at += 1 + n
    layers = []
    for _ in range(nlay):
        kind, relu, pool, _p, cin, cout, shift = struct.unpack_from('<BBBBHHi', d, at)
        at += 12
        wn = cout * cin * (9 if kind == 0 else 1)
        w = np.frombuffer(d, np.int8, wn, at).copy()
        at += wn
        b = np.frombuffer(d, '<i4', cout, at).astype(np.int64)
        at += 4 * cout
        m = np.frombuffer(d, '<i4', cout, at).astype(np.int64)
        at += 4 * cout
        layers.append(Layer(kind, cin, cout, relu, pool, w.reshape(cout, cin, 3, 3) if kind == 0 else w.reshape(cout, cin), b, m, shift))
    assert at == len(d)
    return Net(labels, scale, layers)


def requant(acc, mult, shift, relu):
    r = (acc * mult + (1 << (shift - 1))) >> shift       # int64, arithmetic shift, per output channel (last axis broadcast)
    return np.clip(r, 0 if relu else -127, 127)


def infer(net, x):
    """x: int8 (N, 3, S, S) -> int8 logits (N, classes). Integer arithmetic only."""
    a = x.astype(np.int64)
    for l in net.layers:
        if l.kind == 0:
            n, c, h, w = a.shape
            p = np.pad(a, ((0, 0), (0, 0), (1, 1), (1, 1)))
            cols = np.stack([p[:, :, ky:ky + h, kx:kx + w] for ky in range(3) for kx in range(3)], axis=2)   # n, c, 9, h, w
            wm = l.w.reshape(l.cout, c * 9).astype(np.int64)
            acc = np.einsum('ok,nkhw->nohw', wm, cols.reshape(n, c * 9, h, w)) + l.b[None, :, None, None]
            a = requant(acc, l.mult[None, :, None, None], l.shift, l.relu)
            if l.pool:
                a = a.reshape(n, l.cout, h // 2, 2, w // 2, 2).max(axis=(3, 5))
        else:
            a = a.reshape(a.shape[0], -1)
            acc = a @ l.w.astype(np.int64).T + l.b[None, :]
            a = requant(acc, l.mult[None, :], l.shift, l.relu)
    return a.astype(np.int8)


def golden(model, dataset, n):
    net = read(model)
    d = json.load(open(dataset))
    test = {w['id'] for w in d['writers'] if w['split'] == 'test'}
    pool = [s for s in d['samples'] if s['w'] in test]
    held = pool[::max(1, len(pool) // n)][:n]
    rs = np.stack([raster(s['s']) for s in held])
    lg = infer(net, rs)
    print(json.dumps({'labels': net.labels, 'samples': [{'s': s['s'], 'c': s['c'], 'r': base64.b64encode(r.tobytes()).decode(), 'l': [int(v) for v in l]}
                                                         for s, r, l in zip(held, rs, lg)]}, separators=(',', ':')))


def stress(dataset, k):
    import random
    d = json.load(open(dataset))
    test = {w['id'] for w in d['writers'] if w['split'] == 'test'}
    out = []
    for n, smp in enumerate(x for x in d['samples'] if x['w'] in test):
        for j in range(k):
            r = random.Random(936000 + n * 31 + j)
            pts = [np.array(st, dtype=np.float64).reshape(-1, 2) for st in smp['s']]
            allp = np.concatenate(pts)
            c = (allp.min(0) + allp.max(0)) / 2
            size = max(np.ptp(allp[:, 0]), np.ptp(allp[:, 1]), 1.0)
            a, sh = math.radians(r.uniform(-18, 18)), r.uniform(-0.35, 0.35)
            sx, sy = r.uniform(0.7, 1.4), r.uniform(0.7, 1.4)
            amp, fq, ph = r.uniform(0.02, 0.07) * size, r.uniform(1, 3), r.uniform(0, 6.3)
            strokes = []
            for p in pts:
                p = p - c
                p = np.stack([p[:, 0] + sh * p[:, 1], p[:, 1]], 1) * [sx, sy]
                p = p @ np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])
                p = p + amp * np.stack([np.sin(p[:, 1] / size * fq * 6.28 + ph), np.cos(p[:, 0] / size * fq * 6.28 + ph)], 1)
                p = p + np.random.default_rng(r.getrandbits(32)).normal(0, 0.015 * size, p.shape)
                if len(p) > 4:
                    p = p[[i for i in range(len(p)) if i in (0, len(p) - 1) or r.random() > 0.3]]
                strokes.append([int(round(v)) for v in (p + 500).reshape(-1)])
            out.append({'w': smp['w'], 'c': smp['c'], 's': strokes})
    print(json.dumps({'writers': [{'id': w, 'split': 'test'} for w in sorted(test)], 'samples': out}, separators=(',', ':')))


if __name__ == '__main__':
    if sys.argv[1] == 'stress':
        stress(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2)
        sys.exit()
    if sys.argv[1] == 'golden':
        golden(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 50)
