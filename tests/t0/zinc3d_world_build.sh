#!/bin/sh
# The `world` asset rule (src/assets/world.h): a synthetic glTF city (a ground of 200 m in 32 x 32 quads, nine boxes, one textured, one with
# its own _LOD1, its buffer in a .bin beside it) becomes a .zworld on cells of 50 m. Checked: the cells and chunks of the index (16 cells, a far
# chunk, 4 mid chunks of 2 x 2 cells, 16 near chunks), the levels (the simplified ground and the given LOD1 draw fewer triangles than the
# near level), the sectors (the walls facing away left out), the provenance (each node's cells, levels and batches), the picture, the .gltf
# and .bin copied nowhere, and the PSP's rule carrying only the mid and far levels. And the world's extras: a textured pad whose uvs follow x
# and z made a top batch (the textured box stays a wall), a material's night picture and its glow only at night, a tower with its own reach
# in a cell and chunks of its own, and `"region": 1` writing a far chunk per block.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/src" "$tmp/p/assets/w"
cat > "$tmp/p/zinc.json" <<'J'
{ "name": "worldbuild", "entry": "src/main.ts", "assets": { "dir": "assets", "rules": [
  { "match": "w/city.gltf", "as": "world", "cell": 50, "block": 2, "targets": { "psp": { "levels": "mid,far" } } } ] } }
J
python3 -I - "$tmp/p/assets/w" <<'PY' || { echo "zinc3d_world_build: the synthetic city was not written"; exit 1; }
import base64, json, struct, sys, zlib
d = sys.argv[1]
bin_, views, accs, meshes, nodes = bytearray(), [], [], [], []
def acc(data, fmt, n, typ, comp, target):
    off = len(bin_); bin_.extend(struct.pack('<%d%s' % (len(data), fmt), *data))
    while len(bin_) % 4: bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data) * 4, 'target': target})
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': n, 'type': typ}
    if typ == 'VEC3': a['min'] = [min(data[i::3]) for i in range(3)]; a['max'] = [max(data[i::3]) for i in range(3)]
    accs.append(a); return len(accs) - 1
def mesh(pos, nrm, uv, idx, mat):
    att = {'POSITION': acc(pos, 'f', len(pos) // 3, 'VEC3', 5126, 34962), 'NORMAL': acc(nrm, 'f', len(nrm) // 3, 'VEC3', 5126, 34962)}
    if uv: att['TEXCOORD_0'] = acc(uv, 'f', len(uv) // 2, 'VEC2', 5126, 34962)
    meshes.append({'primitives': [{'attributes': att, 'indices': acc(idx, 'I', len(idx), 'SCALAR', 5125, 34963), 'material': mat}]})
    return len(meshes) - 1
def box(w, h):   # a box of w x h x w on the ground at the origin, flat faces
    P, N, U, I = [], [], [], []
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)),
             ((0, 0, -1), (-1, 0, 0), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1))]
    for n, u, v in faces:
        b = len(P) // 3
        c = [w / 2 * n[0], h / 2 + h / 2 * n[1], w / 2 * n[2]]
        hu, hv = (w / 2, (h / 2 if n[1] == 0 else w / 2))
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P += [c[k] + su * hu * u[k] + sv * hv * v[k] for k in range(3)]; N += list(n); U += [(su + 1) / 2, (sv + 1) / 2]
        I += [b, b + 1, b + 2, b, b + 2, b + 3]
    return P, N, U, I
G = 32   # the ground: 200 m from (0, 0), G x G quads
P, N, I = [], [], []
for j in range(G + 1):
    for i in range(G + 1): P += [200 * i / G, 0, 200 * j / G]; N += [0, 1, 0]
for j in range(G):
    for i in range(G):
        a = j * (G + 1) + i; I += [a, a + G + 1, a + 1, a + 1, a + G + 1, a + G + 2]
nodes.append({'name': 'ground', 'mesh': mesh(P, N, None, I, 0), 'extras': {'id': 'ground-id'}})
bp, bn, bu, bi = box(10, 30)
plain, tex = mesh(bp, bn, None, bi, 1), mesh(bp, bn, bu, bi, 2)
lp, ln, lu, li = box(10, 30); low = mesh(lp[:12 * 4], ln[:12 * 4], None, li[:6 * 4], 1)   # the LOD1: four walls, no roof
for k, (x, z) in enumerate([(25, 25), (75, 25), (125, 25), (25, 75), (75, 75), (125, 125), (175, 175), (175, 25), (25, 175)]):
    nodes.append({'name': 'b%d' % k, 'mesh': tex if k == 4 else mesh(bp, bn, None, bi, 4) if k == 7 else plain, 'translation': [x, 0, z]})
nodes.append({'name': 'pad', 'mesh': mesh([150, .1, 60, 150, .1, 80, 170, .1, 80, 170, .1, 60], [0, 1, 0] * 4, [15, 6, 15, 8, 17, 8, 17, 6], [0, 1, 2, 0, 2, 3], 3)})
tp, tn, tu, ti = box(10, 100)
nodes.append({'name': 'tower', 'mesh': mesh(tp, tn, None, ti, 1), 'translation': [125, 0, 175], 'extras': {'reach': [300, 900]}})
nodes.append({'name': 'b0_LOD1', 'mesh': low, 'translation': [25, 0, 25]})
def png(w, h):
    raw = b''.join(b'\0' + bytes([255, 128, 0] * w) for _ in range(h))
    ch = lambda t, b: struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
g = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
     'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [0.3, 0.6, 0.3, 1]}}, {'pbrMetallicRoughness': {'baseColorFactor': [0.8, 0.8, 0.8, 1]}},
                   {'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}, {'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}},
                   {'emissiveFactor': [1, 0.5, 0], 'extras': {'night': 'night.png', 'glow': 'night'}}],
     'textures': [{'source': 0}], 'images': [{'uri': 'data:image/png;base64,' + base64.b64encode(png(4, 4)).decode()}],
     'accessors': accs, 'bufferViews': views, 'buffers': [{'uri': 'city.bin', 'byteLength': len(bin_)}]}
open(d + '/city.bin', 'wb').write(bin_)
open(d + '/night.png', 'wb').write(png(4, 4))
json.dump(g, open(d + '/city.gltf', 'w'))
PY
cat > "$tmp/p/src/main.ts" <<'TS'
import { Camera, World, defaults3D } from 'zinc:3d';
import { readBytes, readText } from 'zinc:assets';
const b = readBytes('w/city.zworld');
const u32 = (o: i32): i32 => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
console.log(`index ${u32(8)} cells ${u32(12)} chunks`);
console.log(readText('w/city.zworld.json'));
const nc = u32(8), at = 16 + 44 * nc;
console.log(`reach ${u32(16 + 44 * (nc - 1) + 24)} ${u32(16 + 44 * (nc - 1) + 28)}`);
const text = (c: u8[], o: i32, n: i32): string => { const s: string[] = []; for (let i = 0; i < n; i++) s.push(String.fromCharCode(c[o + i])); return s.join(''); };
for (let k = 0, o = at; k < u32(12); k++) {   // each chunk's batches: kind, emissive, night emissive, picture, night picture
  const n = u32(o + 4), name = text(b, o + 8, n);
  o += 8 + ((n + 3) & ~3);
  const c = readBytes('w/' + name);
  const g = (q: i32): i32 => c[q] | (c[q + 1] << 8) | (c[q + 2] << 16) | (c[q + 3] << 24);
  const names: string[] = [];
  for (let i = 0, q = 16 + 84 * g(4); i < g(12); i++) { names.push(text(c, q + 4, g(q))); q += 4 + ((g(q) + 3) & ~3); }
  for (let i = 0; i < g(4); i++) {
    const q = 16 + 84 * i, t = g(q + 20), nt = g(q + 24);
    console.log(`batch ${name} ${i} ${g(q)} ${g(q + 12)} ${g(q + 16)} ${t < 0 ? '-' : names[t]} ${nt < 0 ? '-' : names[nt]}`);
  }
}
const camera = new Camera();
camera.far = 5000;
const d = defaults3D('desktop');
d.budget = 0;
function tris(w: World, x: number, z: number, sectors: boolean): i32 {
  camera.setPosition(x, 40, z).lookAt(100, 0, 100);
  w.sectors = sectors;
  for (let n = 0; n < 6; n++) { w.select(camera, 1.5, [], 0.016); w.serve(1000); }
  w.select(camera, 1.5, [], 0.016);
  return w.triangles;
}
const near = new World('w/city.zworld', d);
near.nearReach = 5000; near.midReach = 6000;
const mid = new World('w/city.zworld', d);
mid.nearReach = 1; mid.midReach = 6000;
const far = new World('w/city.zworld', d);
far.nearReach = 1; far.midReach = 2;
console.log(`levels ${tris(near, 100, -150, false)} ${tris(mid, 100, -150, false)} ${tris(far, 100, -150, false)}`);
console.log(`sectors ${tris(near, 100, -150, true)}`);
TS
ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/p" >"$tmp/out" 2>&1 || { echo "zinc3d_world_build: the run failed: $(tail -3 "$tmp/out")"; exit 1; }
"$ZINC" assets build "$tmp/p" --target psp >"$tmp/psp" 2>&1 || { echo "zinc3d_world_build: the PSP's build failed: $(tail -3 "$tmp/psp")"; exit 1; }
mkdir "$tmp/q" && cp -R "$tmp/p/zinc.json" "$tmp/p/src" "$tmp/p/assets" "$tmp/q/"
sed -i.bak 's/"block": 2,/"block": 2, "region": 1,/' "$tmp/q/zinc.json"
"$ZINC" assets build "$tmp/q" >"$tmp/region" 2>&1 || { echo "zinc3d_world_build: the build with regions failed: $(tail -3 "$tmp/region")"; exit 1; }
python3 -I - "$tmp/out" "$tmp/p/build/assets" "$tmp/q/build/assets" <<'PY'
import glob, json, re, struct, sys
out = open(sys.argv[1]).read()
fail = []
m = re.search(r'index (\d+) cells (\d+) chunks', out)
# 16 cells of 50 m (the ground spans them all) and the tower's; a far chunk, 4 mid chunks (2 x 2 cells), 16 near chunks, the tower's 3
if not m or (m.group(1), m.group(2)) != ('17', '24'): fail.append('the index: %s' % (m.group(0) if m else 'none'))
r = re.search(r'reach (\d+) (\d+)', out)
if not r or [struct.unpack('<f', struct.pack('<I', int(x)))[0] for x in r.groups()] != [300, 900]: fail.append('the tower cell reach: %s' % (r and r.group(0)))
batch = {(k, int(i)): (int(kind), int(e), int(ne), t, nt) for k, i, kind, e, ne, t, nt in re.findall(r'batch (\S+) (\d+) (\d+) (-?\d+) (-?\d+) (\S+) (\S+)', out)}
kindOf = lambda node: {batch.get((k, b), (None,))[0] for c, l, k, b in src.get(node, {}).get('in', []) if l == 0}
prov = json.loads(out[out.index('{"version"'):out.index('\n]}') + 3])
src = {s['node']: s for s in prov['sources']}
if prov['cells'] != 17 or prov['cell'] != 50: fail.append('provenance: %d cells of %s m' % (prov['cells'], prov['cell']))
if src.get('ground', {}).get('id') != 'ground-id' or len({c for c, l, k, b in src['ground']['in'] if l == 0}) != 16: fail.append('the ground is not in its 16 cells at the near level')
if kindOf('pad') != {0} or kindOf('b4') != {1}: fail.append('the pad is not a top or the textured box not a wall: %s %s' % (kindOf('pad'), kindOf('b4')))
glow = {batch.get((k, b)) for c, l, k, b in src.get('b7', {}).get('in', []) if l == 0}
if glow != {(2, 0, 0xff8000, '-', 'night.png')}: fail.append('b7 night glow and picture: %s' % glow)
tower = {(c, k) for c, l, k, b in src.get('tower', {}).get('in', [])}
if tower != {(16, 'city.l0.near.zwc'), (16, 'city.l0.mid.zwc'), (16, 'city.l0.far.zwc')}: fail.append('the tower: %s' % tower)
b0 = src.get('b0', {}).get('in', [])
# b0: its near level in its cell's chunk; its _LOD1 the mid level, and the far one simplified from it
if [(c, l, k) for c, l, k, b in b0] != [(0, 0, 'city.c0.near.zwc')]: fail.append('b0: %s' % b0)
low = src.get('b0_LOD1', {})
if low.get('level') != 1 or sorted((l, k) for c, l, k, b in low['in']) != [(1, 'city.b0_0.mid.zwc'), (2, 'city.far.zwc')]: fail.append('b0_LOD1: %s' % low)
lv = re.search(r'levels (\d+) (\d+) (\d+)', out); sec = re.search(r'sectors (\d+)', out)
n, mi, fa = (int(x) for x in lv.groups()) if lv else (0, 0, 0)
# near: the ground's 2048, the boxes' 10 each, the pad's 2 and the tower's 10; mid and far: the ground simplified, b0 its LOD1
if not (n == 2048 + 90 + 2 + 10 and 0 < fa <= mi < n // 2): fail.append('levels near %d mid %d far %d' % (n, mi, fa))
s = int(sec.group(1)) if sec else 0
if not (2048 < s < n): fail.append('with sectors %d triangles (without %d)' % (s, n))
mac = glob.glob(sys.argv[2] + '/macos/*.zpk') + glob.glob(sys.argv[2] + '/linux/*.zpk')
pk = b''.join(open(p, 'rb').read() for p in mac)
for name in (b'w/city.zworld', b'w/city.far.zwc', b'w/city.b1_1.mid.zwc', b'w/city.c15.near.zwc', b'w/city.zworld.json', b'w/city.0.png'):
    if name not in pk: fail.append('the pack has no %s' % name.decode())
rep = json.load(open((glob.glob(sys.argv[2] + '/macos/report.json') + glob.glob(sys.argv[2] + '/linux/report.json'))[0]))
if [a['name'] for a in rep['assets']] != ['w/city.gltf', 'w/night.png'] or rep['assets'][0]['importer'] != 'world': fail.append('the assets: %s (the .bin copied?)' % rep['assets'])
psp = b''.join(open(p, 'rb').read() for p in glob.glob(sys.argv[2] + '/psp/*.zpk'))
if b'near.zwc' in psp or b'w/city.b0_0.mid.zwc' not in psp: fail.append('the PSP carries the near level, or no mid one')
reg = b''.join(open(p, 'rb').read() for p in glob.glob(sys.argv[3] + '/*/*.zpk'))
if not all(b'w/city.f%d_%d.far.zwc' % (x, z) in reg for x in (0, 1) for z in (0, 1)) or b'w/city.far.zwc' in reg: fail.append('"region": 1 did not write a far chunk per block')
for f in fail: print('zinc3d_world_build: ' + f)
sys.exit(1 if fail else 0)
PY
[ $? -eq 0 ] || { tail -n 30 "$tmp/out"; exit 1; }
echo "zinc3d_world_build: ok"
