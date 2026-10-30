#pragma once
// The host's graphics surface (zinc:gfx) as the runtime calls it. The Rt::HostGfx* entries of runtime.h list the functions with
// their parameter letters; the engine decodes the arguments into HostArg values and calls `hostGfx` with the entry's id (an
// `zn::Rt` value). `src/host` provides the function by linking the existing runtime (runtime/gfx.cpp, raster, zrt). When none is
// installed the calls trap with a clear message.
#include <cstddef>
#include <cstdint>

namespace zn::host {

// One argument or result; only the field of the parameter's letter is set: d (f64), i (i32, u32, boolean), p and n (string: bytes
// and length; f64 array: elements and count).
struct HostArg {
  double d = 0;
  std::int64_t i = 0;
  const void* p = nullptr;
  std::uint32_t n = 0;
};
using HostCall = void (*)(int id, const HostArg* args, HostArg* result);

// Installed by the host library at startup; null in an engine built without one.
extern HostCall hostGfx;
extern HostCall hostGl;      // the Rt::HostGl* rows (isGlRow, zinc:gl, ZN-562): libzn_webgl's zn_webgl_host, loaded by zinc on the first call, linked into an AOT program
extern HostCall hostLayout;  // the Rt::HostLayout* rows (isLayoutRow): a host layout engine, installed by installLayout (src/host/layout_host.cpp)
// Direct entries for the hot scalar rows (ZN-397): rect, line, width()... called once per element per frame skip the letter decoding. a[k] is the raw slot of
// argument k (f64 bits, sign-extended integers), the result goes to a[0]. The graphics host fills them once its runtime started (its first HostCall); a null
// entry takes the HostCall path. Indexed by the zn::Rt value.
using HostFast = void (*)(std::uint64_t* a);
inline constexpr int kHostFastRows = 1024;
extern HostFast hostFast[kHostFastRows];
}  // namespace zn::host
namespace zrt { extern std::int32_t surf_w, surf_h; }   // the surface in logical pixels (runtime/zrt.cpp): AOT code reads width() / height() there, inline (ZN-399)
namespace zn::host {
// The loop of the calling thread as the workers of zinc:worker use it (src/rt/worker.cpp): a wake-up any thread may send, an event of kind
// `kind` for `handle`, and the count of handles that keep the loop running. Filled by installSys (src/host/loop.cpp); null without a host.
struct LoopBridge {
  void* (*wakeNew)() = nullptr;
  void (*wakeSend)(void* handle) = nullptr;
  void (*push)(int handle, int kind) = nullptr;
  void (*active)(int delta) = nullptr;
};
extern LoopBridge loopBridge;   // defined in src/rt/worker.cpp
extern HostCall hostSys;  // zinc:sys, zinc:fs, zinc:storage, zinc:assets, zinc:os (the entries of the table from HostSysFirst)
// Provided by src/host (built with ZN_HOST_GFX): installs `hostGfx`; the runtime itself starts on the first HostGfxFrames call.
void installGfx();    // the graphics host and the system modules (installSys) together
void installSys();
void installLayout();  // the rn layout engine (Yoga, ZN-284.01): zinc installs it; an AOT program does when it calls the layout rows
void installGl();      // zinc:gl in an AOT program (ZN-562): its rows go to zn_webgl_host, linked from zn_gl (src/gl/webgl_host.cpp)
const void* glPresentHooks();   // the zn::gl::PresentHooks (src/gl/webgl_js.h) that write a WebGL canvas into a zinc:gfx image (src/host/gfx_host.cpp)
// Draws one frame of the program now, from inside Rt::HostGfxPoll (the window HAL's zrt_redraw while macOS holds the loop in a live resize): the
// engine running the poll sets it for the call's duration (src/rt/rtcalls.cpp, src/qjs/qjs.cpp); null outside a poll, where the program is mid-frame.
extern void (*redraw)();   // defined once in src/rt/rtcalls.cpp, never inline: the engine modules (ZN-773) must see zinc's own
inline bool gfxStarted = false;  // the surface exists (the first graphics call starts it): AOT code calls startGfx before it reads surf_w / surf_h inline
void startGfx();
// The engine splash (ZN-446, src/host/splash.cpp): opens the window and presents the splash entry of ZINC_SPLASH (a file) or of the base packs'
// boot.zpk, before the program is compiled, baked or started. Nothing in a headless run, with a display plugin, or without a splash; true when shown.
bool showSplash();
// Installs the baked fonts and images (the blob of src/res) in the tables of the runtime's rasterizer; the data is copied. Before the program runs.
bool installResources(const std::uint8_t* blob, std::size_t size);
// The same blob from the file `name` (zinc build --no-embed, a .app): beside the executable, in its bundle's Resources or one level up. False, said on
// stderr, when it is missing or damaged.
bool installResourcesFile(const char* name);
void onFrameEnd(void (*fn)());   // runs `fn` on the main thread at the end of every frame, before it is painted (the WebGL module finishes its canvas reads there, ZN-411)
// Ends the frame loop after this frame without finishing the run: the window, the surface and the resources stay for the next loop (zinc dev's
// Fast Refresh, ZN-742: the program returns to an empty stack, its code is swapped, then its event loop starts again).
void pauseLoop();
// The frame loop of a new program in the same surface (the console player, ZN-792): the quit and pause flags cleared, the frame count back to 0.
void resetLoop();
bool replayScene(const char* scene, const char* out);   // ZN-170: rasterize a ZINC_SCENE_DUMP file into a png with the installed fonts and images
const char* traceEvents(bool on, std::size_t* n);   // DevTools Tracing.start (true) / Tracing.end (false: the frame spans as trace events JSON, valid until the next call)
struct RenderBench { int width, height, cmds; double medianUs, p99Us; std::uint64_t hash; };   // hash: FNV-1a 64 of the pixels like ZINC_FRAMEHASH
bool benchScene(const char* scene, int runs, int threads, RenderBench& out);   // ZN-171: replay a scene dump `runs` times on `threads` band threads (src/host/render_bench.cpp)
int strokeCheck(int count);   // ZN-406: random polylines through stroke_contours against the per-vertex cosf/sinf reference; mismatches (0 = identical)
bool damageCheck(const char* before, const char* now, int& rects, bool& same, int box[4]);   // ZN-179: diff_rects of two scene dumps with the full previous frame and with its compact signatures: the same rectangles; box: their union (x0 y0 x1 y1)
// ZN-744: the previous frame of `before` rasterized, its pixels moved as diff_move finds, the damage left drawn; against a full raster of `now`
struct ScrollCheck { bool moved, same; int dx, dy, area[4], rects; long long drawn, full; };
bool scrollCheck(const char* before, const char* now, ScrollCheck& out);

}  // namespace zn::host
