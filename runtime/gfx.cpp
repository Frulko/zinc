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

// ZINC_VISUALIZE=damage|cmds (docs/dev-mode.md): an overlay over the program's frame, allocated only when asked for.
static struct Vis { Cmd* cmds; uint32_t ncmd, cap; int32_t mode; } vis = {nullptr, 0, 0, -1};  // mode 0 off, 1 damage, 2 cmds
static void render_rows(uint32_t* rows, int32_t y0, int32_t y1) {
  raster::Rect all{0, y0, pw, y1};
  if (shown) raster::render(frame_of(*shown), rows, pw, y0, y1, all);
  else for (int32_t i = 0; i < (y1 - y0) * pw; i++) rows[i] = 0;
  if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, all);
  if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, all);
  if (vis.ncmd) raster::render(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr}, rows, pw, y0, y1, all);
}
// the frame as command lists in paint order, for GPU displays (HalFrame.frames); same lists as render_rows
static HalCmdList lists[4];
static int32_t frame_lists(const HalCmdList* out[], int32_t max) {
  int32_t n = 0;
  auto add = [&](const raster::Frame& f) { if (n < max && n < 4) { lists[n] = HalCmdList{f.cmds, f.count, f.text, f.pts}; out[n] = &lists[n]; n++; } };
  if (shown) add(frame_of(*shown));
  if (rbox.ncmd) add(ovl_frame(rbox));
  if (banner.ncmd) add(ovl_frame(banner));
  if (vis.ncmd) add(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr});
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
    if (shown) raster::render(frame_of(*shown), rows, pw, y0, y1, r);
    if (rbox.ncmd) raster::render(ovl_frame(rbox), rows, pw, y0, y1, r);
    if (banner.ncmd) raster::render(ovl_frame(banner), rows, pw, y0, y1, r);
    if (vis.ncmd) raster::render(raster::Frame{vis.cmds, vis.ncmd, nullptr, nullptr}, rows, pw, y0, y1, r);
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
  bool summary, tracing;
};
static State* st = nullptr;
static const char* trace_file = nullptr;
static bool active() { return st && (st->summary || st->tracing); }
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
void profMark(int32_t phase) { if (prof::active() && phase >= 0 && phase < prof::N) prof::mark(phase); }
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
/** Saves the frame on screen: BMP when the path ends in .bmp, PNG otherwise. */
static bool write_image(const char* path, uint32_t* px, int32_t w, int32_t h) {
  uint32_t n = 0;
  while (path[n]) n++;
  bool bmp = n > 4 && path[n - 4] == '.' && (path[n - 3] | 32) == 'b' && (path[n - 2] | 32) == 'm' && (path[n - 1] | 32) == 'p';
  size_t len = 0;
  uint8_t* data = !px ? nullptr : bmp ? encode_bmp(px, w, h, &len) : encode_png(px, w, h, &len);
  void* f = data ? zrt_host_open(path, "wb") : nullptr;
  bool ok = f && zrt_host_io(f, data, len, 1) == len;
  if (f) zrt_host_close(f);
  if (data) hal_free(data);
  return ok;
}

static bool save(const char* path) {
  uint32_t* px = grab();
  bool ok = write_image(path, px, pw, ph);
  if (px) hal_free(px);
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
  HalFrame f = {pw, ph, 0, 0, ovl_changed ? pw : 0, ovl_changed ? ph : 0, render_rows, render_damage, frame_lists};
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
void begin_frame() { Buf& b = bufs[cur]; b.ncmd = 0; b.ntext = 0; b.npts = 0; tx = ty = 0; kept = false; prof::begin(); }
void keep() { kept = true; }
void end_frame() {
  init_scale();
  vis_init();
  const bool prof_on = prof::active();
  if (prof_on) prof::mark(prof::EFFECTS);   // microtasks drained after the frame callback
  pen_n = 0;
  banner_expire();
  if (kept && !first) {  // retained frame: no rasterization, no swap
    if (vis.mode && vis_update(shown, false)) ovl_changed = true;   // damage flashes fade while idle
    if (ovl_changed) set_full_damage(); else ndmg = 0;
    HalFrame f = {pw, ph, 0, 0, ovl_changed ? pw : 0, ovl_changed ? ph : 0, render_rows, render_damage, frame_lists};
    ovl_changed = false;
    present(&f);
    if (prof_on) prof::end();
    after_present();
    return;
  }
  to_physical(bufs[cur]);
  const Buf& now = bufs[cur];
  const Buf& before = bufs[cur ^ 1];
  if (first || ovl_changed) set_full_damage();
  else ndmg = raster::diff_rects(frame_of(before), frame_of(now), pw, ph, dmg, ZRT_DAMAGE_RECTS);
  if (vis.mode && vis_update(&now, true)) set_full_damage();
  if (prof_on) prof::mark(prof::DIFF);
  raster::Rect d = {pw, ph, 0, 0};
  for (int32_t i = 0; i < ndmg; i++) { d.x0 = dmg[i].x0 < d.x0 ? dmg[i].x0 : d.x0; d.y0 = dmg[i].y0 < d.y0 ? dmg[i].y0 : d.y0; d.x1 = dmg[i].x1 > d.x1 ? dmg[i].x1 : d.x1; d.y1 = dmg[i].y1 > d.y1 ? dmg[i].y1 : d.y1; }
  if (!ndmg) d = raster::Rect{0, 0, 0, 0};
  ovl_changed = false;
  first = false;
  shown = &now;
  stats.draw_cmds = now.ncmd;
  HalFrame f = {pw, ph, d.x0, d.y0, d.x1, d.y1, render_rows, render_damage, frame_lists};
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
  if (b.npts + n + 1 > ZRT_POINT_POOL) { pool_full(2); return false; }  // + 1: an open polygon writes its count first
  c->off = b.npts;
  float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
  uint32_t i = 0, contours = 0;
  while (i < n) {
    // a contour count is program data: negative / NaN / too large must not wrap `i` or claim points not written
    const uint32_t start = closed_list ? i + 1 : 0, avail = (n - start) / 2;
    double want = closed_list ? pts.get((int32_t)i) : (double)avail;
    uint32_t cnt = want >= 1 ? (want < (double)avail ? (uint32_t)want : avail) : 0;
    b.pts[b.npts++] = (float)cnt;
    for (uint32_t k = 0; k < cnt; k++) {
      float x = (float)(pts.get((int32_t)(start + k * 2)) + tx), y = (float)(pts.get((int32_t)(start + k * 2 + 1)) + ty);
      b.pts[b.npts++] = x; b.pts[b.npts++] = y;
      minx = x < minx ? x : minx; maxx = x > maxx ? x : maxx; miny = y < miny ? y : miny; maxy = y > maxy ? y : maxy;
    }
    contours++;
    if (!closed_list || want > (double)avail) break;
    i = start + cnt * 2;
  }
  c->n = contours;
  c->x = minx; c->y = miny; c->w = maxx - minx; c->h = maxy - miny;
  return true;
}
Cmd* emit(uint8_t kind, const float* pts, uint32_t len) {
  Buf& b = bufs[cur];
  if (len > ZRT_POINT_POOL - b.npts) { pool_full(2); return nullptr; }
  Cmd* c = push(kind, 0, 255);
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
  if (b.ntext + n > ZRT_TEXT_POOL) { pool_full(1); return; }
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
  if (!c->n) { if (ZRT_POINT_POOL - b.npts < 64) pool_full(2); b.ncmd--; return; }
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
