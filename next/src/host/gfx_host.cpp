// The graphics host: serves the Rt::HostGfx* calls (include/zn/runtime.h) over the existing runtime (runtime/gfx.cpp, raster.cpp),
// headless. Compiled with the runtime's flags (C++17, no exceptions, no RTTI, no FP contraction) so the pixels match its builds.
#include "zn/stamp.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hal.h"
#include "zn/host.h"
#include "zn/runtime.h"
#include "zrt.h"
#include "zrt_raster.h"

extern "C" int zn_ui_log_on(void);             // src/host/ui_log.cpp (ZN-368): this file includes zrt.h, which keeps the C++ library out
extern "C" void zn_ui_log_mark(int phase);

namespace zrt {
extern int32_t frame_no;
extern HalInput input, prev_input;
extern bool quit_requested;
namespace gfx { void begin_frame(); void end_frame(); void sync_surface(); extern bool grow_enabled;
  extern uint8_t* (*png_encoder)(const uint32_t*, int32_t, int32_t, size_t*, void* (*)(size_t)); }
}
extern "C" int zn_hal_is_live(void);  // hal_dispatch.cpp: a window (the SDL HAL) or the headless one

namespace zn::res { uint8_t* encodePngAlloc(const uint8_t* px, int w, int h, int comp, size_t* n, void* (*alloc)(size_t)); }   // src/res/codec.cpp (no <vector> here: zrt.h clashes with it)
namespace zrt { extern bool display_driver; }  // runtime/zrt.cpp: a plugins/display-* driver took over the screen

namespace {

using zn::host::HostArg;
using zn::Rt;

zrt::String str(const HostArg& a) { return zrt::String::from(static_cast<const char*>(a.p), a.n); }

bool quitFlag = false;
uint64_t lastFrameUs = 0, frameStartUs = 0;
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

void call(int id, const HostArg* a, HostArg* r) {
  namespace g = zrt::gfx;
  auto u = [&](int k) { return static_cast<uint32_t>(a[k].i); };
  auto n = [&](int k) { return static_cast<int32_t>(a[k].i); };
  static bool started = false;
  if (!started) {   // the surface exists from the first graphics call: `const W = width()` at the top of a module sees the board's size, not the default
    started = true;
    static HalConfig cfg = {320, 240, "zinc", 1};
    int w = 0, h = 0;
    if (const char* sz = getenv("ZINC_SIZE")) if (sscanf(sz, "%dx%d", &w, &h) == 2 && w > 0 && h > 0) { cfg.width = w; cfg.height = h; }  // ZINC_SIZE=1100x700: the window (or surface) size
    zrt::start(cfg, 0, nullptr);
    installFast();
  }
  switch (static_cast<Rt>(id)) {
    case Rt::HostGfxFrames: {
      const char* f = getenv("ZINC_FRAMES");
      r->i = f ? atoi(f) : zn_hal_is_live() ? 0x7fffffff : 60;  // a window runs until it is closed
      break;
    }
    case Rt::HostGfxBegin: g::begin_frame(); break;
    case Rt::HostGfxEnd: {
      g::end_frame();
      zrt::frame_no++;
      zn::rt::gStampFrame = zrt::frame_no;
      hal_frame_end();
      if (hal_fixed_dt() <= 0) {  // a window: keep to about 125 frames per second when presenting does not wait for the display
        uint64_t spent = hal_time_us() - frameStartUs;
        if (spent < 8000) hal_sleep_us(8000 - spent);
      }
      break;
    }
    case Rt::HostGfxClear: g::clear(u(0)); break;
    case Rt::HostGfxRect: g::rect(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxRRect: g::rrect(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), n(6)); break;
    case Rt::HostGfxFont: {   // the exact size: baked, else rasterized from the embedded TrueType file (ZN-428 bakes only the program's sizes), else the closest baked
      const char* name = static_cast<const char*>(a[0].p);
      std::int32_t f = zrt::raster::find_font(name, a[0].n, n(1));
      if (f < 0 || zrt::raster::font_at(f)->px != n(1)) {
        const std::int32_t rf = zrt::raster::render_font(name, a[0].n, n(1));
        if (rf >= 0 && zrt::raster::font_at(rf)->px == n(1)) f = rf;
      }
      r->i = f;
      break;
    }
    case Rt::HostGfxDrawText: g::drawText(n(0), a[1].d, a[2].d, str(a[3]), u(4), n(5), a[6].d); break;
    case Rt::HostGfxLine: g::line(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxText: g::text(a[0].d, a[1].d, str(a[2]), u(3), n(4)); break;
    case Rt::HostGfxGradient: g::gradient(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), u(6), a[7].i != 0, n(8)); break;
    case Rt::HostGfxBorder: g::border(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxShadow: g::shadow(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxPolygon: g::polygon(static_cast<const double*>(a[0].p), a[0].n, u(1), n(2)); break;   // the program's f64 storage, read in place (ZN-405)
    case Rt::HostGfxPath: g::path(static_cast<const double*>(a[0].p), a[0].n, u(1), n(2)); break;
    case Rt::HostGfxStroke: g::stroke(static_cast<const double*>(a[0].p), a[0].n, a[1].d, u(2), n(3), a[4].i != 0); break;
    case Rt::HostGfxFontAscent: r->i = g::fontAscent(n(0)); break;
    case Rt::HostGfxLineHeight: r->i = g::lineHeight(n(0)); break;
    case Rt::HostGfxTextWidth: r->d = g::textWidth(n(0), str(a[1]), a[2].d); break;
    case Rt::HostGfxImage: r->i = g::image(str(a[0])); break;
    case Rt::HostGfxImageWidth: r->i = g::imageWidth(n(0)); break;
    case Rt::HostGfxImageHeight: r->i = g::imageHeight(n(0)); break;
    case Rt::HostGfxDrawImage: g::drawImage(n(0), a[1].d, a[2].d, a[3].d, a[4].d, n(5), a[6].d); break;
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
      if (zrt::display_driver && hal_display->poll) hal_display->poll(&zrt::input);   // the driver's own input and its ZINC_FRAMES / ZINC_SHOT counting
      if (zrt::input.quit) quitFlag = true;
      uint64_t t = hal_time_us();
      double fixed = hal_fixed_dt(), dt = fixed;
      if (fixed <= 0) { dt = lastFrameUs ? static_cast<double>(t - lastFrameUs) / 1e6 : 1.0 / 60.0; if (dt > 0.1) dt = 0.1; }
      lastFrameUs = frameStartUs = t;
      zrt::gfx::sync_surface();
      r->d = dt;
      break;
    }
    case Rt::HostGfxShouldQuit: r->i = (quitFlag || zrt::quit_requested) ? 1 : 0; break;
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
    case Rt::HostGfxCommandsFree: r->i = g::commandsFree(); break;
    case Rt::HostGfxProfMark: if (g::profiling()) g::profMark(n(0)); zn_ui_log_mark(n(0)); break;
    case Rt::HostGfxFinish:
      zrt::finish_run();
      if (zrt::display_driver && hal_display && hal_display->shutdown) { zrt::display_driver = false; hal_display->shutdown(); }   // a display driver closes its device or window (and writes ZINC_SHOT)
      break;  // the profile summary, the trace file and the last-frame capture
    default: break;
  }
}

}  // namespace

namespace zn::host {
bool replayScene(const char* scene, const char* out) { return zrt::gfx::scene_replay(scene, out); }
void setGrowDrawCommands(bool on) { zrt::gfx::grow_enabled = on; }

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

void installGfx() { zrt::gfx::png_encoder = encodePngHook; hostGfx = call; installSys(); }

}  // namespace zn::host
