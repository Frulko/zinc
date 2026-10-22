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

// The context's points are in the frame's pixels; zinc:gfx's setTransform (a zinc:stage node drawing at its place, a turned zinc:ui
// parent) still has to move them, as it moves gfx's own shapes and the context's clip: emit() leaves that to the plugin (gfx::matrix).
struct Matrix {
  double m[6];
  bool on = gfx::matrix(m);
  void apply(float& x, float& y) const {
    if (!on) return;
    const double X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    x = (float)X; y = (float)Y;
  }
  float scale() const { const double d = m[0] * m[3] - m[1] * m[2]; return on ? (float)__builtin_sqrt(d < 0 ? -d : d) : 1; }
};

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
    const Matrix xf{};
    float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
    uint32_t count = 0;
    for (int32_t i = 0; i < n;) {
      int32_t k = (int32_t)(double)contours.get(i);
      if (k < 0 || i + 1 + 2 * k > n) return;
      buf[i] = (float)k;
      for (int32_t j = 0; j < k; j++) {
        float x = (float)(double)contours.get(i + 1 + 2 * j), y = (float)(double)contours.get(i + 2 + 2 * j);
        xf.apply(x, y);
        buf[i + 1 + 2 * j] = x; buf[i + 2 + 2 * j] = y;
        x0 = x < x0 ? x : x0; x1 = x > x1 ? x : x1; y0 = y < y0 ? y : y0; y1 = y > y1 ? y : y1;
      }
      i += 1 + 2 * k;
      count++;
    }
    for (int32_t i = 0; i < m; i++) buf[n + i] = (float)(double)paint.get(i);
    if (m >= 7 && xf.on) {   // the gradient record [kind, x0, y0, r0, x1, y1, r1, ...]: its two points move, its radii scale
      xf.apply(buf[n + 1], buf[n + 2]);
      xf.apply(buf[n + 4], buf[n + 5]);
      buf[n + 3] *= xf.scale(); buf[n + 6] *= xf.scale();
    }
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
    // ponytail: the box between two opposite corners moved by the matrix: exact for a move and a scale; images are placed, not turned
    // (docs/plugins/canvas2d.md), so a turned matrix only places them
    const Matrix xf{};
    float ax = (float)x, ay = (float)y, bx = (float)x + (float)w, by = (float)y + (float)h;
    xf.apply(ax, ay); xf.apply(bx, by);
    if (raster::Cmd* c = gfx::emit(raster::IMAGE, nullptr, 0)) {
      c->x = ax < bx ? ax : bx; c->y = ay < by ? ay : by; c->w = ax < bx ? bx - ax : ax - bx; c->h = ay < by ? by - ay : ay - by;
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
