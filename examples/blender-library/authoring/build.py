"""Build and publish the actual Blender library project, without downloaded art."""
import bpy
import json
import math
from mathutils import Matrix, Vector
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'integrations/blender'))
from zinc_scene import publish_scene

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Lantern Library'
scene['zinc_id'] = 'lantern-library'
scene.render.resolution_x = 960
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.use_nodes = True
    value.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*color, 1)
    return value


EARTH = material('Moss', (.22, .36, .29))
PLASTER = material('Warm plaster', (.73, .57, .35))
ROOF = material('Terracotta', (.42, .19, .15))
WOOD = material('Walnut', (.20, .12, .08))
LEAF = material('Pine', (.12, .28, .21))
GOLD = material('Lantern brass', (.98, .65, .15))


def mark(obj, key):
    obj['zinc_id'] = key
    if obj.type == 'MESH':
        obj.data['zinc_asset_id'] = 'mesh-' + key
    return obj


def move_to(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def box(key, size, position, color, collection):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = key
    obj.data.transform(Matrix.Diagonal((*size, 1)))
    obj.location = position
    obj.data.materials.append(color)
    move_to(obj, collection)
    return mark(obj, key)


def empty(key, position, collection, instance=None, metadata=None):
    obj = bpy.data.objects.new(key, None)
    collection.objects.link(obj)
    obj.location = position
    mark(obj, key)
    if instance:
        obj.instance_type = 'COLLECTION'
        obj.instance_collection = instance
    if metadata:
        obj['zinc_metadata'] = json.dumps(metadata)
    return obj


lantern = bpy.data.collections.new('Library - lantern')
box('lantern-post', (.12, .12, 1.6), (0, 0, .8), WOOD, lantern)
box('lantern-light', (.32, .32, .40), (0, 0, 1.7), GOLD, lantern)
empty('lantern-socket', (0, 0, 1.9), lantern, metadata={'socket': {'name': 'light'}})

house = bpy.data.collections.new('Library - cottage')
box('cottage-walls', (2, 1.8, 1.8), (0, 0, .9), PLASTER, house)
roof = box('cottage-roof', (2.4, 2.2, .35), (0, 0, 2), ROOF, house)
roof.rotation_euler[1] = .15
box('cottage-door', (.48, .10, 1.05), (0, -0.96, .525), WOOD, house)
empty('cottage-lantern', (1.4, -.8, 0), house, lantern)

square = bpy.data.collections.new('Library - square')
empty('square-west-cottage', (-2.6, 0, 0), square, house)
east = empty('square-east-cottage', (2.6, 0, 0), square, house)
east.rotation_euler[2] = math.pi

world = scene.collection
box('ground', (14, 12, .25), (0, 0, -.2), EARTH, world)
empty('village', (0, 2, 0), world, square)
gate = box('gate', (2.8, .16, .85), (0, -.7, .55), WOOD, world)
gate['zinc_metadata'] = json.dumps({'collision': {'shape': 'box', 'size': [2.8, .85, .16]}, 'gate': {'name': 'courtyard'}})
empty('delivery-trigger', (0, 2, .4), world, metadata={'trigger': {'shape': 'box', 'size': [2, 1, 2], 'event': 'deliver'}})
empty('player-spawn', (0, -3, .2), world, metadata={'spawn': {'name': 'courier'}})
empty('square-lantern', (-3, -2, 0), world, lantern)

bpy.ops.object.camera_add(location=(10, -13, 11))
camera = bpy.context.object
camera.name = 'overview-camera'
mark(camera, 'overview-camera')
camera.rotation_euler = (Vector((0, 1, .6)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 42
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world = bpy.data.worlds.new('Evening')
scene.world.color = (.13, .16, .19)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'library.blend'))
document, changed = publish_scene(scene, HERE.parent / 'assets', 'authoring/library.blend')
print(f"Published {len(document['nodes'])} nodes and {len(document['assets'])} shared meshes: {document['revision']}")
scene.render.filepath = str(HERE / 'blender-preview.png')
bpy.ops.render.render(write_still=True)
