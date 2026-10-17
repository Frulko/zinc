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
// Gamepads (ZN-574; additive, zero on HALs without them). A slot keeps its index while its pad is connected, as the W3C Gamepad index does.
// buttons: one bit per button in the W3C "standard" order (0 south, 1 east, 2 west, 3 north, 4 5 shoulders, 6 7 triggers, 8 back, 9 start,
// 10 11 stick clicks, 12 up, 13 down, 14 left, 15 right, 16 guide); trigger: the analog values of 6 and 7 (0..1); axes: left x y, right x y
// (-1..1, down and right positive).
// rumble_ms is written by the program and taken (zeroed) by the HAL at its next poll.   ponytail: a field instead of a HAL call; a call when
// an effect must start before the next frame
// value: how far each button is pressed (0..1) on a pad that measures it (the DualShock 2's pressure-sensitive buttons, ZN-759); 0 where it does
// not, and then a held bit counts as 1.
#define HAL_MAX_GAMEPADS 4
struct HalGamepad { int32_t connected; uint32_t buttons; float trigger[2]; float axes[4]; float rumble_low, rumble_high; int32_t rumble_ms; char name[64]; float value[17]; };
/** The zinc:gfx buttons (HalButton bits) a gamepad holds: d-pad or left stick, A B X Y by position (south east west north), shoulders, start, back. */
static inline uint32_t hal_gamepad_buttons(const HalGamepad* p) {
  if (!p->connected) return 0;
  const uint32_t w = p->buttons;
  auto bit = [w](int i, uint32_t to) -> uint32_t { return (w >> i & 1u) ? to : 0u; };
  uint32_t b = bit(12, HAL_UP) | bit(13, HAL_DOWN) | bit(14, HAL_LEFT) | bit(15, HAL_RIGHT) | bit(0, HAL_A) | bit(1, HAL_B) | bit(2, HAL_X) | bit(3, HAL_Y) |
               bit(4, HAL_L) | bit(5, HAL_R) | bit(9, HAL_START) | bit(8, HAL_SELECT);
  if (p->axes[0] < -0.5f) b |= HAL_LEFT;
  if (p->axes[0] > 0.5f) b |= HAL_RIGHT;
  if (p->axes[1] < -0.5f) b |= HAL_UP;
  if (p->axes[1] > 0.5f) b |= HAL_DOWN;
  return b;
}
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
  // precise scrolling (trackpads; additive): pixels since the last poll, resampled at frame time by the HAL so
  // uneven event timing does not judder (+ = up / left, like wheel), and the gesture phase
  float scroll_dx, scroll_dy;
  int32_t scroll_phase;   // 0 none, 1 fingers down / precise stream active, 2 the gesture ended during this poll,
                          // 3 fingers landed on the trackpad (stops a running inertia)
  HalGamepad pad[HAL_MAX_GAMEPADS];   // their zinc:gfx buttons are also in `buttons` (the runtime adds them after the poll)
};
// Optional (the runtime has weak defaults: no text input, a process-local clipboard, no cursor shapes).
// Text input (IME, on-screen keyboard) while a text field is focused; the rectangle is the field (logical pixels).
void hal_text_input(int32_t on, float x, float y, float w, float h);
const char* hal_clipboard_get(void);  // UTF-8, valid until the next call
void hal_clipboard_set(const char* s, size_t n);
enum HalCursor : int32_t { HAL_CURSOR_DEFAULT = 0, HAL_CURSOR_TEXT, HAL_CURSOR_POINTER, HAL_CURSOR_MOVE, HAL_CURSOR_EW_RESIZE,
  HAL_CURSOR_NS_RESIZE, HAL_CURSOR_CROSSHAIR, HAL_CURSOR_GRAB, HAL_CURSOR_GRABBING, HAL_CURSOR_NOT_ALLOWED };
void hal_set_cursor(int32_t shape);
// A device feature of the machine (zinc:sys device(query, arg), ZN-759; optional): the console HALs answer the queries their hardware has (battery,
// network, motion, gyro, vibrate, reartouch, microphone, stereo, eye, storage) and null for the others, which then answer "" (none here).
const char* hal_device(const char* query, const char* arg);
// Escape (optional, weak no-ops): by_app = 1 stops the HAL from acting on Escape itself; hal_escape() is its default
// action (leave fullscreen, else quit; nothing in kiosk mode), called by the app for an unhandled Escape.
void hal_escape_by_app(int32_t on);
void hal_escape(void);
// More windows (ZN-663; optional, the runtime has weak defaults: a HAL without them has the main window only). Window 0 is the main one, the
// others get ids from the runtime. The HAL keeps the rule of the last window: closing one keeps the others, a closed main window is hidden
// while others are open, closing the last one ends the program (the next poll reports quit).
int32_t hal_win_open(int32_t id, const char* title, int32_t w, int32_t h);   // 1: opened, w x h logical pixels
void hal_win_close(int32_t id);                                             // the program closes a window
int32_t hal_win_state(int32_t id);                                          // 1 open, 0 closed (by the user or hal_win_close)
void hal_win_input(int32_t id, HalInput* in, int32_t* w, int32_t* h);       // its events since the last call, pointer and keys; its size
void hal_win_present(int32_t id, const uint32_t* px, int32_t pw, int32_t ph);   // a frame in physical pixels, 0x00RRGGBB
void hal_win_current(int32_t id);                                           // the window being drawn: text input follows it

/** One frame to show. Pixels come from the shared software rasterizer: the HAL calls render() for the bands it
 *  needs (whole damage at once on hosts, a few lines at a time on SPI panels). Pixels are 0x00RRGGBB. */
// A frame as draw commands (layout of zrt::raster::Frame, runtime/zrt_raster.h): what a GPU display replays.
struct HalCmdList { const void* cmds; uint32_t count; const char* text; const float* pts; };
// A frame that scrolled (ZN-744, zrt::raster::diff_move): the pixels of `area` move by (dx, dy), a pixel at p going to p + (dx, dy) (what would come
// from outside the area stays), then the `n` rectangles of `damage` are drawn whole (HalFrame.render_box). The frame's own damage box and
// render_damage cover the area as well, for a display that does not move pixels.
struct HalRect { int32_t x0, y0, x1, y1; };
struct HalMove { HalRect area; int32_t dx, dy; int32_t n; const HalRect* damage; };
struct HalFrame {
  int32_t w, h;
  int32_t x0, y0, x1, y1;   // damaged rectangle (empty when nothing changed)
  void (*render)(uint32_t* rows, int32_t y0, int32_t y1);  // rows points at row y0 of a w-wide buffer
  // Same, but only the damaged rectangles are written; the rest of `rows` must still hold the previous frame
  // (persistent framebuffers). Cheaper when several small areas change (e.g. a grid of animations).
  void (*render_damage)(uint32_t* rows, int32_t y0, int32_t y1);
  // GPU displays (docs/reports/gpu-renderer-design.md): the command lists to draw, in paint order (the program's
  // frame, then the runtime overlays); returns how many were written (at most `max`). Null: pixels only.
  int32_t (*frames)(const HalCmdList* out[], int32_t max);
  // render() with the holes of the hardware layers (HAL_LAYER_HOLE) filled with `color` instead; null when the frame has no layer.
  void (*render_holes)(uint32_t* rows, int32_t y0, int32_t y1, uint32_t color);
  // Every pixel of the box x0..x1 of rows y0..y1 and nothing outside it, for a buffer whose box holds stale pixels and the rest the previous
  // frame (an Android window buffer, ZN-743). Null: render() the whole rows.
  void (*render_box)(uint32_t* rows, int32_t y0, int32_t y1, int32_t x0, int32_t x1);
  const HalMove* move;   // null: nothing moved
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
// Optional (the runtime's weak default returns 0): further regions for the same heap, asked for with i = 0, 1...
// until it returns 0 (ESP32: internal RAM is split in several blocks, the largest one alone is ~110 KiB).
int hal_heap_region_more(int i, void** base, size_t* size);
[[noreturn]] void hal_panic(const char* msg, const char* file, int line);
void hal_frame_begin(void);
void hal_frame_end(void);
void hal_poll_input(HalInput* in);
void hal_present(const HalFrame* f);
void hal_surface_size(int* w, int* h);
// Physical pixels per logical pixel for zinc:gfx frames (HiDPI). Optional: 1 when a HAL does not define it.
int32_t hal_pixel_scale(void);
// The window the program draws into, for plugins that attach native views (plugins/webview): the SDL_Window* on
// macOS/Linux, null when there is none (headless, display plugins) or on HALs without windows (not defined there).
void* hal_window_handle(void);
// Implemented by the runtime: draws one frame now with the current surface size (HALs call it while the OS blocks
// the event loop, e.g. during a live window resize on macOS). Ignored when called re-entrantly.
void zrt_redraw(void);
// An engine that runs the frame loop itself (Zinc Next: the program's own loop, not a runtime frame callback) draws that frame here; null: none.
extern void (*zrt_redraw_hook)(void);
// Fixed timestep used by headless HALs (virtual clock, TST-10). 0 = real time.
double hal_fixed_dt(void);
// Drives the main loop: native HALs loop until step() returns 0; the web HAL hands it to requestAnimationFrame.
void hal_run(int (*step)(void));

// Hardware layers (ZN-731): a picture that lies in device memory (on Linux the dmabufs of a video decoder) is shown by the display itself,
// under the software frame, and the CPU never reads it. Before it asks for a frame's pixels the runtime offers the driver the pictures
// that frame draws (HalDisplay.layers); where the driver takes one, the rasterizer writes HAL_LAYER_HOLE in place of the picture and the
// driver shows its layer through those pixels. What the frame draws after the picture stays in front of it: an opaque pixel replaces
// the hole; where something was blended over it the driver asks for the same rows again with the holes white (HalFrame.render_holes)
// and has, from the two, how much of the picture each pixel lets through.
#define HAL_LAYER_HOLE 0x01000000u
#define HAL_MAX_LAYERS 2
struct HalPicture {
  uint64_t modifier;             // DRM format modifier of the buffers
  uint32_t serial;               // another value for each new picture
  uint32_t format;               // DRM fourcc (YU12, NV12...)
  int32_t w, h;                  // the visible size
  int32_t nplanes;
  int32_t fd[4];                 // the dmabuf of each plane
  uint32_t offset[4], pitch[4];
  int32_t full_range, bt709;     // the stream's colour range and matrix (else limited, BT.601)
};
struct HalLayer { const HalPicture* pic; int32_t x, y, w, h; };   // where on the frame, in its pixels; it may pass the edges
/** A pixel of the frame in the place of a layer, as the driver composes it over the picture (ARGB, colour multiplied by alpha): `s` from
 *  render(), `w` the same pixel from render_holes(.., 0xFFFFFF). A hole is transparent; a pixel that differs in the two renders was
 *  blended over the picture and lets that much of it through (white minus black, read on green); its colour is the one over the black hole. */
static inline uint32_t hal_layer_pixel(uint32_t s, uint32_t w) {
  if (s == HAL_LAYER_HOLE) return 0;
  const int32_t through = (int32_t)((w >> 8) & 255) - (int32_t)((s >> 8) & 255);
  return (uint32_t)(255 - (through < 0 ? 0 : through)) << 24 | (s & 0xFFFFFF);
}

// Display drivers (plugins/display-*): a linked driver registers itself from a static constructor
// (`static HalDisplay d = {...}; static int r = (hal_display = &d, 0);`). The runtime then hands it the frames and
// asks it for input; init returns 0 to decline (no device), and the target HAL keeps the screen.
struct HalDisplay {
  int (*init)(const HalConfig* cfg);
  void (*present)(const HalFrame* f);
  void (*poll)(HalInput* in);   // may be null (no input device)
  void (*shutdown)(void);       // may be null
  int owns_input;               // 1: the driver reads the OS events itself (display-gl); else the target HAL does
  int host_window;              // 1: the driver shows its frames through the target HAL's window (hal_present), e.g.
                                //    the reMarkable emulator; 0: it has its own output (a panel, an emulator window)
  int32_t (*pixel_scale)(void); // may be null: 1, a panel's own pixels. A desktop window returns zoom x screen density (Retina), read once after init
  // may be null (no hardware layers). The layers of the frame presented next, in paint order (n = 0: none); returns a bit per layer it
  // will show. A layer it refuses is drawn by the rasterizer from the picture's pixels.
  uint32_t (*layers)(const HalLayer* l, int32_t n);
  // may be null (a panel of a fixed size, a window). The screen's own size, asked before init when the program names no size (zinc.json, the
  // board, ZINC_SIZE): the surface is then the screen, pixel for pixel. Leaves w and h alone when there is no screen to ask.
  void (*native_size)(int32_t* w, int32_t* h);
  // may be null (no device features). The device's features behind the web APIs of lib/std/web.ts (navigator.getBattery, wakeLock, onLine,
  // document.visibilityState, the sensors...): a query and its argument, a JSON or plain answer valid until the next call, nullptr when the
  // driver does not know the query (the host then answers for the desktop). Queries: docs/guide/09-web-apis.md "Device".
  const char* (*device)(const char* query, const char* arg);
  // may be null (a fixed surface). The surface's logical size now, when the system changed it after init: a system keyboard that takes
  // the bottom of the screen, a rotation. The runtime then draws a whole frame at that size.
  void (*surface_size)(int32_t* w, int32_t* h);
};
extern HalDisplay* hal_display;
}
