extends SceneTree
func _initialize():
    var pack = PCKPacker.new()
    var path = OS.get_cmdline_user_args()[0]
    assert(pack.pck_start(path) == OK)
    for file in ["project.godot","game.gd","game.tscn"]:
        assert(pack.add_file("res://" + file,"res://" + file) == OK)
    assert(pack.add_file("res://.godot/global_script_class_cache.cfg","res://global_script_class_cache.cfg") == OK)
    assert(pack.flush() == OK)
    print("Packed real Godot game: " + path)
    quit()
