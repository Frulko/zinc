#include <godot_cpp/classes/control.hpp>
#include <godot_cpp/classes/image.hpp>
#include <godot_cpp/classes/image_texture.hpp>
#include <godot_cpp/classes/input_event_key.hpp>
#include <godot_cpp/classes/input_event_mouse_button.hpp>
#include <godot_cpp/classes/input_event_mouse_motion.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/utility_functions.hpp>
#include "zn/app.h"
#include "zn/embed.h"
#include "hal.h"
#include <cstring>

extern "C" int warehouse_count, warehouse_speed, warehouse_action;
using namespace godot;

class ZincControl : public Control {
  GDCLASS(ZincControl, Control)
  bool running = false;
  uint64_t serial = 0;
  int uploads = 0, scale = 1;
  Ref<ImageTexture> texture;
  PackedByteArray rgba;
protected:
  static void _bind_methods() {
    ClassDB::bind_method(D_METHOD("forward_input", "event"), &ZincControl::forward_input);
    ClassDB::bind_method(D_METHOD("start"), &ZincControl::start);
    ClassDB::bind_method(D_METHOD("stop"), &ZincControl::stop);
    ClassDB::bind_method(D_METHOD("step"), &ZincControl::step);
    ClassDB::bind_method(D_METHOD("resize_surface", "width", "height", "scale"), &ZincControl::resize_surface);
    ClassDB::bind_method(D_METHOD("set_inventory", "count"), &ZincControl::set_inventory);
    ClassDB::bind_method(D_METHOD("get_speed"), &ZincControl::get_speed);
    ClassDB::bind_method(D_METHOD("take_action"), &ZincControl::take_action);
    ClassDB::bind_method(D_METHOD("get_uploads"), &ZincControl::get_uploads);
    ClassDB::bind_method(D_METHOD("get_pixels"), &ZincControl::get_pixels);
    ClassDB::bind_method(D_METHOD("send_text", "text"), &ZincControl::send_text);
  }
  void _notification(int what) {
    if (what == NOTIFICATION_RESIZED && running) resize_surface(int(get_size().x), int(get_size().y), scale);
    if (what == NOTIFICATION_FOCUS_EXIT && running) { ZnEmbedEvent event{}; event.kind = ZN_EMBED_BLUR; zn_embed_event(&event); }
    if (what == NOTIFICATION_EXIT_TREE) stop();
  }
public:
  ~ZincControl() override { stop(); }
  bool start() {
    if (running || zn_embed_install(int(get_size().x), int(get_size().y), scale) != 0) {
      UtilityFunctions::push_error("ZincControl: invalid size or another runtime already owns the surface");
      return false;
    }
    zn_embed_transparent(1);
    char name[] = "warehouse-ui"; char* argv[] = {name, nullptr};
    if (zn_app_init(1, argv) != 0) { zn_embed_quit(); return false; }
    running = true;
    set_focus_mode(FOCUS_ALL);
    return true;
  }
  void stop() { if (running) { running = false; zn_embed_quit(); texture.unref(); rgba.clear(); } }
  bool resize_surface(int width, int height, int density) {
    if (!running || zn_embed_resize(width, height, density) != 0) return false;
    scale = density; texture.unref(); serial = 0; return true;
  }
  void step() {
    if (!running) return;
    if (zn_embed_tick() != 0) { stop(); return; }
    ZnEmbedFrame frame{};
    if (!zn_embed_frame(&frame) || frame.serial == serial) return;
    serial = frame.serial;
    rgba.resize(frame.width * frame.height * 4);
    auto* destination = rgba.ptrw();
    for (int y = 0; y < frame.height; ++y) {
      auto* row = reinterpret_cast<const uint32_t*>(reinterpret_cast<const uint8_t*>(frame.pixels) + y * frame.stride_bytes);
      for (int x = 0; x < frame.width; ++x) {
        const uint32_t pixel = row[x]; const int at = (y * frame.width + x) * 4;
        destination[at] = pixel >> 16; destination[at+1] = pixel >> 8; destination[at+2] = pixel; destination[at+3] = pixel >> 24;
      }
    }
    Ref<Image> image = Image::create_from_data(frame.width, frame.height, false, Image::FORMAT_RGBA8, rgba);
    if (texture.is_null()) texture = ImageTexture::create_from_image(image);
    else texture->update(image);
    ++uploads;
    queue_redraw();
  }
  void _draw() override { if (texture.is_valid()) draw_texture_rect(texture, Rect2(Vector2(), get_size()), false); }
  void set_inventory(int count) { if (count >= 0 && count <= 999) warehouse_count = count; }
  int get_speed() const { return warehouse_speed; }
  int take_action() { const int action = warehouse_action; warehouse_action = 0; return action; }
  int get_uploads() const { return uploads; }
  PackedByteArray get_pixels() const { return rgba; }
  void send_text(const String& text) {
    const auto utf8 = text.utf8();
    if (utf8.length() >= 256) return;
    ZnEmbedEvent event{}; event.kind = ZN_EMBED_TEXT;
    std::memcpy(event.text, utf8.get_data(), utf8.length()); zn_embed_event(&event);
  }
  void forward_input(const Ref<InputEvent>& input) { _gui_input(input); }
  void _gui_input(const Ref<InputEvent>& input) override {
    if (!running) return;
    ZnEmbedEvent event{};
    Ref<InputEventMouseMotion> motion = input;
    Ref<InputEventMouseButton> button = input;
    Ref<InputEventKey> key = input;
    if (motion.is_valid()) {
      event.kind = ZN_EMBED_MOVE; event.x = motion->get_position().x; event.y = motion->get_position().y;
    } else if (button.is_valid()) {
      event.x = button->get_position().x; event.y = button->get_position().y;
      const int index = int(button->get_button_index());
      if (index == 4 || index == 5) { if (!button->is_pressed()) return; event.kind = ZN_EMBED_WHEEL; event.value = index == 4 ? 1 : -1; }
      else { if (index < 1 || index > 3) return; event.kind = button->is_pressed() ? ZN_EMBED_DOWN : ZN_EMBED_UP; event.key = index == 1 ? 0 : index == 2 ? 2 : 1; }
      if (button->is_pressed()) grab_focus();
    } else if (key.is_valid()) {
      if (key->get_keycode() == KEY_ESCAPE) { release_focus(); return; }
      event.kind = key->is_pressed() ? (key->is_echo() ? ZN_EMBED_KEY_REPEAT : ZN_EMBED_KEY_DOWN) : ZN_EMBED_KEY_UP;
      const int code = int(key->get_keycode());
      switch(code) {
        case KEY_BACKSPACE: event.key = HAL_KEY_BACKSPACE; break;
        case KEY_DELETE: event.key = HAL_KEY_DELETE; break;
        case KEY_ENTER: event.key = HAL_KEY_ENTER; break;
        case KEY_TAB: event.key = HAL_KEY_TAB; break;
        case KEY_LEFT: event.key = HAL_KEY_ARROW_LEFT; break;
        case KEY_RIGHT: event.key = HAL_KEY_ARROW_RIGHT; break;
        case KEY_UP: event.key = HAL_KEY_ARROW_UP; break;
        case KEY_DOWN: event.key = HAL_KEY_ARROW_DOWN; break;
        default: event.key = code < 128 ? code : 0;
      }
      event.mods = (key->is_shift_pressed() ? 1 : 0) | (key->is_ctrl_pressed() ? 2 : 0) | (key->is_alt_pressed() ? 4 : 0) | (key->is_meta_pressed() ? 8 : 0);
      zn_embed_event(&event);
      if (key->is_pressed() && key->get_unicode() >= 32 && !key->is_ctrl_pressed() && !key->is_meta_pressed()) send_text(String::chr(key->get_unicode()));
      accept_event(); return;
    } else return;
    zn_embed_event(&event); accept_event();
  }
};

void initialize(ModuleInitializationLevel level) { if (level == MODULE_INITIALIZATION_LEVEL_SCENE) ClassDB::register_class<ZincControl>(); }
void uninitialize(ModuleInitializationLevel) {}
extern "C" GDExtensionBool GDE_EXPORT zinc_library_init(GDExtensionInterfaceGetProcAddress get_proc_address, GDExtensionClassLibraryPtr library, GDExtensionInitialization* initialization) {
  GDExtensionBinding::InitObject init(get_proc_address, library, initialization);
  init.register_initializer(initialize); init.register_terminator(uninitialize);
  init.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
  return init.init();
}
