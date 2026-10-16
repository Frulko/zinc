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
#ifndef ZRT_MAX_WINDOWS
#define ZRT_MAX_WINDOWS 8   // windows beside the main one (ZN-663)
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
// More windows (ZN-663): a HAL without them has the main window only, and closing it ends the program
extern "C" __attribute__((weak)) int32_t hal_win_open(int32_t, const char*, int32_t, int32_t) { return 0; }
extern "C" __attribute__((weak)) void hal_win_close(int32_t id) { if (id == 0) zrt::quit_requested = true; }
extern "C" __attribute__((weak)) int32_t hal_win_state(int32_t id) { return id == 0 && !zrt::quit_requested; }
extern "C" __attribute__((weak)) void hal_win_input(int32_t, HalInput*, int32_t*, int32_t*) {}
extern "C" __attribute__((weak)) void hal_win_present(int32_t, const uint32_t*, int32_t, int32_t) {}
extern "C" __attribute__((weak)) void hal_win_current(int32_t) {}
namespace zrt {
namespace gfx {
// The program draws in logical pixels; frames are rasterized at pw x ph physical pixels (pxk per logical pixel).
static int32_t pxk = 0, pw = 0, ph = 0;
// panels get logical pixels unless the driver says otherwise (display-gl's desktop window); a driver drawing through the host window
// (host_window) gets the host's pixel scale (Retina)
static int32_t scale_now() {
  const int32_t k = !display_driver || hal_display->host_window ? hal_pixel_scale() : hal_display->pixel_scale ? hal_display->pixel_scale() : 1;
  return k < 1 ? 1 : k;
}
static void init_scale() {
  if (pxk) return;
  pxk = scale_now();
  pw = surf_w * pxk; ph = surf_h * pxk;
}
static bool first_frame();
/** Follows the HAL's surface (window resized, moved to a screen with another density): full redraw at the new size. */
void sync_surface() {
  if (display_driver && !hal_display->surface_size) return;
  int w = surf_w, h = surf_h;
  if (display_driver) hal_display->surface_size(&w, &h); else hal_surface_size(&w, &h);
  // the scale init_scale() uses: the host's would differ from display-gl's every frame, and each frame would be a first one (a kept
  // frame then presented the empty buffer: a black window)
  const int32_t k = scale_now();
  if (w == surf_w && h == surf_h && k == pxk) return;
  surf_w = w; surf_h = h; pxk = 0;
  init_scale();
  first_frame();
}
}

namespace gfx {
#ifdef ZRT_GROW_DRAW_CMDS
bool grow_enabled = true;  // the Zinc Next engine builds the grow variant and switches growing on from zinc.json
#endif
using raster::Cmd;
struct Buf {
#ifdef ZRT_GROW_DRAW_CMDS
  Cmd initial[ZRT_MAX_DRAW_CMDS];
  Cmd* cmds = initial;
  uint32_t capacity = ZRT_MAX_DRAW_CMDS;
  ~Buf() { if (cmds != initial) hal_free(cmds); }
#else
  Cmd cmds[ZRT_MAX_DRAW_CMDS];
#endif
  char text[ZRT_TEXT_POOL];
  float pts[ZRT_POINT_POOL];
  uint32_t ncmd, ntext, npts;
};
static Buf bufs[2];
static int cur = 0;
static bool first = true;
static const Buf* shown = nullptr;
static float tx = 0, ty = 0;  // translation applied to every command (UI transforms)
static bool xf_on;              // gfx.setTransform (ZN-263.01): a matrix after the translation, in logical pixels
static double xf_m[6];
static int32_t target_img = -1;  // beginImage: the commands draw into this image, in its (logical) pixels
bool gpu_strokes = false;
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
static Overlay taps;               // the fingers of a touch screen, where they press (taps_update below)
static bool ovl_changed = false;  // next present repaints the whole screen
static double banner_until = 0;
static int32_t banner_count = 0;
// ZINC_PERF_HUD (ZN-375): the performance panel's overlay, allocated when it is first shown (hud:: below)
// A software frame does not paint its commands each time: they are painted once into `px` after each rebuild, and the damage bands copy
// their rows of it (the panel is opaque). GPU displays replay the commands.
struct HudOverlay { Cmd cmds[1280]; Cmd local[1280]; char text[512]; uint32_t ncmd, ntext; uint32_t* px; int32_t pxw, pxh, pxcap; raster::Rect at; };
static HudOverlay* hud_ovl = nullptr;
static int32_t hud_px_state = 0;   // 0: px is stale, 1: being painted, 2: ready
static uint64_t hud_cost_us = 0;   // the panel's own time (building it, painting and copying its pixels): the summary reports it per frame
template <class O> static raster::Frame ovl_frame(const O& o) { return raster::Frame{o.cmds, o.ncmd, o.text, nullptr}; }
static void hud_render(uint32_t* rows, int32_t y0, int32_t y1, raster::Rect r) {   // bands may paint on several threads
  const uint64_t t = hal_time_us();
  HudOverlay& o = *hud_ovl;
  if (__atomic_load_n(&hud_px_state, __ATOMIC_ACQUIRE) != 2) {
    int32_t stale = 0;
    if (__atomic_compare_exchange_n(&hud_px_state, &stale, 1, false, __ATOMIC_ACQ_REL, __ATOMIC_ACQUIRE)) {
      for (uint32_t i = 0; i < o.ncmd; i++) { o.local[i] = o.cmds[i]; o.local[i].x -= (float)o.at.x0; o.local[i].y -= (float)o.at.y0; }
      raster::render(raster::Frame{o.local, o.ncmd, o.text, nullptr}, o.px, o.pxw, 0, o.pxh, raster::Rect{0, 0, o.pxw, o.pxh});
      __atomic_store_n(&hud_px_state, 2, __ATOMIC_RELEASE);
    } else while (__atomic_load_n(&hud_px_state, __ATOMIC_ACQUIRE) != 2) {}
  }
  const int32_t x0 = r.x0 > o.at.x0 ? r.x0 : o.at.x0, x1 = r.x1 < o.at.x1 ? r.x1 : o.at.x1;
  int32_t ya = y0 > r.y0 ? y0 : r.y0, yb = y1 < r.y1 ? y1 : r.y1;
  if (ya < o.at.y0) ya = o.at.y0;
  if (yb > o.at.y1) yb = o.at.y1;
  for (int32_t y = ya; x0 < x1 && y < yb; y++) __builtin_memcpy(rows + (size_t)(y - y0) * pw + x0, o.px + (size_t)(y - o.at.y0) * o.pxw + (x0 - o.at.x0), (size_t)(x1 - x0) * 4);
  __atomic_fetch_add(&hud_cost_us, hal_time_us() - t, __ATOMIC_RELAXED);
}
static int32_t ovl_k() { init_scale(); return (surf_w >= 960 ? 2 : 1) * pxk; }  // text scale: 8 px cells, 16 px on large screens
template <class O> static Cmd* ovl_push(O& o, uint8_t kind, uint32_t color) {
  if (o.ncmd == sizeof o.cmds / sizeof o.cmds[0]) return nullptr;
  Cmd* c = &o.cmds[o.ncmd++];
  __builtin_memset(c, 0, sizeof(Cmd));
  c->kind = kind; c->c1 = color; c->alpha = 255;
  return c;
}
template <class O> static void ovl_rect(O& o, float x, float y, float w, float h, uint32_t color) {
  if (Cmd* c = ovl_push(o, raster::RECT, color)) { c->x = x; c->y = y; c->w = w; c->h = h; }
}
template <class O> static void ovl_text(O& o, float x, float y, const char* s, uint32_t n, uint32_t color, int32_t k = 0) {
  static const char grid[] = "grid";
  if (o.ntext + n > sizeof o.text) return;
  Cmd* c = ovl_push(o, raster::TEXT, color);
  if (!c) return;
  if (!k) k = ovl_k();
  int32_t f = raster::find_font(grid, 4, 8 * k);
  __builtin_memcpy(o.text + o.ntext, s, n);
  c->res = f; c->off = o.ntext; c->n = n; c->x = x; c->y = y;
  c->w = (float)(raster::text_advance(f, s, n, 0) / 64.0); c->h = (float)(10 * k);
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

// ZINC_VISUALIZE=damage|cmds (docs/dev-mode.md): an overlay over the program's frame, allocated only when asked for.
static struct Vis { Cmd* cmds; uint32_t ncmd, cap; int32_t mode; } vis = {nullptr, 0, 0, -1};  // mode 0 off, 1 damage, 2 cmds
// ZN-410: a frame of many commands is binned into tiles once, by the first band that paints it (the HAL may paint bands on several threads,
// or not at all: GPU displays take the command lists); the next shown frame bins again.
static raster::Tiles shown_tiles = {};
static int32_t tiles_state = 0;   // 0 not binned, 1 binning, 2 ready
static void paint_shown(uint32_t* rows, int32_t y0, int32_t y1, raster::Rect r) {
  const raster::Frame f = frame_of(*shown);
  if (f.count < raster::kTilesMin) { raster::render(f, rows, pw, y0, y1, r); return; }
  if (__atomic_load_n(&tiles_state, __ATOMIC_ACQUIRE) != 2) {
    int32_t idle = 0;
    if (__atomic_compare_exchange_n(&tiles_state, &idle, 1, false, __ATOMIC_ACQ_REL, __ATOMIC_ACQUIRE)) {
      raster::bin(f, pw, ph, shown_tiles);
      __atomic_store_n(&tiles_state, 2, __ATOMIC_RELEASE);
    } else while (__atomic_load_n(&tiles_state, __ATOMIC_ACQUIRE) != 2) {}
  }
  raster::render_tiles(f, shown_tiles, rows, pw, y0, y1, r);
}
static void render_rows(uint32_t* rows, int32_t y0, int32_t y1) {
  raster::Rect all{0, y0, pw, y1};
  if (shown) paint_shown(rows, y0, y1, all);
  else for (int32_t i = 0; i < (y1 - y0) * pw; i++) rows[i] = 0;
  if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, all);
  if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, all);
  if (vis.ncmd) raster::render(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr}, rows, pw, y0, y1, all);
  if (hud_ovl && hud_ovl->ncmd) hud_render(rows, y0, y1, all);
  if (taps.ncmd) raster::render(ovl_frame(taps), rows, pw, y0, y1, all);
}
// the same rows with the holes of the hardware layers in another colour (HalFrame.render_holes, "hardware layers" below)
static int32_t nlay = 0;   // the pictures of the shown frame that are on a layer
static void render_holes(uint32_t* rows, int32_t y0, int32_t y1, uint32_t color) {
  raster::set_layer_fill(color);
  render_rows(rows, y0, y1);
  raster::set_layer_fill(HAL_LAYER_HOLE);
}
// the frame as command lists in paint order, for GPU displays (HalFrame.frames); same lists as render_rows
static HalCmdList lists[6];
static int32_t frame_lists(const HalCmdList* out[], int32_t max) {
  int32_t n = 0;
  auto add = [&](const raster::Frame& f) { if (n < max && n < 6) { lists[n] = HalCmdList{f.cmds, f.count, f.text, f.pts}; out[n] = &lists[n]; n++; } };
  if (shown) add(frame_of(*shown));
  if (rbox.ncmd) add(ovl_frame(rbox));
  if (banner.ncmd) add(ovl_frame(banner));
  if (vis.ncmd) add(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr});
  if (hud_ovl && hud_ovl->ncmd) add(ovl_frame(*hud_ovl));
  if (taps.ncmd) add(ovl_frame(taps));
  return n;
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
    if (shown) paint_shown(rows, y0, y1, r);
    if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, r);
    if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, r);
    if (vis.ncmd) raster::render(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr}, rows, pw, y0, y1, r);
    if (hud_ovl && hud_ovl->ncmd) hud_render(rows, y0, y1, r);
    if (taps.ncmd) raster::render(ovl_frame(taps), rows, pw, y0, y1, r);
  }
}
static void set_full_damage() { dmg[0] = raster::Rect{0, 0, pw, ph}; ndmg = 1; }

// ---------- ZINC_VISUALIZE: damage flashes / command heat map ----------
#define ZRT_VIS_FLASHES 64
struct Flash { raster::Rect r; int32_t born; };
static Flash* flashes = nullptr;   // allocated with the overlay
static int32_t nflash = 0;
static void vis_init() {
  if (vis.mode >= 0) return;
  const char* e = hal_env("ZINC_VISUALIZE");
  vis.mode = !e ? 0 : !__builtin_strcmp(e, "damage") ? 1 : !__builtin_strcmp(e, "cmds") ? 2 : 0;
  if (!vis.mode) return;
  vis.cap = ZRT_MAX_DRAW_CMDS + 2 * ZRT_VIS_FLASHES;
  vis.cmds = (Cmd*)hal_alloc(vis.cap * sizeof(Cmd));
  flashes = (Flash*)hal_alloc(ZRT_VIS_FLASHES * sizeof(Flash));
  if (!vis.cmds || !flashes) vis.mode = 0;
}
static void vis_rect(const raster::Rect& r, uint8_t kind, uint32_t color, int32_t alpha) {
  if (vis.ncmd == vis.cap) return;
  Cmd* c = &vis.cmds[vis.ncmd++];
  __builtin_memset(c, 0, sizeof(Cmd));
  c->kind = kind; c->c1 = color; c->alpha = (uint8_t)alpha; c->s = 2.0f * pxk;
  c->x = (float)r.x0; c->y = (float)r.y0; c->w = (float)(r.x1 - r.x0); c->h = (float)(r.y1 - r.y0);
}
/** Rebuilds the overlay after the frame diff (fresh: this frame has new damage). True: the overlay changed, the
 *  whole screen is presented. Damage rectangles flash and fade over 30 frames, even while the program is idle. */
static bool vis_update(const Buf* now, bool fresh) {
  if (vis.mode == 2) {
    if (!fresh) return false;
    vis.ncmd = 0;
    for (uint32_t i = 0; i < now->ncmd; i++) {
      const Cmd& c = now->cmds[i];
      if (c.kind == raster::CLEAR || c.kind == raster::CLIP || c.kind == raster::UNCLIP) continue;
      vis_rect(raster::Rect{(int32_t)c.x, (int32_t)c.y, (int32_t)(c.x + c.w), (int32_t)(c.y + c.h)}, raster::RECT, 0xff0000, 24);
    }
    return true;
  }
  for (int32_t i = 0; fresh && i < ndmg; i++) {   // a rectangle damaged again restarts its flash (no stacking)
    int32_t k = 0, m = nflash < ZRT_VIS_FLASHES ? nflash : ZRT_VIS_FLASHES;
    while (k < m && __builtin_memcmp(&flashes[k].r, &dmg[i], sizeof dmg[i])) k++;
    if (k < m) flashes[k].born = frame_no; else flashes[nflash++ % ZRT_VIS_FLASHES] = Flash{dmg[i], frame_no};
  }
  bool had = vis.ncmd > 0;
  vis.ncmd = 0;
  for (int32_t i = 0; i < nflash && i < ZRT_VIS_FLASHES; i++) {
    int32_t age = frame_no - flashes[i].born;
    if (age >= 30) continue;
    vis_rect(flashes[i].r, raster::RECT, 0xff00ff, 60 * (30 - age) / 30);
    vis_rect(flashes[i].r, raster::BORDER, 0xff00ff, 255 * (30 - age) / 30);
  }
  return had || vis.ncmd > 0;
}

// ---------- profiler (docs/dev-mode.md): per-phase frame timings ----------
// ZINC_PROFILE=1 prints p50 / p99 / max per phase at exit; the DevTools Tracing domain (plugins/devtools) and
// ZINC_TRACE=file.json collect the spans as Chrome trace events. Off: one test per mark, no memory.
}  // namespace gfx
}  // namespace zrt
extern "C" void* zrt_host_open(const char* path, const char* mode);  // runtime/host.cpp
extern "C" size_t zrt_host_io(void* f, void* p, size_t n, int write);
extern "C" void zrt_host_close(void* f);
namespace zrt {
namespace gfx {
namespace prof {
enum { APP, INPUT, ANIM, LAYOUT, PAINT, EFFECTS, DIFF, RASTER, PRESENT, N };
static const char* const NAMES[N] = {"app", "input", "anim", "layout", "paint", "effects", "diff", "raster", "present"};
#define ZRT_PROF_FRAMES 4096
#define ZRT_PROF_SPANS 32768
#define ZRT_PROF_BANDS 8
struct Span { uint64_t t0; uint32_t dur; uint16_t phase, tid; };   // phase N: the whole frame
struct State {
  uint32_t us[ZRT_PROF_FRAMES][N];   // the last frames, per phase
  uint32_t nframes, nspans;          // totals (both are rings)
  uint32_t acc[N];
  Span spans[ZRT_PROF_SPANS];
  uint64_t band[ZRT_PROF_BANDS][2];  // raster band spans of this frame (SDL HAL worker threads)
  uint64_t frame_t0, last;
  bool summary, tracing, hud;
};
static State* st = nullptr;
static const char* trace_file = nullptr;
static bool active() { return st && (st->summary || st->tracing || st->hud); }
static void enable() {
  if (st) return;
  st = (State*)hal_alloc(sizeof(State));
  if (st) __builtin_memset(st, 0, sizeof(State));
}
static void span(uint64_t t0, uint64_t t1, int32_t phase, int32_t tid) {
  if (!st->tracing) return;
  st->spans[st->nspans++ % ZRT_PROF_SPANS] = Span{t0, (uint32_t)(t1 - t0), (uint16_t)phase, (uint16_t)tid};
}
static void mark(int32_t phase) {
  uint64_t t = hal_time_us();
  st->acc[phase] += (uint32_t)(t - st->last);
  span(st->last, t, phase, 1);
  st->last = t;
}
static void ms(StrBuilder& sb, uint32_t us) {   // "12.34"
  to_s(sb, us / 1000); sb.ch('.');
  uint32_t f = us % 1000 / 10;
  sb.ch((char)('0' + f / 10)); sb.ch((char)('0' + f % 10));
}
/** p50 / p99 / max of one column (phase, or N: work = every phase but present). */
static void stat_line(StrBuilder& sb, int32_t col) {
  uint32_t n = st->nframes < ZRT_PROF_FRAMES ? st->nframes : ZRT_PROF_FRAMES;
  uint32_t* v = (uint32_t*)hal_alloc((n ? n : 1) * sizeof(uint32_t));
  if (!v) return;
  for (uint32_t i = 0; i < n; i++) {
    uint32_t s = 0;
    if (col < N) s = st->us[i][col]; else for (int32_t p = 0; p < PRESENT; p++) s += st->us[i][p];
    v[i] = s;
  }
  for (uint32_t gap = n / 2; gap > 0; gap /= 2)   // shell sort: no libc
    for (uint32_t i = gap; i < n; i++) for (uint32_t j = i; j >= gap && v[j - gap] > v[j]; j -= gap) { uint32_t t = v[j]; v[j] = v[j - gap]; v[j - gap] = t; }
  sb.cstr(col < N ? NAMES[col] : "work");
  sb.cstr(" p50="); ms(sb, n ? v[(n - 1) * 50 / 100] : 0);
  sb.cstr(" p99="); ms(sb, n ? v[(n - 1) * 99 / 100] : 0);
  sb.cstr(" max="); ms(sb, n ? v[n - 1] : 0);
  sb.cstr(" ms\n");
  hal_free(v);
}
static void summary() {
  if (!st || !st->nframes) return;
  StrBuilder sb;
  sb.cstr("zinc profile: frames="); to_s(sb, st->nframes); sb.ch(' ');
  stat_line(sb, N);
  for (int32_t p = 0; p < N; p++) { sb.cstr("zinc profile: "); stat_line(sb, p); }
  hal_log_err(sb.buf, sb.len);
}
/** The collected spans as a JSON array of Chrome trace events (ts / dur in µs). */
static String trace_json() {
  StrBuilder sb;
  sb.cstr("[{\"name\":\"process_name\",\"ph\":\"M\",\"pid\":1,\"tid\":1,\"args\":{\"name\":\"zinc\"}},"
          "{\"name\":\"thread_name\",\"ph\":\"M\",\"pid\":1,\"tid\":1,\"args\":{\"name\":\"CrRendererMain\"}}");
  for (int32_t b = 0; b < ZRT_PROF_BANDS; b++) {
    sb.cstr(",{\"name\":\"thread_name\",\"ph\":\"M\",\"pid\":1,\"tid\":"); to_s(sb, 10 + b);
    sb.cstr(",\"args\":{\"name\":\"raster band "); to_s(sb, b); sb.cstr("\"}}");
  }
  uint32_t n = st ? (st->nspans < ZRT_PROF_SPANS ? st->nspans : ZRT_PROF_SPANS) : 0, first = st ? st->nspans - n : 0;
  if (n) {
    sb.cstr(",{\"name\":\"TracingStartedInBrowser\",\"ph\":\"I\",\"s\":\"t\",\"cat\":\"disabled-by-default-devtools.timeline\",\"pid\":1,\"tid\":1,\"ts\":");
    to_s(sb, st->spans[first % ZRT_PROF_SPANS].t0);
    sb.cstr(",\"args\":{\"data\":{\"frameTreeNodeId\":1,\"persistentIds\":true,\"frames\":[{\"frame\":\"main\",\"url\":\"zinc://app\",\"name\":\"\",\"processId\":1}]}}}");
  }
  for (uint32_t i = first; i < first + n; i++) {
    const Span& s = st->spans[i % ZRT_PROF_SPANS];
    sb.cstr(",{\"name\":\""); sb.cstr(s.phase < N ? NAMES[s.phase] : "zinc frame");
    sb.cstr("\",\"cat\":\"zinc\",\"ph\":\"X\",\"pid\":1,\"tid\":"); to_s(sb, (int32_t)s.tid);
    sb.cstr(",\"ts\":"); to_s(sb, s.t0); sb.cstr(",\"dur\":"); to_s(sb, s.dur); sb.ch('}');
  }
  sb.ch(']');
  return sb.build();
}
static void write_trace() {
  String s = trace_json();
  void* f = zrt_host_open(trace_file, "wb");
  if (f) { zrt_host_io(f, (void*)s.ptr(), s.bytes(), 1); zrt_host_close(f); }
}
/** Frame start: ZINC_PROFILE / ZINC_TRACE are read once; the phase clock starts. */
static void begin() {
  static bool read = false;
  if (!read) {
    read = true;
    const char* e = hal_env("ZINC_PROFILE");
    if (const char* rs = hal_env("ZINC_RENDER_STATS")) if (*rs && *rs != '0') e = rs;   // ZN-170: one switch for the phase timings, the counters of the last frame (render_stats) and the GL stats
    const char* t = hal_env("ZINC_TRACE");
    if ((e && *e && *e != '0') || (t && *t)) enable();
    if (st && e && *e && *e != '0') { st->summary = true; at_finish(summary); }
    if (st && t && *t) { st->tracing = true; trace_file = t; at_finish(write_trace); }
  }
  if (!active()) return;
  st->frame_t0 = st->last = hal_time_us();
  __builtin_memset(st->acc, 0, sizeof st->acc);
  __builtin_memset(st->band, 0, sizeof st->band);
}
/** After present(): raster = the span of the bands the HAL reported, present = the rest of the call. */
static void end() {
  uint64_t t = hal_time_us(), r0 = 0, r1 = 0;
  for (int32_t b = 0; b < ZRT_PROF_BANDS; b++) {
    if (!st->band[b][1]) continue;
    if (!r0 || st->band[b][0] < r0) r0 = st->band[b][0];
    if (st->band[b][1] > r1) r1 = st->band[b][1];
    span(st->band[b][0], st->band[b][1], RASTER, 10 + b);
  }
  uint32_t raster = r1 > r0 ? (uint32_t)(r1 - r0) : 0;
  if (raster) span(r0, r1, RASTER, 1);
  span(st->last, t, PRESENT, 1);
  st->acc[RASTER] += raster;
  st->acc[PRESENT] += (uint32_t)(t - st->last) - raster;
  st->last = t;
  __builtin_memcpy(st->us[st->nframes % ZRT_PROF_FRAMES], st->acc, sizeof st->acc);
  st->nframes++;
  span(st->frame_t0, t, N, 1);
}
}  // namespace prof
bool profiling() { return prof::active(); }
// Draw commands recorded so far in this frame, and how many more the buffer takes (a frame that is out of them drops the rest): zinc:gfx commandCount / commandsFree (ZN-192, ZN-258)
int32_t commandCount() { return (int32_t)bufs[cur].ncmd; }
int32_t commandsFree() {
#ifdef ZRT_GROW_DRAW_CMDS
  return (int32_t)(bufs[cur].capacity - bufs[cur].ncmd);
#else
  return (int32_t)(ZRT_MAX_DRAW_CMDS - bufs[cur].ncmd);
#endif
}
void profMark(int32_t phase) { if (prof::active() && phase >= 0 && phase < prof::N) prof::mark(phase); }

// ---------- ZINC_PERF_HUD (ZN-375, docs/dev-mode.md): a performance panel over the program, like React Native's perf monitor ----------
// Shown with ZINC_PERF_HUD=1 (zinc.json "dev": {"perfHud": true}) or toggled with Cmd/Ctrl+Shift+P. It is an overlay drawn after the
// program's frame (the program's tree and layout never see it) and only its rectangle is repainted. Its numbers are the profiler's: the
// per-phase times ZINC_PROFILE summarizes. Drag it anywhere; a click on its "-" (or on the badge) collapses (expands) it.
const char* (*hud_info)() = nullptr;   // a line from the host: the engine and its counters (Zinc Next: objects, allocations per frame)
namespace hud {
enum { W = 248, H = 140, GRAPH_Y = 88, GRAPH_H = 48, FRAMES = 120, BADGE_W = 72, BADGE_H = 14 };   // in logical pixels
static int32_t state = -1;   // -1: the environment not read yet, 0 hidden, 1 shown
static bool collapsed = false, dragging = false, moved = false, on_button = false, was_down = false;   // was_down: the real button (the program's is hidden)
static float x = -1, y = 0, gx = 0, gy = 0;   // top-left corner (physical pixels; -1: not placed yet), grab offset
static raster::Rect box = {0, 0, 0, 0}, was = {0, 0, 0, 0};   // drawn now, drawn in the previous frame
static uint64_t starts[64];   // the start times of the last frames (µs): fps and dropped frames
static uint32_t nstarts = 0, dropped = 0, stat_at = 0, p50 = 0, p99 = 0, frames_shown = 0;
static uint64_t built_at = 0;     // when the panel was last rebuilt: 10 times a second, and every frame while it is dragged
static bool relayout = true;      // shown, hidden, collapsed or expanded since the last rebuild
static uint32_t* sorted = nullptr;   // ZRT_PROF_FRAMES values for the percentiles
static const uint32_t COLORS[prof::N] = {0x60a5fa, 0xa78bfa, 0xf472b6, 0xfbbf24, 0x34d399, 0x94a3b8, 0x64748b, 0xf87171, 0x475569};
static const char* const SHORT[prof::N] = {"app", "inp", "anim", "lay", "pnt", "fx", "diff", "ras", "pre"};

static bool show() {
  if (!hud_ovl) {
    hud_ovl = (HudOverlay*)hal_alloc(sizeof(HudOverlay));
    sorted = (uint32_t*)hal_alloc(ZRT_PROF_FRAMES * sizeof(uint32_t));
    if (!hud_ovl || !sorted) { state = 0; return false; }
    hud_ovl->ncmd = hud_ovl->ntext = 0;
    hud_ovl->px = nullptr; hud_ovl->pxcap = 0;
  }
  relayout = true;
  prof::enable();
  if (!prof::st) { state = 0; return false; }
  prof::st->hud = true;
  state = 1;
  return true;
}
static void hide() {
  state = 0;
  relayout = true;
  if (prof::st) prof::st->hud = false;
  if (hud_ovl) hud_ovl->ncmd = hud_ovl->ntext = 0;
  box = raster::Rect{0, 0, 0, 0};
}
/** p50 / p99 of the work (every phase but present) over the frames the profiler holds: the numbers of ZINC_PROFILE's summary. */
static void percentiles() {
  uint32_t n = prof::st->nframes < ZRT_PROF_FRAMES ? prof::st->nframes : ZRT_PROF_FRAMES;
  for (uint32_t i = 0; i < n; i++) { uint32_t s = 0; for (int32_t p = 0; p < prof::PRESENT; p++) s += prof::st->us[i][p]; sorted[i] = s; }
  for (uint32_t gap = n / 2; gap > 0; gap /= 2)
    for (uint32_t i = gap; i < n; i++) for (uint32_t j = i; j >= gap && sorted[j - gap] > sorted[j]; j -= gap) { uint32_t t = sorted[j]; sorted[j] = sorted[j - gap]; sorted[j - gap] = t; }
  p50 = n ? sorted[(n - 1) * 50 / 100] : 0;
  p99 = n ? sorted[(n - 1) * 99 / 100] : 0;
  stat_at = prof::st->nframes;
}
static void summary() {
  if (!prof::st || !prof::st->summary || !sorted) return;   // never shown: nothing to report
  percentiles();
  StrBuilder sb;
  sb.cstr("zinc perf hud: x="); to_s(sb, box.x0); sb.cstr(" y="); to_s(sb, box.y0); sb.cstr(" w="); to_s(sb, box.x1 - box.x0); sb.cstr(" h="); to_s(sb, box.y1 - box.y0);
  sb.cstr(" work p50="); prof::ms(sb, p50); sb.cstr(" p99="); prof::ms(sb, p99);
  sb.cstr(" ms, own "); prof::ms(sb, frames_shown ? (uint32_t)(hud_cost_us / frames_shown) : 0); sb.cstr(" ms per frame\n");
  hal_log_err(sb.buf, sb.len);
}
/** Frame start, before the program reads its input: the switch, the hotkey, dragging and collapsing (the program does not see a pointer
 *  that went down on the panel), and the time the frame starts. */
static void frame_start() {
  if (state < 0) {
    const char* e = hal_env("ZINC_PERF_HUD");
    state = 0;
    if (e && *e && *e != '0') show();
    at_finish(summary);
  }
  for (int32_t i = 0; i < input.nkeys; i++) {
    const HalKey& k = input.keys[i];
    if (k.kind == HAL_KEY_DOWN && k.key == 'p' && (k.mods & HAL_MOD_SHIFT) && (k.mods & (HAL_MOD_CTRL | HAL_MOD_META))) { if (state == 1) hide(); else show(); }
  }
  if (state != 1) return;
  init_scale();
  uint64_t t = hal_time_us();
  if (nstarts && t - starts[(nstarts - 1) % 64] > 25000) dropped++;   // more than 1.5 frames of 60 Hz since the previous one
  starts[nstarts++ % 64] = t;
  const float px = input.px * (float)pxk, py = input.py * (float)pxk;
  const bool inside = px >= box.x0 && px < box.x1 && py >= box.y0 && py < box.y1;
  const bool down = input.pdown != 0, pressed = down && !was_down;
  was_down = down;
  if (pressed && inside && !dragging) {
    dragging = true; moved = false;
    gx = px - x; gy = py - y;
    on_button = collapsed || (px >= box.x1 - 14.0f * pxk && py < box.y0 + 12.0f * pxk);
  }
  if (!dragging) return;
  if (input.pdown) {
    float nx = px - gx, ny = py - gy;
    if (nx - x > 2 || x - nx > 2 || ny - y > 2 || y - ny > 2) moved = true;
    if (moved) { x = nx; y = ny; }
  } else {
    dragging = false;
    if (!moved && on_button) { collapsed = !collapsed; relayout = true; }
  }
  input.pdown = 0; input.pbuttons = 0; input.nbtn = 0;   // the program does not see this pointer
}
static void put_ms(char* b, int32_t& n, uint32_t us, bool two) {   // "12.34" or "12.3"
  uint32_t whole = us / 1000, f = two ? us % 1000 / 10 : us % 1000 / 100;
  char d[10]; int32_t k = 0;
  do { d[k++] = (char)('0' + whole % 10); whole /= 10; } while (whole);
  while (k) b[n++] = d[--k];
  b[n++] = '.';
  if (two) b[n++] = (char)('0' + f / 10);
  b[n++] = (char)('0' + f % 10);
}
static void put_int(char* b, int32_t& n, uint32_t v) { char d[10]; int32_t k = 0; do { d[k++] = (char)('0' + v % 10); v /= 10; } while (v); while (k) b[n++] = d[--k]; }
static void put_str(char* b, int32_t& n, const char* s) { while (*s) b[n++] = *s++; }
/** Rebuilds the panel from the frames measured so far (this frame's own times are not known yet). */
static void build(const raster::Rect& dmg_box) {
  HudOverlay& o = *hud_ovl;
  o.ncmd = o.ntext = 0;
  const int32_t k = pxk;
  const float w = (float)((collapsed ? BADGE_W : W) * k), h = (float)((collapsed ? BADGE_H : H) * k);
  if (x < 0) { x = (float)pw - (float)(W * k) - 8.0f * k; y = 8.0f * k; }   // top right
  if (x > pw - w) x = pw - w;
  if (y > ph - h) y = ph - h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  box = raster::Rect{(int32_t)x, (int32_t)y, (int32_t)(x + w), (int32_t)(y + h)};
  const int32_t need = (box.x1 - box.x0) * (box.y1 - box.y0);
  if (o.pxcap < need) { if (o.px) hal_free(o.px); o.px = (uint32_t*)hal_alloc((size_t)need * 4); o.pxcap = o.px ? need : 0; }
  if (!o.px) { box = raster::Rect{0, 0, 0, 0}; return; }
  o.at = box; o.pxw = box.x1 - box.x0; o.pxh = box.y1 - box.y0;
  hud_px_state = 0;
  uint32_t n = nstarts < 64 ? nstarts : 64, fps10 = 0, frame_us = 0;
  if (n >= 2) {
    uint64_t span = starts[(nstarts - 1) % 64] - starts[(nstarts - n) % 64];
    frame_us = (uint32_t)(span / (n - 1));
    fps10 = span ? (uint32_t)((uint64_t)(n - 1) * 10000000u / span) : 0;
  }
  char b[64]; int32_t m;
  ovl_rect(o, x, y, w, h, 0x111827);
  if (collapsed) {
    m = 0; put_int(b, m, fps10 / 10); put_str(b, m, " fps");
    ovl_text(o, x + 4.0f * k, y + 2.0f * k, b, (uint32_t)m, fps10 >= 550 ? 0x34d399 : fps10 >= 300 ? 0xfbbf24 : 0xf87171, k);
    return;
  }
  const prof::State& s = *prof::st;
  if (s.nframes >= stat_at + 30 || !stat_at) percentiles();
  ovl_rect(o, x, y, w, 12.0f * k, 0x1f2937);
  const char* info = hud_info ? hud_info() : nullptr;
  ovl_text(o, x + 4.0f * k, y + 2.0f * k, "zinc perf", 9, 0xe5e7eb, k);
  ovl_text(o, x + w - 12.0f * k, y + 1.0f * k, "-", 1, 0xe5e7eb, k);
  float ty = y + 14.0f * k;
  m = 0; put_int(b, m, fps10 / 10); b[m++] = '.'; b[m++] = (char)('0' + fps10 % 10); put_str(b, m, " fps   frame "); put_ms(b, m, frame_us, true); put_str(b, m, " ms");
  ovl_text(o, x + 4.0f * k, ty, b, (uint32_t)m, 0xffffff, k); ty += 10.0f * k;
  m = 0; put_str(b, m, "work p50 "); put_ms(b, m, p50, true); put_str(b, m, "  p99 "); put_ms(b, m, p99, true);
  ovl_text(o, x + 4.0f * k, ty, b, (uint32_t)m, 0xd1d5db, k); ty += 10.0f * k;
  const int64_t area = (int64_t)pw * ph, d = (int64_t)(dmg_box.x1 - dmg_box.x0) * (dmg_box.y1 - dmg_box.y0);
  m = 0; put_str(b, m, "dropped "); put_int(b, m, dropped); put_str(b, m, "  cmds "); put_int(b, m, stats.draw_cmds);
  put_str(b, m, "  dmg "); put_int(b, m, area > 0 && d > 0 ? (uint32_t)(d * 100 / area) : 0); b[m++] = '%';
  ovl_text(o, x + 4.0f * k, ty, b, (uint32_t)m, 0xd1d5db, k); ty += 10.0f * k;
  uint32_t avg[prof::N] = {0}, frames = s.nframes < 30 ? s.nframes : 30;   // the phases, averaged over the last 30 frames
  for (uint32_t i = 0; i < frames; i++) for (int32_t p = 0; p < prof::N; p++) avg[p] += s.us[(s.nframes - 1 - i) % ZRT_PROF_FRAMES][p];
  float tx = x + 4.0f * k;
  for (int32_t p = 0; p < prof::N; p++) {   // the legend: each phase in the colour of its band in the graph, three per line
    if (p && p % 3 == 0) { tx = x + 4.0f * k; ty += 10.0f * k; }
    m = 0; put_str(b, m, SHORT[p]); b[m++] = ' '; put_ms(b, m, frames ? avg[p] / frames : 0, false);
    ovl_text(o, tx, ty, b, (uint32_t)m, COLORS[p], k);
    tx += (float)(m + 1) * 8.0f * k;
  }
  ty += 10.0f * k;
  if (info && *info) { m = 0; while (info[m] && m < 30) m++; ovl_text(o, x + 4.0f * k, ty, info, (uint32_t)m, 0x9ca3af, k); }
  const float gy0 = y + (float)(GRAPH_Y + GRAPH_H) * k, scale = (float)(GRAPH_H * k) / 33333.0f;   // the graph: 33 ms high
  const uint32_t shown_frames = s.nframes < FRAMES ? s.nframes : FRAMES;
  for (uint32_t i = 0; i < shown_frames; i++) {   // oldest on the left, one column of stacked phases per frame
    const uint32_t* f = s.us[(s.nframes - shown_frames + i) % ZRT_PROF_FRAMES];
    float cx = x + 4.0f * k + (float)(i * 2 * k), cy = gy0;
    for (int32_t p = 0; p < prof::N; p++) {
      float hh = (float)f[p] * scale;
      if (cy - hh < gy0 - GRAPH_H * k) hh = cy - (gy0 - GRAPH_H * k);
      if (hh < 1.0f) continue;
      cy -= hh;
      ovl_rect(o, cx, cy, (float)(2 * k), hh, COLORS[p]);
    }
  }
  ovl_rect(o, x + 4.0f * k, gy0 - 16667.0f * scale, (float)(FRAMES * 2 * k), (float)k, 0xe5e7eb);   // 16.7 ms: 60 fps
}
static void add_rect(const raster::Rect& r) {
  if (r.x0 >= r.x1 || r.y0 >= r.y1) return;
  for (int32_t i = 0; i < ndmg; i++) if (dmg[i].x0 <= r.x0 && dmg[i].y0 <= r.y0 && dmg[i].x1 >= r.x1 && dmg[i].y1 >= r.y1) return;   // painted anyway
  if (ndmg < ZRT_DAMAGE_RECTS) { dmg[ndmg++] = r; return; }
  set_full_damage();
}
/** Before present: 10 times a second (every frame while dragged) the panel is rebuilt, and its rectangle, and where it was, join the
 *  frame's damage; in between it is repainted only where the program's damage covers it. */
static void before_present(const raster::Rect& dmg_box) {
  if (state == 1) frames_shown++;
  const uint64_t now = hal_time_us();
  if (!relayout && !dragging && (state != 1 || now - built_at < 100000)) return;
  if (state == 1) { build(dmg_box); hud_cost_us += hal_time_us() - now; }
  built_at = now;
  relayout = false;
  add_rect(box);
  add_rect(was);
  was = box;
}
}  // namespace hud
// The fingers of a touch screen, shown where they press (owner 2026-10-12): a soft disc and a ring each, over everything the program and
// the panels draw, like the "show taps" of a phone. A debugging aid, off by default (owner 2026-10-16): ZINC_TOUCHES=1 shows them (also
// through `--es zinc.env` on Android). Their damage is their own boxes, now and at the last frame.
static void taps_update() {
  static const bool on = [] {
    const char* e = hal_env("ZINC_TOUCHES");
    return e && *e && *e != '0';
  }();
  static raster::Rect was = {0, 0, 0, 0};
  if (!on || (input.ntouch <= 0 && !taps.ncmd)) return;
  init_scale();
  const float R = 26.0f * pxk;
  raster::Rect at = {pw, ph, 0, 0};
  taps.ncmd = 0;
  for (int32_t i = 0; i < input.ntouch && i < HAL_MAX_TOUCH; i++) {
    const float x = input.touch[i].x * pxk - R, y = input.touch[i].y * pxk - R;
    if (Cmd* c = ovl_push(taps, raster::RECT, 0xFFFFFF)) { c->x = x; c->y = y; c->w = c->h = 2 * R; c->r = R; c->alpha = 96; }
    if (Cmd* c = ovl_push(taps, raster::BORDER, 0x111827)) { c->x = x; c->y = y; c->w = c->h = 2 * R; c->r = R; c->s = 2.0f * pxk; c->alpha = 160; }
    const raster::Rect b = {(int32_t)x - 1, (int32_t)y - 1, (int32_t)(x + 2 * R) + 2, (int32_t)(y + 2 * R) + 2};
    at.x0 = b.x0 < at.x0 ? b.x0 : at.x0; at.y0 = b.y0 < at.y0 ? b.y0 : at.y0; at.x1 = b.x1 > at.x1 ? b.x1 : at.x1; at.y1 = b.y1 > at.y1 ? b.y1 : at.y1;
  }
  auto clipped = [](raster::Rect r) { r.x0 = r.x0 < 0 ? 0 : r.x0; r.y0 = r.y0 < 0 ? 0 : r.y0; r.x1 = r.x1 > pw ? pw : r.x1; r.y1 = r.y1 > ph ? ph : r.y1; return r; };
  at = clipped(at);
  hud::add_rect(at);
  hud::add_rect(was);
  was = at;
}
static raster::Rect damage_box() {
  raster::Rect d = {pw, ph, 0, 0};
  for (int32_t i = 0; i < ndmg; i++) { d.x0 = dmg[i].x0 < d.x0 ? dmg[i].x0 : d.x0; d.y0 = dmg[i].y0 < d.y0 ? dmg[i].y0 : d.y0; d.x1 = dmg[i].x1 > d.x1 ? dmg[i].x1 : d.x1; d.y1 = dmg[i].y1 > d.y1 ? dmg[i].y1 : d.y1; }
  if (!ndmg) d = raster::Rect{0, 0, 0, 0};
  return d;
}
/** plugins/devtools Tracing.start (true: returns '') / Tracing.end (false: returns the trace events). */
String trace(bool on) {
  if (on) { prof::enable(); if (prof::st) { prof::st->tracing = true; prof::st->nspans = 0; } return String(); }
  String s = prof::trace_json();
  if (prof::st && !prof::trace_file) prof::st->tracing = false;
  return s;
}

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
/** Set by a host that has a real encoder (Zinc Next: stb_image_write, deflate): returns a PNG made with `alloc`, or null to fall back to the stored encoder below. */
uint8_t* (*png_encoder)(const uint32_t* px, int32_t w, int32_t h, size_t* n, void* (*alloc)(size_t)) = nullptr;
/** 8-bit RGB PNG with zlib "stored" blocks. ponytail: no compression (~3 bytes per pixel, no dependencies);
 *  zinc capture and zinc test --pixels recompress with Node's zlib. */
static uint8_t* encode_png(const uint32_t* px, int32_t w, int32_t h, size_t* out_n) {
  if (png_encoder) if (uint8_t* c = png_encoder(px, w, h, out_n, hal_alloc)) return c;
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
uint8_t* capture_png(size_t* n, int32_t maxw, int32_t maxh) {
  uint32_t* px = grab();
  int32_t w = pw, h = ph, k = 1;  // shrunk by a whole factor to fit maxw x maxh (DevTools screencast), box-averaged
  while ((maxw > 0 && w / k > maxw) || (maxh > 0 && h / k > maxh)) k++;
  if (px && k > 1) {
    w /= k; h /= k;
    for (int32_t y = 0; y < h; y++) for (int32_t x = 0; x < w; x++) {
      uint32_t r = 0, g = 0, b = 0;
      for (int32_t j = 0; j < k; j++) for (int32_t i = 0; i < k; i++) {
        uint32_t v = px[(size_t)(y * k + j) * pw + x * k + i];
        r += v >> 16 & 255; g += v >> 8 & 255; b += v & 255;
      }
      uint32_t kk = (uint32_t)(k * k);
      px[(size_t)y * w + x] = (r / kk) << 16 | (g / kk) << 8 | b / kk;  // in place: row y*w+x is behind the source
    }
  }
  uint8_t* png = px ? encode_png(px, w, h, n) : nullptr;
  if (px) hal_free(px);
  return png;
}
/** ZINC_SHOT=*.webp: a host that links a WebP encoder installs this (lossless; `alloc` is the allocator the caller frees with); without it a .webp path gets a PNG. */
uint8_t* (*encode_webp_hook)(const uint32_t* px, int32_t w, int32_t h, size_t* n, void* (*alloc)(size_t)) = nullptr;
/** Saves the frame on screen: BMP when the path ends in .bmp, WebP for .webp when the host can, PNG otherwise. */
static bool write_image(const char* path, uint32_t* px, int32_t w, int32_t h) {
  uint32_t n = 0;
  while (path[n]) n++;
  bool bmp = n > 4 && path[n - 4] == '.' && (path[n - 3] | 32) == 'b' && (path[n - 2] | 32) == 'm' && (path[n - 1] | 32) == 'p';
  bool webp = n > 5 && path[n - 5] == '.' && (path[n - 4] | 32) == 'w' && (path[n - 3] | 32) == 'e' && (path[n - 2] | 32) == 'b' && (path[n - 1] | 32) == 'p';
  size_t len = 0;
  uint8_t* data = !px ? nullptr : bmp ? encode_bmp(px, w, h, &len) : webp && encode_webp_hook ? encode_webp_hook(px, w, h, &len, hal_alloc) : encode_png(px, w, h, &len);
  void* f = data ? zrt_host_open(path, "wb") : nullptr;
  bool ok = f && zrt_host_io(f, data, len, 1) == len;
  if (f) zrt_host_close(f);
  if (data) hal_free(data);
  return ok;
}

static void save_windows(const char* path);
static bool save(const char* path) {
  uint32_t* px = grab();
  bool ok = write_image(path, px, pw, ph);
  if (px) hal_free(px);
  save_windows(path);
  return ok;
}
// ---------- scene dump (ZN-170): ZINC_SCENE_DUMP=path writes (frames chosen like ZINC_SHOT_FRAMES / ZINC_SHOT_EVERY, numbered; else the last one) the program's command list and pools; `zinc capture --scene` replays it ----------
// File: "ZSCN", then u32 little-endian: version 1, width, height, sizeof(Cmd), ncmd, ntext, npts; then the Cmd array, the text pool, the point pool.
static bool scene_write(const char* path, const Buf& b) {
  if (!shown) return false;
  uint32_t head[8] = {0x4e43535au, 1, (uint32_t)pw, (uint32_t)ph, (uint32_t)sizeof(Cmd), b.ncmd, b.ntext, b.npts};
  void* f = zrt_host_open(path, "wb");
  if (!f) return false;
  bool ok = zrt_host_io(f, head, sizeof head, 1) == sizeof head;
  ok = ok && zrt_host_io(f, (void*)b.cmds, b.ncmd * sizeof(Cmd), 1) == b.ncmd * sizeof(Cmd);
  ok = ok && zrt_host_io(f, (void*)b.text, b.ntext, 1) == b.ntext;
  ok = ok && zrt_host_io(f, (void*)b.pts, b.npts * 4, 1) == b.npts * 4;
  zrt_host_close(f);
  return ok;
}
/** Rasterizes a dump with the fonts and images installed now into `out` (png or bmp); false when the file is not a scene. */
bool scene_replay(const char* path, const char* out) {
  void* f = zrt_host_open(path, "rb");
  if (!f) return false;
  uint32_t head[8];
  bool ok = zrt_host_io(f, head, sizeof head, 0) == sizeof head && head[0] == 0x4e43535au && head[1] == 1 && head[4] == sizeof(Cmd) && head[2] && head[3] && head[2] < 16384 && head[3] < 16384;
  Cmd* cmds = nullptr; char* text = nullptr; float* pts = nullptr; uint32_t* px = nullptr;
  if (ok) {
    cmds = (Cmd*)hal_alloc((size_t)head[5] * sizeof(Cmd) + 1); text = (char*)hal_alloc(head[6] + 1); pts = (float*)hal_alloc((size_t)head[7] * 4 + 4);
    px = (uint32_t*)hal_alloc((size_t)head[2] * head[3] * 4);
    ok = cmds && text && pts && px && zrt_host_io(f, cmds, head[5] * sizeof(Cmd), 0) == head[5] * sizeof(Cmd) && zrt_host_io(f, text, head[6], 0) == head[6] && zrt_host_io(f, pts, (size_t)head[7] * 4, 0) == (size_t)head[7] * 4;
  }
  zrt_host_close(f);
  if (ok) {
    int32_t w = (int32_t)head[2], h = (int32_t)head[3];
    for (size_t i = 0, k = (size_t)w * h; i < k; i++) px[i] = 0;
    raster::render(raster::Frame{cmds, head[5], text, pts}, px, w, 0, h, raster::Rect{0, 0, w, h});
    ok = write_image(out, px, w, h);
  }
  hal_free(cmds); hal_free(text); hal_free(pts); hal_free(px);
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
/** ZINC_FRAMEHASH=all|last (ZN-125): "zinc: framehash <frame> <W>x<H> <fnv1a-64>" on stderr for every presented frame, or for the last one when the program ends.
 *  The hash covers the rasterized frame (0x00RRGGBB, physical size, row by row), so it is the same on every display driver and on the null HAL. */
static void frame_hash(int32_t n) {
  uint32_t* px = grab();
  if (!px) return;
  uint64_t h = 1469598103934665603ull;
  for (size_t i = 0, k = (size_t)pw * ph; i < k; i++)
    for (int b = 0; b < 4; b++) { h ^= (px[i] >> (8 * b)) & 255; h *= 1099511628211ull; }
  hal_free(px);
  StrBuilder sb;
  sb.cstr("zinc: framehash "); to_s(sb, n); sb.ch(' '); to_s(sb, pw); sb.ch('x'); to_s(sb, ph); sb.ch(' ');
  for (int sh = 60; sh >= 0; sh -= 4) sb.ch("0123456789abcdef"[(h >> sh) & 15]);
  sb.ch('\n');
  hal_log_err(sb.buf, sb.len);
}
static void frame_hash_last() { frame_hash(frame_no); }
static bool scene_write(const char* path, const Buf& b);
static const char* scene_path = nullptr;
static void scene_last() { if (shown) scene_write(scene_path, *shown); }
/** ZINC_RENDER_STATS: "zinc stats: cmds=N rect=.. text=.. scene_bytes=B text_bytes=.. point_floats=.." for the last frame (the 5.3 counters that exist today). */
static void render_stats() {
  if (!shown) return;
  static const char* const K[] = {"clear", "rect", "border", "shadow", "line", "text", "image", "poly", "clip", "unclip"};
  uint32_t by[10] = {0};
  for (uint32_t i = 0; i < shown->ncmd; i++) if (shown->cmds[i].kind < 10) by[shown->cmds[i].kind]++;
  StrBuilder sb;
  sb.cstr("zinc stats: frames="); to_s(sb, frame_no); sb.cstr(" size="); to_s(sb, pw); sb.ch('x'); to_s(sb, ph);
  sb.cstr(" cmds="); to_s(sb, (int32_t)shown->ncmd);
  for (int k = 0; k < 10; k++) if (by[k]) { sb.ch(' '); sb.cstr(K[k]); sb.ch('='); to_s(sb, (int32_t)by[k]); }
  sb.cstr(" scene_bytes="); to_s(sb, (int32_t)(shown->ncmd * sizeof(Cmd) + shown->ntext + shown->npts * 4));
  sb.cstr(" text_bytes="); to_s(sb, (int32_t)shown->ntext); sb.cstr(" point_floats="); to_s(sb, (int32_t)shown->npts);
  sb.ch('\n');
  hal_log_err(sb.buf, sb.len);
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
  static int hashing = -1;  // ZINC_FRAMEHASH: -1 not read, 0 off, 1 every frame, 2 the last frame
  if (hashing < 0) {
    const char* e = hal_env("ZINC_FRAMEHASH");
    hashing = !e || !*e || *e == '0' ? 0 : e[0] == 'l' ? 2 : 1;
    if (hashing == 2) at_finish(frame_hash_last);
  }
  if (hashing == 1) frame_hash(n);
  static int dumping = -1;  // ZINC_SCENE_DUMP: -1 not read, 0 off, 1 selected frames, 2 the last frame
  if (dumping < 0) {
    scene_path = hal_env("ZINC_SCENE_DUMP");
    dumping = !scene_path || !*scene_path ? 0 : hal_env("ZINC_SHOT_FRAMES") || hal_env("ZINC_SHOT_EVERY") ? 1 : 2;
    if (dumping == 2) at_finish(scene_last);
  }
  static bool stats_read = false;
  if (!stats_read) { stats_read = true; const char* rs = hal_env("ZINC_RENDER_STATS"); if (rs && *rs && *rs != '0') at_finish(render_stats); }
  if (dumping == 1 && shown) {
    const char* fl = hal_env("ZINC_SHOT_FRAMES");
    int32_t ev = 0;
    for (const char* e = hal_env("ZINC_SHOT_EVERY"); e && *e >= '0' && *e <= '9'; e++) ev = ev * 10 + (*e - '0');
    bool w = ev > 0 && n % ev == 0;
    for (const char* q = fl; q && *q && !w;) {
      int32_t v = 0;
      while (*q >= '0' && *q <= '9') v = v * 10 + (*q++ - '0');
      w = v == n;
      while (*q && (*q < '0' || *q > '9')) q++;
    }
    char out[1024];
    if (w) { numbered(out, sizeof out, scene_path, n); scene_write(out, *shown); }
  }
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
  HalFrame f = {pw, ph, 0, 0, ovl_changed ? pw : 0, ovl_changed ? ph : 0, render_rows, render_damage, frame_lists, nlay ? render_holes : nullptr};
  ovl_changed = false;
  present(&f);
}

// Logical -> physical. zinc:gfx records its commands in physical pixels (ZN-588: a pass over 200k commands cost about 0.3 ms at scale 4);
// C++ plugins fill theirs after emit(), in logical pixels: those are converted when the frame ends.
static uint32_t* plugin_cmds = nullptr;  // indices of this frame's emit() commands
static uint32_t n_plugin = 0, cap_plugin = 0;
static int32_t font_map[2][64];  // logical font id -> physical font id (cache)
static int32_t phys_font(int32_t f) {
  if (f >= 0 && f < 64 && font_map[0][f] == pxk + 1) return font_map[1][f];
  const raster::Font* fo = raster::font_at(f);
  int32_t r = f;
  if (fo) { uint32_t n = 0; while (fo->name[n]) n++; r = raster::render_font(fo->name, n, fo->px * pxk); }
  if (f >= 0 && f < 64) { font_map[0][f] = pxk + 1; font_map[1][f] = r; }
  return r;
}
static void scale_contours(float* p, uint32_t contours, float k) {  // [count, x, y, ...]*: the coordinates, not the counts
  for (uint32_t n = 0; n < contours; n++) { uint32_t cnt = (uint32_t)p[0]; for (uint32_t j = 1; j <= cnt * 2; j++) p[j] *= k; p += 1 + cnt * 2; }
}
static void to_physical(Buf& b, uint32_t from = 0) {   // from: the first plugin command of a window's slice (endWindow)
  if (pxk == 1) return;
  const float k = (float)pxk;
  for (uint32_t i = from; i < n_plugin; i++) {
    Cmd& c = b.cmds[plugin_cmds[i]];
    if (c.kind == raster::CLEAR || c.kind == raster::UNCLIP) continue;
    c.x *= k; c.y *= k; c.w *= k; c.h *= k;
    switch (c.kind) {
      case raster::RECT: case raster::CLIP: c.r *= k; break;
      case raster::IMAGE:
        if (!(c.pad & raster::kImageTint)) c.r *= k;   // r: a radius, or a sprite's tint
        if (c.pad & raster::kImageBox) { const raster::Box m = raster::image_box(c); raster::set_image_box(c, raster::Box{m.x * k, m.y * k, m.w * k, m.h * k}); }
        break;
      case raster::BORDER: case raster::SHADOW: c.r *= k; c.s *= k; break;
      case raster::TEXT:
        c.s *= k; c.res = phys_font(c.res);
        // rasterize missing runtime glyphs now, on this thread: bands are rendered in parallel (hal_sdl.cpp)
        raster::text_advance(c.res, b.text + c.off, c.n, 0);
        break;
      case raster::STROKE: { c.s *= k; float* p = b.pts + c.off; for (uint32_t j = 0; j < c.n * 2; j++) p[j] *= k; break; }
      case raster::POLY: case raster::LINE: {
        float* p = b.pts + c.off;
        scale_contours(p, c.n, k);
        for (uint32_t n = 0; n < c.n; n++) p += 1 + 2 * (uint32_t)p[0];
        if (c.grad == 4) for (uint32_t j = 1; j <= 6; j++) p[j] *= k;  // gradient paint geometry (raster.cpp paint_at)
        break;
      }
      default: break;
    }
  }
}

// ---------- hardware layers (ZN-731, hal.h) ----------
// A runtime image whose picture lies in device memory (raster::Picture: the dmabuf of a video decoder) goes to a layer of the display when
// the frame draws it the way a layer shows it: a plain IMAGE (upright, whole, opaque, square corners, no tint). The rasterizer leaves a
// hole there and the layer shows through it; what the frame draws after the picture (text, boxes, translucent or not, the corners of a
// rounded clip) stays in front of it, since the driver works out from two renders of those rows how much of the picture each pixel
// lets through (hal.h). Every other way of drawing it (turned, blended, rounded, a part of it, into an image or a window, on a display
// without layers) is the software one, from the picture's pixels, which its owner fills when asked: the frame is the same either way.
// ZINC_LAYER_LOG=1 says on stderr where each picture goes, at each change.
static struct { uint32_t cmd; HalLayer at; raster::Picture* pic; } lay[HAL_MAX_LAYERS];
static bool layers_on = false;   // the driver was given layers at the last frame
static bool is_picture(const Buf& b, const Cmd& c) { return c.kind == raster::IMAGE || (c.kind == raster::XFORM && (uint8_t)b.pts[c.off] == raster::IMAGE); }
static void layer_log(const char* where) {
  static const bool on = hal_env("ZINC_LAYER_LOG") != nullptr;
  static const char* last = nullptr;
  if (!on || where == last) return;
  last = where;   // ponytail: one state for all pictures; per image when two films have to be told apart
  static const char head[] = "gfx: a picture in device memory ";
  hal_log_err(head, sizeof head - 1); hal_log_err(where, __builtin_strlen(where)); hal_log_err("\n", 1);
}
/** The frame draws this picture itself: its pixels, now. */
static void draw_soft(Cmd& c, raster::Picture* p, const char* why) {
  if (!p->filled && p->fill) p->fill(p->user);
  p->software = true;
  c.pad &= (uint8_t)~raster::kImageLayer;
  c.c2 = raster::image_version(c.res);
  layer_log(why);
}
/** The pictures among the commands from `from` on are drawn in software (into an image, a window): their pixels are asked for. */
static void soft_pictures(Buf& b, uint32_t from) {
  for (uint32_t i = from; raster::dyn_pictures && i < b.ncmd; i++)
    if (is_picture(b, b.cmds[i]) && !(b.cmds[i].kind == raster::IMAGE && (b.cmds[i].pad & raster::kImageLayer)))
      if (raster::Picture* p = raster::dyn_picture(b.cmds[i].res)) draw_soft(b.cmds[i], p, "is drawn in software: into an image or a window, or in a frame nobody draws again");
}
static void place_layers(Buf& b) {
  nlay = 0;
  const bool can = display_driver && hal_display->layers;
  HalLayer offer[HAL_MAX_LAYERS];
  int32_t n = 0;
  for (uint32_t i = 0; raster::dyn_pictures && i < b.ncmd; i++) {
    Cmd& c = b.cmds[i];
    raster::Picture* p = is_picture(b, c) ? raster::dyn_picture(c.res) : nullptr;
    if (!p) continue;
    int32_t iw = 0, ih = 0;
    raster::image_size(c.res, &iw, &ih);
    const raster::Rect r = raster::layer_rect(c, *p, iw, ih);
    const char* why = !can ? "is drawn in software: the display has no hardware layer" : n == HAL_MAX_LAYERS ? "is drawn in software: no layer left" :
                      c.kind != raster::IMAGE ? "is drawn in software: it is turned" : c.alpha != 255 ? "is drawn in software: it is blended" :
                      c.pad || c.grad || c.r != 0 ? "is drawn in software: rounded, tinted, a part of it or unfiltered" : r.x1 <= r.x0 || r.y1 <= r.y0 ? "is drawn in software: it is empty" : nullptr;
    if (why) { draw_soft(c, p, why); continue; }
    lay[n] = {i, HalLayer{&p->hal, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0}, p};
    offer[n] = lay[n].at; n++;
  }
  if (!n && !layers_on) return;
  const uint32_t took = hal_display->layers(offer, n);   // n = 0: the layers of the frame before go
  layers_on = n > 0;
  for (int32_t k = 0; k < n; k++) {
    Cmd& c = b.cmds[lay[k].cmd];
    if (took >> k & 1) { c.pad |= raster::kImageLayer; c.c2 = 0; lay[nlay++] = lay[k]; layer_log("is on a hardware layer of the display: no pixel of it is read"); }
    else draw_soft(c, lay[k].pic, "is drawn in software: the display refused the layer");
  }
}
/** A retained frame: its layers go on showing the new pictures. True when one of them is gone (its picture, or the driver's layer): the
 *  frame, which nobody draws again, is then painted whole with that picture in software. */
static bool layers_again(Buf& b) {
  soft_pictures(b, 0);   // the ones it draws itself keep their pixels: an overlay may repaint over them
  if (!layers_on) return false;
  HalLayer offer[HAL_MAX_LAYERS];
  bool same = true;
  for (int32_t k = 0; k < nlay; k++) { offer[k] = lay[k].at; if (raster::dyn_picture(b.cmds[lay[k].cmd].res) != lay[k].pic) same = false; }
  if (same && nlay && hal_display->layers(offer, nlay) == (1u << nlay) - 1) return false;
  hal_display->layers(offer, 0);
  layers_on = false; nlay = 0;
  for (uint32_t i = 0; i < b.ncmd; i++) if (b.cmds[i].kind == raster::IMAGE && (b.cmds[i].pad & raster::kImageLayer)) {
    b.cmds[i].pad &= (uint8_t)~raster::kImageLayer;
    if (raster::Picture* p = raster::dyn_picture(b.cmds[i].res)) draw_soft(b.cmds[i], p, "is drawn in software: the display refused the layer");
  }
  return true;
}

static bool first_frame() { first = true; return true; }
// Bulk frames (ZN-402): when most commands changed, the damage is the union of everything the two frames draw, found without comparing them;
// a full diff every 16th frame leaves the mode once the scene calms down. all_box caches that union per buffer.
static bool bulk_mode = false;
static uint32_t bulk_n = 0;
static raster::Rect all_box[2];
static bool all_ok[2];
void begin_frame() { Buf& b = bufs[cur]; b.ncmd = 0; b.ntext = 0; b.npts = 0; n_plugin = 0; tx = ty = 0; xf_on = false; kept = false; all_ok[cur] = false; hud::frame_start(); prof::begin(); }
void keep() { kept = true; }
void end_frame() {
  init_scale();
  vis_init();
  const bool prof_on = prof::active();
  if (prof_on) prof::mark(prof::EFFECTS);   // microtasks drained after the frame callback
  pen_n = 0;
  banner_expire();
  if (kept && !first) {  // retained frame: no rasterization, no swap
    if (layers_again(bufs[cur ^ 1])) ovl_changed = true;
    if (vis.mode && vis_update(shown, false)) ovl_changed = true;   // damage flashes fade while idle
    if (ovl_changed) set_full_damage(); else ndmg = 0;
    hud::before_present(raster::Rect{0, 0, 0, 0});   // the panel keeps counting while the program is idle
    taps_update();
    const raster::Rect d = damage_box();
    HalFrame f = {pw, ph, d.x0, d.y0, d.x1, d.y1, render_rows, render_damage, frame_lists, nlay ? render_holes : nullptr};
    ovl_changed = false;
    present(&f);
    if (prof_on) prof::end();
    after_present();
    return;
  }
  to_physical(bufs[cur]);
  place_layers(bufs[cur]);
  const Buf& now = bufs[cur];
  const Buf& before = bufs[cur ^ 1];
  if (first || ovl_changed) set_full_damage();
  else if (bulk_mode && (++bulk_n & 15)) {
    if (!all_ok[cur ^ 1]) { all_box[cur ^ 1] = raster::bounds_all(frame_of(before), pw, ph); all_ok[cur ^ 1] = true; }
    all_box[cur] = raster::bounds_all(frame_of(now), pw, ph); all_ok[cur] = true;
    raster::Rect a = all_box[cur ^ 1], b = all_box[cur];
    const bool ea = a.x0 >= a.x1 || a.y0 >= a.y1, eb = b.x0 >= b.x1 || b.y0 >= b.y1;
    if (ea) a = b; else if (!eb) { a.x0 = b.x0 < a.x0 ? b.x0 : a.x0; a.y0 = b.y0 < a.y0 ? b.y0 : a.y0; a.x1 = b.x1 > a.x1 ? b.x1 : a.x1; a.y1 = b.y1 > a.y1 ? b.y1 : a.y1; }
    ndmg = (ea && eb) ? 0 : 1;
    dmg[0] = a;
  } else {
    uint32_t changed = 0;
    ndmg = raster::diff_rects(frame_of(before), frame_of(now), pw, ph, dmg, ZRT_DAMAGE_RECTS, &changed);
    bulk_mode = changed > raster::kBulkChanged;
    bulk_n = 0;
  }
  if (vis.mode && vis_update(&now, true)) set_full_damage();
  if (prof_on) prof::mark(prof::DIFF);
  hud::before_present(damage_box());
  taps_update();
  const raster::Rect d = damage_box();
  ovl_changed = false;
  first = false;
  shown = &now;
  __atomic_store_n(&tiles_state, 0, __ATOMIC_RELEASE);
  stats.draw_cmds = now.ncmd;
  HalFrame f = {pw, ph, d.x0, d.y0, d.x1, d.y1, render_rows, render_damage, frame_lists, nlay ? render_holes : nullptr};
  present(&f);
  if (prof_on) prof::end();
  after_present();
  cur ^= 1;
}
/** One warning per pool when a frame overflows it (the extra commands are dropped). */
static void pool_full(int32_t which) {
  static uint8_t warned = 0;
  if (warned & (1 << which)) return;
  warned |= (uint8_t)(1 << which);
  static const char* const msg[] = {
    "zinc:gfx: the draw command pool is full (ZRT_MAX_DRAW_CMDS): extra commands are dropped this frame; raise it with -DZRT_MAX_DRAW_CMDS=<n>\n",
    "zinc:gfx: the text pool is full (ZRT_TEXT_POOL bytes): extra text is dropped this frame; raise it with -DZRT_TEXT_POOL=<n>\n",
    "zinc:gfx: the point pool is full (ZRT_POINT_POOL floats): extra shapes are dropped this frame; raise it with -DZRT_POINT_POOL=<n>\n"};
  uint32_t n = 0;
  while (msg[which][n]) n++;
  hal_log_err(msg[which], n);
}
static Cmd* push(uint8_t kind, uint32_t color, int32_t alpha) {
  Buf& b = bufs[cur];
#ifdef ZRT_GROW_DRAW_CMDS
  if (!grow_enabled && b.ncmd == ZRT_MAX_DRAW_CMDS) { pool_full(0); return nullptr; }  // a grow build with growing switched off (zinc.json growDrawCommands false): the pool is fixed
  if (b.ncmd == b.capacity) {
    if (b.capacity > 0x7fffffffU / 2 || (size_t)b.capacity > (size_t)-1 / sizeof(Cmd) / 2) panic("draw command capacity overflow");
    uint32_t capacity = b.capacity * 2;
    Cmd* cmds = (Cmd*)hal_alloc((size_t)capacity * sizeof(Cmd));
    if (!cmds) panic("out of memory growing draw commands");  // never silently undercount a stress test
    __builtin_memcpy(cmds, b.cmds, (size_t)b.ncmd * sizeof(Cmd));
    if (b.cmds != b.initial) hal_free(b.cmds);
    b.cmds = cmds; b.capacity = capacity;

  }
#else
  if (b.ncmd == ZRT_MAX_DRAW_CMDS) { pool_full(0); return nullptr; }  // ponytail: extra commands are dropped
#endif
  Cmd* c = &b.cmds[b.ncmd++];
  __builtin_memset(c, 0, sizeof(Cmd));  // padding participates in the frame diff
  c->kind = kind; c->c1 = color & 0xFFFFFF;
  c->alpha = (uint8_t)(alpha < 0 ? 0 : alpha > 255 ? 255 : alpha);
  return c;
}
/** The scale of the commands being recorded: physical pixels, except into an image (beginImage), which is in logical pixels. */

static float rec_k() { if (!pxk) init_scale(); return target_img >= 0 ? 1.0f : (float)pxk; }
static void box(Cmd* c, double x, double y, double w, double h) {
  const float k = rec_k();
  c->x = (float)(x + tx) * k; c->y = (float)(y + ty) * k; c->w = (float)w * k; c->h = (float)h * k;
}
// A matrix that only scales and moves (no turn, no skew, no mirror) leaves a box a box: the command is recorded where it lands, as the
// program would have given it there, and both rasterizers draw it by their plain paths (ZN-730: a film in a zoomed card cost five times
// its direct drawing on a Pi 3). A radius, a border's width and a shadow's blur follow one scale: under two, only a command that has
// none of them. A TEXT keeps the matrix (its glyphs are chosen for the size on screen, D112).
// ponytail: a paint record (grad 5) keeps the matrix too, its geometry is in the point pool; scale it there if a zoomed gradient costs.
static bool xf_plain(Cmd* c, const float* m) {
  if (m[1] != 0 || m[2] != 0 || !(m[0] > 0 && m[3] > 0) || c->kind == raster::TEXT || c->grad == 5) return false;
  const bool image = c->kind == raster::IMAGE, boxed = image && (c->pad & raster::kImageBox), tinted = image && (c->pad & raster::kImageTint);
  if (m[0] != m[3] && ((!tinted && c->r != 0) || (!boxed && c->s != 0))) return false;
  if (boxed) {   // the box the whole image would cover lands with the rectangle painted
    const raster::Box b = raster::image_box(*c);
    raster::set_image_box(*c, raster::Box{m[0] * b.x + m[4], m[3] * b.y + m[5], m[0] * b.w, m[3] * b.h});
  } else c->s *= m[0];
  if (!tinted) c->r *= m[0];   // a tint is a colour kept in r
  c->x = m[0] * c->x + m[4]; c->y = m[3] * c->y + m[5]; c->w *= m[0]; c->h *= m[3];
  return true;
}
// Under gfx.setTransform (ZN-263.01) a box command becomes an XFORM: the command as recorded (its own coordinates, physical pixels) and the
// matrix go to the point pool, its box becomes its screen bounding box (tiles, damage and culling see a box like any other). The matrix acts
// in logical pixels: on physical ones its linear part is the same and its translation is scaled.
static void xform(Cmd* c) {
  if (!xf_on || !c) return;
  Buf& b = bufs[cur];
  const float k = rec_k(), m[6] = {(float)xf_m[0], (float)xf_m[1], (float)xf_m[2], (float)xf_m[3], (float)xf_m[4] * k, (float)xf_m[5] * k};
  if (xf_plain(c, m)) return;
  if (b.npts + raster::kXformLen > ZRT_POINT_POOL) { pool_full(2); b.ncmd--; return; }
  float* p = b.pts + b.npts;
  p[0] = (float)c->kind;
  for (int i = 0; i < 6; i++) p[1 + i] = m[i];
  p[7] = c->x; p[8] = c->y; p[9] = c->w; p[10] = c->h; p[11] = c->r; p[12] = c->s;
  __builtin_memcpy(p + 13, &c->off, 4); __builtin_memcpy(p + 14, &c->n, 4);
  // what the command may paint around its box: a shadow's blur, a text line's overhang (raster.cpp cmd_bounds)
  const float e = c->kind == raster::SHADOW ? c->s + 1 : c->kind == raster::TEXT ? c->h * 0.5f + 1 : 1;
  const float xs[2] = {c->x - e, c->x + c->w + e}, ys[2] = {c->y - e, c->y + c->h + e};
  float minx = 1e30f, miny = 1e30f, maxx = -1e30f, maxy = -1e30f;
  for (float x : xs) for (float y : ys) {
    const float X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    minx = X < minx ? X : minx; maxx = X > maxx ? X : maxx; miny = Y < miny ? Y : miny; maxy = Y > maxy ? Y : maxy;
  }
  c->kind = raster::XFORM; c->off = b.npts; c->n = raster::kXformLen; c->r = 0; c->s = 0;
  c->x = minx; c->y = miny; c->w = maxx - minx; c->h = maxy - miny;
  b.npts += raster::kXformLen;
}
/** (x, y) through the current matrix, in place (logical pixels). */
static void xf_point(double& x, double& y) {
  if (!xf_on) return;
  const double X = xf_m[0] * x + xf_m[2] * y + xf_m[4], Y = xf_m[1] * x + xf_m[3] * y + xf_m[5];
  x = X; y = Y;
}
/** The matrix's mean scale (stroke widths under a transform). */
static double xf_scale() { return xf_on ? math::sqrt(xf_m[0] * xf_m[3] - xf_m[1] * xf_m[2] < 0 ? xf_m[1] * xf_m[2] - xf_m[0] * xf_m[3] : xf_m[0] * xf_m[3] - xf_m[1] * xf_m[2]) : 1; }
void setTransform(double a, double b, double c, double d, double e, double f) {
  xf_on = !(a == 1 && b == 0 && c == 0 && d == 1 && e == 0 && f == 0);
  xf_m[0] = a; xf_m[1] = b; xf_m[2] = c; xf_m[3] = d; xf_m[4] = e; xf_m[5] = f;
}
void resetTransform() { xf_on = false; }

void onFrame(Fn<void(double)> cb) { frame_cb = cb; }
void onResize(Fn<void(int32_t, int32_t)>) {}
int32_t width() { return surf_w; }
int32_t height() { return surf_h; }
void clear(uint32_t color) { push(raster::CLEAR, color, 255); }
void rect(double x, double y, double w, double h, uint32_t color) { if (Cmd* c = push(raster::RECT, color, 255)) { box(c, x, y, w, h); xform(c); } }
void rrect(double x, double y, double w, double h, double r, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::RECT, color, alpha)) { box(c, x, y, w, h); c->r = (float)r * rec_k(); xform(c); }
}
void gradient(double x, double y, double w, double h, double r, uint32_t c1, uint32_t c2, bool vertical, int32_t alpha) {
  if (Cmd* c = push(raster::RECT, c1, alpha)) { box(c, x, y, w, h); c->r = (float)r * rec_k(); c->c2 = c2 & 0xFFFFFF; c->grad = vertical ? 1 : 2; xform(c); }
}
// A rounded box filled with a gradient paint record (ZN-261, raster.cpp paint_at): RECT grad 5, the record in the point pool with its
// geometry in physical pixels like the box. A record that does not hold its stops draws nothing.
void gradientPaint(double x, double y, double w, double h, double r, const double* g, uint32_t n, int32_t alpha) {
  if (n < 11 || !(g[0] >= 1 && g[0] <= 12) || !(g[7] >= 1 && g[7] <= (double)((n - 8) / 3)) || g[7] != (double)(uint32_t)g[7]) return;
  const int32_t kind = (int32_t)g[0];
  if (g[0] != (double)kind || (kind & 7) < 1 || (kind & 7) > 4 || kind > 12) return;
  const uint32_t len = 8 + 3 * (uint32_t)g[7];
  Buf& b = bufs[cur];
  if (len > ZRT_POINT_POOL - b.npts) { pool_full(2); return; }
  Cmd* c = push(raster::RECT, 0, alpha);
  if (!c) return;
  box(c, x, y, w, h);
  c->r = (float)r * rec_k(); c->grad = 5; c->off = b.npts; c->n = len;
  float* p = b.pts + b.npts;
  const float k = rec_k();
  for (uint32_t i = 0; i < len; i++) p[i] = (float)g[i];
  p[1] = (float)(g[1] + tx) * k; p[2] = (float)(g[2] + ty) * k;   // a point
  if ((kind & 7) <= 2) { p[3] *= k; p[4] = (float)(g[4] + tx) * k; p[5] = (float)(g[5] + ty) * k; p[6] *= k; }   // radius, point, radius
  else if ((kind & 7) == 3) { p[4] *= k; p[5] *= k; }   // the ellipse's radii; a conic's r0 is an angle
  for (uint32_t i = 0; i < (uint32_t)g[7]; i++) {   // colours and alphas as the raster reads them (program data: NaN and out of range clamped)
    float* s = p + 8 + i * 3;
    const double cv = g[9 + i * 3], av = g[10 + i * 3];
    s[1] = cv >= 0 && cv <= 16777215.0 ? (float)(uint32_t)cv : 0;
    s[2] = av >= 0 ? (av <= 255 ? (float)(int32_t)av : 255) : 0;
  }
  b.npts += len;
  xform(c);
}
void border(double x, double y, double w, double h, double r, double width, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::BORDER, color, alpha)) { box(c, x, y, w, h); c->r = (float)r * rec_k(); c->s = (float)width * rec_k(); xform(c); }
}
void shadow(double x, double y, double w, double h, double r, double blur, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::SHADOW, color, alpha)) { box(c, x, y, w, h); c->r = (float)r * rec_k(); c->s = (float)blur * rec_k(); xform(c); }
}
// The point rows read the program's f64 storage in place (ZN-405): no array is built per call.
static bool add_points(Cmd* c, const double* pts, uint32_t n, bool closed_list) {
  Buf& b = bufs[cur];
  if (b.npts + n + 1 > ZRT_POINT_POOL) { pool_full(2); return false; }  // + 1: an open polygon writes its count first
  c->off = b.npts;
  const float ks = rec_k();
  float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
  uint32_t i = 0, contours = 0;
  while (i < n) {
    // a contour count is program data: negative / NaN / too large must not wrap `i` or claim points not written
    const uint32_t start = closed_list ? i + 1 : 0, avail = (n - start) / 2;
    double want = closed_list ? pts[i] : (double)avail;
    uint32_t cnt = want >= 1 ? (want < (double)avail ? (uint32_t)want : avail) : 0;
    b.pts[b.npts++] = (float)cnt;
    for (uint32_t k = 0; k < cnt; k++) {
      double dx = pts[start + k * 2] + tx, dy = pts[start + k * 2 + 1] + ty;
      xf_point(dx, dy);
      const float x = (float)dx, y = (float)dy;
      b.pts[b.npts++] = x * ks; b.pts[b.npts++] = y * ks;
      minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy;
    }
    contours++;
    if (!closed_list || want > (double)avail) break;
    i = start + cnt * 2;
  }
  c->n = contours;
  c->x = minx * ks; c->y = miny * ks; c->w = (maxx - minx) * ks; c->h = (maxy - miny) * ks;
  return true;
}
Cmd* emit(uint8_t kind, const float* pts, uint32_t len) {
  Buf& b = bufs[cur];
  if (len > ZRT_POINT_POOL - b.npts) { pool_full(2); return nullptr; }
  Cmd* c = push(kind, 0, 255);
  if (c && target_img < 0 && pxk != 1) {   // the plugin fills it in logical pixels: converted at the end of the frame
    if (n_plugin == cap_plugin) {
      const uint32_t cap = cap_plugin ? cap_plugin * 2 : 256;
      uint32_t* a = (uint32_t*)hal_alloc(cap * sizeof(uint32_t));
      if (!a) panic("out of memory recording plugin commands");
      if (plugin_cmds) { __builtin_memcpy(a, plugin_cmds, n_plugin * sizeof(uint32_t)); hal_free(plugin_cmds); }
      plugin_cmds = a; cap_plugin = cap;
    }
    plugin_cmds[n_plugin++] = b.ncmd - 1;
  }
  if (!c || !len) return c;
  __builtin_memcpy(b.pts + b.npts, pts, len * sizeof(float));
  c->off = b.npts;
  // contours: a count must be a whole number of points that are there; anything else ends the list (the rasterizer
  // walks these counts, and canvas2d appends a paint record after its contours)
  if (kind == raster::POLY) for (uint32_t i = 0; i < len;) {
    float f = pts[i];
    if (!(f >= 0 && f <= (float)((len - i - 1) / 2)) || (float)(uint32_t)f != f) break;
    c->n++; i += 1 + 2 * (uint32_t)f;
  }
  b.npts += len;
  return c;
}
/** Filled polygon from flat [x0, y0, x1, y1, ...] coordinates. */
void polygon(const double* pts, uint32_t n, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::POLY, color, alpha)) if (!add_points(c, pts, n, false)) bufs[cur].ncmd--;
}
void polygon(const Array<double>& pts, uint32_t color, int32_t alpha) { polygon(pts.obj()->data, (uint32_t)pts.length(), color, alpha); }
/** Several contours: [count, x0, y0, ..., count, x0, y0, ...] (nonzero winding, for holes and vector art). */
void path(const double* contours, uint32_t n, uint32_t color, int32_t alpha) {
  if (Cmd* c = push(raster::POLY, color, alpha)) if (!add_points(c, contours, n, true)) bufs[cur].ncmd--;
}
void path(const Array<double>& contours, uint32_t color, int32_t alpha) { path(contours.obj()->data, (uint32_t)contours.length(), color, alpha); }
void line(double x1, double y1, double x2, double y2, uint32_t color) {
  // a 1px line is a thin quad
  double dx = x2 - x1, dy = y2 - y1, len = math::sqrt(dx * dx + dy * dy);
  if (len <= 0) { rect(x1, y1, 1, 1, color); return; }
  double nx = -dy / len * 0.5, ny = dx / len * 0.5;
  const double q[8] = {x1 + nx + 0.5, y1 + ny + 0.5, x2 + nx + 0.5, y2 + ny + 0.5, x2 - nx + 0.5, y2 - ny + 0.5, x1 - nx + 0.5, y1 - ny + 0.5};
  polygon(q, 8, color, 255);
}
int32_t font(const String& name, int32_t px) { return raster::find_font(name.ptr(), name.bytes(), px); }
/** A font at exactly `px` pixels from a TrueType file chosen at run time (ZN-669): a family the program bakes or embeds ("sans", "sans-bold", "mono",
 *  the stem of a .ttf of its assets), the path of a file of its assets (its stem when that file is embedded), or a file the host added
 *  (raster::add_font_file). Its glyphs are the baker's at that size. Without TrueType files (small targets), the closest baked size; -1: none. */
int32_t loadFont(const String& name, double px) {
  const int32_t k = !(px >= 1) ? 1 : px > 512 ? 512 : (int32_t)(px + 0.5);
  const char* s = name.ptr();
  uint32_t n = name.bytes();
  int32_t f = raster::exact_font(s, n, k);
  if (f >= 0) return f;
  uint32_t from = 0, to = n;   // fonts/Lora-Regular.ttf -> Lora-Regular
  for (uint32_t i = 0; i < n; i++) if (s[i] == '/') from = i + 1;
  for (uint32_t i = n; i > from; i--) if (s[i - 1] == '.') { to = i - 1; break; }
  if (from > 0 || to < n) { f = raster::exact_font(s + from, to - from, k); if (f >= 0) return f; }
  return raster::find_font(s + from, to - from, k);
}
int32_t fontAscent(int32_t f) { const raster::Font* fo = raster::font_at(f); return fo ? fo->ascent : 0; }
int32_t lineHeight(int32_t f) { const raster::Font* fo = raster::font_at(f); return fo ? fo->ascent + fo->descent + fo->lineGap : 0; }
// A text under a matrix that scales (ZN-726). The software raster and the GL replay sample the glyph bitmaps through the matrix, so the
// glyphs of the text's own font come out blurred when enlarged. The text keeps that font for its layout (its box, its advances: a line is
// as wide as without the matrix, times the scale) and takes its glyphs from a font of about its size on screen, drawn through the matrix
// with what is left of the scale. The size is the first of a ladder, a quarter of an octave apart, that is not below the size on screen:
// the glyphs are drawn at 84 to 103 % of their size (reduced rather than enlarged: measured, an enlarged glyph loses twice the edge
// contrast), and a zoom that passes through hundreds of scales makes at most 17 fonts of a family, each with the glyphs that were drawn.
// Above 128 pixels the glyphs are enlarged again: the GL replay's atlas (1024 pixels) holds few larger ones.
// The scale is the larger of the two axes': a box narrowed along one (a card turning over) keeps its glyphs. A text whose own glyphs
// would be drawn at 84 to 103 % (a matrix that turns or flips, a small zoom) is drawn with them, as before. Returns the glyphs' font, or
// -1 for the text's own.
static int32_t glyph_font(int32_t f, const char* s, uint32_t n) {
  static const int16_t ladder[] = {8, 10, 11, 13, 16, 19, 23, 27, 32, 38, 45, 54, 64, 76, 91, 108, 128};   // round(2^(k/4))
  const double up = 1.03;   // how much a glyph may be enlarged
  const raster::Font* fo = raster::font_at(f);
  if (!xf_on || !fo) return -1;
  const double sx = xf_m[0] * xf_m[0] + xf_m[1] * xf_m[1], sy = xf_m[2] * xf_m[2] + xf_m[3] * xf_m[3], s2 = sx > sy ? sx : sy;
  if (!(s2 < 0.7071068 || s2 > up * up) || !(s2 < 1e12)) return -1;   // 2^(-1/4) <= scale <= up
  const double want = fo->px * math::sqrt(s2);
  uint32_t i = 0;
  while (i + 1 < sizeof ladder / sizeof *ladder && ladder[i] * up < want) i++;
  if (ladder[i] == fo->px) return -1;
  const int32_t g = raster::scaled_font(f, ladder[i]);
  const raster::Font* go = raster::font_at(g);
  if (!go || go->px == fo->px) return -1;
  // No font of that size could be made (no TrueType file, the table full) and this is the closest baked one: it serves when it is large
  // enough and not far larger than needed, or at least nearer than the text's own.
  if (!(go->px * up >= want ? go->px < want * 1.5 || go->px < fo->px : go->px > fo->px)) return -1;
  return raster::text_font(g, s, n);
}
double textWidth(int32_t f, const String& s, double tracking) { return raster::text_advance(raster::text_font(f, s.ptr(), s.bytes()), s.ptr(), s.bytes(), (float)tracking) / 64.0; }
void drawText(int32_t f, double x, double y, const String& s, uint32_t color, int32_t alpha, double tracking) {
  f = raster::text_font(f, s.ptr(), s.bytes());   // a character the baked font lacks: its twin from the TrueType file
  Buf& b = bufs[cur];
  uint32_t n = s.bytes();
  if (b.ntext + n > ZRT_TEXT_POOL) { pool_full(1); return; }
  Cmd* c = push(raster::TEXT, color, alpha);
  if (!c) return;
  __builtin_memcpy(b.text + b.ntext, s.ptr(), n);
  const float k = rec_k();
  c->res = f; c->off = b.ntext; c->n = n; c->s = (float)tracking * k;
  box(c, x, y, textWidth(f, s, tracking), lineHeight(f));
  b.ntext += n;
  if (k != 1.0f) {
    c->res = phys_font(f);
    raster::text_advance(c->res, b.text + c->off, n, 0);   // rasterize missing runtime glyphs now, on this thread: bands are rendered in parallel (hal_sdl.cpp)
  }
  const int32_t g = glyph_font(c->res, b.text + c->off, n);
  if (g >= 0) {   // r, which a TEXT has no use for, carries the glyphs' font (plus one) in the XFORM's payload
    c->r = (float)(g + 1);
    raster::text_advance(g, b.text + c->off, n, c->s * raster::font_at(g)->px / raster::font_at(c->res)->px);   // its glyphs, made on this thread too
  }
  xform(c);
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
  if (Cmd* c = push(raster::IMAGE, 0, alpha)) { box(c, x, y, w, h); c->res = i; c->r = (float)radius * rec_k(); c->c2 = raster::image_version(i); xform(c); }
}
/** The source rectangle (sx, sy, sw, sh) of an image, in the pixels of imageWidth / imageHeight, on (dx, dy, dw, dh): a frame of a sprite sheet.
 *  flags: 1 mirrors it left to right, 2 top to bottom, 4 samples the nearest texel instead of blending four. The part of the source
 *  rectangle outside the image is not drawn. Linear sampling reads the neighbouring texels at the edges of the rectangle, as a GPU does.
 *  A sprite (ZN-581): turned by `rotation` radians (clockwise on the screen) around the centre of (dx, dy, dw, dh), recorded as an XFORM
 *  through the matrix in force; its colour multiplied by `tint`; blended by `blend` (raster::Blend). */
void drawImageRect(int32_t i, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh, int32_t alpha, int32_t flags,
                   double rotation, uint32_t tint, int32_t blend) {
  if (rotation != 0) {   // the turn after the matrix in force, around the centre (logical pixels, after translate)
    if (!(rotation - rotation == 0)) return;   // NaN or infinite: no turn to draw
    const bool on = xf_on;
    double m[6];
    for (int k = 0; k < 6; k++) m[k] = xf_m[k];
    const double cs = math::cos(rotation), sn = math::sin(rotation), qx = dx + dw * 0.5 + tx, qy = dy + dh * 0.5 + ty;
    const double r[6] = {cs, sn, -sn, cs, qx - cs * qx + sn * qy, qy - sn * qx - cs * qy};   // q - R q
    if (!on) for (int k = 0; k < 6; k++) xf_m[k] = r[k];
    else {
      xf_m[0] = m[0] * r[0] + m[2] * r[1]; xf_m[1] = m[1] * r[0] + m[3] * r[1];
      xf_m[2] = m[0] * r[2] + m[2] * r[3]; xf_m[3] = m[1] * r[2] + m[3] * r[3];
      xf_m[4] = m[0] * r[4] + m[2] * r[5] + m[4]; xf_m[5] = m[1] * r[4] + m[3] * r[5] + m[5];
    }
    xf_on = true;
    drawImageRect(i, sx, sy, sw, sh, dx, dy, dw, dh, alpha, flags, 0, tint, blend);
    xf_on = on;
    for (int k = 0; k < 6; k++) xf_m[k] = m[k];
    return;
  }
  int32_t iw, ih;
  if (!raster::image_size(i, &iw, &ih) || !(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return;   // also NaN
  Cmd* c = push(raster::IMAGE, 0, alpha);
  if (!c) return;
  box(c, dx, dy, dw, dh);
  c->res = i; c->c2 = raster::image_version(i); c->grad = flags & 4 ? 1 : 0;
  if ((tint & 0xFFFFFF) != 0xFFFFFF) { c->pad |= raster::kImageTint; c->r = (float)(tint & 0xFFFFFF); }
  if (blend > 0 && blend <= raster::BLEND_SCREEN) c->pad |= (uint8_t)(blend << raster::kBlendShift);
  // where the whole image would lie for the source rectangle to land on the destination (zrt_raster.h image_box); mirrored: from the far side, a negative size
  const double fx = dw / sw, fy = dh / sh;
  double bx = dx - sx * fx, by = dy - sy * fy, bw = iw * fx, bh = ih * fy;
  if (flags & 1) { bx = dx + (sx + sw) * fx; bw = -bw; }
  if (flags & 2) { by = dy + (sy + sh) * fy; bh = -bh; }
  const float k = rec_k();
  raster::set_image_box(*c, raster::Box{(float)(bx + tx) * k, (float)(by + ty) * k, (float)bw * k, (float)bh * k});
  xform(c);   // the box travels with the command: s, off and n in the XFORM's payload, c1 in the Cmd
}
/** Stroked polyline from flat [x0, y0, ...] coordinates (round joins and caps). */
void stroke(const double* pts, uint32_t len, double width, uint32_t color, int32_t alpha, bool closed) {
  Buf& b = bufs[cur];
  uint32_t n = len / 2;
  if (n < 2) return;
#ifndef ZRT_STROKE_POINTS
#define ZRT_STROKE_POINTS 2048  // esp32: 512 (its point pool holds 1024 floats anyway)
#endif
  static float tmp[ZRT_STROKE_POINTS * 2];
  if (n > ZRT_STROKE_POINTS) n = ZRT_STROKE_POINTS;  // ponytail: long lines are split by the caller (map tiles already are)
  for (uint32_t i = 0; i < n; i++) { double x = pts[i * 2] + tx, y = pts[i * 2 + 1] + ty; xf_point(x, y); tmp[i * 2] = (float)x; tmp[i * 2 + 1] = (float)y; }
  width *= xf_scale();   // ponytail: a transformed stroke keeps a round pen of the matrix's mean scale
  static const char* force = hal_env("ZINC_GPU_STROKES");   // 1 / 0: STROKE commands or outlines whatever the display (tests, measures)
  if ((force ? *force == '1' : gpu_strokes) && target_img < 0) {   // the display draws the polyline on the GPU (ZN-590.01): no outline here
    if (b.npts + n * 2 > ZRT_POINT_POOL) { pool_full(2); return; }
    Cmd* c = push(raster::STROKE, color, alpha);
    if (!c) return;
    const float k = rec_k(), hw = (float)width * 0.5f + 1;
    float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
    c->off = b.npts; c->n = n; c->s = (float)width * k; c->pad = closed ? 2 : 0;
    for (uint32_t i = 0; i < n; i++) {
      const float x = tmp[i * 2], y = tmp[i * 2 + 1];
      b.pts[b.npts++] = x * k; b.pts[b.npts++] = y * k;
      minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy;
    }
    c->x = (minx - hw) * k; c->y = (miny - hw) * k; c->w = (maxx - minx + 2 * hw) * k; c->h = (maxy - miny + 2 * hw) * k;
    return;
  }
  Cmd* c = push(raster::POLY, color, alpha);
  if (!c) return;
  uint32_t r = raster::stroke_contours(tmp, n, (float)width, closed, b.pts + b.npts, ZRT_POINT_POOL - b.npts);
  float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f, hw = (float)width * 0.5f + 1;
  for (uint32_t i = 0; i < n; i++) { float x = tmp[i * 2], y = tmp[i * 2 + 1]; minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy; }
  c->off = b.npts; c->n = r & 0xFFFF; b.npts += r >> 16;
  if (!c->n) { if (ZRT_POINT_POOL - b.npts < 64) pool_full(2); b.ncmd--; return; }
  const float k = rec_k();   // the outline is built in logical pixels, then scaled like the rest
  if (k != 1.0f) scale_contours(b.pts + c->off, c->n, k);
  c->x = (minx - hw) * k; c->y = (miny - hw) * k; c->w = (maxx - minx + 2 * hw) * k; c->h = (maxy - miny + 2 * hw) * k;
}
void stroke(const Array<double>& pts, double width, uint32_t color, int32_t alpha, bool closed) { stroke(pts.obj()->data, (uint32_t)pts.length(), width, color, alpha, closed); }
/** Runtime image (black), drawable with drawImage and a render target for beginImage. */
int32_t createImage(int32_t w, int32_t h) { return raster::dyn_create(w, h); }
void destroyImage(int32_t i) { raster::dyn_destroy(i); }
// Render-to-image: commands between beginImage and endImage are rasterized into the image instead of the screen
// (cached map tiles, static layers). They never reach the frame diff.
static uint32_t mark_cmd, mark_text, mark_pts;
// A range that starts with CLEAR does not depend on what the image held. When it is the range last drawn into this image, and nothing else
// wrote the image since, the image is left as it is: a cached layer (the scroll tiles of lib/std/ui.ts) is recorded again whenever something
// may have changed, and rasterized, uploaded and diffed only when something did.
struct Drawn { int32_t img; uint32_t version, hash; };
static Drawn drawn[256];   // by image id; ponytail: two cached images that share a slot draw every time, a map when a program keeps that many
void beginImage(int32_t i) { Buf& b = bufs[cur]; target_img = i; mark_cmd = b.ncmd; mark_text = b.ntext; mark_pts = b.npts; }
void endImage() {
  Buf& b = bufs[cur];
  uint32_t* px = raster::dyn_pixels(target_img);
  int32_t w, h;
  if (px && raster::image_size(target_img, &w, &h)) {
    soft_pictures(b, mark_cmd);
    raster::Frame fr{b.cmds + mark_cmd, b.ncmd - mark_cmd, b.text, b.pts};
    Drawn& d = drawn[(uint32_t)target_img % 256];
    const uint32_t hsh = fr.count && fr.cmds[0].kind == raster::CLEAR ? raster::frame_hash(fr) | 1 : 0;   // 0: it draws over what is there
    if (!hsh || d.img != target_img || d.hash != hsh || d.version != raster::image_version(target_img)) {
      raster::render(fr, px, w, 0, h, raster::Rect{0, 0, w, h});
      raster::dyn_set_alpha(target_img, false);   // the raster writes 0x00RRGGBB: a decoded image drawn into is opaque from now on
      raster::dyn_update(target_img, nullptr, 0);
      d = Drawn{target_img, raster::image_version(target_img), hsh};
    }
  }
  b.ncmd = mark_cmd; b.ntext = mark_text; b.npts = mark_pts; target_img = -1;
}
// ---------- more windows (ZN-663) ----------
// A window beside the main one draws a slice of the frame's command list into pixels of its own: between beginWindow and endWindow the
// commands are recorded as usual (physical pixels at the main window's scale), then rasterized into the window's buffer when they changed,
// handed to the HAL and dropped from the list, like beginImage. While its callback runs, the window's input stands in for the main
// window's and width()/height() are its size. The HAL (hal_window.h) owns the rule of the last window: closing one keeps the others,
// closing the last one ends the program; a closed main window is hidden while others are open.
struct Win { int32_t id; int32_t w, h, pw, ph; uint32_t* px; uint32_t hash; bool open; HalInput in, prev; };
static Win wins[ZRT_MAX_WINDOWS];
static Win* in_win = nullptr;   // the window being drawn
static int32_t win_ids = 0;
static struct { int32_t w, h; float tx, ty; bool xf, kept; double m[6]; uint32_t cmd, text, pts, plugin; HalInput in, prev; } outer;
static Win* win_of(int32_t id) { for (Win& x : wins) if (x.open && x.id == id) return &x; return nullptr; }
int32_t openWindow(const String& title, int32_t w, int32_t h) {
  Win* x = nullptr;
  for (Win& s : wins) if (!s.open) { x = &s; break; }
  if (!x || w < 1 || h < 1) return -1;
  char t[256];
  uint32_t n = title.bytes() < sizeof t - 1 ? title.bytes() : (uint32_t)sizeof t - 1;
  __builtin_memcpy(t, title.ptr(), n); t[n] = 0;
  const int32_t id = ++win_ids;
  if (!hal_win_open(id, t, w, h)) return -1;
  if (x->px) hal_free(x->px);
  __builtin_memset(x, 0, sizeof *x);
  x->id = id; x->w = w; x->h = h; x->open = true; x->in.pinch = 1;
  return id;
}
void closeWindow(int32_t id) {
  if (Win* x = id ? win_of(id) : nullptr) { x->open = false; if (x->px) hal_free(x->px); x->px = nullptr; }
  hal_win_close(id);
}
bool windowOpen(int32_t id) {
  Win* x = id ? win_of(id) : nullptr;
  if (id && !x) return false;
  if (hal_win_state(id)) return true;
  if (x) closeWindow(id);   // closed by the user: its pixels go
  return false;
}
void beginWindow(int32_t id) {
  Win* x = win_of(id);
  if (!x || in_win || target_img >= 0) return;
  x->prev = x->in;
  x->in.wheel = 0; x->in.pinch = 1;
  hal_win_input(id, &x->in, &x->w, &x->h);
  Buf& b = bufs[cur];
  outer.w = surf_w; outer.h = surf_h; outer.tx = tx; outer.ty = ty; outer.xf = xf_on; outer.kept = kept; __builtin_memcpy(outer.m, xf_m, sizeof xf_m);
  outer.cmd = b.ncmd; outer.text = b.ntext; outer.pts = b.npts; outer.plugin = n_plugin; outer.in = input; outer.prev = prev_input;
  surf_w = x->w; surf_h = x->h; tx = ty = 0; xf_on = false; kept = false; input = x->in; prev_input = x->prev;
  hal_win_current(id);
  in_win = x;
}
void endWindow() {
  Win* x = in_win;
  if (!x) return;
  Buf& b = bufs[cur];
  to_physical(b, outer.plugin);
  init_scale();
  const int32_t wpw = x->w * pxk, wph = x->h * pxk;
  if (!x->px || wpw != x->pw || wph != x->ph) {
    if (x->px) hal_free(x->px);
    x->px = (uint32_t*)hal_alloc((size_t)wpw * wph * 4);
    x->pw = wpw; x->ph = wph; x->hash = 0;
  }
  soft_pictures(b, outer.cmd);
  raster::Frame fr{b.cmds + outer.cmd, b.ncmd - outer.cmd, b.text, b.pts};
  const uint32_t hsh = raster::frame_hash(fr) | 1;   // never 0: a new buffer is always drawn
  if (x->px && hsh != x->hash && !kept) {   // an unchanged frame (or keep()) keeps the pixels the window shows
    raster::render(fr, x->px, wpw, 0, wph, raster::Rect{0, 0, wpw, wph});
    hal_win_present(x->id, x->px, wpw, wph);
    x->hash = hsh;
  }
  b.ncmd = outer.cmd; b.ntext = outer.text; b.npts = outer.pts; n_plugin = outer.plugin;
  x->in = input;
  surf_w = outer.w; surf_h = outer.h; tx = outer.tx; ty = outer.ty; xf_on = outer.xf; kept = outer.kept; __builtin_memcpy(xf_m, outer.m, sizeof xf_m);
  input = outer.in; prev_input = outer.prev;
  hal_win_current(0);
  in_win = nullptr;
}
/** ZINC_SHOT: each open window beside the main one as <name>-w<id>.<ext>. */
static void save_windows(const char* path) {
  for (Win& x : wins) {
    if (!x.open || !x.px) continue;
    char out[1024];
    uint32_t n = 0, dot = 0;
    while (path[n] && n < 1000) { if (path[n] == '.') dot = n; else if (path[n] == '/') dot = 0; n++; }
    if (!dot) dot = n;
    __builtin_memcpy(out, path, dot);
    uint32_t k = dot;
    out[k++] = '-'; out[k++] = 'w';
    char d[10]; int32_t nd = 0, v = x.id;
    do { d[nd++] = (char)('0' + v % 10); v /= 10; } while (v);
    while (nd) out[k++] = d[--nd];
    __builtin_memcpy(out + k, path + dot, n - dot); k += n - dot; out[k] = 0;
    write_image(out, x.px, x.pw, x.ph);
  }
}
void clip(double x, double y, double w, double h, double r) {
  if (xf_on) {   // ponytail: under a matrix the clip is the bounding box of the transformed rectangle, square
    double xs[4] = {x, x + w, x + w, x}, ys[4] = {y, y, y + h, y + h}, x0 = 1e300, y0 = 1e300, x1 = -1e300, y1 = -1e300;
    for (int i = 0; i < 4; i++) { xf_point(xs[i], ys[i]); x0 = xs[i] < x0 ? xs[i] : x0; x1 = xs[i] > x1 ? xs[i] : x1; y0 = ys[i] < y0 ? ys[i] : y0; y1 = ys[i] > y1 ? ys[i] : y1; }
    x = x0 - tx; y = y0 - ty; w = x1 - x0; h = y1 - y0; r = 0;
  }
  if (Cmd* c = push(raster::CLIP, 0, 255)) { box(c, x, y, w, h); c->r = (float)r * rec_k(); }
}
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
int32_t pixelScale() { init_scale(); return pxk; }
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
// Raster bands (the SDL HAL renders them on worker threads): their spans feed the profiler's raster phase and
// the per-band tracks of the trace. The HAL has weak no-op defaults for programs without zinc:gfx.
extern "C" int32_t zrt_profiling(void) { return zrt::gfx::prof::active() ? 1 : 0; }
extern "C" void zrt_prof_band(int32_t band, uint64_t t0, uint64_t t1) {
  using namespace zrt::gfx::prof;
  if (st && band >= 0 && band < ZRT_PROF_BANDS) { st->band[band][0] = t0; st->band[band][1] = t1; }
}
