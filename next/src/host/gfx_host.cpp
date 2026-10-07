// The graphics host: serves the Rt::HostGfx* calls (include/zn/runtime.h) over the existing runtime (runtime/gfx.cpp, raster.cpp),
// headless. Compiled with the runtime's flags (C++17, no exceptions, no RTTI, no FP contraction) so the pixels match its builds.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hal.h"
#include "zn/host.h"
#include "zn/runtime.h"
#include "zrt.h"
#include "zrt_raster.h"

namespace zrt {
extern int32_t frame_no;
extern HalInput input, prev_input;
extern bool quit_requested;
namespace gfx { void begin_frame(); void end_frame(); void sync_surface(); extern bool grow_enabled; }
}
extern "C" int zn_hal_is_live(void);  // hal_dispatch.cpp: a window (the SDL HAL) or the headless one

namespace {

using zn::host::HostArg;
using zn::Rt;

zrt::String str(const HostArg& a) { return zrt::String::from(static_cast<const char*>(a.p), a.n); }
zrt::Array<double> arr(const HostArg& a) {
  auto r = zrt::Array<double>::with_cap(static_cast<int32_t>(a.n));
  const double* p = static_cast<const double*>(a.p);
  for (uint32_t k = 0; k < a.n; ++k) r.push_raw(p[k]);
  return r;
}

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

void call(int id, const HostArg* a, HostArg* r) {
  namespace g = zrt::gfx;
  auto u = [&](int k) { return static_cast<uint32_t>(a[k].i); };
  auto n = [&](int k) { return static_cast<int32_t>(a[k].i); };
  switch (static_cast<Rt>(id)) {
    case Rt::HostGfxFrames: {
      static HalConfig cfg = {320, 240, "zinc", 1};
      static bool started = false;
      if (!started) {
        started = true;
        int w = 0, h = 0;
        if (const char* sz = getenv("ZINC_SIZE")) if (sscanf(sz, "%dx%d", &w, &h) == 2 && w > 0 && h > 0) { cfg.width = w; cfg.height = h; }  // ZINC_SIZE=1100x700: the window (or surface) size
        zrt::start(cfg, 0, nullptr);
      }
      const char* f = getenv("ZINC_FRAMES");
      r->i = f ? atoi(f) : zn_hal_is_live() ? 0x7fffffff : 60;  // a window runs until it is closed
      break;
    }
    case Rt::HostGfxBegin: g::begin_frame(); break;
    case Rt::HostGfxEnd: {
      g::end_frame();
      zrt::frame_no++;
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
    case Rt::HostGfxFont: r->i = zrt::raster::find_font(static_cast<const char*>(a[0].p), a[0].n, n(1)); break;
    case Rt::HostGfxDrawText: g::drawText(n(0), a[1].d, a[2].d, str(a[3]), u(4), n(5), a[6].d); break;
    case Rt::HostGfxLine: g::line(a[0].d, a[1].d, a[2].d, a[3].d, u(4)); break;
    case Rt::HostGfxText: g::text(a[0].d, a[1].d, str(a[2]), u(3), n(4)); break;
    case Rt::HostGfxGradient: g::gradient(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, u(5), u(6), a[7].i != 0, n(8)); break;
    case Rt::HostGfxBorder: g::border(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxShadow: g::shadow(a[0].d, a[1].d, a[2].d, a[3].d, a[4].d, a[5].d, u(6), n(7)); break;
    case Rt::HostGfxPolygon: g::polygon(arr(a[0]), u(1), n(2)); break;
    case Rt::HostGfxPath: g::path(arr(a[0]), u(1), n(2)); break;
    case Rt::HostGfxStroke: g::stroke(arr(a[0]), a[1].d, u(2), n(3), a[4].i != 0); break;
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
    case Rt::HostGfxProfiling: r->i = g::profiling() ? 1 : 0; break;
    case Rt::HostGfxProfMark: g::profMark(n(0)); break;
    case Rt::HostGfxFinish: zrt::finish_run(); break;  // the profile summary, the trace file and the last-frame capture
    default: break;
  }
}

}  // namespace

namespace zn::host {
void setGrowDrawCommands(bool on) { zrt::gfx::grow_enabled = on; }

void installGfx() { hostGfx = call; installSys(); }

}  // namespace zn::host
