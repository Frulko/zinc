// zinc:gfx (UI-12): immediate-mode drawing into a retained command list. Each frame is diffed with the previous
// one; only the damaged rectangle is rasterized and presented (UI-09), so static screens cost almost nothing.
#include "zrt.h"
#include "zrt_raster.h"

#ifndef ZRT_MAX_DRAW_CMDS
#define ZRT_MAX_DRAW_CMDS 8192
#endif
#ifndef ZRT_TEXT_POOL
#define ZRT_TEXT_POOL 32768
#endif
#ifndef ZRT_POINT_POOL
#define ZRT_POINT_POOL 32768
#endif

namespace zrt {
extern Fn<void(double)> frame_cb;
extern HalInput input, prev_input;
extern int32_t frame_no;
extern bool quit_requested;
extern int32_t surf_w, surf_h;

namespace gfx {
using raster::Cmd;
struct Buf {
  Cmd cmds[ZRT_MAX_DRAW_CMDS];
  char text[ZRT_TEXT_POOL];
  float pts[ZRT_POINT_POOL];
  uint32_t ncmd, ntext, npts;
};
static Buf bufs[2];
static int cur = 0;
static bool first = true;
static const Buf* shown = nullptr;
static float tx = 0, ty = 0;  // translation applied to every command (UI transforms)

static raster::Frame frame_of(const Buf& b) { return raster::Frame{b.cmds, b.ncmd, b.text, b.pts}; }
static void render_rows(uint32_t* rows, int32_t y0, int32_t y1) {
  raster::render(frame_of(*shown), rows, surf_w, y0, y1, raster::Rect{0, y0, surf_w, y1});
}

void begin_frame() { Buf& b = bufs[cur]; b.ncmd = 0; b.ntext = 0; b.npts = 0; tx = ty = 0; }
void end_frame() {
  const Buf& now = bufs[cur];
  const Buf& before = bufs[cur ^ 1];
  raster::Rect d = first ? raster::Rect{0, 0, surf_w, surf_h} : raster::diff(frame_of(before), frame_of(now), surf_w, surf_h);
  first = false;
  shown = &now;
  stats.draw_cmds = now.ncmd;
  HalFrame f = {surf_w, surf_h, d.x0, d.y0, d.x1, d.y1, render_rows};
  hal_present(&f);
  cur ^= 1;
}
static Cmd* push(uint8_t kind, uint32_t color, int32_t alpha) {
  Buf& b = bufs[cur];
  if (b.ncmd == ZRT_MAX_DRAW_CMDS) return nullptr;  // ponytail: extra commands are dropped
  Cmd* c = &b.cmds[b.ncmd++];
  __builtin_memset(c, 0, sizeof(Cmd));  // padding participates in the frame diff
  c->kind = kind; c->c1 = color & 0xFFFFFF;
  c->alpha = (uint8_t)(alpha < 0 ? 0 : alpha > 255 ? 255 : alpha);
  return c;
}
static void box(Cmd* c, double x, double y, double w, double h) { c->x = (float)(x + tx); c->y = (float)(y + ty); c->w = (float)w; c->h = (float)h; }

void onFrame(Fn<void(double)> cb) { frame_cb = cb; }
int32_t width() { return surf_w; }
int32_t height() { return surf_h; }
void clear(uint32_t color) { push(raster::CLEAR, color, 255); }
void rect(double x, double y, double w, double h, uint32_t color) { if (Cmd* c = push(raster::RECT, color, 255)) box(c, x, y, w, h); }
void rrect(double x, double y, double w, double h, double r, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::RECT, color, alpha)) { box(c, x, y, w, h); c->r = (float)r; }
}
void gradient(double x, double y, double w, double h, double r, uint32_t c1, uint32_t c2, bool vertical, int32_t alpha) {
  if (Cmd* c = push(raster::RECT, c1, alpha)) { box(c, x, y, w, h); c->r = (float)r; c->c2 = c2 & 0xFFFFFF; c->grad = vertical ? 1 : 2; }
}
void border(double x, double y, double w, double h, double r, double width, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::BORDER, color, alpha)) { box(c, x, y, w, h); c->r = (float)r; c->s = (float)width; }
}
void shadow(double x, double y, double w, double h, double r, double blur, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::SHADOW, color, alpha)) { box(c, x, y, w, h); c->r = (float)r; c->s = (float)blur; }
}
static bool add_points(Cmd* c, const Array<double>& pts, bool closed_list) {
  Buf& b = bufs[cur];
  uint32_t n = (uint32_t)pts.length();
  if (b.npts + n > ZRT_POINT_POOL) return false;
  c->off = b.npts;
  float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
  uint32_t i = 0, contours = 0;
  while (i < n) {
    uint32_t cnt = (uint32_t)pts.get((int32_t)i);
    if (!closed_list) cnt = n / 2;
    b.pts[b.npts++] = (float)cnt;
    const uint32_t start = closed_list ? i + 1 : 0;
    for (uint32_t k = 0; k < cnt && start + k * 2 + 1 < n; k++) {
      float x = (float)(pts.get((int32_t)(start + k * 2)) + tx), y = (float)(pts.get((int32_t)(start + k * 2 + 1)) + ty);
      b.pts[b.npts++] = x; b.pts[b.npts++] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    contours++;
    if (!closed_list) break;
    i = start + cnt * 2;
  }
  c->n = contours;
  c->x = minx; c->y = miny; c->w = maxx - minx; c->h = maxy - miny;
  return true;
}
/** Filled polygon from flat [x0, y0, x1, y1, ...] coordinates. */
void polygon(const Array<double>& pts, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::POLY, color, alpha)) if (!add_points(c, pts, false)) bufs[cur].ncmd--;
}
/** Several contours: [count, x0, y0, ..., count, x0, y0, ...] (nonzero winding, for holes and vector art). */
void path(const Array<double>& contours, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::POLY, color, alpha)) if (!add_points(c, contours, true)) bufs[cur].ncmd--;
}
void line(double x1, double y1, double x2, double y2, uint32_t color) {
  // a 1px line is a thin quad
  double dx = x2 - x1, dy = y2 - y1, len = math::sqrt(dx * dx + dy * dy);
  if (len <= 0) { rect(x1, y1, 1, 1, color); return; }
  double nx = -dy / len * 0.5, ny = dx / len * 0.5;
  polygon(Array<double>::of(x1 + nx + 0.5, y1 + ny + 0.5, x2 + nx + 0.5, y2 + ny + 0.5, x2 - nx + 0.5, y2 - ny + 0.5, x1 - nx + 0.5, y1 - ny + 0.5), color, 255);
}
int32_t font(const String& name, int32_t px) { return raster::find_font(name.ptr(), name.bytes(), px); }
int32_t fontAscent(int32_t f) { return f >= 0 && f < raster::font_count ? raster::fonts[f].ascent : 0; }
int32_t lineHeight(int32_t f) { return f >= 0 && f < raster::font_count ? raster::fonts[f].ascent + raster::fonts[f].descent + raster::fonts[f].lineGap : 0; }
double textWidth(int32_t f, const String& s, double tracking) { return raster::text_advance(f, s.ptr(), s.bytes(), (float)tracking) / 64.0; }
void drawText(int32_t f, double x, double y, const String& s, uint32_t color, int32_t alpha, double tracking) {
  Buf& b = bufs[cur];
  uint32_t n = s.bytes();
  if (b.ntext + n > ZRT_TEXT_POOL) return;
  Cmd* c = push(raster::TEXT, color, alpha);
  if (!c) return;
  __builtin_memcpy(b.text + b.ntext, s.ptr(), n);
  c->res = f; c->off = b.ntext; c->n = n; c->s = (float)tracking;
  box(c, x, y, textWidth(f, s, tracking), lineHeight(f));
  b.ntext += n;
}
/** Legacy API: crisp 8px monospace grid scaled by `scale`. */
void text(double x, double y, const String& s, uint32_t color, int32_t scale) {
  static const char grid[] = "grid";
  drawText(raster::find_font(grid, 4, 8 * (scale < 1 ? 1 : scale)), x, y, s, color, 255, 0);
}
int32_t image(const String& name) { return raster::find_image(name.ptr(), name.bytes()); }
int32_t imageWidth(int32_t i) { return i >= 0 && i < raster::image_count ? raster::images[i].w : 0; }
int32_t imageHeight(int32_t i) { return i >= 0 && i < raster::image_count ? raster::images[i].h : 0; }
void drawImage(int32_t i, double x, double y, double w, double h, int32_t alpha, double radius) {
  if (Cmd* c = push(raster::IMAGE, 0, alpha)) { box(c, x, y, w, h); c->res = i; c->r = (float)radius; }
}
void clip(double x, double y, double w, double h) { if (Cmd* c = push(raster::CLIP, 0, 255)) box(c, x, y, w, h); }
void unclip() { push(raster::UNCLIP, 0, 255); }
void translate(double x, double y) { tx = (float)x; ty = (float)y; }

bool isDown(int32_t b) { return (input.buttons >> b) & 1u; }
bool wasPressed(int32_t b) { return ((input.buttons >> b) & 1u) && !((prev_input.buttons >> b) & 1u); }
double pointerX() { return input.px; }
double pointerY() { return input.py; }
bool pointerDown() { return input.pdown != 0; }
int32_t frame() { return frame_no; }
void quit() { quit_requested = true; }
}
}  // namespace zrt
