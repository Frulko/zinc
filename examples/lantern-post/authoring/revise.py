"""Move an authored gate and publish the retimed companion as a second complete revision."""
import bpy
import json
import shutil
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'integrations/blender'))
from zinc_scene import publish_scene
destination=HERE/'revisions'
gate=bpy.data.objects['gate']
gate.location.x+=.5
companion=bpy.data.objects['companion']
with bpy.data.libraries.load(str(destination/'companion-revised.blend'),link=True) as (available,loaded):
    loaded.collections=['Companion']
companion.instance_collection=loaded.collections[0]
bpy.ops.wm.save_as_mainfile(filepath=str(destination/'lantern-revised.blend'))
reference=dict(id='companion-v1',file='//companion.glb',metadata='//companion.animation.json',
               source='examples/lantern-post/authoring/revisions/companion-revised.blend')
companion['zinc_skin']=json.dumps(reference)
loaded.collections[0].library.filepath='//companion-revised.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(destination/'lantern-revised.blend'))
published=destination/'published'
document,changed=publish_scene(bpy.context.scene,published,'examples/lantern-post/authoring/revisions/lantern-revised.blend')
assets=HERE.parent/'assets'
for path in (published/'objects').iterdir():
    target=assets/'objects'/path.name
    if not target.exists():
        shutil.copyfile(path,target)
shutil.copyfile(published/'scene.json',assets/'revised.json')
print('Actual artist edit: gate moved 0.5m and Walk retimed; complete revised.json publication ready')
