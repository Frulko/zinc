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
extern HostCall hostLayout;  // the Rt::HostLayout* rows (isLayoutRow): a host layout engine, installed by installLayout (src/host/layout_host.cpp)
// Direct entries for the hot scalar rows (ZN-397): rect, line, width()... called once per element per frame skip the letter decoding. a[k] is the raw slot of
// argument k (f64 bits, sign-extended integers), the result goes to a[0]. The graphics host fills them once its runtime started (its first HostCall); a null
// entry takes the HostCall path. Indexed by the zn::Rt value.
using HostFast = void (*)(std::uint64_t* a);
inline constexpr int kHostFastRows = 1024;
extern HostFast hostFast[kHostFastRows];
inline HostCall hostSys = nullptr;  // zinc:sys, zinc:fs, zinc:storage, zinc:assets, zinc:os (the entries of the table from HostSysFirst)
// Provided by src/host (built with ZN_HOST_GFX): installs `hostGfx`; the runtime itself starts on the first HostGfxFrames call.
void installGfx();    // the graphics host and the system modules (installSys) together
void installSys();
void installLayout();  // the rn layout engine (Yoga, ZN-284.01): zinc installs it; an AOT program does when it calls the layout rows    // zinc:sys, zinc:fs, zinc:storage, zinc:assets, zinc:os (src/host/sys_host.cpp)
// Installs the baked fonts and images (the blob of src/res) in the tables of the runtime's rasterizer; the data is copied. Before the program runs.
bool installResources(const std::uint8_t* blob, std::size_t size);
void onFrameEnd(void (*fn)());   // runs `fn` on the main thread at the end of every frame, before it is painted (the WebGL module finishes its canvas reads there, ZN-411)
bool replayScene(const char* scene, const char* out);   // ZN-170: rasterize a ZINC_SCENE_DUMP file into a png with the installed fonts and images
struct RenderBench { int width, height, cmds; double medianUs, p99Us; std::uint64_t hash; };   // hash: FNV-1a 64 of the pixels like ZINC_FRAMEHASH
bool benchScene(const char* scene, int runs, int threads, RenderBench& out);   // ZN-171: replay a scene dump `runs` times on `threads` band threads (src/host/render_bench.cpp)
int strokeCheck(int count);   // ZN-406: random polylines through stroke_contours against the per-vertex cosf/sinf reference; mismatches (0 = identical)
bool damageCheck(const char* before, const char* now, int& rects, bool& same);   // ZN-179: diff_rects of two scene dumps with the full previous frame and with its compact signatures: the same rectangles

}  // namespace zn::host
