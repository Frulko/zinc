// The graphics host: serves the Rt::HostGfx* calls (include/zn/runtime.h) over the existing runtime (runtime/gfx.cpp, raster.cpp),
// headless. Compiled with the runtime's flags (C++17, no exceptions, no RTTI, no FP contraction) so the pixels match its builds.
#include "zn/stamp.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hal.h"
#include "hal_window.h"
#include "zn/host.h"
#include "zn/runtime.h"
#include "zrt.h"
#include "zrt_raster.h"
#include "zn/alloc_stats.h"
#include "gl/webgl_js.h"

extern "C" int zn_ui_log_on(void);             // src/host/ui_log.cpp (ZN-368): this file includes zrt.h, which keeps the C++ library out
extern "C" void zn_ui_log_mark(int phase);

namespace zrt {
extern int32_t frame_no;
extern HalInput input, prev_input;
extern bool quit_requested;
namespace gfx { void begin_frame(); void end_frame(); void sync_surface(); void pause_badge(bool on); extern bool grow_enabled;
  extern uint8_t* (*png_encoder)(const uint32_t*, int32_t, int32_t, size_t*, void* (*)(size_t)); }
}
extern "C" int zn_hal_is_live(void);  // hal_dispatch.cpp: a window (the SDL HAL) or the headless one
extern "C" int zn_hal_signal_count(void);        // hal_dispatch.cpp: the system's signals (safe area, theme, back...)
extern "C" const char* zn_hal_signal_next(void);
extern "C" void hal_set_resize(int32_t on) __attribute__((weak));   // targets/macos/hal_sdl.cpp (ZN-608)

namespace zn::res {   // src/res/codec.cpp (no <vector> here: zrt.h clashes with it)
uint8_t* encodePngAlloc(const uint8_t* px, int w, int h, int comp, size_t* n, void* (*alloc)(size_t));
uint8_t* decodeRgbaAlloc(const uint8_t* data, size_t size, int* w, int* h);
}
namespace zn::host { const char* assetsRoot(); }   // sys_host.cpp: the directory zinc:assets reads
namespace zrt { extern bool display_driver; }  // runtime/zrt.cpp: a plugins/display-* driver took over the screen
namespace zrt { extern void (*mirror_input)(HalInput* in); extern void (*shell_input)(HalInput* in); }  // runtime/zrt.cpp: zinc device screen --live, zinc:shell
namespace zn::loop { void holdClock(bool on); void stepClock(double ms); }   // src/host/loop.cpp (zn/loop.h brings <vector>, which zrt.h clashes with)

namespace {

using zn::host::HostArg;
using zn::Rt;

zrt::String str(const HostArg& a) { return zrt::String::from(static_cast<const char*>(a.p), a.n); }

bool quitFlag = false;
bool pauseFlag = false;   // zn::host::pauseLoop: the frame loop ends once, the window stays (zinc dev's Fast Refresh, ZN-742)
uint64_t lastFrameUs = 0, frameStartUs = 0;
// The inspector's pause (zn/host.h devPause): asked by the inspector or by F8 / Cmd or Ctrl+\ in a dev run, applied by the next poll.
bool devOn = false, devStepAsked = false, devRepaintAsked = false;
int devFrame = 0;   // what host.gfxPaused answers for this frame: 0 the program's, 1 paused, 2 paused and drawn again
// Paused: the program keeps the input it had and gets nothing new, as a page paused in Chrome drops what arrives meanwhile. Closing the window still quits.
void dropInput() {
  HalInput& in = zrt::input;
  const int32_t quit = in.quit;
  in = zrt::prev_input;
  in.nkeys = in.ntext = in.nbtn = 0;
  in.wheel = in.wheel_x = in.scroll_dx = in.scroll_dy = 0;
  in.pinch = 1;
  in.scroll_phase = 0;
  in.quit = quit;
}
// F8, or Cmd/Ctrl+\ as in Chrome, pauses or resumes a dev run (zinc dev); the program never sees the key.
void devShortcut() {
  static const bool dev = [] { const char* e = getenv("ZINC_DEV"); return e && *e == '1'; }();
  HalInput& in = zrt::input;
  for (int32_t i = 0; dev && i < in.nkeys;) {
    const HalKey& k = in.keys[i];
    if (k.key != HAL_KEY_F1 + 7 && !(k.key == '\\' && (k.mods & (HAL_MOD_CTRL | HAL_MOD_META)))) { i++; continue; }
    if (k.kind == HAL_KEY_DOWN) zn::host::devPause(!devOn);
    memmove(&in.keys[i], &in.keys[i + 1], sizeof(HalKey) * static_cast<size_t>(in.nkeys - i - 1));
    in.nkeys--;
  }
}
char* sbuf = nullptr;  // the string a call returns lives here until the next call
size_t scap = 0;
void answer(zn::host::HostArg* r, const char* p, size_t n) {
  if (n + 1 > scap) { scap = n + 64; sbuf = static_cast<char*>(realloc(sbuf, scap)); }
  memcpy(sbuf, p, n);
  sbuf[n] = 0;
  r->p = sbuf;
  r->n = static_cast<uint32_t>(n);
}

// The direct entries (zn/host.h, ZN-397): the rows a program calls once per element per frame, without the HostArg decoding of `call`.
double D(uint64_t s) { double d; memcpy(&d, &s, 8); return d; }
uint64_t fromD(double d) { uint64_t s; memcpy(&s, &d, 8); return s; }
uint64_t fromI(int64_t v) { return static_cast<uint64_t>(v); }
void installFast() {
  namespace g = zrt::gfx;
  zn::host::HostFast* t = zn::host::hostFast;
  auto at = [&](Rt id) -> zn::host::HostFast& { return t[static_cast<int>(id)]; };
  at(Rt::HostGfxClear) = [](uint64_t* a) { g::clear(static_cast<uint32_t>(a[0])); };
  at(Rt::HostGfxRect) = [](uint64_t* a) { g::rect(D(a[0]), D(a[1]), D(a[2]), D(a[3]), static_cast<uint32_t>(a[4])); };
  at(Rt::HostGfxRRect) = [](uint64_t* a) { g::rrect(D(a[0]), D(a[1]), D(a[2]), D(a[3]), D(a[4]), static_cast<uint32_t>(a[5]), static_cast<int32_t>(a[6])); };
  at(Rt::HostGfxLine) = [](uint64_t* a) { g::line(D(a[0]), D(a[1]), D(a[2]), D(a[3]), static_cast<uint32_t>(a[4])); };
  at(Rt::HostGfxBorder) = [](uint64_t* a) { g::border(D(a[0]), D(a[1]), D(a[2]), D(a[3]), D(a[4]), D(a[5]), static_cast<uint32_t>(a[6]), static_cast<int32_t>(a[7])); };
  at(Rt::HostGfxDrawImage) = [](uint64_t* a) { g::drawImage(static_cast<int32_t>(a[0]), D(a[1]), D(a[2]), D(a[3]), D(a[4]), static_cast<int32_t>(a[5]), D(a[6])); };
  at(Rt::HostGfxDrawImageRect) = [](uint64_t* a) { g::drawImageRect(static_cast<int32_t>(a[0]), D(a[1]), D(a[2]), D(a[3]), D(a[4]), D(a[5]), D(a[6]), D(a[7]), D(a[8]), static_cast<int32_t>(a[9]), static_cast<int32_t>(a[10]),
                                                         D(a[11]), static_cast<uint32_t>(a[12]), static_cast<int32_t>(a[13])); };
  at(Rt::HostGfxClip) = [](uint64_t* a) { g::clip(D(a[0]), D(a[1]), D(a[2]), D(a[3]), D(a[4])); };
  at(Rt::HostGfxUnclip) = [](uint64_t*) { g::unclip(); };
  at(Rt::HostGfxTranslate) = [](uint64_t* a) { g::translate(D(a[0]), D(a[1])); };
  at(Rt::HostGfxWidth) = [](uint64_t* a) { a[0] = fromI(g::width()); };
  at(Rt::HostGfxHeight) = [](uint64_t* a) { a[0] = fromI(g::height()); };
  at(Rt::HostGfxPixelScale) = [](uint64_t* a) { a[0] = fromI(g::pixelScale()); };
  at(Rt::HostGfxImageWidth) = [](uint64_t* a) { a[0] = fromI(g::imageWidth(static_cast<int32_t>(a[0]))); };
  at(Rt::HostGfxImageHeight) = [](uint64_t* a) { a[0] = fromI(g::imageHeight(static_cast<int32_t>(a[0]))); };
  at(Rt::HostGfxIsDown) = [](uint64_t* a) { a[0] = g::isDown(static_cast<int32_t>(a[0])) ? 1 : 0; };
  at(Rt::HostGfxWasPressed) = [](uint64_t* a) { a[0] = g::wasPressed(static_cast<int32_t>(a[0])) ? 1 : 0; };
  at(Rt::HostGfxPointerX) = [](uint64_t* a) { a[0] = fromD(g::pointerX()); };
  at(Rt::HostGfxPointerY) = [](uint64_t* a) { a[0] = fromD(g::pointerY()); };
  at(Rt::HostGfxPointerDown) = [](uint64_t* a) { a[0] = g::pointerDown() ? 1 : 0; };
}

/** The gamepad of slot `i` (ZN-574), or null: no such slot, or nothing plugged in it. */
static const HalGamepad* pad(int32_t i) { return i >= 0 && i < HAL_MAX_GAMEPADS && zrt::input.pad[i].connected ? &zrt::input.pad[i] : nullptr; }

extern "C" int zn_asset_font(const char* name, uint32_t n);   // src/host/sys_host.cpp
extern "C" int zn_asset_image(const char* name, uint32_t n);
// The SDL window on Android draws SHADER commands on a GPU layer under its software-rastered frame when a program asks for a shader before its
// first frame is shown (targets/macos/hal_sdl.cpp, ZN-746); no SDL window: nothing to do
extern "C" __attribute__((weak)) void zn_hal_sdl_gpu_layers(void) {}
// zinc:gfx loadFont (ZN-669): a family or file the program embeds, else the file read whole from its assets
int32_t loadFont(const zrt::String& name, double px) {
  const int32_t f = zrt::gfx::loadFont(name, px);
  if (f >= 0 || zn_asset_font(name.ptr(), name.bytes()) < 0) return f;
  return zrt::gfx::loadFont(name, px);
}
// zinc:gfx imageFromBytes (ZN-432): the bytes of an image file (one slot per byte) become a runtime image, with alpha when a pixel is not opaque; -1: not an image, or no room
int32_t imageFromFile(const uint8_t* file, size_t n) {   // the bytes of a PNG, JPEG or WebP file: a runtime image, -1 when they are not one
  int w = 0, h = 0;
  uint8_t* rgba = zn::res::decodeRgbaAlloc(file, n, &w, &h);
  if (!rgba) return -1;
  const int32_t id = zrt::raster::dyn_create(w, h);
  if (uint32_t* px = zrt::raster::dyn_pixels(id)) {
    bool alpha = false;
    for (size_t i = 0, k = static_cast<size_t>(w) * h; i < k; i++) {
      const uint8_t* p = rgba + i * 4;
      px[i] = static_cast<uint32_t>(p[3]) << 24 | static_cast<uint32_t>(p[0]) << 16 | static_cast<uint32_t>(p[1]) << 8 | p[2];
      alpha |= p[3] != 255;
    }
    zrt::raster::dyn_set_alpha(id, alpha);
    zrt::raster::dyn_update(id, nullptr, 0);
  }
  free(rgba);
  return id;
}
// A JPEG or WebP of the assets directory that was left as its file (zinc pack and the Linux exports bake no photographs: decoded pixels
// weigh ten times the file, museum-table's 87 MB): decoded at its first image() call and kept, as a baked image is.
// ponytail: 64 names, a linear scan; a map when a program shows more photographs than that
int32_t photoFromAssets(const char* name, uint32_t n) {
  static struct { char name[192]; int32_t id; } seen[64];
  static int count = 0;
  const char* dot = nullptr;
  for (uint32_t i = 0; i < n; i++) if (name[i] == '.') { if (i + 1 < n && name[i + 1] == '.') return -1; dot = name + i; }   // no "..": the assets only
  if (!dot || n >= sizeof seen[0].name) return -1;
  const size_t el = n - static_cast<size_t>(dot - name);
  if (!(el == 4 && !strncasecmp(dot, ".jpg", 4)) && !(el == 5 && (!strncasecmp(dot, ".jpeg", 5) || !strncasecmp(dot, ".webp", 5)))) return -1;
  for (int i = 0; i < count; i++) if (!strncmp(seen[i].name, name, n) && !seen[i].name[n]) return seen[i].id;
  char path[1024];
  if (snprintf(path, sizeof path, "%s/%.*s", zn::host::assetsRoot(), static_cast<int>(n), name) >= static_cast<int>(sizeof path)) return -1;
  FILE* f = fopen(path, "rb");
  if (!f) return -1;
  fseek(f, 0, SEEK_END);
  const long size = ftell(f);
  fseek(f, 0, SEEK_SET);
  uint8_t* file = size > 0 ? static_cast<uint8_t*>(malloc(static_cast<size_t>(size))) : nullptr;
  const bool read = file && fread(file, 1, static_cast<size_t>(size), f) == static_cast<size_t>(size);
  fclose(f);
  const int32_t id = read ? imageFromFile(file, static_cast<size_t>(size)) : -1;
  free(file);
  if (id >= 0 && count < 64) { memcpy(seen[count].name, name, n); seen[count].name[n] = 0; seen[count++].id = id; }
  return id;
}
int32_t imageFromBytes(const uint64_t* slots, uint32_t n) {
  uint8_t* file = static_cast<uint8_t*>(malloc(n ? n : 1));
  if (!file) return -1;
  for (uint32_t i = 0; i < n; i++) file[i] = static_cast<uint8_t>(slots[i]);
  const int32_t id = imageFromFile(file, n);
  free(file);
  return id;
}

// zinc:gfx imageFromPixels / updateImage (ZN-746): RGBA bytes (one slot per byte, four a pixel, rows top first) into a runtime image, with
// alpha when a pixel is not opaque; no file format between the program and the pixels. A new version of the image: a GPU display uploads it again.
static bool putRgba(int32_t id, const uint64_t* slots, uint32_t n) {
  const uint32_t* cur; int32_t w = 0, h = 0, stride = 0;
  uint32_t* px = zrt::raster::dyn_pixels(id);
  if (!px || !zrt::raster::dyn_view(id, &cur, &w, &h, &stride) || static_cast<uint64_t>(w) * h * 4 > n) return false;
  bool alpha = false;
  for (int32_t y = 0; y < h; y++)
    for (int32_t x = 0; x < w; x++) {
      const uint64_t* p = slots + (static_cast<size_t>(y) * w + x) * 4;
      const uint32_t a = static_cast<uint32_t>(p[3]) & 255;
      px[static_cast<size_t>(y) * stride + x] = a << 24 | (static_cast<uint32_t>(p[0]) & 255) << 16 | (static_cast<uint32_t>(p[1]) & 255) << 8 | (static_cast<uint32_t>(p[2]) & 255);
      alpha |= a != 255;
    }
  zrt::raster::dyn_set_alpha(id, alpha);
  zrt::raster::dyn_update(id, nullptr, 0);
  return true;
}
int32_t imageFromPixels(const uint64_t* slots, uint32_t n, int32_t w, int32_t h) {
  if (w <= 0 || h <= 0 || w > 16384 || h > 16384 || static_cast<uint64_t>(w) * h * 4 > n) return -1;
  const int32_t id = zrt::raster::dyn_create(w, h);
  if (id >= 0 && !putRgba(id, slots, n)) { zrt::gfx::destroyImage(id); return -1; }
  return id;
}

static void (*frameEnd[4])();   // zn::host::onFrameEnd
static int nFrameEnd = 0;
#ifdef ZN_APP_LIBRARY
static constexpr bool kAppShell = true;    // the shell paces the frames (its tick, the display's vsync), ZN-620
#else
static constexpr bool kAppShell = false;
#endif
// zinc.json app.window for the window HAL, before the window exists: ZINC_WINDOW_CONFIG, written by zinc run and baked by zinc build
// (src/main.cpp appWindowConfig): has_position x y min_w min_h max_w max_h borderless always_on_top transparent not_resizable key aspect|title
extern "C" __attribute__((weak)) void hal_set_window_config(const HalWindowConfig*) {}   // the SDL HAL overrides it; the headless HAL has none (a bare weak reference does not link on Mach-O)
static void windowConfig() {
  const char* t = getenv("ZINC_WINDOW_CONFIG");
  if (!t || !*t) return;
  HalWindowConfig c = {};
  if (sscanf(t, "%d %d %d %d %d %d %d %d %d %d %d %u %f", &c.has_position, &c.x, &c.y, &c.min_w, &c.min_h, &c.max_w, &c.max_h, &c.borderless,
             &c.always_on_top, &c.transparent, &c.not_resizable, &c.transparent_key, &c.aspect) != 13) return;
  if (const char* bar = strchr(t, '|')) snprintf(c.title, sizeof c.title, "%s", bar + 1);
  hal_set_window_config(&c);
}
// The surface exists from the first graphics call: `const W = width()` at the top of a module sees the board's size, not the default
void startSurface() {
  if (zn::host::gfxStarted) return;
  zn::host::gfxStarted = true;
  windowConfig();
  zrt_redraw_hook = [] { if (auto f = zn::host::redraw) f(); };   // the window HAL's redraws (live resize) run the engine's frame
  static HalConfig cfg = {320, 240, "zinc", 1};
  // the name `zinc run` gives its program (zinc.json "name", else the folder): the window's title unless zinc.json sets one, the app's name (ZN-733)
  if (const char* nm = getenv("ZINC_APP_NAME"); nm && *nm) cfg.title = nm;
  if (getenv("ZINC_WINDOW_LOG")) fprintf(stderr, "zinc: window \"%s\"\n", cfg.title);   // tests read the name here: a headless run has no window to ask
  int w = 0, h = 0;
  const char* sz = getenv("ZINC_SIZE");
  if (sz && sscanf(sz, "%dx%d", &w, &h) == 2 && w > 0 && h > 0) { cfg.width = w; cfg.height = h; }  // ZINC_SIZE=1100x700: the window (or surface) size
  else if (hal_display && hal_display->native_size) hal_display->native_size(&cfg.width, &cfg.height);   // no size named: a device's screen (fbdev, KMS) at its own resolution, not 320x240 scaled up (ZN-734)
  zrt::start(cfg, 0, nullptr);
  installFast();
}
void call(int id, const HostArg* a, HostArg* r) {
  namespace g = zrt::gfx;
  auto u = [&](int k) { return static_cast<uint32_t>(a[k].i); };
  auto n = [&](int k) { return static_cast<int32_t>(a[k].i); };
  if (!zn::host::gfxStarted) startSurface();
  switch (static_cast<Rt>(id)) {
    case Rt::HostGfxFrames: {
      const char* f = getenv("ZINC_FRAMES");
      const int32_t all = f ? atoi(f) : zn_hal_is_live() ? 0x7fffffff : 60;  // a window runs until it is closed
      r->i = all > zrt::frame_no ? all - zrt::frame_no : 0;   // the frames left: the loader stage (ZN-447) presents some before the program's loop
      break;
    }
    case Rt::HostGfxBegin: g::begin_frame(); break;
    case Rt::HostGfxEnd: {
      if (devFrame == 1) g::keep();   // paused: the frame on screen stays (with the badge over it)
      for (int k = 0; k < nFrameEnd; ++k) frameEnd[k]();
      g::end_frame();
      zrt::frame_no++;
      zn::rt::gStampFrame = zrt::frame_no;
      hal_frame_end();
      if (!kAppShell && hal_fixed_dt() <= 0) {  // a window: keep to about 125 frames per second when presenting does not wait for the display
        uint64_t spent = hal_time_us() - frameStartUs;
        if (spent < 8000) hal_sleep_us(8000 - spent);
      }
      break;
    }
    case Rt::HostGfxClear: g::clear(u(0)); break;
    case Rt::HostGfxRect: g::rect(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxRRect: g::rrect(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), n(6)); break;
    case Rt::HostGfxFont: r->i = zrt::raster::find_font(static_cast<const char*>(a[0].p), a[0].n, n(1)); break;   // the closest baked size, -1 for a family not baked (the prototype's)
    case Rt::HostGfxDrawText: g::drawText(n(0), a[1].d, a[2].d, str(a[3]), u(4), n(5), a[6].d); break;
    case Rt::HostGfxLine: g::line(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxText: g::text(a[0].d, a[1].d, str(a[2]), u(3), n(4)); break;
    case Rt::HostGfxGradient: g::gradient(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), u(6), a[7].i != 0, n(8)); break;
    case Rt::HostGfxGradientPaint: g::gradientPaint(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, static_cast<const double*>(a[5].p), a[5].n, n(6)); break;
    case Rt::HostGfxBorder: g::border(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxShadow: g::shadow(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxPolygon: g::polygon(static_cast<const double*>(a[0].p), a[0].n, u(1), n(2)); break;   // the program's f64 storage, read in place (ZN-405)
    case Rt::HostGfxPath: g::path(static_cast<const double*>(a[0].p), a[0].n, u(1), n(2)); break;
    case Rt::HostGfxStroke: g::stroke(static_cast<const double*>(a[0].p), a[0].n, a[1].d, u(2), n(3), a[4].i != 0); break;
    case Rt::HostGfxFontAscent: r->i = g::fontAscent(n(0)); break;
    case Rt::HostGfxLineHeight: r->i = g::lineHeight(n(0)); break;
    case Rt::HostGfxTextWidth: r->d = g::textWidth(n(0), str(a[1]), a[2].d); break;
    case Rt::HostGfxImage: {   // baked, else an image entry of the mounted packs (a page of a sprite atlas, ZN-438)
      r->i = g::image(str(a[0]));
      if (r->i < 0) r->i = zn_asset_image(static_cast<const char*>(a[0].p), a[0].n);
      if (r->i < 0) r->i = photoFromAssets(static_cast<const char*>(a[0].p), a[0].n);   // a photograph left as its file (zinc pack)
      break;
    }
    case Rt::HostGfxImageWidth: r->i = g::imageWidth(n(0)); break;
    case Rt::HostGfxImageHeight: r->i = g::imageHeight(n(0)); break;
    case Rt::HostGfxDrawImage: g::drawImage(n(0), a[1].d, a[2].d, a[3].d, a[4].d, n(5), a[6].d); break;
    case Rt::HostGfxDrawImageRect: g::drawImageRect(n(0), a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, a[6].d, a[7].d, a[8].d, n(9), n(10), a[11].d, u(12), n(13)); break;
    case Rt::HostGfxImageFromBytes: r->i = imageFromBytes(static_cast<const uint64_t*>(a[0].p), a[0].n); break;
    case Rt::HostGfxImageFromPixels: r->i = imageFromPixels(static_cast<const uint64_t*>(a[0].p), a[0].n, n(1), n(2)); break;
    case Rt::HostGfxUpdateImage: putRgba(n(0), static_cast<const uint64_t*>(a[1].p), a[1].n); break;
    case Rt::HostGfxShaderProgram: r->i = g::shaderProgram(str(a[0]), n(1)); zn_hal_sdl_gpu_layers(); break;   // a window that can still put a GPU layer under its frame does
    case Rt::HostGfxDrawShader: g::drawShader(n(0), a[1].d, a[2].d, a[3].d, a[4].d, static_cast<const double*>(a[5].p), a[5].n); break;
    case Rt::HostGfxShaderAvailable: r->i = g::shaders_drawn ? 1 : 0; break;
    case Rt::HostGfxProfSection: { zrt::String j = g::profSection(str(a[0])); answer(r, j.ptr(), j.bytes()); break; }
    case Rt::HostGfxSignalCount: r->i = zn_hal_signal_count(); break;
    case Rt::HostGfxSignalNext: { const char* s = zn_hal_signal_next(); answer(r, s, strlen(s)); break; }
    case Rt::HostGfxClip: g::clip(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d); break;
    case Rt::HostGfxUnclip: g::unclip(); break;
    case Rt::HostGfxTranslate: g::translate(a[0].d, a[1].d); break;
    case Rt::HostGfxKeep: g::keep(); break;
    case Rt::HostGfxWidth: r->i = g::width(); break;
    case Rt::HostGfxHeight: r->i = g::height(); break;
    case Rt::HostGfxPixelScale: r->i = g::pixelScale(); break;
    case Rt::HostGfxPoll: {  // the start of a frame as the runtime's loop does it: input, then the time step (fixed headless, measured with a window)
      hal_frame_begin();
      zrt::prev_input = zrt::input;
      zrt::input.wheel = 0; zrt::input.pinch = 1;
      hal_poll_input(&zrt::input);
      for (const HalGamepad& p : zrt::input.pad) zrt::input.buttons |= hal_gamepad_buttons(&p);   // a gamepad is also the zinc:gfx buttons (ZN-574)
      if (zrt::display_driver && hal_display->poll) hal_display->poll(&zrt::input);   // the driver's own input and its ZINC_FRAMES / ZINC_SHOT counting
      if (zrt::mirror_input) zrt::mirror_input(&zrt::input);   // zinc device screen --live (src/host/mirror.cpp)
      if (zrt::shell_input) zrt::shell_input(&zrt::input);     // zinc:shell: what goes to the program it shows (plugins/shell)
      if (zrt::input.quit) quitFlag = true;
      devShortcut();
      uint64_t t = hal_time_us();
      double fixed = hal_fixed_dt(), dt = fixed;
      if (fixed <= 0) { dt = lastFrameUs ? static_cast<double>(t - lastFrameUs) / 1e6 : 1.0 / 60.0; if (dt > 0.1) dt = 0.1; }
      lastFrameUs = frameStartUs = t;   // measured while paused too: the first frame after it is an ordinary step, not the pause
      devFrame = 0;
      if (devOn) {   // a step is one frame of the program (1/60 s of its clock), then paused again
        dropInput();
        if (devStepAsked) { devStepAsked = false; dt = 1.0 / 60.0; zn::loop::stepClock(1000.0 / 60.0); }
        else { devFrame = devRepaintAsked ? 2 : 1; devRepaintAsked = false; dt = 0; }
      }
      zrt::gfx::sync_surface();
      r->d = dt;
      break;
    }
    case Rt::HostGfxPaused: r->i = devFrame; break;
    case Rt::HostGfxShouldQuit: r->i = (quitFlag || zrt::quit_requested || pauseFlag) ? 1 : 0; break;
    case Rt::HostGfxQuit: g::quit(); break;
    case Rt::HostGfxKeyName: { zrt::String k = g::keyName(n(0)); answer(r, k.ptr(), k.bytes()); break; }
    case Rt::HostGfxClipboardText: { zrt::String k = g::clipboardText(); answer(r, k.ptr(), k.bytes()); break; }
    case Rt::HostGfxSetClipboardText: g::setClipboardText(str(a[0])); break;
    case Rt::HostGfxStartTextInput: g::startTextInput(a[0].d, a[1].d, a[2].d, a[3].d); break;
    case Rt::HostGfxCreateImage: r->i = g::createImage(n(0), n(1)); break;
    case Rt::HostGfxDestroyImage: g::destroyImage(n(0)); break;
    case Rt::HostGfxBeginImage: g::beginImage(n(0)); break;
    case Rt::HostGfxEndImage: g::endImage(); break;
    case Rt::HostGfxCapture: r->i = g::capture(str(a[0])) ? 1 : 0; break;
    case Rt::HostGfxEscapeByApp: g::escapeByApp(a[0].i != 0); break;
    case Rt::HostGfxWheel: r->d = g::wheel(); break;
    case Rt::HostGfxWheelX: r->d = g::wheelX(); break;
    case Rt::HostGfxPinch: r->d = g::pinch(); break;
    case Rt::HostGfxScrollDX: r->d = g::scrollDX(); break;
    case Rt::HostGfxScrollDY: r->d = g::scrollDY(); break;
    case Rt::HostGfxScrollPhase: r->i = g::scrollPhase(); break;
    case Rt::HostGfxTouchCount: r->i = g::touchCount(); break;
    case Rt::HostGfxTouchX: r->d = g::touchX(n(0)); break;
    case Rt::HostGfxTouchY: r->d = g::touchY(n(0)); break;
    case Rt::HostGfxTouchId: r->i = g::touchId(n(0)); break;
    case Rt::HostGfxPenCount: r->i = g::penCount(); break;
    case Rt::HostGfxPenX: r->d = g::penX(n(0)); break;
    case Rt::HostGfxPenY: r->d = g::penY(n(0)); break;
    case Rt::HostGfxPenPressure: r->d = g::penPressure(n(0)); break;
    case Rt::HostGfxPenTiltX: r->d = g::penTiltX(n(0)); break;
    case Rt::HostGfxPenTiltY: r->d = g::penTiltY(n(0)); break;
    case Rt::HostGfxPenFlags: r->i = g::penFlags(n(0)); break;
    // gamepads (ZN-574): the slots of the HAL; a slot out of range or empty answers as no gamepad
    case Rt::HostGfxGamepadCount: r->i = HAL_MAX_GAMEPADS; break;
    case Rt::HostGfxGamepadConnected: r->i = pad(n(0)) ? 1 : 0; break;
    case Rt::HostGfxGamepadName: { const HalGamepad* p = pad(n(0)); answer(r, p ? p->name : "", p ? static_cast<uint32_t>(strlen(p->name)) : 0); break; }
    case Rt::HostGfxGamepadButtons: { const HalGamepad* p = pad(n(0)); r->i = p ? static_cast<int32_t>(p->buttons) : 0; break; }
    case Rt::HostGfxGamepadButtonValue: {
      const HalGamepad* p = pad(n(0)); const int32_t b = n(1);
      // a pressure-sensitive button's own value (ZN-759), else the trigger's travel or the held bit
      r->d = !p || b < 0 || b > 16 ? 0 : p->value[b] > 0 ? p->value[b] : (b == 6 || b == 7) ? p->trigger[b - 6] : (p->buttons >> b & 1u);
      break;
    }
    case Rt::HostGfxGamepadAxis: { const HalGamepad* p = pad(n(0)); const int32_t k = n(1); r->d = p && k >= 0 && k < 4 ? p->axes[k] : 0; break; }
    case Rt::HostGfxGamepadRumble: {
      const int32_t i = n(0);
      const bool ok = pad(i) != nullptr;
      if (ok) { HalGamepad& p = zrt::input.pad[i]; p.rumble_low = static_cast<float>(a[1].d); p.rumble_high = static_cast<float>(a[2].d); p.rumble_ms = n(3); }
      r->i = ok ? 1 : 0;
      break;
    }
    case Rt::HostGfxIsDown: r->i = g::isDown(n(0)) ? 1 : 0; break;
    case Rt::HostGfxWasPressed: r->i = g::wasPressed(n(0)) ? 1 : 0; break;
    case Rt::HostGfxPointerX: r->d = g::pointerX(); break;
    case Rt::HostGfxPointerY: r->d = g::pointerY(); break;
    case Rt::HostGfxPointerDown: r->i = g::pointerDown() ? 1 : 0; break;
    case Rt::HostGfxPointerButtons: r->i = g::pointerButtons(); break;
    case Rt::HostGfxModifiers: r->i = g::modifiers(); break;
    case Rt::HostGfxKeyCount: r->i = g::keyCount(); break;
    case Rt::HostGfxKeyKind: r->i = g::keyKind(n(0)); break;
    case Rt::HostGfxKeyMods: r->i = g::keyMods(n(0)); break;
    case Rt::HostGfxButtonEventCount: r->i = g::buttonEventCount(); break;
    case Rt::HostGfxButtonEventX: r->d = g::buttonEventX(n(0)); break;
    case Rt::HostGfxButtonEventY: r->d = g::buttonEventY(n(0)); break;
    case Rt::HostGfxButtonEventButton: r->i = g::buttonEventButton(n(0)); break;
    case Rt::HostGfxButtonEventDown: r->i = g::buttonEventDown(n(0)) ? 1 : 0; break;
    case Rt::HostGfxStopTextInput: g::stopTextInput(); break;
    case Rt::HostGfxSetCursor: g::setCursor(n(0)); break;
    case Rt::HostGfxEscapeDefault: g::escapeDefault(); break;
    case Rt::HostGfxProfiling: r->i = g::profiling() || zn_ui_log_on() ? 1 : 0; break;   // ZINC_LOG=ui=debug: zinc:ui marks its phases (ZN-368)
    case Rt::HostGfxCommands: r->i = g::commandCount(); break;
    case Rt::HostGfxSetResize: if (hal_set_resize) hal_set_resize(static_cast<int32_t>(n(0))); break;
    case Rt::HostGfxSetTransform: g::setTransform(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d); break;
    case Rt::HostGfxResetTransform: g::resetTransform(); break;
    case Rt::HostGfxOpenWindow: r->i = g::openWindow(str(a[0]), n(1), n(2)); break;
    case Rt::HostGfxCloseWindow: g::closeWindow(n(0)); break;
    case Rt::HostGfxWindowOpen: r->i = g::windowOpen(n(0)) ? 1 : 0; break;
    case Rt::HostGfxBeginWindow: g::beginWindow(n(0)); break;
    case Rt::HostGfxEndWindow: g::endWindow(); break;
    case Rt::HostGfxWindowCtl: r->i = g::windowCtl(n(0), n(1), str(a[2]), n(3), n(4)); break;
    case Rt::HostGfxLoadFont: r->i = loadFont(str(a[0]), a[1].d); break;   // the SDL HAL has it; headless runs and other HALs keep their surface
    case Rt::HostGfxCommandsFree: r->i = g::commandsFree(); break;
    case Rt::HostGfxProfMark: if (g::profiling()) g::profMark(n(0)); zn_ui_log_mark(n(0)); break;
    case Rt::HostGfxFinish:
      if (pauseFlag) { pauseFlag = false; break; }   // paused, not finished: the next loop draws in the same window
      zrt::finish_run();
      if (zrt::display_driver && hal_display && hal_display->shutdown) { zrt::display_driver = false; hal_display->shutdown(); }   // a display driver closes its device or window (and writes ZINC_SHOT)
      break;  // the profile summary, the trace file and the last-frame capture
    default: break;
  }
}

}  // namespace

namespace zn::host {
void startGfx() { startSurface(); }
bool replayScene(const char* scene, const char* out) { return zrt::gfx::scene_replay(scene, out); }
const char* traceEvents(bool on, std::size_t* n) {
  static zrt::String s;
  s = zrt::gfx::trace(on);
  *n = s.bytes();
  return s.ptr();
}
void setGrowDrawCommands(bool on) { zrt::gfx::grow_enabled = on; }
void onFrameEnd(void (*fn)()) { if (nFrameEnd < 4) frameEnd[nFrameEnd++] = fn; }
void pauseLoop() { pauseFlag = true; }
void devPause(bool on) {
  devStepAsked = devRepaintAsked = false;
  if (on == devOn) return;
  devOn = on;
  zn::loop::holdClock(on);
  zrt::gfx::pause_badge(on);
}
bool devPaused() { return devOn; }
void devStep() { if (devOn) devStepAsked = true; }
void devRepaint() { if (devOn) devRepaintAsked = true; }
void resetLoop() { quitFlag = pauseFlag = false; zrt::frame_no = 0; zrt::quit_requested = false; }

// screenshots: a deflate-compressed PNG instead of the runtime's stored blocks (ZN-115)
uint8_t* encodePngHook(const uint32_t* px, int32_t w, int32_t h, size_t* n, void* (*alloc)(size_t)) {
  size_t count = static_cast<size_t>(w) * static_cast<size_t>(h);
  uint8_t* rgb = static_cast<uint8_t*>(malloc(count * 3));
  if (!rgb) return nullptr;
  for (size_t i = 0; i < count; i++) { rgb[i * 3] = static_cast<uint8_t>(px[i] >> 16); rgb[i * 3 + 1] = static_cast<uint8_t>(px[i] >> 8); rgb[i * 3 + 2] = static_cast<uint8_t>(px[i]); }
  uint8_t* out = zn::res::encodePngAlloc(rgb, w, h, 3, n, alloc);
  free(rgb);
  return out;
}

static const char* gEngine = "AOT";   // an AOT program's; zinc run names the interpreter or QuickJS (setEngineName)
static const char* hudInfo() {   // the perf panel's engine line (ZN-375): the runtime allocator's blocks and allocations since the previous frame (ZN-192)
  static char line[64];
  static std::uint64_t last = 0;
  const std::uint64_t a = zn::rt::gAllocs;
  if (!strcmp(gEngine, "QuickJS")) snprintf(line, sizeof line, "%s", gEngine);   // its objects are not the runtime allocator's
  else snprintf(line, sizeof line, "%s %llu blk +%llu/f", gEngine, (unsigned long long)(a - zn::rt::gFrees), (unsigned long long)(last ? a - last : 0));
  last = a;
  return line;
}
void setEngineName(const char* name) { gEngine = name; }
const char* engineName() { return gEngine; }
const char* gfxInfo(std::size_t* n) {
  static zrt::String s;
  s = zrt::gfx::info_json();
  *n = s.bytes();
  return s.ptr();
}
// gl.zincPresent and zinc:gl's present (ZN-411, ZN-562): libzn_webgl writes the canvas into the runtime image's own pixels
static const zn::gl::PresentHooks kGlPresent = {
    [](int image, int* w, int* h) { int32_t iw = 0, ih = 0; if (!zrt::raster::image_size(image, &iw, &ih)) return false; *w = iw; *h = ih; return true; },
    [](int image, int w, int h) -> unsigned* {
      int32_t iw = 0, ih = 0;
      if (!zrt::raster::image_size(image, &iw, &ih)) return nullptr;
      if (iw != w || ih != h) zrt::raster::dyn_resize(image, w, h);
      return zrt::raster::dyn_pixels(image);
    },
    [](int image) { zrt::raster::dyn_update(image, nullptr, 0); },
    onFrameEnd};
const void* glPresentHooks() { return &kGlPresent; }
void installMirror();   // mirror.cpp
void installScreencast();   // screencast.cpp
void installGfx() {
  zrt::gfx::thread_trace = [](int32_t op, size_t* n) { return threadTrace(op, [] { return static_cast<std::uint64_t>(hal_time_us()); }, n); };   // the workers' tracks, on the frames' clock
  zrt::gfx::png_encoder = encodePngHook; zrt::gfx::hud_info = hudInfo;hostGfx = call; installSys(); installMirror(); installScreencast(); }

}  // namespace zn::host

// The inspector's pause for the plugins that run their own clock (zinc:audio's mixer stops, then goes on from where it was): weak-linked by them.
extern "C" int zn_dev_paused(void) { return devOn ? 1 : 0; }
// The pause ops of zinc:__netlog (21 pause "1" or resume, 22 step, 23 repaint, 24 the state) for the C++ transport of zinc:devtools (cdp.host.cpp, QuickJS).
extern "C" const char* zn_dev_pause_op(int op, const char* arg) {
  if (op == 21) zn::host::devPause(arg && arg[0] == '1');
  else if (op == 22) zn::host::devStep();
  else if (op == 23) zn::host::devRepaint();
  return devOn ? "1" : "0";
}
