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
  // panels get logical pixels; a driver drawing through the host window (host_window) gets its pixel scale (Retina)
  pxk = display_driver && !hal_display->host_window ? 1 : hal_pixel_scale();
  if (pxk < 1) pxk = 1;
  pw = surf_w * pxk; ph = surf_h * pxk;
}
static bool first_frame();
/** Follows the HAL's surface (window resized, moved to a screen with another density): full redraw at the new size. */
void sync_surface() {
  if (display_driver) return;
  int w = surf_w, h = surf_h;
  hal_surface_size(&w, &h);
  int32_t k = hal_pixel_scale(); if (k < 1) k = 1;
  if (w == surf_w && h == surf_h && k == pxk) return;
  surf_w = w; surf_h = h; pxk = 0;
  init_scale();
  first_frame();
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
#ifndef ZRT_OVERLAY_TEXT
#define ZRT_OVERLAY_TEXT 4096  // esp32: 1024 (static RAM is scarce there)
#endif
struct Overlay { Cmd cmds[64]; char text[ZRT_OVERLAY_TEXT]; uint32_t ncmd, ntext; };
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

// ---------- frame capture (docs/guide/06-testing.md): ZINC_SHOT, gfx.capture, F12 in zinc dev, DevTools screenshots ----
// The frame is rasterized again from the retained command list, so it works on every HAL, windowed or headless.
}  // namespace gfx
}  // namespace zrt
extern "C" void* zrt_host_open(const char* path, const char* mode);  // runtime/host.cpp
extern "C" size_t zrt_host_io(void* f, void* p, size_t n, int write);
extern "C" void zrt_host_close(void* f);
namespace zrt {
namespace gfx {
/** The frame on screen (overlay included) at physical size, 0x00RRGGBB, from the system allocator (hal_free it). */
static uint32_t* grab() {
  init_scale();
  uint32_t* px = (uint32_t*)hal_alloc((size_t)pw * ph * 4);
  if (px) render_rows(px, 0, ph);
  return px;
}
static uint32_t crc32(uint32_t c, const uint8_t* p, size_t n) {
  static uint32_t tab[256];
  if (!tab[1]) for (uint32_t i = 0; i < 256; i++) { uint32_t v = i; for (int k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320u ^ (v >> 1) : v >> 1; tab[i] = v; }
  c = ~c;
  while (n--) c = tab[(c ^ *p++) & 255] ^ (c >> 8);
  return ~c;
}
static uint8_t* put32(uint8_t* p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; return p + 4; }
/** 8-bit RGB PNG with zlib "stored" blocks. ponytail: no compression (~3 bytes per pixel, no dependencies);
 *  zinc capture and zinc test --pixels recompress with Node's zlib. */
static uint8_t* encode_png(const uint32_t* px, int32_t w, int32_t h, size_t* out_n) {
  size_t row = (size_t)w * 3 + 1, raw = row * (size_t)h, blocks = (raw + 65534) / 65535;
  uint8_t* o = (uint8_t*)hal_alloc(8 + 25 + 12 + 2 + raw + blocks * 5 + 4 + 12);
  if (!o) return nullptr;
  uint8_t* p = o;
  __builtin_memcpy(p, "\x89PNG\r\n\x1a\n", 8); p += 8;
  p = put32(p, 13);
  uint8_t* c = p;
  __builtin_memcpy(p, "IHDR", 4); p = put32(put32(p + 4, (uint32_t)w), (uint32_t)h);
  *p++ = 8; *p++ = 2; *p++ = 0; *p++ = 0; *p++ = 0;  // 8 bits, RGB, deflate, filter 0, no interlace
  p = put32(p, crc32(0, c, 17));
  uint8_t* len = p;
  c = p += 4;
  __builtin_memcpy(p, "IDAT", 4); p += 4;
  *p++ = 0x78; *p++ = 0x01;
  uint32_t a = 1, b = 0;
  size_t left = 0;  // bytes left in the current stored block
  for (int32_t y = 0; y < h; y++) for (size_t i = 0; i < row; i++) {
    if (!left) {
      size_t done = (size_t)y * row + i, n = raw - done < 65535 ? raw - done : 65535;
      *p++ = done + n == raw; *p++ = (uint8_t)n; *p++ = (uint8_t)(n >> 8); *p++ = (uint8_t)~n; *p++ = (uint8_t)(~n >> 8);
      left = n;
    }
    uint8_t v = i ? (uint8_t)(px[(size_t)y * w + (i - 1) / 3] >> (16 - 8 * ((i - 1) % 3))) : 0;  // filter byte, then R G B
    *p++ = v; left--;
    a += v; if (a >= 65521) a -= 65521;
    b += a; if (b >= 65521) b -= 65521;
  }
  p = put32(p, b << 16 | a);
  put32(len, (uint32_t)(p - c - 4));
  p = put32(p, crc32(0, c, (size_t)(p - c)));
  p = put32(p, 0);
  c = p;
  __builtin_memcpy(p, "IEND", 4); p += 4;
  p = put32(p, crc32(0, c, 4));
  *out_n = (size_t)(p - o);
  return o;
}
/** 24-bit bottom-up BMP (ZINC_SHOT=*.bmp, the format older tools expect). */
static uint8_t* encode_bmp(const uint32_t* px, int32_t w, int32_t h, size_t* out_n) {
  size_t row = ((size_t)w * 3 + 3) & ~(size_t)3, n = 54 + row * (size_t)h;
  uint8_t* o = (uint8_t*)hal_alloc(n);
  if (!o) return nullptr;
  __builtin_memset(o, 0, n);
  auto le = [&](int at, uint32_t v) { o[at] = (uint8_t)v; o[at + 1] = (uint8_t)(v >> 8); o[at + 2] = (uint8_t)(v >> 16); o[at + 3] = (uint8_t)(v >> 24); };
  o[0] = 'B'; o[1] = 'M'; le(2, (uint32_t)n); le(10, 54); le(14, 40); le(18, (uint32_t)w); le(22, (uint32_t)h); o[26] = 1; o[28] = 24;
  for (int32_t y = 0; y < h; y++) {
    uint8_t* l = o + 54 + row * (size_t)(h - 1 - y);
    for (int32_t x = 0; x < w; x++) { uint32_t v = px[(size_t)y * w + x]; l[x * 3] = (uint8_t)v; l[x * 3 + 1] = (uint8_t)(v >> 8); l[x * 3 + 2] = (uint8_t)(v >> 16); }
  }
  *out_n = n;
  return o;
}
uint8_t* capture_png(size_t* n) {
  uint32_t* px = grab();
  uint8_t* png = px ? encode_png(px, pw, ph, n) : nullptr;
  if (px) hal_free(px);
  return png;
}
/** Saves the frame on screen: BMP when the path ends in .bmp, PNG otherwise. */
static bool save(const char* path) {
  uint32_t n = 0;
  while (path[n]) n++;
  bool bmp = n > 4 && path[n - 4] == '.' && (path[n - 3] | 32) == 'b' && (path[n - 2] | 32) == 'm' && (path[n - 1] | 32) == 'p';
  uint32_t* px = grab();
  size_t len = 0;
  uint8_t* data = !px ? nullptr : bmp ? encode_bmp(px, pw, ph, &len) : encode_png(px, pw, ph, &len);
  if (px) hal_free(px);
  void* f = data ? zrt_host_open(path, "wb") : nullptr;
  bool ok = f && zrt_host_io(f, data, len, 1) == len;
  if (f) zrt_host_close(f);
  if (data) hal_free(data);
  return ok;
}
bool capture(const String& path) {
  StrBuilder sb; to_s(sb, path); sb.ch('\0');
  return save(sb.buf);
}
static const char* shot_path = nullptr;  // ZINC_SHOT
static void save_last() { if (shot_path) save(shot_path); }
/** "dir/out.png" + 30 -> "dir/out-30.png" */
static void numbered(char* out, uint32_t cap, const char* path, int32_t n) {
  uint32_t len = 0, dot = 0;
  while (path[len]) { if (path[len] == '.') dot = len; if (path[len] == '/') dot = 0; len++; }
  if (!dot) dot = len;
  char num[12]; int k = 0;
  do { num[k++] = (char)('0' + n % 10); n /= 10; } while (n && k < 11);
  uint32_t o = 0;
  for (uint32_t i = 0; i < dot && o + 1 < cap; i++) out[o++] = path[i];
  if (o + 1 < cap) out[o++] = '-';
  while (k && o + 1 < cap) out[o++] = num[--k];
  for (uint32_t i = dot; i < len && o + 1 < cap; i++) out[o++] = path[i];
  out[o] = 0;
}
/** After each presented frame: ZINC_SHOT_FRAMES=1,30,60 / ZINC_SHOT_EVERY=n (numbered files), or with ZINC_SHOT alone
 *  the last frame when the program ends. Display drivers keep their own ZINC_SHOT picture of the emulated device.
 *  zinc dev: F12 saves the frame to ZINC_SHOT_DIR (build/shots). */
static void after_present() {
  static int state = 0;  // 0: environment not read, 1: no shots, 2: shots
  static const char* list = nullptr;
  static int32_t every = 0;
  if (!state) {
    const char* p = hal_env("ZINC_SHOT");
    list = hal_env("ZINC_SHOT_FRAMES");
    for (const char* e = hal_env("ZINC_SHOT_EVERY"); e && *e >= '0' && *e <= '9'; e++) every = every * 10 + (*e - '0');
    state = p && *p && (!display_driver || hal_display->host_window) ? 2 : 1;   // a host-window driver shows our frames
    if (state == 2) { shot_path = p; if (!list && !every) at_finish(save_last); }
  }
  const int32_t n = frame_no + 1;  // frames are numbered from 1, like ZINC_FRAMES counts them
  if (state == 2 && (list || every)) {
    bool want = every > 0 && n % every == 0;
    for (const char* s = list; s && *s && !want;) {
      int32_t v = 0;
      while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
      want = v == n;
      while (*s && (*s < '0' || *s > '9')) s++;
    }
    char out[1024];
    if (want) { numbered(out, sizeof out, shot_path, n); save(out); }
  }
#ifdef ZRT_DEV
  for (int32_t i = 0; i < input.nkeys; i++) {
    if (input.keys[i].kind != HAL_KEY_DOWN || input.keys[i].key != HAL_KEY_F1 + 11) continue;
    StrBuilder sb;
    const char* dir = hal_env("ZINC_SHOT_DIR");
    sb.cstr(dir && *dir ? dir : "."); sb.cstr("/frame-"); to_s(sb, n); sb.cstr(".png"); sb.ch('\0');
    bool ok = save(sb.buf);
    StrBuilder m; m.cstr(ok ? "zinc dev: frame saved to " : "zinc dev: cannot write "); m.cstr(sb.buf); m.ch('\n');
    hal_log_err(m.buf, m.len);
  }
#endif
}
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
      case raster::RECT: case raster::IMAGE: case raster::CLIP: c.r *= k; break;
      case raster::BORDER: case raster::SHADOW: c.r *= k; c.s *= k; break;
      case raster::TEXT:
        c.s *= k; c.res = phys_font(c.res);
        // rasterize missing runtime glyphs now, on this thread: bands are rendered in parallel (hal_sdl.cpp)
        raster::text_advance(c.res, b.text + c.off, c.n, 0);
        break;
      case raster::POLY: case raster::LINE: {
        float* p = b.pts + c.off;
        for (uint32_t n = 0; n < c.n; n++) { uint32_t cnt = (uint32_t)p[0]; for (uint32_t j = 1; j <= cnt * 2; j++) p[j] *= k; p += 1 + cnt * 2; }
        if (c.grad == 4) for (uint32_t j = 1; j <= 6; j++) p[j] *= k;  // gradient paint geometry (raster.cpp paint_at)
        break;
      }
      default: break;
    }
  }
}

static bool first_frame() { first = true; return true; }
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
    after_present();
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
  after_present();
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
#ifndef ZRT_STROKE_POINTS
#define ZRT_STROKE_POINTS 2048  // esp32: 512 (its point pool holds 1024 floats anyway)
#endif
  static float tmp[ZRT_STROKE_POINTS * 2];
  if (n > ZRT_STROKE_POINTS) n = ZRT_STROKE_POINTS;  // ponytail: long lines are split by the caller (map tiles already are)
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
void clip(double x, double y, double w, double h, double r) { if (Cmd* c = push(raster::CLIP, 0, 255)) { box(c, x, y, w, h); c->r = (float)r; } }
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

// ---- desktop input: keyboard/text queue, mouse buttons, clipboard, cursor, text input
double wheelX() { return input.wheel_x; }
double scrollDX() { return input.scroll_dx; }
double scrollDY() { return input.scroll_dy; }
int32_t scrollPhase() { return input.scroll_phase; }
int32_t pointerButtons() { return (int32_t)input.pbuttons; }
int32_t modifiers() { return (int32_t)input.mods; }
int32_t keyCount() { return input.nkeys; }
int32_t keyKind(int32_t i) { return i >= 0 && i < input.nkeys ? input.keys[i].kind : -1; }
int32_t keyMods(int32_t i) { return i >= 0 && i < input.nkeys ? (int32_t)input.keys[i].mods : 0; }
static const char* const KEY_NAMES[] = {"Backspace", "Delete", "Enter", "Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp",
  "ArrowDown", "Home", "End", "PageUp", "PageDown"};
String keyName(int32_t i) {
  if (i < 0 || i >= input.nkeys) return String();
  const HalKey& k = input.keys[i];
  if (k.kind == HAL_KEY_TEXT) return String::from(input.text + k.off, k.len);
  if (k.key >= 32 && k.key < 127) { char c = (char)k.key; return String::from(&c, 1); }
  if (k.key >= HAL_KEY_BACKSPACE && k.key < HAL_KEY_F1) { const char* n = KEY_NAMES[k.key - HAL_KEY_BACKSPACE]; uint32_t l = 0; while (n[l]) l++; return String::from(n, l); }
  if (k.key >= HAL_KEY_F1 && k.key < HAL_KEY_F1 + 12) { char b[4] = {'F', 0, 0, 0}; int32_t f = k.key - HAL_KEY_F1 + 1; uint32_t l = 1; if (f >= 10) b[l++] = '1'; b[l++] = (char)('0' + f % 10); return String::from(b, l); }
  return String();
}
int32_t buttonEventCount() { return input.nbtn; }
static const HalButtonEvent* btn_at(int32_t i) { static const HalButtonEvent none = {}; return i >= 0 && i < input.nbtn ? &input.btn[i] : &none; }
double buttonEventX(int32_t i) { return btn_at(i)->x; }
double buttonEventY(int32_t i) { return btn_at(i)->y; }
int32_t buttonEventButton(int32_t i) { return btn_at(i)->button; }
bool buttonEventDown(int32_t i) { return btn_at(i)->down != 0; }
void startTextInput(double x, double y, double w, double h) { hal_text_input(1, (float)x, (float)y, (float)w, (float)h); }
void stopTextInput() { hal_text_input(0, 0, 0, 0, 0); }
String clipboardText() { const char* s = hal_clipboard_get(); uint32_t n = 0; while (s && s[n]) n++; return String::from(s ? s : "", n); }
void setClipboardText(const String& s) { hal_clipboard_set(s.ptr(), s.bytes()); }
void setCursor(int32_t c) { hal_set_cursor(c); }
// Escape: the HAL leaves fullscreen or quits on it, unless the app takes the key (zinc:ui does, and falls back to
// escapeDefault() when nothing handled it)
void escapeByApp(bool on) { hal_escape_by_app(on ? 1 : 0); }
void escapeDefault() { hal_escape(); }
}
}  // namespace zrt
// Weak defaults for HALs without desktop input: no IME, a process-local clipboard, no cursor shapes.
extern "C" __attribute__((weak)) void hal_text_input(int32_t, float, float, float, float) {}
static char* local_clip = nullptr;
extern "C" __attribute__((weak)) const char* hal_clipboard_get(void) { return local_clip ? local_clip : ""; }
extern "C" __attribute__((weak)) void hal_clipboard_set(const char* s, size_t n) {
  if (local_clip) hal_free(local_clip);
  local_clip = (char*)hal_alloc(n + 1);
  if (!local_clip) return;
  __builtin_memcpy(local_clip, s, n);
  local_clip[n] = 0;
}
extern "C" __attribute__((weak)) void hal_set_cursor(int32_t) {}
extern "C" __attribute__((weak)) void hal_escape_by_app(int32_t) {}
extern "C" __attribute__((weak)) void hal_escape(void) {}
// ponytail: a full queue overwrites its last slot, so stroke ends (pen up) survive a slow frame; middles thin out.
extern "C" void hal_pen_push(const HalPen* s) {
  if (zrt::det_mode == 1 || zrt::det_mode == 3) return;  // deterministic runs take no live input (tapes carry no pen)
  zrt::gfx::pen_q[zrt::gfx::pen_n < ZRT_PEN_SAMPLES ? zrt::gfx::pen_n++ : ZRT_PEN_SAMPLES - 1] = *s;
}
