#!/usr/bin/env python3
"""Pocket Tokyo's city as glTF: reads a cooked pack of pocket-nexus/pocket-tokyo (TKPK v3, the `ipod60` profile: OpenGL ES vertices
and 16-bit pictures, crates/tokyo-pack/src/lib.rs) and writes, for each block of 512 m, one GLB per level of detail the cook made
(near, mid, far) plus the PNG pictures they name, the Tokyo Tower at its three levels, the heights and the tour. The project's
zinc.json then imports them like any model (`zinc assets build`: gltfpack, .zmesh for zinc:3d, the textures per target).

  python3 -I examples/tokyo/tools/city-gltf.py fetch [cache dir]          # the public pack (177 MB, SHA-256 checked) into ~/.zinc/cache/tokyo
  python3 -I examples/tokyo/tools/city-gltf.py build <pack> <out dir>     # the GLBs, PNGs and city.json

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


TILES = 2   # a block's models are cut into TILES x TILES tiles (256 m): small reads, a finer choice of level


def split(meshes, x0, z0, step):
    """Cuts the meshes of a block (a dict kind -> Mesh) into tiles of `step` metres, each triangle to the tile of its centroid:
    a dict (i, j) -> {kind: Mesh}."""
    tiles, maps = {}, {}
    for kind, m in meshes.items():
        p = m.pos
        for t in range(0, len(m.idx), 3):
            tri = m.idx[t:t + 3]
            cx = sum(p[v * 3] for v in tri) / 3.0
            cz = sum(p[v * 3 + 2] for v in tri) / 3.0
            ij = (min(TILES - 1, max(0, int((cx - x0) // step))), min(TILES - 1, max(0, int((cz - z0) // step))))
            out = tiles.setdefault(ij, {k: Mesh(k) for k in meshes})[kind]
            rm = maps.setdefault((ij, kind), {})
            for v in tri:
                if v not in rm:
                    rm[v] = len(out.pos) // 3
                    out.pos += p[v * 3:v * 3 + 3]; out.nrm += m.nrm[v * 3:v * 3 + 3]
                    if m.uv: out.uv += m.uv[v * 2:v * 2 + 2]
                    if m.col: out.col += m.col[v * 3:v * 3 + 3]
                out.idx.append(rm[v])
    return tiles


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


# ---------------------------------------------------------------- glTF
MATERIALS = {TOP: 'ground', WALL: 'facade', SOLID: 'paint', OPEN: 'steel'}


def write_glb(path, meshes, images):
    """`meshes`: Mesh list; `images`: material name -> picture URI (beside the GLB)."""
    meshes = [m for m in meshes if m.idx]
    if not meshes: return 0
    bin_, views, accessors, prims, mats, texs, imgs = bytearray(), [], [], [], [], [], []

    def view(data, target):
        while len(bin_) % 4: bin_.append(0)
        views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), 'target': target})
        bin_.extend(data)
        return len(views) - 1

    def acc(values, comps, kind, minmax=False):
        fmt = '<%df' % len(values)
        a = {'bufferView': view(struct.pack(fmt, *values), 34962), 'componentType': 5126, 'count': len(values) // comps, 'type': kind}
        if minmax:
            a['min'] = [min(values[i::comps]) for i in range(comps)]
            a['max'] = [max(values[i::comps]) for i in range(comps)]
        accessors.append(a)
        return len(accessors) - 1

    for m in meshes:
        name = MATERIALS[m.material]
        attrs = {'POSITION': acc(m.pos, 3, 'VEC3', True), 'NORMAL': acc(m.nrm, 3, 'VEC3'), 'COLOR_0': acc(m.col, 3, 'VEC3')}
        if m.uv: attrs['TEXCOORD_0'] = acc(m.uv, 2, 'VEC2')
        big = len(m.pos) // 3 > 65535
        idx = struct.pack('<%d%s' % (len(m.idx), 'I' if big else 'H'), *m.idx)
        accessors.append({'bufferView': view(idx, 34963), 'componentType': 5125 if big else 5123, 'count': len(m.idx), 'type': 'SCALAR'})
        mat = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 1}}
        if m.material == OPEN: mat['doubleSided'] = True
        if name in images and m.uv:
            imgs.append({'uri': images[name]}); texs.append({'source': len(imgs) - 1})
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(texs) - 1}
        mats.append(mat)
        prims.append({'attributes': attrs, 'indices': len(accessors) - 1, 'material': len(mats) - 1})
    gltf = {'asset': {'version': '2.0', 'generator': 'zinc examples/tokyo city-gltf.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
            'nodes': [{'mesh': 0, 'name': os.path.basename(path)}], 'meshes': [{'primitives': prims}], 'materials': mats,
            'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    if imgs: gltf['images'], gltf['textures'] = imgs, texs
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(bin_) % 4: bin_.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_)
    return sum(len(m.idx) // 3 for m in meshes)


def build(pack_path, out):
    pk = Pack(pack_path)
    os.makedirs(out, exist_ok=True)
    gverts = {TOP: pk.section('VTOP'), WALL: pk.section('VWAL'), SOLID: pk.section('VSOL')}
    gidx = pk.section('IDX0')
    htex, near = pk.section('HTEX'), pk.section('NEAR')
    no, _ = pk.sec['NEAR']

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

    blocks = []
    for b in range(pk.bx * pk.bz):
        bx, bz = b % pk.bx, b // pk.bx
        frame = (pk.x0 + bx * pk.block, pk.z0 + bz * pk.block, pk.block)
        stem = 'b%d_%d' % (bx, bz)
        off, size, gw, gh, gl = pk.hpic[b]
        ground = rgb565(htex, off, gw, gw)
        write_png(os.path.join(out, stem + '.png'), gw, gw, ground)
        write_png(os.path.join(out, stem + '.night.png'), gw, gw, night_ground(pk, ground, gw, frame, lamps, lamp_side))
        step = pk.block / TILES
        recs = {(i, j): {'name': 't%d_%d' % (bx * TILES + i, bz * TILES + j), 'ground': stem, 'x': frame[0] + i * step, 'z': frame[1] + j * step,
                         'side': step, 'yMin': pk.blocks[b][0], 'yMax': pk.blocks[b][1], 'tris': {}} for i in range(TILES) for j in range(TILES)}

        def tiled(meshes, lod, pic):   # writes each tile's model of one level, the block's picture shared
            for ij, ms in split(meshes, frame[0], frame[1], step).items():
                n = write_glb(os.path.join(out, '%s.%s.glb' % (recs[ij]['name'], lod)), ms.values(), {'ground': pic, 'facade': 'facade.png'})
                if n: recs[ij]['tris'][lod] = n
        # mid (the block's batches) and far (its region's): the block's own picture
        for lod, draws in (('mid', pk.blocks[b][2:4]), ('far', pk.regions[b][2:4])):
            meshes = {k: Mesh(k) for k in (TOP, WALL, SOLID, OPEN)}
            for i in range(draws[0], draws[0] + draws[1]):
                unpack_batch(pk, pk.batches[i], gverts, gidx, frame, meshes)
            tiled(meshes, lod, stem + '.png')
        # near: each cell's record, its ground in one picture of the block at the cells' resolution
        meshes = {k: Mesh(k) for k in (TOP, WALL, SOLID, OPEN)}
        cw = max((pk.ncel[b * pk.cells ** 2 + c][7] for c in range(pk.cells ** 2)), default=0)
        side = cw * pk.cells if cw else 0
        pic = bytearray(side * side * 3) if side else None
        have = [False] * pk.cells ** 2
        for c in range(pk.cells ** 2):
            cid = b * pk.cells ** 2 + c
            nc = pk.ncel[cid]
            first, count = pk.cell_tab[cid][6:8]
            if nc[1] == 0 or count == 0: continue
            parts, at = [], no + nc[0]
            for s in nc[2:7]:
                parts.append(at); at += (s + 15) & ~15
            rec_verts = {TOP: pk.b[parts[0]:parts[0] + nc[2]], WALL: pk.b[parts[1]:parts[1] + nc[3]], SOLID: pk.b[parts[2]:parts[2] + nc[4]]}
            rec_idx = pk.b[parts[3]:parts[3] + nc[5]]
            for i in range(first, first + count):
                unpack_batch(pk, pk.batches[i], rec_verts, rec_idx, frame, meshes)
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
            tiled(meshes, 'near', stem + '.near.png')
        blocks += [r for r in recs.values() if r['tris']]
        print('\rgltf: block %d/%d' % (b + 1, pk.bx * pk.bz), end='', file=sys.stderr)
    print(file=sys.stderr)

    # the landmarks (Tokyo Tower): a model at three levels, chosen by distance alone
    marks = []
    for m, l in enumerate(pk.land):
        lo, hi, lods, reach, blk = l[0:3], l[3:6], l[6:12], l[12:14], l[14]
        bx, bz = blk % pk.bx, blk // pk.bx
        frame = (pk.x0 + bx * pk.block, pk.z0 + bz * pk.block, pk.block)
        rec = {'name': 'landmark%d' % m, 'min': lo, 'max': hi, 'reach': reach, 'tris': {}}
        for k, lod in enumerate(('near', 'mid', 'far')):
            meshes = {k2: Mesh(k2) for k2 in (TOP, WALL, SOLID, OPEN)}
            first, count = lods[k * 2], lods[k * 2 + 1]
            for i in range(first, first + count):
                unpack_batch(pk, pk.batches[i], gverts, gidx, frame, meshes)   # OPEN: solids seen from both sides
            n = write_glb(os.path.join(out, '%s.%s.glb' % (rec['name'], lod)), meshes.values(), {})
            if n: rec['tris'][lod] = n
        marks.append(rec)

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
    lines += ['tile %s %s %s %s %s %s %d %d %d %s' % (b['name'], g(b['x']), g(b['z']), g(b['side']), g(b['yMin']), g(b['yMax']),
              b['tris'].get('near', 0), b['tris'].get('mid', 0), b['tris'].get('far', 0), b['ground']) for b in blocks]
    lines += ['landmark %s %s %s %s %d %d %d' % (m['name'], ' '.join(g(v) for v in m['min']), ' '.join(g(v) for v in m['max']),
              ' '.join(g(v) for v in m['reach']), m['tris'].get('near', 0), m['tris'].get('mid', 0), m['tris'].get('far', 0)) for m in marks]
    lines += ['credit ' + a for a in pk.meta.get('source', {}).get('attribution', [])]
    with open(os.path.join(out, 'city.txt'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    total = {lod: sum(b['tris'].get(lod, 0) for b in blocks) for lod in ('near', 'mid', 'far')}
    print('gltf: %d tiles, triangles %s -> %s' % (len(blocks), total, out))


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/.zinc/cache/tokyo'))
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
