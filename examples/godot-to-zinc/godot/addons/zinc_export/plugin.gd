@tool
extends EditorPlugin

func _enter_tree():
    add_tool_menu_item("Publish Zinc scene", _publish)

func _exit_tree():
    remove_tool_menu_item("Publish Zinc scene")

func _publish():
    var scene = get_editor_interface().get_edited_scene_root()
    if scene == null:
        push_error("Zinc export: open a scene first")
        return
    var result = preload("res://addons/zinc_export/exporter.gd").new().publish(scene, ProjectSettings.globalize_path("res://../assets"))
    if result != OK:
        push_error("Zinc export rejected; previous publication retained")
