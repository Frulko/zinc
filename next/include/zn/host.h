#pragma once
// The host's graphics surface (zinc:gfx) as the runtime calls it: plain C++ types, no engine types. The engine decodes the
// arguments of the Rt::HostGfx* calls (runtime.h) and calls through this table; `src/host` fills it by linking the existing
// runtime (runtime/gfx.cpp and raster). When no table is installed the calls trap with a clear message.
#include <cstdint>

namespace zn::host {

struct Gfx {
  std::int32_t (*frames)();                 // frames to run (ZINC_FRAMES, default 60)
  void (*begin)();                          // starts a frame
  void (*end)();                            // rasterizes and presents the frame (a capture is taken here when asked for)
  void (*clear)(std::uint32_t color);
  void (*rect)(double x, double y, double w, double h, std::uint32_t color);
  void (*rrect)(double x, double y, double w, double h, double r, std::uint32_t color, std::int32_t alpha);
  std::int32_t (*font)(const char* family, std::uint32_t len, std::int32_t px);
  void (*drawText)(std::int32_t font, double x, double y, const char* s, std::uint32_t len, std::uint32_t color, std::int32_t alpha, double tracking);
};

// Installed by the host library at startup; null in an engine built without one.
extern const Gfx* gfx;
// Provided by src/host (built with ZN_HOST_GFX): installs the table; the runtime itself starts on the first `frames()` call.
void installGfx();

}  // namespace zn::host
