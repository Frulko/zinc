"""Assemble the playable yard from the actual static and animated Blender libraries."""
import bpy
import json
from mathutils import Matrix, Vector
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'integrations/blender'))
from zinc_scene import publish_scene
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'examples/blender-library/authoring/library.blend'))
scene = bpy.context.scene
scene.name = 'Lantern Post'
scene['zinc_id'] = 'lantern-post'
scene.render.resolution_y = 640


def mark(obj, key):
    obj.name = key
    obj['zinc_id'] = key
    if obj.type == 'MESH':
        obj.data['zinc_asset_id'] = 'mesh-' + key
    return obj


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    return mat


NAVY = material('Courier navy', (.12, .24, .32))
CREAM = material('Courier face', (.87, .65, .39))
GOLD = material('Post brass', (.98, .65, .15))


def box(key, size, position, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    mark(obj, key)
    obj.data.transform(Matrix.Diagonal((*size, 1)))
    obj.location = position
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


spawn = bpy.data.objects['player-spawn']
spawn.location.z = 0
spawn['zinc_dynamic'] = True
box('courier-coat', (.40, .26, .60), (0, 0, .5), NAVY, spawn)
box('courier-head', (.30, .28, .28), (0, 0, .94), CREAM, spawn)
box('courier-cap', (.37, .37, .12), (0, 0, 1.11), NAVY, spawn)
box('courier-bag', (.20, .34, .30), (.28, 0, .43), GOLD, spawn)
bpy.data.objects['cottage-walls']['zinc_metadata'] = json.dumps({'collision': {'shape': 'box', 'size': [2, 1.8, 1.8]}})
old = bpy.data.objects.get('delivery-trigger')
bpy.data.objects.remove(old, do_unlink=True)
for name, x, y in [('west', -2.6, .65), ('east', 2.6, .65), ('post', -3, -2)]:
    marker = bpy.data.objects.new('delivery-' + name, None)
    scene.collection.objects.link(marker)
    mark(marker, 'delivery-' + name)
    marker.location = (x, y, .5)
    marker['zinc_metadata'] = json.dumps({'trigger': {'shape': 'box', 'size': [1.2, 1.5, 1.2], 'event': 'delivery:' + name}})
    box('mailbox-' + name, (.28, .24, .25), (x+.5, y, .95), GOLD)

with bpy.data.libraries.load(str(ROOT / 'examples/animation-lab/authoring/companion.blend'), link=True) as (available, loaded):
    loaded.collections = ['Companion']
companion = bpy.data.objects.new('Companion library instance', None)
scene.collection.objects.link(companion)
mark(companion, 'companion')
companion.location = (.7, -3.5, 0)
companion.instance_type = 'COLLECTION'
companion.instance_collection = loaded.collections[0]
loaded.collections[0].library.filepath = '//../../animation-lab/authoring/companion.blend'
companion['zinc_skin'] = json.dumps(dict(id='companion-v1', file='//../../animation-lab/assets/companion.glb',
                                         metadata='//../../animation-lab/assets/companion.animation.json',
                                         source='examples/animation-lab/authoring/companion.blend'))
companion['zinc_metadata'] = json.dumps({'spawn': {'name': 'companion'}})
camera = bpy.data.objects['overview-camera']
camera.location = (9, -12, 13)
camera.rotation_euler = (Vector((0, .3, .2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 38
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'lantern.blend'))
document, changed = publish_scene(scene, HERE.parent / 'assets', 'examples/lantern-post/authoring/lantern.blend')
print(f"Lantern Post: {len(document['nodes'])} authored entities, {len(document['assets'])} assets, skin and markers published atomically")
