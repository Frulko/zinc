@tool
extends RefCounted

var errors: Array[String] = []
var nodes: Array = []
var meshes: Dictionary = {}
var identities: Dictionary = {}
var scene_file: String
var scene_root: Node

func vector(v: Vector3) -> Array:
    return [v.x, v.y, v.z]

func reject(node: Node, property: String, reason: String):
    errors.append("%s:%s: %s" % [scene_file, scene_root.get_path_to(node), property + ": " + reason])

func walk(node: Node, parent_id):
    var id = str(node.get_meta("zinc_id", ""))
    if id.is_empty() or identities.has(id):
        reject(node, "zinc_id", "missing or duplicate stable identity; assign a unique authored ID")
    identities[id] = true
    if node.get_script() != null:
        reject(node, "script", "scripts are not translated; implement gameplay in Zinc")
    if not node is Node3D or not node.get_class() in ["Node3D", "MeshInstance3D", "Marker3D", "Camera3D"]:
        reject(node, "type", "unsupported node " + node.get_class())
        return
    if not node.visible:
        reject(node, "visible", "hidden-node semantics are unsupported")
    var asset = null
    if node is MeshInstance3D:
        if node.mesh == null:
            reject(node, "mesh", "missing mesh resource")
        else:
            asset = str(node.mesh.get_meta("zinc_asset_id", ""))
            if asset.is_empty() or not asset.is_valid_filename():
                reject(node, "mesh.zinc_asset_id", "require a stable filename-safe asset identity")
            elif meshes.has(asset) and meshes[asset] != node.mesh:
                reject(node, "mesh.zinc_asset_id", "identity refers to two different mesh resources")
            else:
                meshes[asset] = node.mesh
            if node.material_override != null:
                reject(node, "material_override", "export material on the shared mesh resource")
            for surface in node.mesh.get_surface_count():
                var material = node.mesh.surface_get_material(surface)
                if material is ShaderMaterial:
                    reject(node, "mesh.material", "ShaderMaterial is unsupported; bake to StandardMaterial3D")
                elif material != null and not material is StandardMaterial3D:
                    reject(node, "mesh.material", "unsupported material class")
    var metadata = {}
    for key in node.get_meta_list():
        var name = str(key)
        if name.begins_with("zinc_") and not name in ["zinc_id", "zinc_dynamic"]:
            var component = name.trim_prefix("zinc_")
            if not component in ["collision", "trigger", "socket", "spawn", "interaction", "gate", "world"]:
                reject(node, name, "unsupported component")
            else:
                metadata[component] = node.get_meta(key)
    if node is Camera3D:
        if node.projection != Camera3D.PROJECTION_PERSPECTIVE:
            reject(node, "projection", "only perspective cameras supported")
        metadata["camera"] = {"fov":node.fov,"near":node.near,"far":node.far}
    var q = node.quaternion
    nodes.append({"id":id,"name":node.name,"parent":parent_id,"asset":asset,"translation":vector(node.position),"rotation":[q.x,q.y,q.z,q.w],"scale":vector(node.scale),"metadata":metadata,"source":{"file":scene_file,"object":str(scene_root.get_path_to(node))}})
    if node.has_meta("zinc_dynamic"):
        nodes[-1]["dynamic"] = node.get_meta("zinc_dynamic")
    for child in node.get_children():
        walk(child, id)

func publish(root: Node, output: String) -> Error:
    errors.clear()
    nodes.clear()
    meshes.clear()
    identities.clear()
    scene_file = "godot/" + root.scene_file_path.trim_prefix("res://")
    scene_root = root
    walk(root, null)
    if not errors.is_empty():
        for message in errors:
            push_error("Zinc export: " + message)
        return ERR_INVALID_DATA
    var staging = output + ".staging"
    DirAccess.make_dir_recursive_absolute(staging)
    var assets = []
    for id in meshes.keys():
        var holder = MeshInstance3D.new()
        holder.name = str(id)
        holder.mesh = meshes[id]
        var document = GLTFDocument.new()
        document.root_node_mode = GLTFDocument.ROOT_NODE_MODE_KEEP_ROOT
        var state = GLTFState.new()
        var result = document.append_from_scene(holder, state)
        if result == OK:
            result = document.write_to_filesystem(state, staging.path_join(id + ".glb"))
        holder.free()
        if result != OK:
            push_error("Zinc export: asset %s: glTF export failed %s" % [id, result])
            return result
        var bytes = FileAccess.get_file_as_bytes(staging.path_join(id + ".glb"))
        # Inspect required semantics before publication; never strip an extension declaration.
        var json_length = bytes.decode_u32(12)
        var gltf = JSON.parse_string(bytes.slice(20, 20 + json_length).get_string_from_utf8())
        if gltf.has("extensionsRequired") and not gltf.extensionsRequired.is_empty():
            push_error("Zinc export: asset %s: unsupported required extensions %s" % [id, gltf.extensionsRequired])
            return ERR_UNAVAILABLE
        var digest = FileAccess.get_sha256(staging.path_join(id + ".glb"))
        var uri = digest + ".glb"
        DirAccess.rename_absolute(staging.path_join(id + ".glb"), staging.path_join(uri))
        assets.append({"id":id,"uri":uri,"hash":digest,"dependencies":[]})
    var manifest = {"schema":"zinc.scene","version":1,"id":str(root.get_meta("zinc_id")),"source":{"tool":"Godot 4.6-stable","file":scene_file,"scene":root.name},"assets":assets,"nodes":nodes}
    DirAccess.make_dir_recursive_absolute(output)
    for item in assets:
        if not FileAccess.file_exists(output.path_join(item.uri)):
            DirAccess.rename_absolute(staging.path_join(item.uri), output.path_join(item.uri))
    var draft = staging.path_join("draft.json")
    var file = FileAccess.open(draft, FileAccess.WRITE)
    file.store_string(JSON.stringify(manifest, "  ", true, true))
    file.close()
    var messages = []
    var code = OS.execute("python3", [ProjectSettings.globalize_path("res://../publish.py"), draft, output], messages, true)
    for message in messages:
        print(message)
    if code != 0:
        push_error("Zinc export: publication rejected; previous revision retained")
        return ERR_INVALID_DATA
    print("Zinc export: %s nodes, %s shared assets -> %s" % [nodes.size(), assets.size(), output])
    return OK
