// What the graphics host (src/host/gfx_host.cpp) asks of the desktop engine and a console core does without (ZN-455): the UI log, the system's
// signals (safe area, theme, back key), image decoding from bytes and the PNG encoder of captures (the runtime writes its own stored PNG). The
// images of the asset pack linked into the core (ZIM1 entries: an imported image, a page of a sprite atlas) are zinc:gfx images (ZN-759).
#include <stddef.h>
#include <stdint.h>
#include <map>
#include <string>

#include "zn/zim.h"
#include "zrt_raster.h"

bool zn_console_pack_read(const std::string& name, int kind, std::string& out);   // host_console.cpp

#define HOST_DEFINES_RESOURCE_STATS   // the definition below is the core's, not a weak one
#include "zn/resource_stats.h"

#ifndef ZN_CONSOLE_LIVE
#define ZN_CONSOLE_LIVE 0   // 1 with a console's HAL: the screen is real, a program runs until it ends (no 60-frame budget of a headless run)
#endif

extern "C" {
// zinc:gfx image(name) of a pack's image entry: decoded once into a runtime image (block-compressed formats are a GPU's: drawn transparent here)
int zn_asset_image(const char* name, uint32_t n) {
  static std::map<std::string, int32_t> made;
  const std::string key(name, n);
  if (auto it = made.find(key); it != made.end()) return it->second;
  std::string zim;
  if (!zn_console_pack_read(key, 1, zim) || zim.size() < zn::zim::kHeader || zim.compare(0, 4, "ZIM1") != 0) return -1;
  const auto* p = reinterpret_cast<const unsigned char*>(zim.data());
  auto u32 = [&](int at) { return static_cast<uint32_t>(p[at] | p[at + 1] << 8 | p[at + 2] << 16) | static_cast<uint32_t>(p[at + 3]) << 24; };
  const zn::zim::Format* f = zn::zim::format(p[4]);
  const unsigned flags = p[6] | p[7] << 8;
  const uint32_t w = u32(8), h = u32(12);
  if (!f || f->bw > 1 || w == 0 || h == 0 || w > 4096 || h > 4096 || zim.size() < zn::zim::kHeader + zn::zim::levelBytes(*f, w, h)) return -1;
  const int32_t id = zrt::raster::dyn_create(static_cast<int32_t>(w), static_cast<int32_t>(h));
  uint32_t* px = zrt::raster::dyn_pixels(id);
  if (!px) return -1;
  bool alpha = false;
  for (size_t i = 0, k = static_cast<size_t>(w) * h; i < k; i++) {
    px[i] = zn::zim::argb(*f, p + zn::zim::kHeader, i, flags & zn::zim::Premultiplied);
    alpha |= (px[i] >> 24) != 255;
  }
  zrt::raster::dyn_set_alpha(id, alpha);
  zrt::raster::dyn_update(id, nullptr, 0);
  made[key] = id;
  return id;
}
int zn_hal_is_live(void) { return ZN_CONSOLE_LIVE; }
int zn_hal_signal_count(void) { return 0; }
const char* zn_hal_signal_next(void) { return ""; }
int zn_ui_log_on(void) { return 0; }
void zn_ui_log_mark(int) {}
int zn_asset_font(const char*, uint32_t) { return -1; }
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
