// zinc:canvas: emits the context's fills as raw POLY commands (even-odd flag, gradient paint record after the
// contours, see runtime/raster.cpp paint_at). Portable C++ (every target with the 2D rasterizer).
#include "zinc_native_canvas2d.h"
#include "zrt_raster.h"

using namespace zrt;
namespace {
// `number` in the spec is the program's number kind (f64, f32 or fx12)
template<class C, class A, class B, class D, class E, class F> A arg0(void (C::*)(A, B, D, E, F));
typedef decltype(arg0(&NativeCanvas2D::fill)) Nums;
template<class C, class A, class B, class D, class E, class F, class G, class H> B arg1(void (C::*)(A, B, D, E, F, G, H));
typedef decltype(arg1(&NativeCanvas2D::image)) N;

struct Impl : NativeCanvas2D {
  float* buf = nullptr;
  int32_t cap = 0;
  void fill(Nums contours, uint32_t color, int32_t alpha, bool evenodd, Nums paint) override {
    const int32_t n = contours.length(), m = paint.length();
    if (n < 7 || alpha <= 0) return;
    if (n + m > cap) {  // ponytail: grows, never shrinks
      if (buf) hal_free(buf);
      cap = (n + m) * 2;
      buf = (float*)hal_alloc((size_t)cap * sizeof(float));
      if (!buf) { cap = 0; return; }
    }
    float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
    uint32_t count = 0;
    for (int32_t i = 0; i < n;) {
      int32_t k = (int32_t)(double)contours.get(i);
      if (k < 0 || i + 1 + 2 * k > n) return;
      buf[i] = (float)k;
      for (int32_t j = 0; j < k; j++) {
        float x = (float)(double)contours.get(i + 1 + 2 * j), y = (float)(double)contours.get(i + 2 + 2 * j);
        buf[i + 1 + 2 * j] = x; buf[i + 2 + 2 * j] = y;
        x0 = x < x0 ? x : x0; x1 = x > x1 ? x : x1; y0 = y < y0 ? y : y0; y1 = y > y1 ? y : y1;
      }
      i += 1 + 2 * k;
      count++;
    }
    for (int32_t i = 0; i < m; i++) buf[n + i] = (float)(double)paint.get(i);
    raster::Cmd* c = gfx::emit(raster::POLY, buf, (uint32_t)(n + m));
    if (!c) return;
    c->n = count;  // emit() would count the paint record as contours
    c->c1 = color & 0xFFFFFF;
    c->alpha = (uint8_t)(alpha > 255 ? 255 : alpha);
    c->pad = evenodd ? 1 : 0;
    c->grad = m ? 4 : 0;
    c->x = x0; c->y = y0; c->w = x1 - x0; c->h = y1 - y0;
  }
  void image(int32_t image, N x, N y, N w, N h, int32_t alpha, bool smooth) override {
    if (alpha <= 0) return;
    if (raster::Cmd* c = gfx::emit(raster::IMAGE, nullptr, 0)) {
      c->x = (float)x; c->y = (float)y; c->w = (float)w; c->h = (float)h;
      c->res = image; c->alpha = (uint8_t)(alpha > 255 ? 255 : alpha); c->grad = smooth ? 0 : 1;
      c->c2 = raster::image_version(image);
    }
  }
};
}  // namespace

NativeCanvas2D* zinc_create_Canvas2D() {
  static Impl e;
  e.rc = zrt::IMMORTAL;
  return &e;
}
