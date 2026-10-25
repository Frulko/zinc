"""Run in the saved .blend: repeat publication and failure recovery are real exporter checks."""
import bpy
import copy
import json
from pathlib import Path
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'integrations/blender'))
from zinc_scene import publish_scene

with tempfile.TemporaryDirectory() as directory:
    first, changed = publish_scene(bpy.context.scene, directory, 'authoring/library.blend')
    assert changed
    path = Path(directory) / 'scene.json'
    stamp, original = path.stat().st_mtime_ns, path.read_bytes()
    again, changed = publish_scene(bpy.context.scene, directory, 'authoring/library.blend')
    assert not changed and first == again and stamp == path.stat().st_mtime_ns
    a, b = bpy.data.objects['gate'], bpy.data.objects['ground']
    saved = b['zinc_id']
    b['zinc_id'] = a['zinc_id']
    try:
        publish_scene(bpy.context.scene, directory, 'authoring/library.blend')
        raise AssertionError('duplicate source identity accepted')
    except ValueError as error:
        assert 'duplicate identity' in str(error)
    b['zinc_id'] = saved
    assert path.read_bytes() == original
    a.location.x += .5
    updated, changed = publish_scene(bpy.context.scene, directory, 'authoring/library.blend')
    assert changed and updated['revision'] != first['revision']
    assert updated['assets'] == first['assets']
    before = next(n for n in first['nodes'] if n['id'] == 'gate')
    after = next(n for n in updated['nodes'] if n['id'] == 'gate')
    assert abs(after['translation'][0] - before['translation'][0] - .5) < 1e-6
    print('Blender proof: deterministic unchanged export, duplicate failure rollback, transform-only asset reuse')
