// Zinc hardware abstraction layer. One implementation per target (targets/<id>/hal_*.cpp).
// The runtime and generated code never call an SDK directly.
#pragma once
#include <stdint.h>
#include <stddef.h>

extern "C" {

struct HalConfig {
  int32_t width, height;  // logical surface size
  const char* title;
  int32_t gfx;            // 1 if the program uses zinc:gfx (window needed)
};

enum HalButton : uint32_t {
  HAL_UP = 1u << 0, HAL_DOWN = 1u << 1, HAL_LEFT = 1u << 2, HAL_RIGHT = 1u << 3,
  HAL_A = 1u << 4, HAL_B = 1u << 5, HAL_X = 1u << 6, HAL_Y = 1u << 7,
  HAL_L = 1u << 8, HAL_R = 1u << 9, HAL_START = 1u << 10, HAL_SELECT = 1u << 11,
};

#define HAL_MAX_TOUCH 10
struct HalTouch { int32_t id; float x, y; };
// Desktop input (keyboard, text, mouse buttons). HALs that have it reset the queues at the start of hal_poll_input
// and append in event order; the others leave them empty.
#define HAL_MAX_KEYS 32
#define HAL_TEXT_BYTES 256
#define HAL_MAX_BUTTON_EVENTS 8
enum HalMod : uint32_t { HAL_MOD_SHIFT = 1u << 0, HAL_MOD_CTRL = 1u << 1, HAL_MOD_ALT = 1u << 2, HAL_MOD_META = 1u << 3 };
enum HalKeyKind : int32_t { HAL_KEY_DOWN = 0, HAL_KEY_UP = 1, HAL_KEY_REPEAT = 2, HAL_KEY_TEXT = 3 };
// Key codes: printable keys are their unshifted ASCII code (32..126, letters lowercase); named keys from 256.
enum HalKeyCode : int32_t {
  HAL_KEY_BACKSPACE = 256, HAL_KEY_DELETE, HAL_KEY_ENTER, HAL_KEY_TAB, HAL_KEY_ESCAPE, HAL_KEY_ARROW_LEFT, HAL_KEY_ARROW_RIGHT,
  HAL_KEY_ARROW_UP, HAL_KEY_ARROW_DOWN, HAL_KEY_HOME, HAL_KEY_END, HAL_KEY_PAGEUP, HAL_KEY_PAGEDOWN, HAL_KEY_F1,  // F1..F12 follow
};
// kind HAL_KEY_TEXT: typed text (UTF-8), text[off .. off+len) of HalInput.text; key is 0
struct HalKey { int32_t key; uint32_t mods; int32_t kind; uint16_t off, len; };
struct HalButtonEvent { float x, y; int32_t button; int32_t down; };  // button: 0 left, 1 middle, 2 right
struct HalInput {
  uint32_t buttons;      // HalButton bits
  float px, py;          // pointer, logical coordinates
  int32_t pdown;
  int32_t quit;          // window closed / frame budget exhausted
  float wheel;           // scroll / zoom steps since the last poll (+ = up / zoom in)
  float pinch;           // trackpad pinch scale factor since the last poll (1 = none)
  int32_t ntouch;        // active touch points (multitouch screens)
  HalTouch touch[HAL_MAX_TOUCH];
  // --- desktop input (additive; zero on HALs without it)
  float wheel_x;         // horizontal scroll steps since the last poll (+ = right)
  uint32_t pbuttons;     // pointer buttons held: 1 left, 2 right, 4 middle
  uint32_t mods;         // HalMod bits held
  int32_t nkeys;
  HalKey keys[HAL_MAX_KEYS];
  int32_t ntext;
  char text[HAL_TEXT_BYTES];
  int32_t nbtn;
  HalButtonEvent btn[HAL_MAX_BUTTON_EVENTS];
};
// Optional (the runtime has weak defaults: no text input, a process-local clipboard, no cursor shapes).
// Text input (IME, on-screen keyboard) while a text field is focused; the rectangle is the field (logical pixels).
void hal_text_input(int32_t on, float x, float y, float w, float h);
const char* hal_clipboard_get(void);  // UTF-8, valid until the next call
void hal_clipboard_set(const char* s, size_t n);
enum HalCursor : int32_t { HAL_CURSOR_DEFAULT = 0, HAL_CURSOR_TEXT, HAL_CURSOR_POINTER, HAL_CURSOR_MOVE, HAL_CURSOR_EW_RESIZE,
  HAL_CURSOR_NS_RESIZE, HAL_CURSOR_CROSSHAIR, HAL_CURSOR_GRAB, HAL_CURSOR_GRABBING, HAL_CURSOR_NOT_ALLOWED };
void hal_set_cursor(int32_t shape);

/** One frame to show. Pixels come from the shared software rasterizer: the HAL calls render() for the bands it
 *  needs (whole damage at once on hosts, a few lines at a time on SPI panels). Pixels are 0x00RRGGBB. */
struct HalFrame {
  int32_t w, h;
  int32_t x0, y0, x1, y1;   // damaged rectangle (empty when nothing changed)
  void (*render)(uint32_t* rows, int32_t y0, int32_t y1);  // rows points at row y0 of a w-wide buffer
  // Same, but only the damaged rectangles are written; the rest of `rows` must still hold the previous frame
  // (persistent framebuffers). Cheaper when several small areas change (e.g. a grid of animations).
  void (*render_damage)(uint32_t* rows, int32_t y0, int32_t y1);
};

// Pen / stylus: HALs and display drivers push every sample they read (in hal_poll_input / HalDisplay.poll); the
// frame callback sees all samples since the previous frame (zinc:gfx penCount/penX...), so fast strokes are not lost.
enum HalPenFlag : uint32_t { HAL_PEN_DOWN = 1u << 0, HAL_PEN_ERASER = 1u << 1, HAL_PEN_HOVER = 1u << 2 };
struct HalPen { float x, y, pressure, tilt_x, tilt_y; uint32_t flags; };  // logical coords, pressure 0..1, tilt degrees
void hal_pen_push(const HalPen* s);  // implemented by the runtime (gfx.cpp)

void hal_init(const HalConfig* cfg);
void hal_shutdown(void);
// System allocator: HAL-internal use, debug builds (ASan) and oversized fallbacks.
void* hal_alloc(size_t n);
void hal_free(void* p);
uint64_t hal_time_us(void);
void hal_sleep_us(uint64_t us);
void hal_log(const char* s, size_t n);
void hal_log_err(const char* s, size_t n);
int hal_isatty(int fd);
const char* hal_env(const char* name);  // null when unset or unsupported
// MEM-10: the region managed by the TLSF heap (size comes from the profile, ZRT_HEAP_BYTES).
void hal_heap_region(void** base, size_t* size);
[[noreturn]] void hal_panic(const char* msg, const char* file, int line);
void hal_frame_begin(void);
void hal_frame_end(void);
void hal_poll_input(HalInput* in);
void hal_present(const HalFrame* f);
void hal_surface_size(int* w, int* h);
// Physical pixels per logical pixel for zinc:gfx frames (HiDPI). Optional: 1 when a HAL does not define it.
int32_t hal_pixel_scale(void);
// Implemented by the runtime: draws one frame now with the current surface size (HALs call it while the OS blocks
// the event loop, e.g. during a live window resize on macOS). Ignored when called re-entrantly.
void zrt_redraw(void);
// Fixed timestep used by headless HALs (virtual clock, TST-10). 0 = real time.
double hal_fixed_dt(void);
// Drives the main loop: native HALs loop until step() returns 0; the web HAL hands it to requestAnimationFrame.
void hal_run(int (*step)(void));

// Display drivers (plugins/display-*): a linked driver registers itself from a static constructor
// (`static HalDisplay d = {...}; static int r = (hal_display = &d, 0);`). The runtime then hands it the frames and
// asks it for input; init returns 0 to decline (no device), and the target HAL keeps the screen.
struct HalDisplay {
  int (*init)(const HalConfig* cfg);
  void (*present)(const HalFrame* f);
  void (*poll)(HalInput* in);   // may be null (no input device)
  void (*shutdown)(void);       // may be null
};
extern HalDisplay* hal_display;
}
