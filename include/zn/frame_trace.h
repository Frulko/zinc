// Frame trace hook (D182): the stages of each frame across the script and render threads, for the profiler and the inspector's
// Performance view. One function pointer, null when nothing listens (one load and a branch per stage). Set it before the first frame
// or from the script thread; it is called from the script thread and from the render thread ("zinc render"), so it must be
// thread-safe and short (copy into a ring, never block). Times are hal_time_us() microseconds.
#pragma once
#include <stdint.h>

enum ZnFrameTraceKind {
  ZN_FT_BUILD = 1,     // script thread: the frame's build, begin_frame to end_frame (a: slot)
  ZN_FT_HANDOFF = 2,   // script thread: waiting for the render thread before the commit (a: slot committed, b: 1 when threaded)
  ZN_FT_RENDER = 3,    // render thread (or inline): raster or GL replay and present of one frame (a: slot, b: 1 when on the render thread)
  ZN_FT_PRESENT = 4,   // the interval between two presents' starts (t0: previous start, t1: this start, a: interval us)
  ZN_FT_ANIM = 5,      // compositor: one animated value ticked (a: layer id, b: property << 32 | float bits of the value)
  ZN_FT_PUBLISH = 6,   // compositor: values sent back to script at a frame start (a: count)
};

extern "C" {
extern void (*zn_frame_trace)(int32_t kind, uint64_t t0, uint64_t t1, int64_t a, int64_t b);
}
