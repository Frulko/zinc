// What the graphics host (src/host/gfx_host.cpp) asks of the desktop engine and a console core does without (ZN-455): the UI log, the system's
// signals (safe area, theme, back key), asset packs, image decoding from bytes and the PNG encoder of captures (the runtime writes its own stored PNG).
#include <stddef.h>
#include <stdint.h>

#define HOST_DEFINES_RESOURCE_STATS   // the definition below is the core's, not a weak one
#include "zn/resource_stats.h"

#ifndef ZN_CONSOLE_LIVE
#define ZN_CONSOLE_LIVE 0   // 1 with a console's HAL: the screen is real, a program runs until it ends (no 60-frame budget of a headless run)
#endif

extern "C" {
int zn_hal_is_live(void) { return ZN_CONSOLE_LIVE; }
int zn_hal_signal_count(void) { return 0; }
const char* zn_hal_signal_next(void) { return ""; }
int zn_ui_log_on(void) { return 0; }
void zn_ui_log_mark(int) {}
int zn_asset_font(const char*, uint32_t) { return -1; }
int zn_asset_image(const char*, uint32_t) { return -1; }
void zn_resource_stats_register(const char*, ZnResourceStatsFn, void*) {}
__attribute__((weak)) void hal_set_resize(int32_t) {}   // a console's HAL may follow the program's onResize
}

namespace zn::res {   // src/res/codec.cpp (stb) stays out of the core: imageFromBytes answers -1, captures use the runtime's PNG writer
uint8_t* encodePngAlloc(const uint8_t*, int, int, int, size_t*, void* (*)(size_t)) { return nullptr; }
uint8_t* decodeRgbaAlloc(const uint8_t*, size_t, int*, int*) { return nullptr; }
}

#ifndef ZRT_GROW_DRAW_CMDS
namespace zrt::gfx { bool grow_enabled = false; }   // the core's draw pool is fixed (runtime/gfx.cpp builds the grow variant only with ZRT_GROW_DRAW_CMDS)
#endif
