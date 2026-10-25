"""Original skinned dog, three baked clips, and explicit event/socket metadata."""
import bpy
import json
import math
from mathutils import Vector
from pathlib import Path

HERE = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
parts = []


def ellipsoid(name, location, scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parts.append(obj)


ellipsoid('Body', (0, 0, .8), (.38, .70, .39))
ellipsoid('Neck', (0, .5, .92), (.29, .34, .34))
ellipsoid('Head', (0, .73, 1.08), (.29, .31, .29))
ellipsoid('Muzzle', (0, 1.0, .99), (.20, .28, .15))
ellipsoid('EarL', (-.23, .67, 1.25), (.12, .16, .25))
ellipsoid('EarR', (.23, .67, 1.25), (.12, .16, .25))
ellipsoid('Tail', (0, -.8, .92), (.12, .38, .13))
for x in (-.26, .26):
    for y in (-.46, .44):
        ellipsoid('Leg', (x, y, .40), (.13, .17, .37))
        ellipsoid('Paw', (x, y+.04, .12), (.15, .23, .12))
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.object
mesh.name = 'CompanionSkin'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
remesh = mesh.modifiers.new('Fuse organic surfaces', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = .085
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth = mesh.modifiers.new('Smooth skin', 'SMOOTH')
smooth.factor = .7
smooth.iterations = 3
bpy.ops.object.modifier_apply(modifier=smooth.name)
decimate = mesh.modifiers.new('Desktop baseline', 'DECIMATE')
decimate.ratio = .55
bpy.ops.object.modifier_apply(modifier=decimate.name)
triangulate = mesh.modifiers.new('Triangles', 'TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=triangulate.name)
for polygon in mesh.data.polygons:
    polygon.use_smooth = True
material = bpy.data.materials.new('Companion caramel')
material.diffuse_color = (1, 1, 1, 1)
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = material.diffuse_color
mesh.data.materials.append(material)
palette = mesh.data.color_attributes.new(name='CompanionPalette', type='FLOAT_COLOR', domain='POINT')
for vertex in mesh.data.vertices:
    x, y, z = vertex.co
    color = (.60, .29, .10, 1)
    if y > .22 and z < .82:
        color = (.93, .77, .49, 1)
    if z < .22:
        color = (.22, .11, .06, 1)
    if y > 1.17 or (abs(abs(x)-.21) < .08 and .83 < y < .98 and z > 1.07):
        color = (.035, .025, .02, 1)
    if z > 1.34:
        color = (.22, .10, .055, 1)
    palette.data[vertex.index].color = color

bpy.ops.object.armature_add()
rig = bpy.context.object
rig.name = 'CompanionRig'
bpy.ops.object.mode_set(mode='EDIT')
rig.data.edit_bones.remove(rig.data.edit_bones[0])
bones = []


def bone(name, head, tail, parent=None):
    value = rig.data.edit_bones.new(name)
    value.head = head
    value.tail = tail
    if parent:
        value.parent = rig.data.edit_bones[parent]
    bones.append((name, Vector(head), Vector(tail)))


bone('Root', (0, 0, 0), (0, 0, .2))
bone('Spine', (0, -.50, .8), (0, .48, .8), 'Root')
bone('Head', (0, .48, .8), (0, .83, 1.08), 'Spine')
bone('Tail', (0, -.52, .86), (0, -1.03, 1.0), 'Spine')
for side, x in [('L', -.26), ('R', .26)]:
    for end, y in [('Front', .44), ('Hind', -.46)]:
        name = end + side
        bone(name, (x, y, .7), (x, y, .37), 'Spine')
        bone(name + 'Paw', (x, y, .37), (x, y+.06, .1), name)
bpy.ops.object.mode_set(mode='OBJECT')


def distance(point, a, b):
    direction = b - a
    t = max(0, min(1, (point-a).dot(direction) / direction.length_squared))
    return (point - (a + direction*t)).length


groups = {name: mesh.vertex_groups.new(name=name) for name, _, _ in bones if name != 'Root'}
mixed = 0
for vertex in mesh.data.vertices:
    influences = sorted(((1 / max(.045, distance(vertex.co, a, b))**4, name) for name, a, b in bones if name != 'Root'), reverse=True)[:4]
    total = sum(weight for weight, _ in influences)
    if influences[1][0]/total > .05:
        mixed += 1
    for weight, name in influences:
        groups[name].add([vertex.index], weight/total, 'REPLACE')
modifier = mesh.modifiers.new('Real deform skeleton', 'ARMATURE')
modifier.object = rig
mesh.parent = rig
for pose in rig.pose.bones:
    pose.rotation_mode = 'XYZ'

events = []
for clip, frames, strength in [('Idle', 48, .04), ('Walk', 24, .45), ('Run', 16, .85)]:
    rig.animation_data_create()
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(frames + 1):
        scene.frame_set(frame)
        phase = frame / frames * math.tau
        for pose in rig.pose.bones:
            pose.rotation_euler = (0, 0, 0)
            pose.location = (0, 0, 0)
            if pose.name == 'Head':
                pose.rotation_euler.x = math.sin(phase) * (.06 if clip == 'Idle' else .03)
            elif pose.name == 'Tail':
                pose.rotation_euler.z = math.sin(phase * 2) * .24
            elif pose.name in ('FrontL', 'HindR', 'FrontR', 'HindL'):
                sign = 1 if pose.name in ('FrontL', 'HindR') else -1
                pose.rotation_euler.x = math.sin(phase) * strength * sign
            elif pose.name.endswith('Paw'):
                sign = 1 if pose.name in ('FrontLPaw', 'HindRPaw') else -1
                pose.rotation_euler.x = max(0, math.sin(phase) * sign) * strength * .6
            pose.keyframe_insert('rotation_euler', frame=frame)
            pose.keyframe_insert('location', frame=frame)
    if clip != 'Idle':
        for fraction, event in [(.25, 'foot-left'), (.75, 'foot-right')]:
            marker = action.pose_markers.new(event)
            marker.frame = round(frames * fraction)
            events.append(dict(clip=clip, time=marker.frame/24, name=event))
rig.animation_data.action = None
scene.frame_set(0)
for pose in rig.pose.bones:
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
library = bpy.data.collections.new('Companion')
scene.collection.children.link(library)
for obj in (mesh, rig):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    library.objects.link(obj)
scene.frame_start = 0
scene.frame_end = 48
(HERE.parent / 'assets').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'companion.blend'))
bpy.ops.export_scene.gltf(filepath=str(HERE.parent / 'assets' / 'companion.glb'), export_format='GLB',
                          export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_frame_range=False, export_skins=True,
                          export_all_influences=False, export_morph=False, export_cameras=False, export_lights=False,
                          export_vertex_color='ACTIVE')
mouth_local = rig.data.bones['Head'].matrix_local.inverted() @ Vector((0, 1.12, .96))
(HERE.parent / 'assets' / 'companion.animation.json').write_text(json.dumps(dict(
    source='authoring/companion.blend', skeleton='companion-v1', rootMotion='controller',
    sockets=[dict(name='mouth', joint='Head', translation=[mouth_local.x, mouth_local.y, mouth_local.z])], events=events), indent=2)+'\n')
print(f'Actual skin: {len(mesh.data.vertices)} vertices, {len(mesh.data.polygons)} triangles, {len(bones)} deform bones, {mixed} vertices with mixed weights')
reference = {}
for name, frame in [('Walk', 6), ('Run', 4)]:
    rig.animation_data.action = bpy.data.actions[name]
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    sampled = evaluated.to_mesh()
    reference[name] = [[v.co.x, v.co.z, -v.co.y] for v in sampled.vertices]
    evaluated.to_mesh_clear()
(HERE.parent / 'assets' / 'companion.reference.json').write_text(json.dumps(reference, separators=(',', ':'))+'\n')
