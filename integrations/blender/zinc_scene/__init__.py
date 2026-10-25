"""Explicit Zinc publication. Blender remains the owner of source identities."""
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import uuid

import bpy
from mathutils import Matrix

try:
    from .scene_exchange import publish, validate
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools'))
    from scene_exchange import publish, validate

CONVERSION = Matrix.Rotation(-math.pi / 2, 4, 'X')


def stable(block, property_name):
    value = block.get(property_name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{block.name}: missing {property_name}; use Assign missing identities before publishing')
    return value


def assign_missing(scene):
    """Explicitly creates identities, never repairs duplicated identities."""
    if not scene.get('zinc_id'):
        scene['zinc_id'] = str(uuid.uuid4())
    for obj in bpy.data.objects:
        if not obj.get('zinc_id'):
            obj['zinc_id'] = str(uuid.uuid4())
        if obj.type == 'MESH' and not obj.data.get('zinc_asset_id'):
            obj.data['zinc_asset_id'] = str(uuid.uuid4())


def publish_scene(scene, directory, source_file):
    bpy.context.view_layer.update()
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'objects').mkdir(exist_ok=True)
    document = dict(schema='zinc.scene', version=1, id=stable(scene, 'zinc_id'),
                    source=dict(tool='Blender ' + bpy.app.version_string, file=source_file, scene=scene.name),
                    assets=[], nodes=[])
    meshes, authored = {}, {}
    for obj in bpy.data.objects:
        if obj.hide_render:
            continue
        key = stable(obj, 'zinc_id')
        if key in authored and authored[key] != obj:
            raise ValueError(f'{obj.name}: duplicate identity {key} also used by {authored[key].name}')
        authored[key] = obj
        if obj.type == 'MESH':
            asset_id = stable(obj.data, 'zinc_asset_id')
            if asset_id in meshes and meshes[asset_id].data != obj.data:
                raise ValueError(f'{obj.name}: duplicate asset identity {asset_id}')
            meshes[asset_id] = obj
    # Validate metadata and hierarchy before exporting any content.
    def visit(objects, parent, prefix, stack):
        for obj in sorted(objects, key=lambda o: stable(o, 'zinc_id')):
            if obj.hide_render:
                continue
            if obj.type not in {'EMPTY', 'MESH', 'CAMERA'}:
                raise ValueError(f'{obj.name}: unsupported object type {obj.type}; bake or exclude it')
            key = prefix + stable(obj, 'zinc_id')
            matrix = obj.matrix_local.copy()
            matrix = CONVERSION @ matrix if obj.type == 'CAMERA' else CONVERSION @ matrix @ CONVERSION.inverted()
            position, rotation, scale = matrix.decompose()
            metadata = json.loads(obj.get('zinc_metadata', '{}'))
            if obj.type == 'CAMERA':
                if obj.data.type != 'PERSP':
                    raise ValueError(f'{obj.name}: only perspective cameras supported')
                # Blender's sensor fit determines the vertical FOV, not angle_y alone.
                aspect = scene.render.resolution_x / scene.render.resolution_y
                fov = 2 * math.atan(math.tan(obj.data.angle_x / 2) / aspect)
                metadata['camera'] = dict(fov=math.degrees(fov), near=obj.data.clip_start, far=obj.data.clip_end)
            node = dict(id=key, name=obj.name, parent=parent,
                        asset=stable(obj.data, 'zinc_asset_id') if obj.type == 'MESH' else None,
                        translation=list(position), rotation=[rotation.x, rotation.y, rotation.z, rotation.w], scale=list(scale),
                        metadata=metadata, source=dict(file=source_file, object=obj.name))
            document['nodes'].append(node)
            visit(obj.children, key, prefix, stack)
            if obj.instance_type == 'COLLECTION':
                collection = obj.instance_collection
                if collection is None:
                    raise ValueError(f'{obj.name}: missing collection reference')
                if collection.name in stack:
                    raise ValueError(f'{obj.name}: collection reference cycle: {collection.name}')
                if collection.instance_offset.length > 1e-8:
                    raise ValueError(f'{collection.name}: nonzero instance offset; apply it before publishing')
                visit([o for o in collection.objects if o.parent is None], key, key + '/', stack + [collection.name])
    visit([o for o in scene.objects if o.parent is None], None, '', [])
    for asset_id in sorted(meshes):
        document['assets'].append(dict(id=asset_id, uri='objects/pending.glb', hash='0'*64, dependencies=[]))
    validate(document, check_revision=False)
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    original_scene = bpy.context.window.scene
    export_scene = bpy.data.scenes.new('Zinc temporary export')
    try:
        bpy.context.window.scene = export_scene
        for record in document['assets']:
            obj = meshes[record['id']]
            if obj.modifiers or obj.constraints:
                raise ValueError(f'{obj.name}: modifiers/constraints require an explicit baked mesh in static scene profile')
            for material in obj.data.materials:
                if material and material.use_nodes:
                    for node in material.node_tree.nodes:
                        if node.type not in {'OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'}:
                            raise ValueError(f'{obj.name}/{material.name}: unsupported shader {node.type}; bake to base color')
            copy = obj.copy()
            copy.parent = None
            copy.matrix_world = Matrix.Identity(4)
            export_scene.collection.objects.link(copy)
            bpy.context.view_layer.objects.active = copy
            copy.select_set(True)
            with tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / 'mesh.glb'
                bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, use_active_scene=True,
                                          export_yup=True, export_animations=False, export_extras=False,
                                          export_cameras=False, export_lights=False)
                data = path.read_bytes()
            bpy.data.objects.remove(copy, do_unlink=True)
            digest = hashlib.sha256(data).hexdigest()
            record['hash'] = digest
            record['uri'] = 'objects/' + digest + '.glb'
            path = directory / record['uri']
            if not path.exists():
                path.write_bytes(data)
        changed = publish(document, directory)
        return document, changed
    finally:
        bpy.context.window.scene = original_scene
        bpy.data.scenes.remove(export_scene)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active


class ZINC_OT_assign(bpy.types.Operator):
    bl_idname = 'zinc.assign_missing'
    bl_label = 'Zinc: Assign missing identities'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        assign_missing(context.scene)
        return {'FINISHED'}


class ZINC_OT_publish(bpy.types.Operator):
    bl_idname = 'zinc.publish_scene'
    bl_label = 'Zinc: Publish scene'
    directory: bpy.props.StringProperty(name='Publication directory', subtype='DIR_PATH')
    source_file: bpy.props.StringProperty(name='Project-relative source', default='authoring/scene.blend')

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        try:
            document, changed = publish_scene(context.scene, bpy.path.abspath(self.directory), self.source_file)
            self.report({'INFO'}, f"{'Published' if changed else 'Unchanged'} {document['revision']}")
            return {'FINISHED'}
        except (ValueError, OSError, RuntimeError, TypeError) as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


def menu(self, context):
    self.layout.operator(ZINC_OT_assign.bl_idname)
    self.layout.operator(ZINC_OT_publish.bl_idname)


def register():
    bpy.utils.register_class(ZINC_OT_assign)
    bpy.utils.register_class(ZINC_OT_publish)
    bpy.types.TOPBAR_MT_file_export.append(menu)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(menu)
    bpy.utils.unregister_class(ZINC_OT_publish)
    bpy.utils.unregister_class(ZINC_OT_assign)
