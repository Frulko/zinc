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
struct HalInput {
  uint32_t buttons;      // HalButton bits
  float px, py;          // pointer, logical coordinates
  int32_t pdown;
  int32_t quit;          // window closed / frame budget exhausted
  float wheel;           // scroll / zoom steps since the last poll (+ = up / zoom in)
  float pinch;           // trackpad pinch scale factor since the last poll (1 = none)
  int32_t ntouch;        // active touch points (multitouch screens)
  HalTouch touch[HAL_MAX_TOUCH];
};

/** One frame to show. Pixels come from the shared software rasterizer: the HAL calls render() for the bands it
 *  needs (whole damage at once on hosts, a few lines at a time on SPI panels). Pixels are 0x00RRGGBB. */
struct HalFrame {
  int32_t w, h;
  int32_t x0, y0, x1, y1;   // damaged rectangle (empty when nothing changed)
  void (*render)(uint32_t* rows, int32_t y0, int32_t y1);  // rows points at row y0 of a w-wide buffer
};

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
