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

struct HalInput {
  uint32_t buttons;      // HalButton bits
  float px, py;          // pointer, logical coordinates
  int32_t pdown;
  int32_t quit;          // window closed / frame budget exhausted
};

enum HalDrawKind : uint8_t { HAL_DRAW_CLEAR, HAL_DRAW_RECT, HAL_DRAW_LINE, HAL_DRAW_TEXT };

struct HalDrawCmd {
  uint8_t kind, scale;
  uint16_t text_len;
  uint32_t color;        // 0xRRGGBB
  uint32_t text_off;     // into DrawList.text
  float x, y, w, h;      // for LINE: (x,y)-(w,h)
};

struct HalDrawList {
  const HalDrawCmd* cmds;
  uint32_t count;
  const char* text;
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
void hal_present(const HalDrawList* dl);
void hal_surface_size(int* w, int* h);
// Fixed timestep used by headless HALs (virtual clock, TST-10). 0 = real time.
double hal_fixed_dt(void);
}
