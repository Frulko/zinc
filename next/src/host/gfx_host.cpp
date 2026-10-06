// The graphics host: fills the zn::host::Gfx table (zn/host.h) over the existing runtime (runtime/gfx.cpp, raster.cpp), headless.
// This file is compiled with the runtime's flags (C++17, no exceptions, no RTTI, no FP contraction) so the pixels match its builds.
#include <stdlib.h>

#include "hal.h"
#include "zn/host.h"
#include "zrt.h"
#include "zrt_raster.h"

namespace zrt {
extern int32_t frame_no;
namespace gfx { void begin_frame(); void end_frame(); }
}

namespace {

int32_t frames() {
  static HalConfig cfg = {320, 240, "zinc", 1};
  static bool started = false;
  if (!started) { started = true; zrt::start(cfg, 0, nullptr); }
  const char* f = getenv("ZINC_FRAMES");
  return f ? atoi(f) : 60;
}
void begin() { zrt::gfx::begin_frame(); }
void end() { zrt::gfx::end_frame(); zrt::frame_no++; }
int32_t font(const char* family, uint32_t len, int32_t px) { return zrt::raster::find_font(family, len, px); }
void drawText(int32_t f, double x, double y, const char* s, uint32_t len, uint32_t color, int32_t alpha, double tracking) {
  zrt::gfx::drawText(f, x, y, zrt::String::from(s, len), color, alpha, tracking);
}

const zn::host::Gfx table = {frames, begin, end, zrt::gfx::clear, zrt::gfx::rect, zrt::gfx::rrect, font, drawText};

}  // namespace

namespace zn::host {

void installGfx() { gfx = &table; }

}  // namespace zn::host
