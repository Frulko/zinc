extends Node3D

var zinc
var courier: MeshInstance3D
var parcels: Array[MeshInstance3D] = []
var inventory = 0
var used = 0
var tick = 0

func box(at: Vector3, dimensions: Vector3, color: Color) -> MeshInstance3D:
    var item = MeshInstance3D.new()
    var mesh = BoxMesh.new()
    mesh.size = dimensions
    var material = StandardMaterial3D.new()
    material.albedo_color = color
    mesh.material = material
    item.mesh = mesh
    item.position = at
    add_child(item)
    return item

func _ready():
    box(Vector3(0,-0.3,0),Vector3(16,0.5,12),Color("263b43"))
    for index in range(8):
        parcels.append(box(Vector3((index % 4) * 2 - 4,0.5,(index / 4) * -3),Vector3.ONE,Color("c98445")))
    courier = box(Vector3(0,0.4,3),Vector3(0.6,0.8,0.6),Color("5ac9c0"))
    var light = DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-55,-30,0)
    add_child(light)
    var camera = Camera3D.new()
    camera.position = Vector3(8,9,13)
    add_child(camera)
    camera.look_at(Vector3(0,0,0))
    zinc = ClassDB.instantiate("ZincControl")
    zinc.position = Vector2(680,24)
    zinc.size = Vector2(400,640)
    var shader = Shader.new()
    shader.code = "shader_type canvas_item; render_mode blend_premul_alpha;"
    var material = ShaderMaterial.new()
    material.shader = shader
    zinc.material = material
    add_child(zinc)
    assert(zinc.start(), "Zinc runtime failed to start")
    get_viewport().size_changed.connect(_layout)
    _layout()
    if "--self-test" in OS.get_cmdline_user_args():
        call_deferred("_self_test")
    elif "--visual-proof" in OS.get_cmdline_user_args():
        call_deferred("_visual_proof")

func _layout():
    zinc.position.x = max(0, get_viewport().get_visible_rect().size.x - 420)
    zinc.size.y = max(560, get_viewport().get_visible_rect().size.y - 48)

func gameplay_allowed() -> bool:
    # accept_event does not stop Godot's globally polled key state.
    return not zinc.has_focus()

func _process(delta):
    tick += 1
    if not parcels.is_empty():
        parcels[0].rotation.y += delta * 0.5
    if gameplay_allowed():
        var direction = Vector3(float(Input.is_physical_key_pressed(KEY_RIGHT))-float(Input.is_physical_key_pressed(KEY_LEFT)),0,float(Input.is_physical_key_pressed(KEY_DOWN))-float(Input.is_physical_key_pressed(KEY_UP)))
        courier.position += direction * delta * zinc.get_speed()
        if Input.is_physical_key_pressed(KEY_SPACE):
            pickup()
    var action = zinc.take_action()
    if action == 1 and inventory > 0:
        inventory -= 1
        used += 1
        courier.scale = Vector3.ONE * (1.0 + used * 0.1)
    elif action == 3:
        inventory = 0
        used = 0
        courier.position = Vector3(0,0.4,3)
        courier.scale = Vector3.ONE
        for parcel in parcels:
            parcel.visible = true
    zinc.set_inventory(inventory)
    zinc.step()

func pickup():
    for parcel in parcels:
        if parcel.visible and courier.position.distance_to(parcel.position) < 2.2:
            parcel.visible = false
            inventory += 1
            return

func click_at(at: Vector2):
    var event = InputEventMouseButton.new()
    event.button_index = MOUSE_BUTTON_LEFT
    event.position = at
    event.pressed = true
    zinc.forward_input(event)
    zinc.step()
    event.pressed = false
    zinc.forward_input(event)
    zinc.step()

func _self_test():
    set_process(false)
    for index in range(4):
        zinc.step()
    var original_uploads = zinc.get_uploads()
    for index in range(8):
        zinc.step()
    assert(zinc.get_uploads() == original_uploads, "idle uploaded a frame")
    var pixels = zinc.get_pixels()
    assert(pixels.size() == 400 * int(zinc.size.y) * 4)
    assert(pixels[3] == 0, "background must be transparent")
    if "--capture-ui" in OS.get_cmdline_user_args():
        Image.create_from_data(400,int(zinc.size.y),false,Image.FORMAT_RGBA8,pixels).save_png("/private/tmp/warehouse-ui.png")
    var partial_alpha = false
    for index in range(3,pixels.size(),4):
        if pixels[index] > 0 and pixels[index] < 255:
            partial_alpha = true
            assert(pixels[index-1] <= pixels[index] and pixels[index-2] <= pixels[index] and pixels[index-3] <= pixels[index], "alpha contract must be premultiplied")
    assert(partial_alpha, "HUD must retain partial alpha")
    zinc.set_inventory(2)
    zinc.step()
    assert(zinc.get_uploads() > original_uploads, "inventory update did not reach Zinc")
    click_at(Vector2(150,355))
    assert(zinc.take_action() == 1, "Zinc action did not reach Godot")
    click_at(Vector2(280,435))
    assert(zinc.get_speed() >= 4, "Zinc slider did not update game setting")
    var drag = InputEventMouseButton.new()
    drag.button_index = MOUSE_BUTTON_LEFT
    drag.position = Vector2(200,435)
    drag.pressed = true
    zinc.forward_input(drag)
    zinc.step()
    var motion = InputEventMouseMotion.new()
    motion.position = Vector2(440,435)
    zinc.forward_input(motion)
    zinc.step()
    var release = drag.duplicate()
    release.position = motion.position
    release.pressed = false
    zinc.forward_input(release)
    zinc.step()
    assert(zinc.get_speed() == 5, "captured slider drag outside bounds was lost")
    click_at(Vector2(150,132))
    var before_text = zinc.get_pixels()
    zinc.send_text("gear")
    zinc.step()
    assert(zinc.get_pixels() != before_text, "focused search did not accept text")
    zinc.grab_focus()
    assert(not gameplay_allowed(), "polled game controls must stop while Zinc owns focus")
    var held_key = InputEventKey.new()
    held_key.physical_keycode = KEY_RIGHT
    held_key.pressed = true
    Input.parse_input_event(held_key)
    var previous_position = courier.position
    _process(0.1)
    assert(courier.position == previous_position, "typing leaked into polled gameplay controls")
    var released_key = held_key.duplicate()
    released_key.pressed = false
    Input.parse_input_event(released_key)
    zinc.release_focus()
    assert(gameplay_allowed())
    assert(zinc.resize_surface(400,600,2))
    zinc.step()
    assert(zinc.get_pixels().size() == 800*1200*4)
    zinc.stop()
    zinc.stop()
    print("PASS Warehouse: native Zinc pixels, alpha, idle, state, focus, resize and teardown")
    get_tree().quit()

func _viewport_click(at: Vector2):
    var event = InputEventMouseButton.new()
    event.button_index = MOUSE_BUTTON_LEFT
    event.position = zinc.position + at
    event.global_position = event.position
    event.pressed = true
    get_viewport().push_input(event, true)
    _process(0.0)
    await get_tree().process_frame
    event.pressed = false
    get_viewport().push_input(event, true)
    _process(0.0)
    await get_tree().process_frame
    _process(0.0)

func _visual_proof():
    assert(DisplayServer.get_name() != "headless", "visual proof needs a real renderer/window")
    set_process(false)
    inventory = 2
    _process(0.0)
    await RenderingServer.frame_post_draw
    await _viewport_click(Vector2(150,355))
    assert(inventory == 1 and used == 1, "viewport click did not reach Zinc and the game")
    assert(zinc.has_focus(), "viewport click did not transfer focus")
    var key = InputEventKey.new()
    key.physical_keycode = KEY_RIGHT
    key.keycode = KEY_RIGHT
    key.pressed = true
    Input.parse_input_event(key)
    await get_tree().process_frame
    var before = courier.position
    _process(0.1)
    assert(courier.position == before, "focused UI leaked polled game input")
    key.pressed = false
    Input.parse_input_event(key)
    zinc.release_focus()
    await _viewport_click(Vector2(280,435))
    assert(zinc.get_speed() >= 4, "viewport slider input was lost")

    # Two real rendered backdrops distinguish premultiplied composition from opaque/straight-alpha output.
    var backdrop = ColorRect.new()
    backdrop.position = zinc.position
    backdrop.size = zinc.size
    backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(backdrop)
    move_child(backdrop, zinc.get_index())
    var pixels = zinc.get_pixels()
    var local = Vector2i(25,200)
    var offset = (local.y * int(zinc.size.x) + local.x) * 4
    var alpha = float(pixels[offset+3]) / 255.0
    assert(alpha > 0.0 and alpha < 1.0, "composition probe must have partial alpha")
    var source = Color(float(pixels[offset])/255.0,float(pixels[offset+1])/255.0,float(pixels[offset+2])/255.0,alpha)
    for color in [Color.RED, Color.BLUE]:
        backdrop.color = color
        await RenderingServer.frame_post_draw
        var image = get_viewport().get_texture().get_image()
        var ratio = Vector2(image.get_size()) / get_viewport().get_visible_rect().size
        var sample = image.get_pixelv(Vector2i((zinc.position + Vector2(local)) * ratio))
        var expected = source + color * (1.0-alpha)
        assert(abs(sample.r-expected.r) < 0.025 and abs(sample.g-expected.g) < 0.025 and abs(sample.b-expected.b) < 0.025, "GPU premultiplied composition differs from Zinc coverage")
    backdrop.queue_free()
    await get_tree().process_frame
    await RenderingServer.frame_post_draw
    var capture = OS.get_environment("ZINC_CAPTURE")
    assert(not capture.is_empty(), "set ZINC_CAPTURE for the reviewed viewport image")
    assert(get_viewport().get_texture().get_image().save_png(capture) == OK)
    zinc.stop()
    print("PASS Warehouse visual: real viewport input, focus, slider and GPU alpha composition")
    get_tree().quit()
