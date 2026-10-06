// The graphics host: serves the Rt::HostGfx* calls (include/zn/runtime.h) over the existing runtime (runtime/gfx.cpp, raster.cpp),
// headless. Compiled with the runtime's flags (C++17, no exceptions, no RTTI, no FP contraction) so the pixels match its builds.
#include <stdlib.h>

#include "hal.h"
#include "zn/host.h"
#include "zn/runtime.h"
#include "zrt.h"
#include "zrt_raster.h"

namespace zrt {
extern int32_t frame_no;
namespace gfx { void begin_frame(); void end_frame(); }
}

namespace {

using zn::host::HostArg;
using zn::Rt;

zrt::String str(const HostArg& a) { return zrt::String::from(static_cast<const char*>(a.p), a.n); }
zrt::Array<double> arr(const HostArg& a) {
  auto r = zrt::Array<double>::with_cap(static_cast<int32_t>(a.n));
  const double* p = static_cast<const double*>(a.p);
  for (uint32_t k = 0; k < a.n; ++k) r.push_raw(p[k]);
  return r;
}

void call(int id, const HostArg* a, HostArg* r) {
  namespace g = zrt::gfx;
  auto u = [&](int k) { return static_cast<uint32_t>(a[k].i); };
  auto n = [&](int k) { return static_cast<int32_t>(a[k].i); };
  switch (static_cast<Rt>(id)) {
    case Rt::HostGfxFrames: {
      static HalConfig cfg = {320, 240, "zinc", 1};
      static bool started = false;
      if (!started) { started = true; zrt::start(cfg, 0, nullptr); }
      const char* f = getenv("ZINC_FRAMES");
      r->i = f ? atoi(f) : 60;
      break;
    }
    case Rt::HostGfxBegin: g::begin_frame(); break;
    case Rt::HostGfxEnd: g::end_frame(); zrt::frame_no++; break;
    case Rt::HostGfxClear: g::clear(u(0)); break;
    case Rt::HostGfxRect: g::rect(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxRRect: g::rrect(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), n(6)); break;
    case Rt::HostGfxFont: r->i = zrt::raster::find_font(static_cast<const char*>(a[0].p), a[0].n, n(1)); break;
    case Rt::HostGfxDrawText: g::drawText(n(0), a[1].d, a[2].d, str(a[3]), u(4), n(5), a[6].d); break;
    case Rt::HostGfxLine: g::line(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxText: g::text(a[0].d, a[1].d, str(a[2]), u(3), n(4)); break;
    case Rt::HostGfxGradient: g::gradient(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), u(6), a[7].i != 0, n(8)); break;
    case Rt::HostGfxBorder: g::border(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxShadow: g::shadow(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxPolygon: g::polygon(arr(a[0]), u(1), n(2)); break;
    case Rt::HostGfxPath: g::path(arr(a[0]), u(1), n(2)); break;
    case Rt::HostGfxStroke: g::stroke(arr(a[0]), a[1].d, u(2), n(3), a[4].i != 0); break;
    case Rt::HostGfxFontAscent: r->i = g::fontAscent(n(0)); break;
    case Rt::HostGfxLineHeight: r->i = g::lineHeight(n(0)); break;
    case Rt::HostGfxTextWidth: r->d = g::textWidth(n(0), str(a[1]), a[2].d); break;
    case Rt::HostGfxImage: r->i = g::image(str(a[0])); break;
    case Rt::HostGfxImageWidth: r->i = g::imageWidth(n(0)); break;
    case Rt::HostGfxImageHeight: r->i = g::imageHeight(n(0)); break;
    case Rt::HostGfxDrawImage: g::drawImage(n(0), a[1].d, a[2].d, a[3].d, a[4].d, n(5), a[6].d); break;
    case Rt::HostGfxClip: g::clip(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d); break;
    case Rt::HostGfxUnclip: g::unclip(); break;
    case Rt::HostGfxTranslate: g::translate(a[0].d, a[1].d); break;
    case Rt::HostGfxKeep: g::keep(); break;
    case Rt::HostGfxWidth: r->i = g::width(); break;
    case Rt::HostGfxHeight: r->i = g::height(); break;
    case Rt::HostGfxPixelScale: r->i = g::pixelScale(); break;
    default: break;
  }
}

}  // namespace

namespace zn::host {

void installGfx() { hostGfx = call; }

}  // namespace zn::host
