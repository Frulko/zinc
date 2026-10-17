"""The 3D art of examples/marble, adapted from Kenney's kits (CC0) in Blender, headless:

    blender -b --factory-startup -P build.py -- <kits dir> [--no-render]

<kits dir> holds the three kits unzipped (fetch.sh): marble/, platformer/, nature/. For every piece of PIECES this script imports
the kit's GLB (or builds the piece: floor tops, the hole, the goal ring, the sky), bakes its colours into vertex colours (Kenney's
palette texture sampled at each corner's uv, or a material's base colour), and exports two GLBs without any texture:

    models/high/<piece>.glb   the kit's geometry as it is (desktop, Vita)
    models/low/<piece>.glb    decimated to the piece's low budget, flat shaded (PSP, PS2, 3DS)

then models/models.json (the manifest the game reads), preview/course.json (a sample course assembled from the pieces, the input of
the zinc:3d viewer) and preview/course-blender.png (that course rendered by Eevee). Units: glTF's, +Y up; one tile is 1 unit, one
height level 0.5 (Kenney's low block). Yaw 0 puts an edge piece on the cell's south edge (+Z); yaw 90 east (+X), 180 north, 270 west.
"""
import bpy
import bmesh
import json
import math
import os
import sys

import numpy as np
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KITS = argv[0] if argv else '/tmp/kenney'
RENDER = '--no-render' not in argv
LEVEL = 0.5

KIT_DIR = {'platformer': 'platformer/Models/GLB format', 'marble': 'marble/Models/GLB format', 'nature': 'nature/Models/GLTF format'}
KIT_URL = {'platformer': 'https://kenney.nl/assets/platformer-kit', 'marble': 'https://kenney.nl/assets/marble-kit', 'nature': 'https://kenney.nl/assets/nature-kit'}

# Kenney colours used by the built pieces: sRGB, sampled from the platformer kit's palette (Models/GLB format/Textures/colormap.png).
GRASS = (0.38, 0.80, 0.55)       # replaced at run time by the grass block's top colour
DIRT = (0.67, 0.37, 0.25)        # and its dirt's
RECOLOUR = {'grass': lambda: GRASS, 'dirt': lambda: DIRT}   # the nature kit's materials of these names, in the platformer kit's colours


# ---------------------------------------------------------------- helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mats():
    """The three materials every piece uses; the exporter reads them as: lit vertex colours, unlit vertex colours, blended glass."""
    out = {}
    for kind in ('lit', 'unlit', 'glass'):
        m = bpy.data.materials.get(kind) or bpy.data.materials.new(kind)
        m.use_backface_culling = kind == 'lit'   # the sky is seen from inside, the glass from both sides
        nt = m.node_tree
        nt.nodes.clear()
        o = nt.nodes.new('ShaderNodeOutputMaterial')
        v = nt.nodes.new('ShaderNodeVertexColor')
        v.layer_name = 'Color'
        if kind == 'unlit':
            nt.links.new(v.outputs['Color'], o.inputs['Surface'])
        else:
            b = nt.nodes.new('ShaderNodeBsdfPrincipled')
            nt.links.new(v.outputs['Color'], b.inputs['Base Color'])
            b.inputs['Roughness'].default_value = 0.1 if kind == 'glass' else 0.8
            if kind == 'glass':
                b.inputs['Alpha'].default_value = 0.35
                m.surface_render_method = 'BLENDED'
            nt.links.new(b.outputs['BSDF'], o.inputs['Surface'])
        out[kind] = m
    return out


_palettes = {}


def palette(img):
    if img.filepath not in _palettes:
        w, h = img.size
        a = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(a)                     # an 8-bit PNG: the stored sRGB bytes / 255, rows from the bottom
        _palettes[img.filepath] = a.reshape(h, w, 4)
    return _palettes[img.filepath]


def corner_colours(me):
    """sRGB colour of every corner: the palette texel under its uv, else the material's base colour."""
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    out = np.ones((len(me.loops), 4), dtype=np.float32)
    for p in me.polygons:
        m = me.materials[p.material_index] if me.materials else None
        img, base = None, (0.8, 0.8, 0.8, 1)
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    img = n.image
                if n.type == 'BSDF_PRINCIPLED':
                    base = n.inputs['Base Color'].default_value
        for li in p.loop_indices:
            if img is not None and uv is not None:
                pal = palette(img)
                h, w = pal.shape[:2]
                u, v = uv[li].uv
                out[li, :3] = pal[min(h - 1, max(0, int((v % 1) * h))), min(w - 1, max(0, int((u % 1) * w))), :3]
            else:   # Kenney writes sRGB values in baseColorFactor; the nature kit's grass and dirt take the platformer kit's
                name = m.name.split('.')[0] if m else ''
                out[li, :3] = RECOLOUR[name]() if name in RECOLOUR else base[:3]
    return out


def bake(obj, glass_names=('glass',)):
    """Vertex colours from the kit's materials, then our materials (lit, or glass for the marble's shell)."""
    me = obj.data
    col = corner_colours(me)
    glass = [bool(me.materials and me.materials[p.material_index] and me.materials[p.material_index].name.split('.')[0] in glass_names) for p in me.polygons]
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', col.ravel())
    M = mats()
    me.materials.clear()
    me.materials.append(M['lit'])
    me.materials.append(M['glass'])
    for p, g in zip(me.polygons, glass):
        p.material_index = 1 if g else 0
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])


def import_kit(kit, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KITS, KIT_DIR[kit], name + '.glb'))
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in objs:   # the kit's node transforms go into the vertices
        w = o.matrix_world.copy()
        o.data = o.data.copy()
        o.data.transform(w)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
        bake(o)
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
        bpy.data.objects.remove(o)   # the kit's empties
    return join(objs)


def join(objs):
    if len(objs) == 1:
        return objs[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return objs[0]


def new_object(name, verts, faces, colours, material='lit'):
    """A mesh from lists: faces of vertex indices, colours one sRGB triple per face corner (or per face when it is a triple)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ca = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
    flat = []
    for f, c in zip(faces, colours):
        cs = c if isinstance(c[0], (tuple, list)) else [c] * len(f)
        for x in cs:
            flat += [x[0], x[1], x[2], 1.0]
    ca.data.foreach_set('color', flat)
    me.materials.append(mats()[material])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def transform(o, scale=(1, 1, 1), turns=0, move=(0, 0, 0)):
    m = Matrix.Translation(move) @ Matrix.Rotation(turns * math.pi / 2, 4, 'Z') @ Matrix.Diagonal((*scale, 1))
    o.data.transform(m)
    return o


def keep_faces(o, pred):
    """Deletes the faces whose (normal, centre) fail pred."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not pred(f.normal, f.calc_center_median())], context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    return o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def bounds(o):
    a = np.array([v.co for v in o.data.vertices])
    return a.min(0), a.max(0)


def decimate(o, target):
    """The low variant: coplanar faces merged, then collapsed to about `target` triangles, flat shaded (the kit's look); then every
    corner takes again the colour of the kit's surface nearest to it (the decimator blends colours across faces of different colours)."""
    if tris(o) <= target:
        return o
    src = bmesh.new()
    src.from_mesh(o.data)
    src.faces.ensure_lookup_table()
    layer = src.loops.layers.float_color['Color']
    bvh = BVHTree.FromBMesh(src)
    for kind in ('DISSOLVE', 'COLLAPSE'):
        n = tris(o)
        if n <= target:
            break
        md = o.modifiers.new('d', 'DECIMATE')
        md.decimate_type = kind
        if kind == 'DISSOLVE':
            md.angle_limit = math.radians(2)
            md.delimit = {'MATERIAL'}
        else:
            md.ratio = target / n
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=md.name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    me = o.data
    col = np.ones((len(me.loops), 4), dtype=np.float32)
    for p in me.polygons:
        centre = p.center
        for li, vi in zip(p.loop_indices, p.vertices):
            q = me.vertices[vi].co * 0.7 + centre * 0.3        # inside the face: the nearest kit face is this face's, not a neighbour's
            hit = bvh.find_nearest(q)
            f = src.faces[hit[2]]
            near = min(f.loops, key=lambda l: (l.vert.co - q).length)
            col[li] = near[layer]
        p.use_smooth = False
    me.color_attributes['Color'].data.foreach_set('color', col.ravel())
    src.free()
    return o


# ---------------------------------------------------------------- built pieces (Kenney's colours, our geometry)
def top_colour(kit, name):
    o = import_kit(kit, name)
    me = o.data
    col = np.array([c.color[:3] for c in me.color_attributes['Color'].data])
    ups = [li for p in me.polygons if p.normal.z > 0.9 for li in p.loop_indices]
    c = tuple(float(x) for x in col[ups].mean(0))
    bpy.data.objects.remove(o)
    return c


def floor_top(name, colour, variant):
    """A tile's top: a square at the cell's floor height (Kenney's block top is a rounded square; square tops meet without gaps)."""
    return new_object(name, [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [(0, 1, 2, 3)], [colour])


def hole(name, variant):
    """A tile with a round hole: the grass top around it and a dirt wall one level deep inside it."""
    n = 16 if variant == 'high' else 8
    r = 0.3
    verts, faces, cols = [], [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        d = 0.5 / max(abs(math.cos(a)), abs(math.sin(a)))   # the square's edge at that angle
        verts += [(d * math.cos(a), d * math.sin(a), 0), (r * math.cos(a), r * math.sin(a), 0), (r * math.cos(a), r * math.sin(a), -LEVEL)]
    dark = tuple(c * 0.35 for c in DIRT)
    for i in range(n):
        j = (i + 1) % n
        faces.append((3 * i, 3 * j, 3 * j + 1, 3 * i + 1))
        cols.append(GRASS)
        faces.append((3 * i + 1, 3 * j + 1, 3 * j + 2, 3 * i + 2))
        cols.append([DIRT, DIRT, dark, dark])
    return new_object(name, verts, faces, cols)


def ring(name, variant):
    """The goal ring: an upright torus facing north-south, unlit gold, drawn blended (the one translucent draw of the scene)."""
    seg, sides = (32, 8) if variant == 'high' else (16, 4)
    R, r, cz = 0.42, 0.05, 0.6
    verts, faces, cols = [], [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(sides):
            b = 2 * math.pi * j / sides
            x, z = (R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a)
            verts.append((x, r * math.sin(b), cz + z))
    for i in range(seg):
        for j in range(sides):
            a, b = i * sides + j, ((i + 1) % seg) * sides + j
            c, d = ((i + 1) % seg) * sides + (j + 1) % sides, i * sides + (j + 1) % sides
            faces.append((a, d, c, b))
            cols.append((1.0, 0.82, 0.25))
    o = new_object(name, verts, faces, cols, 'glass')
    o.data.materials[0] = mats()['glass']
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def sky(name, variant):
    """A sphere seen from inside: Kenney-blue zenith, pale horizon, a softer blue under the board. Unlit vertex colours, no texture."""
    seg, rings = (24, 12) if variant == 'high' else (12, 6)
    R = 60.0
    stops = [(-1.0, (0.55, 0.66, 0.86)), (0.0, (0.93, 0.96, 1.0)), (0.35, (0.66, 0.82, 0.97)), (1.0, (0.36, 0.60, 0.92))]

    def grad(y):
        for (y0, c0), (y1, c1) in zip(stops, stops[1:]):
            if y <= y1:
                t = (y - y0) / (y1 - y0)
                return tuple(a + (b - a) * t for a, b in zip(c0, c1))
        return stops[-1][1]
    verts, faces, cols = [(0, 0, -R)], [], []
    for k in range(1, rings):
        el = -math.pi / 2 + math.pi * k / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg
            verts.append((R * math.cos(el) * math.cos(a), R * math.cos(el) * math.sin(a), R * math.sin(el)))
    verts.append((0, 0, R))
    top = len(verts) - 1
    ring_at = lambda k, i: 1 + (k - 1) * seg + i % seg
    colour = lambda vi: grad(verts[vi][2] / R)
    for i in range(seg):   # inward faces: clockwise seen from outside
        f = (0, ring_at(1, i), ring_at(1, i + 1))
        faces.append(f)
        f2 = (top, ring_at(rings - 1, i + 1), ring_at(rings - 1, i))
        faces.append(f2)
    for k in range(1, rings - 1):
        for i in range(seg):
            faces.append((ring_at(k, i), ring_at(k + 1, i), ring_at(k + 1, i + 1), ring_at(k, i + 1)))
    cols = [[colour(v) for v in f] for f in faces]
    o = new_object(name, verts, faces, cols, 'unlit')
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def backdrop(name, variant):
    """Floating grass islands with trees on a ring around the course, below it: Kenney's tall blocks scaled up, one mesh."""
    rnd = np.random.RandomState(7)
    parts = []
    count = 9 if variant == 'high' else 6
    for i in range(count):
        a = 2 * math.pi * (i + rnd.rand() * 0.4) / count
        d = 36 + rnd.rand() * 12
        s = 1.5 + rnd.rand() * 1.5
        x, y, z = d * math.cos(a), d * math.sin(a), -12 - rnd.rand() * 6
        b = transform(import_kit('platformer', 'block-grass-large-tall'), (s, s, s), i % 4, (x, y, z))
        parts.append(b)
        if variant == 'high':   # low: the islands alone (a decimated island loses its grass top)
            t = transform(import_kit('platformer', 'tree-pine' if i % 2 else 'tree'), (s, s, s), i % 4, (x + s * 0.4, y - s * 0.3, z + s))
            parts.append(t)
    o = join(parts)
    o.name = name
    return o


# ---------------------------------------------------------------- the pieces
def kit(kitname, file, scale=(1, 1, 1), turns=0, move=(0, 0, 0)):
    return lambda name, variant: transform(import_kit(kitname, file), scale, turns, move)


def side(name, variant):
    """The south face of Kenney's grass block (the grass drips and the dirt): one level of a cell's exposed edge, top at 0. Low: the
    same face as two quads, the grass band over the dirt in the kit's colours (the drips are what a decimator cannot keep)."""
    o = import_kit('platformer', 'block-grass-low')
    keep_faces(o, lambda n, c: n.y < -0.3 and abs(n.z) < 0.7)
    transform(o, move=(0, 0, -LEVEL))
    if variant == 'high':
        return o
    grass, dirt_top, dirt_bottom = band_colours(o)
    bpy.data.objects.remove(o)
    z = -0.2
    return new_object(name, [(-.5, -.5, 0), (.5, -.5, 0), (.5, -.5, z), (-.5, -.5, z), (.5, -.5, -LEVEL), (-.5, -.5, -LEVEL)],
                      [(0, 3, 2, 1), (3, 5, 4, 2)], [grass, [dirt_top, dirt_bottom, dirt_bottom, dirt_top]])


def band_colours(o):
    """The mean colours of a side's grass band, of the top of its dirt and of its bottom."""
    me = o.data
    col = np.array([c.color[:3] for c in me.color_attributes['Color'].data])
    z = np.array([me.vertices[l.vertex_index].co.z for l in me.loops])
    pick = lambda m: tuple(float(x) for x in col[m].mean(0))
    return pick(z > -0.2), pick((z <= -0.2) & (z > -0.4)), pick(z <= -0.45)


def side_dirt(name, variant):
    """The dirt of that face stretched to a whole level: the levels under the top one, so the grass band shows once per edge."""
    o = import_kit('platformer', 'block-grass-low')
    keep_faces(o, lambda n, c: n.y < -0.3 and abs(n.z) < 0.7 and c.z < 0.25)
    top = bounds(o)[1][2]
    transform(o, (1, 1, LEVEL / top), 0, (0, 0, -LEVEL))
    if variant == 'high':
        return o
    me = o.data
    col = np.array([c.color[:3] for c in me.color_attributes['Color'].data])
    z = np.array([me.vertices[l.vertex_index].co.z for l in me.loops])
    hi, lo = tuple(float(x) for x in col[z > -0.1].mean(0)), tuple(float(x) for x in col[z < -0.4].mean(0))
    bpy.data.objects.remove(o)
    return new_object(name, [(-.5, -.5, 0), (.5, -.5, 0), (.5, -.5, -LEVEL), (-.5, -.5, -LEVEL)], [(0, 3, 2, 1)], [[hi, lo, lo, hi]])


def oriented(kitname, file, want, scale=(1, 1, 1), move=(0, 0, 0)):
    """A kit piece turned by quarter turns until its centroid lies in the quadrant `want` (signs of x and y, Blender axes)."""
    def make(name, variant):
        o = import_kit(kitname, file)
        for t in range(4):
            c = np.array([v.co for v in o.data.vertices]).mean(0)
            if np.sign(c[0]) * want[0] >= 0 and np.sign(c[1]) * want[1] >= 0:
                break
            transform(o, turns=1)
        return transform(o, scale, 0, move)
    return make


def rising(file, cells):
    """A kit slope turned to rise north (-Z), its low end on the pivot cell, scaled so its surface climbs one level over `cells` cells:
    a line fitted through the sloped faces' corners gives the surface's height at the two ends of the footprint."""
    o = import_kit('platformer', file)

    def fit():
        pts = np.array([o.data.vertices[v].co for p in o.data.polygons if 0.3 < p.normal.z < 0.98 for v in p.vertices])
        b, a = np.polyfit(pts[:, 1], pts[:, 2], 1)
        return a, b
    if fit()[1] < 0:
        transform(o, turns=2)
    a, b = fit()
    z_low, z_high = a - b * cells / 2, a + b * cells / 2
    k = LEVEL / (z_high - z_low)
    transform(o, (1, 1, k), 0, (0, (cells - 1) / 2, -z_low * k))
    return o


def marble(file):
    return lambda name, variant: import_kit('marble', file.replace('*', 'high' if variant == 'high' else 'low'))


GRASS_ALT = None
PIECES = {
    # name: (builder, low triangle target or None to keep, size in tiles (x, z), pivot, what it is)
    'floor':        (lambda n, v: floor_top(n, GRASS, v), None, (1, 1), 'cell centre, top at 0', 'grass tile top (Kenney grass colour)'),
    'floor_alt':    (lambda n, v: floor_top(n, GRASS_ALT, v), None, (1, 1), 'cell centre, top at 0', 'lighter grass top: alternate with floor for a checker'),
    'floor_start':  (lambda n, v: floor_top(n, SNOW, v), None, (1, 1), 'cell centre, top at 0', 'start pad (Kenney snow top colour)'),
    'floor_goal':   (lambda n, v: floor_top(n, GOLD, v), None, (1, 1), 'cell centre, top at 0', 'goal pad (Kenney moving-block gold)'),
    'side_dirt':    (side_dirt, None, (1, 0), 'cell centre; covers y -0.5..0 on the +Z edge', 'a level of bare dirt under side (Platformer block-grass-low, stretched)'),
    'side':         (side, None, (1, 0), 'cell centre; covers y -0.5..0 on the +Z edge', 'one level of exposed cell edge: grass drips over dirt (Platformer block-grass-low)'),
    'hole':         (hole, None, (1, 1), 'cell centre, top at 0', 'tile with a round hole r 0.3, one level deep'),
    'ramp':         (lambda n, v: rising('block-grass-large-slope-narrow', 2), 24, (1, 2), 'centre of the low cell at its floor; rises 0.5 to the cell at -Z', 'grass slope (Platformer block-grass-large-slope-narrow)'),
    'ramp_short':   (lambda n, v: rising('platform-ramp', 1), 24, (1, 1), 'cell centre at its floor', 'wooden ramp, one level over one cell (Platformer platform-ramp)'),
    'fence':        (kit('platformer', 'fence-low-straight'), 20, (1, 0), 'cell centre; on the +Z edge', 'low wooden rail (Platformer fence-low-straight)'),
    'fence_corner': (oriented('platformer', 'fence-low-corner', (-1, -1)), 30, (1, 1), 'cell centre; on the +Z and -X edges', 'rail corner (Platformer fence-low-corner)'),
    'hedge':        (kit('platformer', 'hedge'), 20, (1, 0), 'cell centre; on the +Z edge', 'hedge wall (Platformer hedge)'),
    'hedge_corner': (oriented('platformer', 'hedge-corner', (-1, -1)), 30, (1, 1), 'cell centre; on the +Z and -X edges', 'hedge corner (Platformer hedge-corner)'),
    'bumper':       (kit('platformer', 'spring'), 60, (1, 1), 'cell centre at its floor', 'spring bumper (Platformer spring)'),
    'platform':     (kit('platformer', 'block-moving', move=(0, 0, -0.3)), 24, (1, 1), 'cell centre, top at 0', 'moving platform, rigid (Platformer block-moving)'),
    'marble':       (marble('marble-center-butterfly-*'), None, (0.4, 0.4), 'sphere centre, radius 0.2', 'the marble: glass shell (blended) over a coloured core (Marble Kit marble-center-butterfly-high / -low)'),
    'gem':          (kit('platformer', 'jewel'), None, (0.34, 0.28), 'base centre (y 0..0.37)', 'collectible (Platformer jewel)'),
    'goal_gate':    (kit('marble', 'banner-high'), 40, (1, 0), 'cell centre at its floor; spans x, faces z', 'finish banner (Marble Kit banner-high)'),
    'goal_flag':    (kit('platformer', 'flag'), 40, (0.4, 0.1), 'pole base', 'flag (Platformer flag)'),
    'goal_ring':    (ring, None, (1, 0), 'cell centre at its floor; ring centre at y 0.6', 'translucent gold ring, blended'),
    'tree':         (kit('platformer', 'tree'), 160, (1, 1), 'trunk base', 'round tree (Platformer tree)'),
    'tree_pine':    (kit('platformer', 'tree-pine'), 120, (1, 1), 'trunk base', 'pine (Platformer tree-pine)'),
    'tree_small':   (kit('platformer', 'tree-pine-small'), 100, (0.7, 0.7), 'trunk base', 'small pine (Platformer tree-pine-small)'),
    'flowers':      (kit('platformer', 'flowers'), 40, (0.8, 0.8), 'base centre', 'flower patch (Platformer flowers)'),
    'grass_tuft':   (kit('platformer', 'grass'), 24, (0.5, 0.5), 'base centre', 'grass tuft (Platformer grass)'),
    'rocks':        (kit('platformer', 'rocks'), 30, (0.7, 0.7), 'base centre', 'rocks (Platformer rocks)'),
    'mushrooms':    (kit('platformer', 'mushrooms'), 36, (0.5, 0.5), 'base centre', 'mushrooms (Platformer mushrooms)'),
    'crate':        (kit('platformer', 'crate'), 24, (0.5, 0.5), 'base centre', 'crate (Platformer crate)'),
    'barrel':       (kit('platformer', 'barrel'), 40, (0.5, 0.5), 'base centre', 'barrel (Platformer barrel)'),
    'sign':         (kit('platformer', 'arrow'), 30, (0.5, 0.2), 'post base; arrow points +X', 'arrow sign (Platformer arrow)'),
    'pillar':       (kit('nature', 'statue_column', (1.6, 1.6, 1.6), move=(0, 0, 0.08)), 40, (0.5, 0.5), 'base centre', 'stone column (Nature Kit statue_column)'),
    'potted_plant': (lambda n, v: join([kit('nature', 'pot_large', (1.4, 1.4, 1.4), move=(0, 0, 0.07))(n, v),
                                        kit('nature', 'plant_bushLarge', (1.8, 1.8, 1.8), move=(0, 0, 0.26))(n, v)]), 50, (0.8, 0.7), 'base centre', 'potted bush (Nature Kit pot_large + plant_bushLarge)'),
    'rock_tall':    (kit('nature', 'rock_tallA', (1.2, 1.2, 1.2), move=(0, 0, 0.06)), 50, (1.2, 0.8), 'base centre', 'tall rock (Nature Kit rock_tallA)'),
    'sky':          (sky, None, (120, 120), 'centre: keep it on the camera', 'sky sphere, unlit vertex colours, radius 60'),
    'backdrop':     (backdrop, None, (80, 80), 'course centre', 'floating grass islands around and below the course (Platformer block-grass-large-tall; high: with trees), one mesh'),
}


def build(variant):
    out = {}
    for name, (make, low, *_rest) in PIECES.items():
        o = make(name, variant)
        o.name = name
        if variant == 'low' and low is not None:
            decimate(o, low)
        out[name] = o
    return out


def export(objs, variant):
    d = os.path.join(ASSETS, 'models', variant)
    os.makedirs(d, exist_ok=True)
    # The scene's name differs per variant, so a piece the same in both (floor, gem) is not one file twice: zinc's model importer caches
    # a bundle by its bytes with the first file's entry name in it, and two identical GLBs would give one pack two entries of that name.
    bpy.context.scene.name = 'marble-' + variant
    for name, o in objs.items():
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(d, name + '.glb'), export_format='GLB', use_selection=True, export_vertex_color='ACTIVE',
                                  export_all_vertex_colors=False, export_materials='EXPORT', export_image_format='NONE', export_yup=True, export_apply=True,
                                  export_extras=False, export_cameras=False, export_lights=False)


# ---------------------------------------------------------------- the sample course (an IntGrid: rows run +Z, south; columns +X)
# Heights: '.' void, 0-3 a floor at that level, a-d a moving platform at level 0-3 over the void.
# Objects: S start, G goal (gate, ring before it, flag beside it), g gem, B bumper, O hole, R ramp (its low cell; '^' marks its high
# cell), Q short ramp; fences and hedges go on the void edges by themselves; then decor: t tree, p pine, s small pine, f flowers, w grass tuft, r rocks, m mushrooms, c crate,
# k barrel, a sign, u pillar, n potted plant, T tall rock.
HEIGHTS = [
    "...222222...",
    "...222222...",
    "...222222...",
    "......1.....",
    "..11111111..",
    "..11111111..",
    "..11....11..",
    "..11bb..11..",
    "..11....11..",
    "..11111111..",
    "....0000....",
    "...000000...",
    "...000000...",
    "...000000...",
]
OBJECTS = [
    "...u.gG..u..",
    "...t.g..ps..",
    "...n.g..fk..",
    "......^.....",
    "..p..gR..g..",
    "..w.g.B..t..",
    "..f......c..",
    "..O.....gO..",
    "..k......w..",
    "..m.g..g.r..",
    "....Q.......",
    "...a.gg..T..",
    "...cw..g.n..",
    "...u.S..f...",
]


def course():
    H, W = len(HEIGHTS), len(HEIGHTS[0])
    lvl = lambda r, c: (int(HEIGHTS[r][c]) if HEIGHTS[r][c].isdigit() else -1) if 0 <= r < H and 0 <= c < W else -1
    obj = lambda r, c: OBJECTS[r][c] if 0 <= r < H and 0 <= c < W else '.'
    place = []

    def put(piece, c, r, level, yaw=0, dx=0.0, dz=0.0, dy=0.0):
        place.append({'piece': piece, 'x': round(c - W / 2 + 0.5 + dx, 3), 'y': round(level * LEVEL + dy, 3), 'z': round(r - H / 2 + 0.5 + dz, 3), 'yaw': yaw})
    dirs = [(0, 1, 0), (1, 0, 90), (0, -1, 180), (-1, 0, 270)]   # (dc, dr, yaw): south (+Z), east, north, west
    for r in range(H):
        for c in range(W):
            h, o = HEIGHTS[r][c], obj(r, c)
            if h in 'abcd':
                put('platform', c, r, 'abcd'.index(h))
                continue
            if not h.isdigit():
                continue
            L = int(h)
            if o == 'O':
                put('hole', c, r, L)
            elif o == 'S':
                put('floor_start', c, r, L)
            elif o == 'G':
                put('floor_goal', c, r, L)
            elif o not in 'RQ^':
                put('floor' if (r + c) % 2 == 0 else 'floor_alt', c, r, L)
            for dc, dr, yaw in dirs:   # exposed edges: one side piece per level down to the neighbour (the void: down to level -1)
                n = lvl(r + dr, c + dc)   # a platform's cell is void here
                for k in range(L, n, -1):
                    put('side' if k == L else 'side_dirt', c, r, k, yaw)
            if o == 'R':
                put('ramp', c, r, L)
            if o == 'Q':
                put('ramp_short', c, r, L)
            if o == 'g':
                put('gem', c, r, L, dy=0.15)
            if o == 'B':
                put('bumper', c, r, L)
            if o == 'G':
                put('goal_gate', c, r, L)
                put('goal_ring', c, r + 1, L)
                put('goal_flag', c + 1, r, L, dx=0.2)
            if o == 'S':
                put('marble', c, r, L, dy=0.2)
            deco = {'t': 'tree', 'p': 'tree_pine', 's': 'tree_small', 'f': 'flowers', 'w': 'grass_tuft', 'r': 'rocks', 'm': 'mushrooms', 'c': 'crate',
                    'k': 'barrel', 'a': 'sign', 'u': 'pillar', 'n': 'potted_plant', 'T': 'rock_tall'}
            if o in deco:
                put(deco[o], c, r, L, yaw=90 * ((r * 7 + c * 3) % 4))
    # rails: fences along the void edges of the middle level, hedges around the start area
    for r in range(H):
        for c in range(W):
            if not HEIGHTS[r][c].isdigit():
                continue
            L = int(HEIGHTS[r][c])
            for dc, dr, yaw in dirs:
                if lvl(r + dr, c + dc) == -1 and obj(r + dr, c + dc) == '.' and not (0 <= r + dr < H and 0 <= c + dc < W and HEIGHTS[r + dr][c + dc] in 'abcd'):
                    if obj(r, c) in 'RQ^SG' or (dr == -1 and obj(r - 1, c) == '^'):
                        continue
                    put('hedge' if L == 0 else 'fence', c, r, L, yaw)
    put('sky', W / 2 - 0.5, H / 2 - 0.5, 0)
    put('backdrop', W / 2 - 0.5, H / 2 - 0.5, 0)
    return {'width': W, 'height': H, 'tile': 1.0, 'level': LEVEL, 'heights': HEIGHTS, 'objects': OBJECTS, 'placements': place}


# ---------------------------------------------------------------- preview render
def render(objs, placements, path, eye=(7.5, -11.5, 9.0), at=(0, 0.5, 0.2), ortho=0.0, labels=False):
    """Eevee picture of the placements (glTF coordinates) seen from `eye` (Blender coordinates); `ortho` > 0: orthographic, that wide."""
    sc = bpy.context.scene
    for o in objs.values():
        o.hide_render = True
    for i, p in enumerate(placements):
        src = objs[p['piece']]
        o = bpy.data.objects.new('%s.%d' % (p['piece'], i), src.data)
        o.location = (p['x'], -p['z'], p['y'])     # glTF (x, y, z) -> Blender (x, -z, y)
        o.rotation_euler = (0, 0, math.radians(p['yaw']))
        o.visible_shadow = p['piece'] not in ('sky', 'backdrop')
        sc.collection.objects.link(o)
        if labels:
            t = bpy.data.objects.new('label.%d' % i, bpy.data.curves.new('label.%d' % i, 'FONT'))
            t.data.body, t.data.size, t.data.align_x = p['piece'], 0.2, 'CENTER'
            t.location = (p['x'], -p['z'] - 0.75, 0.02)
            sc.collection.objects.link(t)
    # Blender's look of the vertex colours: they are sRGB, Eevee reads them as linear: a gamma node puts that back for the picture only
    for m in mats().values():
        nt = m.node_tree
        v = [n for n in nt.nodes if n.type == 'VERTEX_COLOR'][0]
        g = nt.nodes.new('ShaderNodeGamma')
        g.inputs['Gamma'].default_value = 2.2
        for l in list(v.outputs['Color'].links):
            nt.links.new(g.outputs['Color'], l.to_socket)
        nt.links.new(v.outputs['Color'], g.inputs['Color'])
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
    sc.collection.objects.link(sun)
    world = bpy.data.worlds.new('w')
    world.color = (0.5, 0.6, 0.75)
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.45, 0.55, 0.7, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 30
    if ortho:
        cam.data.type, cam.data.ortho_scale = 'ORTHO', ortho
    cam.location = eye
    sc.collection.objects.link(cam)
    target = bpy.data.objects.new('target', None)
    target.location = at
    sc.collection.objects.link(target)
    c = cam.constraints.new('TRACK_TO')
    c.target = target
    sc.camera = cam
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 960, 544
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    sc.eevee.taa_render_samples = 32
    try:
        sc.eevee.use_shadows = True
    except AttributeError:
        pass
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- main
def main():
    global GRASS, GRASS_ALT, SNOW, GOLD, DIRT
    reset()
    GRASS = top_colour('platformer', 'block-grass-low')
    GRASS_ALT = tuple(min(1.0, c * 0.82 + 0.18) for c in GRASS)
    SNOW = top_colour('platformer', 'block-snow-low')
    GOLD = top_colour('platformer', 'block-moving')
    o = import_kit('platformer', 'block-grass-low')
    me = o.data
    cols = np.array([c.color[:3] for c in me.color_attributes['Color'].data])
    low = [li for p in me.polygons if abs(p.normal.z) < 0.5 and p.center.z < 0.2 for li in p.loop_indices]
    DIRT = tuple(float(x) for x in cols[low].mean(0))
    bpy.data.objects.remove(o)
    manifest = {'units': {'tile': 1.0, 'level': LEVEL, 'up': '+Y', 'south': '+Z',
                          'yaw': 'degrees about +Y; 0: an edge piece on the cell\'s +Z edge, 90: +X, 180: -Z, 270: -X'},
                'materials': 'vertex colours only (sRGB bytes), no texture; parts: lit, unlit (sky), blended (the marble\'s glass, the goal ring)',
                'zinc_json_rule': {'match': 'models/**/*.glb', 'as': 'model', 'format': 'zmesh'},
                'pieces': {}}
    built = {}
    for variant in ('high', 'low'):
        reset()
        built[variant] = build(variant)
        for name, o in built[variant].items():
            lo, hi = bounds(o)
            e = manifest['pieces'].setdefault(name, {})
            e.setdefault('tris', {})[variant] = tris(o)
            if variant == 'high':
                spec = PIECES[name]
                e.update({'file': 'models/{variant}/%s.glb' % name, 'zmesh': 'models/{variant}/%s.zmesh' % name, 'tiles': list(spec[2]),
                          'pivot': spec[3], 'what': spec[4],
                          'bounds': [[round(float(lo[0]), 3), round(float(lo[2]), 3), round(float(-hi[1]), 3)],
                                     [round(float(hi[0]), 3), round(float(hi[2]), 3), round(float(-lo[1]), 3)]]})
        export(built[variant], variant)
        if RENDER:   # a sheet of every piece of this variant with its name
            names = [n for n in PIECES if n not in ('sky', 'backdrop')]
            cols = 8
            sheet = [{'piece': n, 'x': (i % cols - (cols - 1) / 2) * 1.9, 'y': 0.25 if n == 'marble' else 0.5 if n.startswith(('floor', 'side', 'hole', 'platform')) else 0,
                      'z': (i // cols) * 2.7, 'yaw': 0} for i, n in enumerate(names)]
            render(built[variant], sheet, os.path.join(ASSETS, 'preview', 'pieces-%s.png' % variant), eye=(0, -17.4, 11), at=(0, -5.4, 0.6), ortho=17.5, labels=True)
        if variant == 'high':
            course_data = course()
    for variant in ('high', 'low'):
        manifest.setdefault('sample_course', {})[variant] = sum(manifest['pieces'][p['piece']]['tris'][variant] for p in course_data['placements'])
    manifest['sample_course']['placements'] = len(course_data['placements'])
    manifest['sources'] = {k: {'url': KIT_URL[k], 'licence': 'CC0 1.0', 'licence_file': 'models/licences/%s-kit.txt' % k} for k in KIT_URL}
    lic = os.path.join(ASSETS, 'models', 'licences')
    os.makedirs(lic, exist_ok=True)
    for k in KIT_URL:   # Kenney's licence of each kit used, beside the models (CC0: no obligation, kept for the record)
        with open(os.path.join(KITS, k, 'License.txt'), 'rb') as f, open(os.path.join(lic, k + '-kit.txt'), 'wb') as g:
            g.write(f.read().replace(b'\r\n', b'\n') + ('\n\tSource: %s\n' % KIT_URL[k]).encode())
    with open(os.path.join(ASSETS, 'models', 'models.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    os.makedirs(os.path.join(ASSETS, 'preview'), exist_ok=True)
    with open(os.path.join(ASSETS, 'preview', 'course.json'), 'w') as f:
        json.dump(course_data, f, indent=1)
    print('BUILT', json.dumps({n: e['tris'] for n, e in manifest['pieces'].items()}), manifest['sample_course'])
    if RENDER:   # the high pieces of the last build were reset by the low one: build them again for the picture
        reset()
        render(build('high'), course_data['placements'], os.path.join(ASSETS, 'preview', 'course-blender.png'))


main()
