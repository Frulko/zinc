#pragma once
#include <algorithm>
#include <cstddef>
#include <limits>
#include "quickjs.h"

namespace zn::qjs {

// QuickJS scans are indivisible: the budget predicts when to start, never stops a scan.
class FrameGc {
 public:
  explicit FrameGc(JSRuntime* rt) : rt_(rt), saved_(JS_GetGCThreshold(rt)), baseline_(JS_ZnMallocSize(rt)) { arm(); }
  ~FrameGc() { JS_SetGCThreshold(rt_, saved_); }
  FrameGc(const FrameGc&) = delete;
  FrameGc& operator=(const FrameGc&) = delete;

  bool due(double elapsedMs) const {
    const std::size_t bytes = JS_ZnMallocSize(rt_);
    const std::size_t growth = bytes > baseline_ ? bytes - baseline_ : 0;
    return growth >= soft_ && (growth >= hard_ || elapsedMs + pauseMs_ <= 1000.0 / 60.0);
  }
  void collected(double pauseMs) {
    baseline_ = JS_ZnMallocSize(rt_);
    pauseMs_ = std::max(1.0, pauseMs * 1.25);
    arm();
  }
  void arm() const {
    // An allocating callback still has QuickJS's automatic collector as a memory-pressure fallback.
    JS_SetGCThreshold(rt_, baseline_ > std::numeric_limits<std::size_t>::max() - hard_ ?
                      std::numeric_limits<std::size_t>::max() : baseline_ + hard_);
  }

 private:
  static constexpr std::size_t soft_ = 8 * 1024 * 1024, hard_ = 32 * 1024 * 1024;
  JSRuntime* rt_;
  std::size_t saved_, baseline_;
  double pauseMs_ = 1;
};

}  // namespace zn::qjs
