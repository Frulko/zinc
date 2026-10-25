"""Reopen the real library project and publish its static square as a Zinc world."""
import bpy
import json
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'integrations/blender'))
from zinc_scene import publish_scene
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'examples/blender-library/authoring/library.blend'))
collection = bpy.data.collections['Library - square']
collection['zinc_metadata'] = json.dumps({'world': {'cell': 4, 'levels': ['near', 'mid', 'far']}})
bpy.data.objects['cottage-walls']['zinc_metadata'] = json.dumps({'collision': {'shape': 'box', 'size': [2.8, 2.4, 2.4]}})
bpy.context.scene['zinc_id'] = 'lantern-library-world'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'world.blend'))
document, _ = publish_scene(bpy.context.scene, HERE.parent / 'assets', 'authoring/world.blend')
print('World publication:', len(document['nodes']), 'authored nodes')
