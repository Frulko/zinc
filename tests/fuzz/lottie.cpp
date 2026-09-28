// zinc:lottie (plugins/lottie): parse an animation, draw its first, middle and last frame, rasterize.
#include "fuzz.h"
#include "../../plugins/lottie/native/lottie.host.cpp"
namespace zrt { namespace gfx { void begin_frame(); } }

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  static NativeLottie* l = zinc_create_Lottie();
  int32_t a = l->parse(zfuzz::str(d, n));
  if (a >= 0) {
    double f = l->frames(a);
    const double at[] = {0, f / 2, f - 1};
    for (double t : at) {
      zrt::gfx::begin_frame();
      l->draw(a, t, 0, 0, 320, 240, 255);
      size_t k = 0;
      if (uint8_t* png = zrt::gfx::capture_png(&k)) hal_free(png);
    }
    l->free(a);
  }
  zfuzz::clear();
  return 0;
}
