extends SceneTree

func _initialize():
    var scene = load("res://yard.tscn").instantiate()
    root.add_child(scene)
    var args = OS.get_cmdline_user_args()
    var output = ProjectSettings.globalize_path("res://../assets") if args.is_empty() else args[0]
    var result = preload("res://addons/zinc_export/exporter.gd").new().publish(scene, output)
    scene.free()
    quit(0 if result == OK else 1)
