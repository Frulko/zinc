// zinc:gfx draw calls with arbitrary arguments (NaN, infinities, huge and negative sizes, bad contour counts), then
// the frame is rasterized twice (end_frame's damage path and a full capture): the software rasterizer must stay in
// its buffers whatever a program draws (runtime/gfx.cpp, runtime/raster.cpp).
#include "fuzz.h"
namespace zrt { namespace gfx { void begin_frame(); void end_frame(); } }
using namespace zrt;

namespace {
struct In {
  const uint8_t* p; size_t n;
  uint8_t u8() { if (!n) return 0; n--; return *p++; }
  double num() {  // small ints mostly, sometimes an extreme
    uint8_t k = u8();
    switch (k & 7) {
      case 0: return __builtin_nan("");
      case 1: return (k & 8) ? 1e30 : -1e30;
      case 2: return (double)(int8_t)u8() / 7.0;
      case 3: return (double)(int32_t)(u8() | u8() << 8 | u8() << 16 | (uint32_t)u8() << 24);
      default: return (double)(int8_t)u8() * 3;
    }
  }
  Array<double> arr() { Array<double> a = Array<double>::with_cap(0); int m = u8() % 24; for (int i = 0; i < m; i++) a.push(num()); return a; }
};
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > 4096) return 0;
  static int32_t font = gfx::font(String::from("sans", 4), 16);
  In in{d, n};
  gfx::begin_frame();
  int32_t img = -1;
  for (int ops = 0; in.n && ops < 64; ops++) {
    uint32_t c = in.u8() * 0x10101u;
    switch (in.u8() % 16) {
      case 0: gfx::rect(in.num(), in.num(), in.num(), in.num(), c); break;
      case 1: gfx::rrect(in.num(), in.num(), in.num(), in.num(), in.num(), c, in.u8()); break;
      case 2: gfx::gradient(in.num(), in.num(), in.num(), in.num(), in.num(), c, ~c, in.u8() & 1, in.u8()); break;
      case 3: gfx::border(in.num(), in.num(), in.num(), in.num(), in.num(), in.num(), c, in.u8()); break;
      case 4: gfx::shadow(in.num(), in.num(), in.num(), in.num(), in.num(), in.num(), c, in.u8()); break;
      case 5: gfx::polygon(in.arr(), c, in.u8()); break;
      case 6: gfx::path(in.arr(), c, in.u8()); break;
      case 7: gfx::line(in.num(), in.num(), in.num(), in.num(), c); break;
      case 8: gfx::stroke(in.arr(), in.num(), c, in.u8(), in.u8() & 1); break;
      case 9: { char t[8]; int k = in.u8() % 8; for (int i = 0; i < k; i++) t[i] = (char)in.u8(); gfx::drawText(font, in.num(), in.num(), String::from(t, (uint32_t)k), c, in.u8(), in.num()); break; }
      case 10: gfx::clip(in.num(), in.num(), in.num(), in.num(), in.num()); break;
      case 11: gfx::unclip(); break;
      case 12: gfx::translate(in.num(), in.num()); break;
      case 13: if (img < 0) img = gfx::createImage((int32_t)(int8_t)in.u8() * 8, in.u8() % 64); break;
      case 14: if (img >= 0) gfx::drawImage(img, in.num(), in.num(), in.num(), in.num(), in.u8(), in.num()); break;
      case 15: (void)gfx::textWidth(font, String::from((const char*)in.p, in.n < 6 ? (uint32_t)in.n : 6), in.num()); break;
    }
  }
  gfx::end_frame();
  size_t k = 0;
  if (uint8_t* png = gfx::capture_png(&k)) hal_free(png);
  if (img >= 0) gfx::destroyImage(img);
  return 0;
}
