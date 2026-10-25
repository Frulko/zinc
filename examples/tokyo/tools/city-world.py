#!/usr/bin/env python3
"""Pocket Tokyo's city as a zinc:3d world: reads a cooked pack of pocket-nexus/pocket-tokyo (TKPK v3, the `ipod60` profile: OpenGL ES
vertices and 16-bit pictures, crates/tokyo-pack/src/lib.rs) and writes a world (include/zn/zworld.h) that keeps the pack's batches and
their spans as they are: the index `city.zworld` (its 768 cells of 128 m and the Tokyo Tower), the far level of the whole city in one
chunk (`far.zwc`), the mid level a chunk per block of 512 m (`b<x>_<z>.mid.zwc`), the near level a chunk per cell (`c<n>.near.zwc`), the
tower a chunk per level; the PNG pictures they name, the heights and the tour. zinc:3d's World (plugins/3d/index.ts) reads it.

  python3 -I examples/tokyo/tools/city-world.py fetch [cache dir]          # the public pack (177 MB, SHA-256 checked) into ~/.zinc/cache/tokyo
  python3 -I examples/tokyo/tools/city-world.py build <pack> <out dir>     # the world, its pictures, heights.bin and city.txt

Python's standard library only. The pack's data keeps its sources' terms (PLATEAU, GSI, OpenStreetMap: ODbL); it is not committed.
"""
import hashlib, json, math, os, struct, sys, urllib.request, zlib

SITE = 'https://tokyo.studio.pocket.nexus/pack/'
MANIFEST = 'db44452a8d444631.json'   # the deployed browser build's pack: profile ipod60
SECTORS = 16
TOP, WALL, SOLID, OPEN = 0, 1, 2, 3


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    pack = os.path.join(cache, 'ipod60.pack')
    with urllib.request.urlopen(SITE + MANIFEST, timeout=60) as r:
        man = json.load(r)
    if os.path.exists(pack) and hashlib.sha256(open(pack, 'rb').read()).hexdigest() == man['sha256']:
        print(pack); return
    h = hashlib.sha256()
    with open(pack + '.part', 'wb') as out:
        for i, piece in enumerate(man['pieces']):
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(SITE + piece, timeout=300) as r:
                        data = r.read()
                    break
                except OSError:
                    if attempt == 3: raise
            out.write(data); h.update(data)
            print('\rfetch: %d/%d pieces' % (i + 1, len(man['pieces'])), end='', file=sys.stderr)
    print(file=sys.stderr)
    if h.hexdigest() != man['sha256']: sys.exit('fetch: the pack does not match its SHA-256')
    os.replace(pack + '.part', pack)
    print(pack)


# ---------------------------------------------------------------- the pack
class Pack:
    def __init__(self, path):
        self.b = open(path, 'rb').read()
        magic, version, n, _ = struct.unpack_from('<4sIII', self.b, 0)
        if magic != b'TKPK' or version != 3: sys.exit('%s: not a TKPK v3 pack' % path)
        self.sec = {}
        for i in range(n):
            t, o, s, _ = struct.unpack_from('<4sIII', self.b, 16 + i * 16)
            self.sec[t.decode()] = (o, s)
        c = struct.unpack_from('<fIIffIffffffIIf6ffII', self.b, self.sec['CITY'][0])
        (self.block, self.bx, self.bz, self.x0, self.z0, self.cells, self.y0, self.yspan, self.margin, self.gx0, self.gz0, self.gstep,
         self.gw, self.gh, self.hstep) = c[:15]
        self.view, self.hour, self.region_blocks, self.flags = list(c[15:21]), c[21], c[22], c[23]
        if self.flags & 2 == 0 or self.region_blocks != 1: sys.exit('the pack is not a handheld pack with one block a region (ipod60)')
        self.meta = json.loads(self.section('META'))
        self.batches = self.table('BTCH', '<5I6fI')
        self.blocks = self.table('BLCK', '<ffIIII')
        self.regions = self.table('REGN', '<ffIIII')
        self.cell_tab = self.table('CELL', '<6fII')
        self.ncel = self.table('NCEL', '<7IHH')
        self.hpic = self.table('HPIC', '<IIHHI')
        self.land = self.table('LAND', '<6f6I2fII')

    def section(self, tag):
        o, s = self.sec[tag]
        return self.b[o:o + s]

    def table(self, tag, fmt):
        data, n = self.section(tag), struct.calcsize(fmt)
        return [struct.unpack_from(fmt, data, i * n) for i in range(len(data) // n)]


def sector_normal(k):
    a = -math.pi + (k + 0.5) * 2 * math.pi / SECTORS
    return (math.cos(a), 0.0, math.sin(a))


class Mesh:
    """One primitive: world positions, normals, uvs (or none), colours (or none), triangles."""
    def __init__(self, material):
        self.material, self.pos, self.nrm, self.uv, self.col, self.idx = material, [], [], [], [], []



def unpack_batch(pk, batch, verts, idx_bytes, frame, out, uv_frame=None):
    """Appends one batch's triangles to `out` (a dict kind -> Mesh). `verts`: the vertex bytes of each kind; `frame`: (x0, z0, side)."""
    kind, vfirst, vcount, ifirst, icount = batch[:5]
    x0, z0, side = frame
    wide = side + 2 * pk.margin
    q = lambda v: (v + 32768) / 65535.0
    y = lambda v: pk.y0 + q(v) * pk.yspan
    m = out[kind]
    base = len(m.pos) // 3
    if kind == TOP:
        data = verts[TOP]
        for i in range(vfirst, vfirst + vcount):
            px, py, pz, ao, _ = struct.unpack_from('<hhhBB', data, i * 8)
            wx, wz = x0 + q(px) * side, z0 + q(pz) * side
            m.pos += (wx, y(py), wz); m.nrm += (0.0, 1.0, 0.0)
            ux0, uz0, us = uv_frame or frame
            m.uv += ((wx - ux0) / us, (wz - uz0) / us)
            g = 0.45 + 0.55 * ao / 255.0
            m.col += (g, g, g)
    elif kind == WALL:
        data = verts[WALL]
        for i in range(vfirst, vfirst + vcount):
            px, py, pz, ao, sector, r, g, b, _gain, u, v = struct.unpack_from('<hhhBB4Bhh', data, i * 16)
            m.pos += (x0 - pk.margin + q(px) * wide, y(py), z0 - pk.margin + q(pz) * wide)
            m.nrm += sector_normal(sector & 31) if (sector & 31) < SECTORS else (0.0, 1.0, 0.0)
            m.uv += (u / 32767.0, v / 32767.0 * 32.0)
            k = (0.45 + 0.55 * ao / 255.0) / 255.0
            m.col += (r * k, g * k, b * k)
    else:
        data = verts[SOLID]
        first_n = len(m.nrm)
        for i in range(vfirst, vfirst + vcount):
            px, py, pz, ao, _sector, r, g, b, _a = struct.unpack_from('<hhhBB4B', data, i * 12)
            m.pos += (x0 - pk.margin + q(px) * wide, y(py), z0 - pk.margin + q(pz) * wide)
            m.nrm += (0.0, 0.0, 0.0)
            k = (0.45 + 0.55 * ao / 255.0) / 255.0
            m.col += (r * k, g * k, b * k)
    tri = struct.unpack_from('<%dH' % icount, idx_bytes, ifirst * 2)
    m.idx += [base + t for t in tri]
    if kind in (SOLID, OPEN):   # painted geometry has no normal in the pack: the mean of its faces'
        P, N = m.pos, m.nrm
        for t in range(0, icount, 3):
            a, b, c = (base + tri[t]) * 3, (base + tri[t + 1]) * 3, (base + tri[t + 2]) * 3
            ux, uy, uz = P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]
            vx, vy, vz = P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            for o in (a, b, c): N[o] += nx; N[o + 1] += ny; N[o + 2] += nz
        for o in range(first_n, len(N), 3):
            l = math.sqrt(N[o] ** 2 + N[o + 1] ** 2 + N[o + 2] ** 2) or 1.0
            N[o] /= l; N[o + 1] /= l; N[o + 2] /= l


# ---------------------------------------------------------------- pictures
def rgb565(data, at, w, h):
    px = struct.unpack_from('<%dH' % (w * h), data, at)
    out = bytearray(w * h * 3)
    for i, p in enumerate(px):
        out[i * 3] = (p >> 11) * 255 // 31; out[i * 3 + 1] = ((p >> 5) & 63) * 255 // 63; out[i * 3 + 2] = (p & 31) * 255 // 31
    return out


NIGHT_WALL = (0.16, 0.18, 0.26)
NIGHT_GROUND = (0.13, 0.15, 0.22)


def night_ground(pk, day, w, frame, lamps, side):
    """A ground picture by night (handheld.rs night_ground): its colours under the night's light and the lamps' (nearest texel)."""
    x0, z0, span = frame
    out = bytearray(len(day))
    for y in range(w):
        j = min(side - 1, max(0, int((z0 + (y + 0.5) / w * span - pk.gz0) / pk.gstep)))
        for x in range(w):
            i = min(side - 1, max(0, int((x0 + (x + 0.5) / w * span - pk.gx0) / pk.gstep)))
            v = lamps[j * side + i] if i < pk.gw and j < pk.gh else 0
            l = ((v >> 11) / 31.0 * 2, ((v >> 5) & 63) / 63.0 * 2, (v & 31) / 31.0 * 2)
            o = (y * w + x) * 3
            for c in range(3):
                out[o + c] = min(255, int(day[o + c] * (NIGHT_GROUND[c] + l[c] * 0.8)))
    return out


def write_png(path, w, h, rgb):
    raw = b''.join(b'\0' + bytes(rgb[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))



# ---------------------------------------------------------------- the world (include/zn/zworld.h)
GROUPS = SECTORS + 1           # a cell's index groups when its faces are ordered by sector: 16 compass sectors, then up and down
VCOL, DOUBLE = 1, 8            # zinc:3d draw flags
NIGHT_LIT = 0xffffff           # a night picture is lit by itself: its light is in the picture
LANDMARK_GLOW = 0xa0a0a0       # the tower's painted members by night (the pack's alpha 191: floodlights)
NO_SPANS = 0xffffffff


def quantise(m):
    """A batch's vertices as zworld's 20-byte records over its own box: s16 position, s16 uv, RGBA8 colour, s8 normal."""
    P, n = m.pos, len(m.pos) // 3
    lo = [min(P[a::3]) for a in range(3)]
    sc = [max(max(P[a::3]) - lo[a], 1e-3) for a in range(3)]
    us = max(max((abs(v) for v in m.uv), default=0), 1e-6) / 32767
    c8 = lambda v: max(0, min(255, int(round(v * 255))))
    s8 = lambda v: max(-127, min(127, int(round(v * 127))))
    buf = bytearray()
    for i in range(n):
        q = [max(-32768, min(32767, int(round((P[i * 3 + a] - lo[a]) / sc[a] * 65535)) - 32768)) for a in range(3)]
        u = (int(round(m.uv[i * 2] / us)), int(round(m.uv[i * 2 + 1] / us))) if m.uv else (0, 0)
        c = m.col[i * 3:i * 3 + 3] if m.col else (1.0, 1.0, 1.0)
        nn = m.nrm[i * 3:i * 3 + 3]
        buf += struct.pack('<3h2h4B3b3x', q[0], q[1], q[2], u[0], u[1], c8(c[0]), c8(c[1]), c8(c[2]), 255, s8(nn[0]), s8(nn[1]), s8(nn[2]))
    return lo, sc, us, buf


def batch(pk, bi, verts, idx, frame, cell_first, cells, pics, landmark=False):
    """One of the pack's batches as a zworld batch: its triangles, its material by day and by night, its spans (where each of its cells,
    and each sector of a cell, starts in its indices)."""
    b = pk.batches[bi]
    kind, icount, spans_at = b[0], b[4], b[11]
    ms = {k: Mesh(k) for k in (TOP, WALL, SOLID, OPEN)}
    unpack_batch(pk, b, verts, idx, frame, ms)
    m = ms[kind]
    by_sector = kind == WALL or (pk.flags & 1 and kind == SOLID)   # tokyo-sim view.rs by_sector (FACED: solids too)
    if spans_at == NO_SPANS:   # in no order: one group, the cell's whole
        assert cells == 1, bi
        groups, spans = 1, [0, icount]
    else:
        groups = GROUPS if by_sector or cells == 1 else 1   # a record of its own (near, landmark): ordered by sector
        spans = list(pk.spans[spans_at:spans_at + cells * groups + 1])
        assert spans[0] == 0 and spans[-1] == icount, (bi, spans[0], spans[-1], icount)
    tex = ntex = None
    emis, nemis = 0, 0
    if kind == TOP: tex, ntex, nemis = pics
    elif kind == WALL: tex, ntex, nemis = 'facade.png', 'facade-night.png', NIGHT_LIT
    elif landmark: nemis = LANDMARK_GLOW
    return {'kind': kind, 'flags': VCOL | (DOUBLE if kind == OPEN else 0), 'tex': tex, 'ntex': ntex, 'emis': emis, 'nemis': nemis,
            'cell': cell_first, 'cells': cells, 'groups': groups, 'spans': spans, 'mesh': m}


def write_chunk(path, batches):
    """A zworld chunk: what one level of a few cells draws, loaded and freed as one."""
    names, recs, spans, data = [], bytearray(), [], bytearray()
    def name(s):
        if s is None: return -1
        if s not in names: names.append(s)
        return names.index(s)
    tris = 0
    for b in batches:
        m = b['mesh']
        if not m.idx: continue
        lo, sc, us, vb = quantise(m)
        recs += struct.pack('<5I3i5I8f', b['kind'], b['flags'], 0xffffff, b['emis'], b['nemis'], name(b['tex']), name(b['ntex']), b['cell'], b['cells'],
                            b['groups'], len(spans), len(m.pos) // 3, len(m.idx), lo[0], lo[1], lo[2], sc[0], sc[1], sc[2], us, 0.0)
        spans += b['spans']
        data += vb + struct.pack('<%dH' % len(m.idx), *m.idx)
        while len(data) % 4: data.append(0)
        tris += len(m.idx) // 3
    out = bytearray(struct.pack('<4sIII', b'ZWC1', len(recs) // 84, len(spans), len(names))) + recs
    for s in names:
        e = s.encode()
        out += struct.pack('<I', len(e)) + e + b'\0' * (-len(e) % 4)
    out += struct.pack('<%dI' % len(spans), *spans) + data
    with open(path, 'wb') as f: f.write(out)
    return tris


def build(pack_path, out):
    pk = Pack(pack_path)
    pk.spans = struct.unpack('<%dI' % (len(pk.section('SPAN')) // 4), pk.section('SPAN'))
    os.makedirs(out, exist_ok=True)
    gverts = {TOP: pk.section('VTOP'), WALL: pk.section('VWAL'), SOLID: pk.section('VSOL')}
    gidx = pk.section('IDX0')
    htex = pk.section('HTEX')
    no, _ = pk.sec['NEAR']
    per = pk.cells ** 2

    # the facades: the day picture, then what the windows emit (levels each; the largest is first)
    off, size, fw, fh, levels = pk.hpic[-1]
    level_bytes = sum((fw >> l) * (fh >> l) * 2 for l in range(levels))
    day = rgb565(htex, off, fw, fh)
    write_png(os.path.join(out, 'facade.png'), fw, fh, day)
    # by night: what the night leaves of the wall (handheld.rs NIGHT_WALL) plus what the windows emit, drawn as it is
    lit = rgb565(htex, off + level_bytes, fw, fh)
    night = bytearray(min(255, int(day[i] * NIGHT_WALL[i % 3] + lit[i] * 0.7)) for i in range(len(day)))
    write_png(os.path.join(out, 'facade-night.png'), fw, fh, night)
    # the lamps' light over the grid of heights (half strength, r5 g6 b5), for the ground's night pictures
    lamp = pk.section('LAMP')
    lamp_side = int(math.sqrt(len(lamp) // 2))
    lamps = struct.unpack('<%dH' % (lamp_side * lamp_side), lamp)

    # the cells (the pack's, 128 m, a block's in a row) and the chunks that hold their levels: the far level of the whole city in one, the
    # mid level a chunk per block, the near level a chunk per cell
    cells = [{'box': list(pk.cell_tab[c][0:6]), 'reach': (0.0, 0.0), 'chunks': [-1, -1, 0]} for c in range(pk.bx * pk.bz * per)]
    chunks, far, total = [('far.zwc', 2)], [], [0, 0, 0]
    for b in range(pk.bx * pk.bz):
        bx, bz = b % pk.bx, b // pk.bx
        frame = (pk.x0 + bx * pk.block, pk.z0 + bz * pk.block, pk.block)
        stem = 'b%d_%d' % (bx, bz)
        off, size, gw, gh, gl = pk.hpic[b]
        ground = rgb565(htex, off, gw, gw)
        write_png(os.path.join(out, stem + '.png'), gw, gw, ground)
        write_png(os.path.join(out, stem + '.night.png'), gw, gw, night_ground(pk, ground, gw, frame, lamps, lamp_side))
        pics = (stem + '.png', stem + '.night.png', NIGHT_LIT)
        bf, bc = pk.blocks[b][2:4]
        mid = [batch(pk, i, gverts, gidx, frame, b * per, per, pics) for i in range(bf, bf + bc)]
        if mid:
            total[1] += write_chunk(os.path.join(out, stem + '.mid.zwc'), mid)
            chunks.append((stem + '.mid.zwc', 1))
            for c in range(per): cells[b * per + c]['chunks'][1] = len(chunks) - 1
        rf, rc = pk.regions[b][2:4]
        far += [batch(pk, i, gverts, gidx, frame, b * per, per, pics) for i in range(rf, rf + rc)]
        # near: each cell's record, its ground in one picture of the block at the cells' resolution
        cw = max((pk.ncel[b * per + c][7] for c in range(per)), default=0)
        side = cw * pk.cells if cw else 0
        pic = bytearray(side * side * 3) if side else None
        have = [False] * per
        npics = (stem + '.near.png', stem + '.night.png', NIGHT_LIT)
        for c in range(per):
            cid = b * per + c
            nc = pk.ncel[cid]
            first, count = pk.cell_tab[cid][6:8]
            if nc[1] == 0 or count == 0: continue
            parts, at = [], no + nc[0]
            for s in nc[2:7]:
                parts.append(at); at += (s + 15) & ~15
            rec_verts = {TOP: pk.b[parts[0]:parts[0] + nc[2]], WALL: pk.b[parts[1]:parts[1] + nc[3]], SOLID: pk.b[parts[2]:parts[2] + nc[4]]}
            rec_idx = pk.b[parts[3]:parts[3] + nc[5]]
            near = [batch(pk, i, rec_verts, rec_idx, frame, cid, 1, npics) for i in range(first, first + count)]
            name = 'c%d.near.zwc' % cid
            total[0] += write_chunk(os.path.join(out, name), near)
            chunks.append((name, 0))
            cells[cid]['chunks'][0] = len(chunks) - 1
            w = nc[7]
            if w == cw:
                cx, cz = c % pk.cells, c // pk.cells
                have[c] = True
                texels = rgb565(pk.b, parts[4], w, w)
                for yy in range(w):
                    o = ((cz * w + yy) * side + cx * w) * 3
                    pic[o:o + w * 3] = texels[yy * w * 3:(yy + 1) * w * 3]
        if pic is not None:   # cells with no record: the block's picture, scaled up
            k = side // gw
            for yy in range(side):
                for xx in range(side):
                    if have[(yy // cw) * pk.cells + xx // cw]: continue
                    o, s = (yy * side + xx) * 3, ((yy // k) * gw + xx // k) * 3
                    pic[o:o + 3] = ground[s:s + 3]
            write_png(os.path.join(out, stem + '.near.png'), side, side, pic)
        print('\rworld: block %d/%d' % (b + 1, pk.bx * pk.bz), end='', file=sys.stderr)
    print(file=sys.stderr)
    total[2] += write_chunk(os.path.join(out, 'far.zwc'), far)

    # the landmarks (Tokyo Tower): a cell of their own, a chunk a level, their own distances between the levels
    for m, l in enumerate(pk.land):
        lo, hi, lods, reach, blk = l[0:3], l[3:6], l[6:12], l[12:14], l[14]
        bx, bz = blk % pk.bx, blk // pk.bx
        frame = (pk.x0 + bx * pk.block, pk.z0 + bz * pk.block, pk.block)
        cell = {'box': list(lo) + list(hi), 'reach': tuple(reach), 'chunks': [-1, -1, -1]}
        for k, lod in enumerate(('near', 'mid', 'far')):
            first, count = lods[k * 2], lods[k * 2 + 1]
            bs = [batch(pk, i, gverts, gidx, frame, len(cells), 1, (None, None, 0), True) for i in range(first, first + count)]
            if not bs: continue
            name = 'landmark%d.%s.zwc' % (m, lod)
            write_chunk(os.path.join(out, name), bs)
            chunks.append((name, k))
            cell['chunks'][k] = len(chunks) - 1
        cells.append(cell)

    # the index: the cells and the chunks
    idx = bytearray(struct.pack('<4sIII', b'ZWD1', 1, len(cells), len(chunks)))
    for c in cells: idx += struct.pack('<8f3i', *c['box'], c['reach'][0], c['reach'][1], *c['chunks'])
    for name, level in chunks:
        e = name.encode()
        idx += struct.pack('<II', level, len(e)) + e + b'\0' * (-len(e) % 4)
    with open(os.path.join(out, 'city.zworld'), 'wb') as f: f.write(idx)

    # the heights, at 8 m: the highest of what each cell covers, in metres above y0, one byte per 2 m
    hm = struct.unpack('<%dH' % (pk.gw * pk.gh), pk.section('HMAP'))
    k = max(1, int(8 / pk.gstep))
    w, h = pk.gw // k, pk.gh // k
    heights = bytearray(w * h)
    for j in range(h):
        for i in range(w):
            top = max(hm[(j * k + jj) * pk.gw + i * k + ii] for jj in range(k) for ii in range(k))
            heights[j * w + i] = min(255, int(top * pk.hstep / 2 + 0.999))
    open(os.path.join(out, 'heights.bin'), 'wb').write(heights)
    tour = struct.unpack('<%df' % (len(pk.section('TOUR')) // 4), pk.section('TOUR'))
    # city.txt: one record a line, words separated by spaces (the program reads it without a JSON parser, as a console's strict profile wants)
    g = lambda v: ('%g' % v)
    lines = ['city %d %d %s %s %s %s' % (pk.bx, pk.bz, g(pk.block), g(pk.x0), g(pk.z0), g(pk.hour)),
             'view ' + ' '.join(g(v) for v in pk.view),
             'heights %s %s %s %d %d %s 2' % (g(pk.gx0), g(pk.gz0), g(pk.gstep * k), w, h, g(pk.y0))]
    lines += ['tour ' + ' '.join(g(v) for v in tour[i:i + 6]) for i in range(0, len(tour), 6)]
    lines += ['credit ' + a for a in pk.meta.get('source', {}).get('attribution', [])]
    with open(os.path.join(out, 'city.txt'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('world: %d cells, %d chunks, triangles near %d, mid %d, far %d -> %s' % (len(cells), len(chunks), total[0], total[1], total[2], out))


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/.zinc/cache/tokyo'))
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
