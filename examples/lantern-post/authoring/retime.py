"""Actual Blender Walk edit: double key times, republish GLB and matching marker times."""
import bpy
import json
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
destination=HERE/'revisions'
destination.mkdir(exist_ok=True)
rig=bpy.data.objects['CompanionRig']
original=bpy.data.actions['Walk']
rig.animation_data.action=original
poses=[]
for frame in range(25):
    bpy.context.scene.frame_set(frame)
    poses.append({bone.name:(tuple(bone.rotation_euler),tuple(bone.location)) for bone in rig.pose.bones})
rig.animation_data.action=None
bpy.data.actions.remove(original)
action=bpy.data.actions.new('Walk')
action.use_fake_user=True
rig.animation_data.action=action
for frame,pose in enumerate(poses):
    for name,(rotation,position) in pose.items():
        bone=rig.pose.bones[name]
        bone.rotation_mode='XYZ'
        bone.rotation_euler=rotation
        bone.location=position
        bone.keyframe_insert('rotation_euler',frame=frame*2)
        bone.keyframe_insert('location',frame=frame*2)
for fraction,name in [(.25,'foot-left'),(.75,'foot-right')]:
    marker=action.pose_markers.new(name)
    marker.frame=round(48*fraction)
rig.animation_data.action=None
for bone in rig.pose.bones:
    bone.rotation_euler=(0,0,0)
    bone.location=(0,0,0)
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(destination/'companion-revised.blend'))
bpy.ops.export_scene.gltf(filepath=str(destination/'companion.glb'),export_format='GLB',export_yup=True,
                          export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
                          export_frame_range=False,export_skins=True,export_all_influences=False,
                          export_morph=False,export_cameras=False,export_lights=False,export_vertex_color='ACTIVE')
metadata=json.loads((HERE.parents[1]/'animation-lab/assets/companion.animation.json').read_text())
for event in metadata['events']:
    if event['clip']=='Walk':
        event['time']*=2
metadata['source']='examples/lantern-post/authoring/revisions/companion-revised.blend'
(destination/'companion.animation.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Actual artist edit: Walk key times and foot markers retimed from 1s to 2s')
