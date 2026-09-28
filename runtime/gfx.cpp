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
extern bool display_driver;
static void present(const HalFrame* f) { if (display_driver) hal_display->present(f); else hal_present(f); }
}  // namespace zrt
// HiDPI: physical pixels per logical pixel (the SDL HAL reports Retina density x window magnification)
extern "C" __attribute__((weak)) int32_t hal_pixel_scale(void) { return 1; }
namespace zrt {
namespace gfx {
// The program draws in logical pixels; frames are rasterized at pw x ph physical pixels (pxk per logical pixel).
static int32_t pxk = 0, pw = 0, ph = 0;
static void init_scale() {
  if (pxk) return;
  pxk = display_driver ? 1 : hal_pixel_scale();
  if (pxk < 1) pxk = 1;
  pw = surf_w * pxk; ph = surf_h * pxk;
}
}

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
static bool kept = false;     // keep(): nothing changed, show the previous frame again
#ifndef ZRT_PEN_SAMPLES
#define ZRT_PEN_SAMPLES 256
#endif
static HalPen pen_q[ZRT_PEN_SAMPLES];  // samples pushed since the last frame
static int32_t pen_n = 0;

static raster::Frame frame_of(const Buf& b) { return raster::Frame{b.cmds, b.ncmd, b.text, b.pts}; }

// ---------- runtime overlay (docs/dev-mode.md): red box and console banner, drawn over the program's frame ----------
struct Overlay { Cmd cmds[64]; char text[4096]; uint32_t ncmd, ntext; };
static Overlay rbox, banner;       // box: full-screen red box; banner: LogBox-style strip at the bottom
static bool ovl_changed = false;  // next present repaints the whole screen
static double banner_until = 0;
static int32_t banner_count = 0;
static raster::Frame ovl_frame(const Overlay& o) { return raster::Frame{o.cmds, o.ncmd, o.text, nullptr}; }
static int32_t ovl_k() { init_scale(); return (surf_w >= 960 ? 2 : 1) * pxk; }  // text scale: 8 px cells, 16 px on large screens
static Cmd* ovl_push(Overlay& o, uint8_t kind, uint32_t color) {
  if (o.ncmd == sizeof o.cmds / sizeof o.cmds[0]) return nullptr;
  Cmd* c = &o.cmds[o.ncmd++];
  __builtin_memset(c, 0, sizeof(Cmd));
  c->kind = kind; c->c1 = color; c->alpha = 255;
  return c;
}
static void ovl_rect(Overlay& o, float x, float y, float w, float h, uint32_t color) {
  if (Cmd* c = ovl_push(o, raster::RECT, color)) { c->x = x; c->y = y; c->w = w; c->h = h; }
}
static void ovl_text(Overlay& o, float x, float y, const char* s, uint32_t n, uint32_t color) {
  static const char grid[] = "grid";
  if (o.ntext + n > sizeof o.text) return;
  Cmd* c = ovl_push(o, raster::TEXT, color);
  if (!c) return;
  int32_t f = raster::find_font(grid, 4, 8 * ovl_k());
  __builtin_memcpy(o.text + o.ntext, s, n);
  c->res = f; c->off = o.ntext; c->n = n; c->x = x; c->y = y;
  c->w = (float)(raster::text_advance(f, s, n, 0) / 64.0); c->h = (float)(10 * ovl_k());
  o.ntext += n;
}
/** Word-wrapped paragraph; returns the y below it. */
static float ovl_para(Overlay& o, float x, float y, const char* s, uint32_t n, uint32_t color, int max_lines) {
  int32_t k = ovl_k(), cols = (pw - (int32_t)x - 4 * k) / (8 * k);
  if (cols < 8) cols = 8;
  while (n && max_lines-- > 0) {
    uint32_t len = n <= (uint32_t)cols ? n : (uint32_t)cols;
    if (len < n) { uint32_t sp = len; while (sp > 0 && s[sp] != ' ') sp--; if (sp > 0) len = sp; }
    ovl_text(o, x, y, s, len, color);
    y += 10 * k;
    s += len; n -= len;
    while (n && *s == ' ') { s++; n--; }
  }
  return y;
}
static void banner_expire() {
  if (banner.ncmd && now_ms() > banner_until) { banner.ncmd = banner.ntext = 0; banner_count = 0; ovl_changed = true; }
}
/** Shows the red box for `text` ("message\n    at f (file:line)..."); null clears it. False: no screen. */
bool crash_screen(const char* text, uint32_t n) {
  rbox.ncmd = rbox.ntext = 0;
  ovl_changed = true;
  if (!text) return true;
  int32_t k = ovl_k();
  float pad = 6.0f * k, y;
  ovl_rect(rbox, 0, 0, (float)pw, (float)ph, 0xb91c1c);
  ovl_rect(rbox, 0, 0, (float)pw, 14.0f * k, 0x7f1d1d);
  static const char title[] = "Zinc: uncaught error";
  ovl_text(rbox, pad, 3.0f * k, title, sizeof title - 1, 0xfecaca);
  y = 20.0f * k;
  uint32_t i = 0;
  while (i < n && text[i] != '\n') i++;
  y = ovl_para(rbox, pad, y, text, i, 0xffffff, 6) + 6.0f * k;
  while (i < n) {  // stack lines
    uint32_t j = ++i;
    while (i < n && text[i] != '\n') i++;
    while (j < i && text[j] == ' ') j++;
    if (y + 24.0f * k < ph) y = ovl_para(rbox, pad, y, text + j, i - j, 0xfde2e2, 2);
  }
#ifdef ZRT_DEV
  static const char hint[] = "Save a file to reload. Enter/Space/click: restart";
#else
  static const char hint[] = "Enter/Space/click: restart";
#endif
  ovl_para(rbox, pad, (float)ph - 38.0f * k, hint, sizeof hint - 1, 0xfecaca, 2);
  return true;
}
/** console.warn/error in dev builds: a yellow strip at the bottom, hidden after 8 s. */
void log_banner(int, const char* s, uint32_t n) {
  int32_t k = ovl_k();
  float h = 14.0f * k, y = (float)ph - h;
  uint32_t len = 0;
  while (len < n && s[len] != '\n') len++;
  banner.ncmd = banner.ntext = 0;
  banner_count++;
  ovl_rect(banner, 0, y, (float)pw, h, 0xfacc15);
  char head[16], dig[12];
  int p = 0, dn = 0;
  int32_t v = banner_count;
  do { dig[dn++] = (char)('0' + v % 10); v /= 10; } while (v && dn < 10);
  head[p++] = '!'; head[p++] = ' ';
  while (dn) head[p++] = dig[--dn];
  head[p++] = ' ';
  ovl_text(banner, 4.0f * k, y + 3.0f * k, head, (uint32_t)p, 0x7c2d12);
  int32_t cols = (pw - (p + 1) * 8 * k) / (8 * k);
  if (cols > 0) ovl_text(banner, 4.0f * k + p * 8.0f * k, y + 3.0f * k, s, len < (uint32_t)cols ? len : (uint32_t)cols, 0x1c1917);
  banner_until = now_ms() + 8000;
  ovl_changed = true;
}

static void render_rows(uint32_t* rows, int32_t y0, int32_t y1) {
  raster::Rect all{0, y0, pw, y1};
  if (shown) raster::render(frame_of(*shown), rows, pw, y0, y1, all);
  else for (int32_t i = 0; i < (y1 - y0) * pw; i++) rows[i] = 0;
  if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, all);
  if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, all);
}
// damage of the frame being presented, as disjoint rectangles (render_damage)
#ifndef ZRT_DAMAGE_RECTS
#define ZRT_DAMAGE_RECTS 8
#endif
static raster::Rect dmg[ZRT_DAMAGE_RECTS];
static int32_t ndmg = 0;
static void render_damage(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t i = 0; i < ndmg; i++) {
    raster::Rect r{dmg[i].x0, dmg[i].y0 > y0 ? dmg[i].y0 : y0, dmg[i].x1, dmg[i].y1 < y1 ? dmg[i].y1 : y1};
    if (r.y0 >= r.y1) continue;
    if (shown) raster::render(frame_of(*shown), rows, pw, y0, y1, r);
    if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, r);
    if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, r);
  }
}
static void set_full_damage() { dmg[0] = raster::Rect{0, 0, pw, ph}; ndmg = 1; }
/** Presents the last frame with the overlay (the red box loop, while the program is stopped). */
void present_overlay() {
  init_scale();
  banner_expire();
  if (ovl_changed) set_full_damage(); else ndmg = 0;
  HalFrame f = {pw, ph, 0, 0, ovl_changed ? pw : 0, ovl_changed ? ph : 0, render_rows, render_damage};
  ovl_changed = false;
  present(&f);
}

// Logical -> physical: one pass over the finished frame, so commands emitted by C++ plugins are converted too.
static int32_t font_map[2][64];  // logical font id -> physical font id (cache)
static int32_t phys_font(int32_t f) {
  if (f >= 0 && f < 64 && font_map[0][f] == pxk + 1) return font_map[1][f];
  const raster::Font* fo = raster::font_at(f);
  int32_t r = f;
  if (fo) { uint32_t n = 0; while (fo->name[n]) n++; r = raster::render_font(fo->name, n, fo->px * pxk); }
  if (f >= 0 && f < 64) { font_map[0][f] = pxk + 1; font_map[1][f] = r; }
  return r;
}
static void to_physical(Buf& b) {
  if (pxk == 1) return;
  const float k = (float)pxk;
  for (uint32_t i = 0; i < b.ncmd; i++) {
    Cmd& c = b.cmds[i];
    if (c.kind == raster::CLEAR || c.kind == raster::UNCLIP) continue;
    c.x *= k; c.y *= k; c.w *= k; c.h *= k;
    switch (c.kind) {
      case raster::RECT: case raster::IMAGE: c.r *= k; break;
      case raster::BORDER: case raster::SHADOW: c.r *= k; c.s *= k; break;
      case raster::TEXT: c.s *= k; c.res = phys_font(c.res); break;
      case raster::POLY: case raster::LINE: {
        float* p = b.pts + c.off;
        for (uint32_t n = 0; n < c.n; n++) { uint32_t cnt = (uint32_t)p[0]; for (uint32_t j = 1; j <= cnt * 2; j++) p[j] *= k; p += 1 + cnt * 2; }
        break;
      }
      default: break;
    }
  }
}

void begin_frame() { Buf& b = bufs[cur]; b.ncmd = 0; b.ntext = 0; b.npts = 0; tx = ty = 0; kept = false; }
void keep() { kept = true; }
void end_frame() {
  init_scale();
  pen_n = 0;
  banner_expire();
  if (kept && !first) {  // retained frame: no rasterization, no swap
    if (ovl_changed) set_full_damage(); else ndmg = 0;
    HalFrame f = {pw, ph, 0, 0, ovl_changed ? pw : 0, ovl_changed ? ph : 0, render_rows, render_damage};
    ovl_changed = false;
    present(&f);
    return;
  }
  to_physical(bufs[cur]);
  const Buf& now = bufs[cur];
  const Buf& before = bufs[cur ^ 1];
  if (first || ovl_changed) set_full_damage();
  else ndmg = raster::diff_rects(frame_of(before), frame_of(now), pw, ph, dmg, ZRT_DAMAGE_RECTS);
  raster::Rect d = {pw, ph, 0, 0};
  for (int32_t i = 0; i < ndmg; i++) { d.x0 = dmg[i].x0 < d.x0 ? dmg[i].x0 : d.x0; d.y0 = dmg[i].y0 < d.y0 ? dmg[i].y0 : d.y0; d.x1 = dmg[i].x1 > d.x1 ? dmg[i].x1 : d.x1; d.y1 = dmg[i].y1 > d.y1 ? dmg[i].y1 : d.y1; }
  if (!ndmg) d = raster::Rect{0, 0, 0, 0};
  ovl_changed = false;
  first = false;
  shown = &now;
  stats.draw_cmds = now.ncmd;
  HalFrame f = {pw, ph, d.x0, d.y0, d.x1, d.y1, render_rows, render_damage};
  present(&f);
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
      minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy;
    }
    contours++;
    if (!closed_list) break;
    i = start + cnt * 2;
  }
  c->n = contours;
  c->x = minx; c->y = miny; c->w = maxx - minx; c->h = maxy - miny;
  return true;
}
Cmd* emit(uint8_t kind, const float* pts, uint32_t len) {
  Buf& b = bufs[cur];
  if (len > ZRT_POINT_POOL - b.npts) return nullptr;
  Cmd* c = push(kind, 0, 255);
  if (!c || !len) return c;
  __builtin_memcpy(b.pts + b.npts, pts, len * sizeof(float));
  c->off = b.npts;
  if (kind == raster::POLY) for (uint32_t i = 0; i < len; i += 1 + 2 * (uint32_t)pts[i]) c->n++;
  b.npts += len;
  return c;
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
int32_t imageWidth(int32_t i) { int32_t w, h; raster::image_size(i, &w, &h); return w; }
int32_t imageHeight(int32_t i) { int32_t w, h; raster::image_size(i, &w, &h); return h; }
void drawImage(int32_t i, double x, double y, double w, double h, int32_t alpha, double radius) {
  if (Cmd* c = push(raster::IMAGE, 0, alpha)) { box(c, x, y, w, h); c->res = i; c->r = (float)radius; c->c2 = raster::image_version(i); }
}
/** Stroked polyline from flat [x0, y0, ...] coordinates (round joins and caps). */
void stroke(const Array<double>& pts, double width, uint32_t color, int32_t alpha, bool closed) {
  Buf& b = bufs[cur];
  uint32_t n = (uint32_t)pts.length() / 2;
  if (n < 2) return;
  static float tmp[4096];
  if (n > 2048) n = 2048;  // ponytail: long lines are split by the caller (map tiles already are)
  for (uint32_t i = 0; i < n; i++) { tmp[i * 2] = (float)(pts.get((int32_t)i * 2) + tx); tmp[i * 2 + 1] = (float)(pts.get((int32_t)i * 2 + 1) + ty); }
  Cmd* c = push(raster::POLY, color, alpha);
  if (!c) return;
  uint32_t r = raster::stroke_contours(tmp, n, (float)width, closed, b.pts + b.npts, ZRT_POINT_POOL - b.npts);
  float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f, hw = (float)width * 0.5f + 1;
  for (uint32_t i = 0; i < n; i++) { float x = tmp[i * 2], y = tmp[i * 2 + 1]; minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy; }
  c->off = b.npts; c->n = r & 0xFFFF; b.npts += r >> 16;
  if (!c->n) { b.ncmd--; return; }
  c->x = minx - hw; c->y = miny - hw; c->w = maxx - minx + 2 * hw; c->h = maxy - miny + 2 * hw;
}
/** Runtime image (black), drawable with drawImage and a render target for beginImage. */
int32_t createImage(int32_t w, int32_t h) { return raster::dyn_create(w, h); }
void destroyImage(int32_t i) { raster::dyn_destroy(i); }
// Render-to-image: commands between beginImage and endImage are rasterized into the image instead of the screen
// (cached map tiles, static layers). They never reach the frame diff.
static int32_t target_img = -1;
static uint32_t mark_cmd, mark_text, mark_pts;
void beginImage(int32_t i) { Buf& b = bufs[cur]; target_img = i; mark_cmd = b.ncmd; mark_text = b.ntext; mark_pts = b.npts; }
void endImage() {
  Buf& b = bufs[cur];
  uint32_t* px = raster::dyn_pixels(target_img);
  int32_t w, h;
  if (px && raster::image_size(target_img, &w, &h)) {
    raster::Frame fr{b.cmds + mark_cmd, b.ncmd - mark_cmd, b.text, b.pts};
    raster::render(fr, px, w, 0, h, raster::Rect{0, 0, w, h});
    raster::dyn_update(target_img, nullptr, 0);
  }
  b.ncmd = mark_cmd; b.ntext = mark_text; b.npts = mark_pts; target_img = -1;
}
void clip(double x, double y, double w, double h) { if (Cmd* c = push(raster::CLIP, 0, 255)) box(c, x, y, w, h); }
void unclip() { push(raster::UNCLIP, 0, 255); }
void translate(double x, double y) { tx = (float)x; ty = (float)y; }

bool isDown(int32_t b) { return (input.buttons >> b) & 1u; }
bool wasPressed(int32_t b) { return ((input.buttons >> b) & 1u) && !((prev_input.buttons >> b) & 1u); }
double pointerX() { return input.px; }
double pointerY() { return input.py; }
bool pointerDown() { return input.pdown != 0; }
double wheel() { return input.wheel; }
double pinch() { return input.pinch == 0 ? 1 : input.pinch; }
int32_t touchCount() { return input.ntouch; }
double touchX(int32_t i) { return i >= 0 && i < input.ntouch ? input.touch[i].x : 0; }
double touchY(int32_t i) { return i >= 0 && i < input.ntouch ? input.touch[i].y : 0; }
int32_t touchId(int32_t i) { return i >= 0 && i < input.ntouch ? input.touch[i].id : -1; }
static const HalPen* pen_at(int32_t i) { static const HalPen none = {}; return i >= 0 && i < pen_n ? &pen_q[i] : &none; }
int32_t penCount() { return pen_n; }
double penX(int32_t i) { return pen_at(i)->x; }
double penY(int32_t i) { return pen_at(i)->y; }
double penPressure(int32_t i) { return pen_at(i)->pressure; }
double penTiltX(int32_t i) { return pen_at(i)->tilt_x; }
double penTiltY(int32_t i) { return pen_at(i)->tilt_y; }
int32_t penFlags(int32_t i) { return (int32_t)pen_at(i)->flags; }
int32_t frame() { return frame_no; }
void quit() { quit_requested = true; }
}
}  // namespace zrt
// ponytail: a full queue overwrites its last slot, so stroke ends (pen up) survive a slow frame; middles thin out.
extern "C" void hal_pen_push(const HalPen* s) { zrt::gfx::pen_q[zrt::gfx::pen_n < ZRT_PEN_SAMPLES ? zrt::gfx::pen_n++ : ZRT_PEN_SAMPLES - 1] = *s; }
