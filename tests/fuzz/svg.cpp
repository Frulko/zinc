// zinc:svg (plugins/svg): parse a document, draw it into a frame and rasterize the frame.
#include "fuzz.h"
#include "../../plugins/svg/native/svg.host.cpp"
namespace zrt { namespace gfx { void begin_frame(); } }

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  static NativeSvgEngine* e = zinc_create_SvgEngine();
  int32_t doc = e->parse(zfuzz::str(d, n));
  if (doc >= 0) {
    zrt::gfx::begin_frame();
    e->draw(doc, 0, 0, 320, 240, 255);
    size_t k = 0;
    if (uint8_t* png = zrt::gfx::capture_png(&k)) hal_free(png);
    e->dispose(doc);
  }
  zfuzz::clear();
  return 0;
}
