#include <cassert>
#include <stdexcept>
#include "qjs/gc.h"
#include "zn/frame_profile.h"

struct JSRuntime { size_t bytes = 0, threshold = 256 * 1024; };
extern "C" size_t JS_GetGCThreshold(JSRuntime* rt) { return rt->threshold; }
extern "C" size_t JS_ZnMallocSize(JSRuntime* rt) { return rt->bytes; }
extern "C" void JS_SetGCThreshold(JSRuntime* rt, size_t bytes) { rt->threshold = bytes; }

int main() {
  static_assert(zn::frame_profile::APP == 0 && zn::frame_profile::PRESENT == 8 && zn::frame_profile::GC == 9);
  constexpr size_t mb = 1024 * 1024;
  JSRuntime rt;
  const auto saved = rt.threshold;
  try {
    zn::qjs::FrameGc gc(&rt);
    assert(rt.threshold == 32 * mb && !gc.due(0));
    rt.bytes = 8 * mb;
    assert(gc.due(0) && !gc.due(17));
    rt.bytes = 32 * mb;
    assert(gc.due(100));
    rt.bytes = 2 * mb;
    gc.collected(12);
    assert(rt.threshold == 34 * mb && !gc.due(0));
    rt.bytes = 10 * mb;
    assert(gc.due(0) && !gc.due(2));
    rt.bytes = mb; // acyclic objects freed since the scan: no unsigned underflow
    assert(!gc.due(0));
    throw std::runtime_error("frame failed");
  } catch (const std::runtime_error&) {}
  assert(rt.threshold == saved);
  { zn::qjs::FrameGc restarted(&rt); assert(!restarted.due(0)); }
  assert(rt.threshold == saved);
  rt.bytes = std::numeric_limits<size_t>::max() - mb;
  { zn::qjs::FrameGc gc(&rt); assert(rt.threshold == std::numeric_limits<size_t>::max()); }
  assert(rt.threshold == saved);
}
