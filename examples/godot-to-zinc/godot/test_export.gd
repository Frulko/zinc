extends SceneTree

func _initialize():
    var scene = load("res://yard.tscn").instantiate()
    var exporter = preload("res://addons/zinc_export/exporter.gd").new()
    var output = OS.get_cmdline_user_args()[0]
    assert(exporter.publish(scene, output) == OK)
    var original = FileAccess.get_file_as_bytes(output.path_join("scene.json"))
    assert(exporter.publish(scene, output) == OK)
    assert(original == FileAccess.get_file_as_bytes(output.path_join("scene.json")))
    scene.get_node("Stacks/CrateB").set_meta("zinc_id", "crate-a")
    assert(exporter.publish(scene, output) != OK)
    assert(original == FileAccess.get_file_as_bytes(output.path_join("scene.json")))
    scene.get_node("Stacks/CrateB").set_meta("zinc_id", "crate-b")
    var material = ShaderMaterial.new()
    scene.get_node("Gate").material_override = material
    assert(exporter.publish(scene, output) != OK)
    assert(original == FileAccess.get_file_as_bytes(output.path_join("scene.json")))
    scene.get_node("Gate").material_override = null
    var script = GDScript.new()
    script.source_code = "extends Node3D\n"
    assert(script.reload() == OK)
    scene.get_node("Spawn").set_script(script)
    assert(exporter.publish(scene, output) != OK)
    assert(original == FileAccess.get_file_as_bytes(output.path_join("scene.json")))
    scene.free()
    print("PASS Godot export: stable, shared, duplicate/script/shader failures preserve publication")
    quit()
