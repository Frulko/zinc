// The UI's frame phases in the engine's log (ZN-368): ZINC_LOG=ui=debug turns zinc:ui's profiling marks on (lib/std/ui.ts: 0 app, 1 input, 2 anim, 3 layout,
// 4 paint) and each layout pass is written with its duration; paint at trace. Kept apart from gfx_host.cpp, which includes zrt.h.
#include <chrono>

#include "zn/log.h"

extern "C" int zn_ui_log_on(void) { return zn::log::on("ui", zn::log::Debug) ? 1 : 0; }

extern "C" void zn_ui_log_mark(int phase) {
  if (!zn::log::on("ui", zn::log::Debug)) return;
  static auto last = std::chrono::steady_clock::now();
  const auto now = std::chrono::steady_clock::now();
  const double ms = std::chrono::duration<double, std::milli>(now - last).count();
  last = now;
  // ponytail: a frame whose layout did not run (nothing dirty) spends a few microseconds between the anim and layout marks, so passes are told apart by
  // duration; a host row saying "laid out" would be exact if a very cheap pass ever goes unseen
  if (phase == 3 && ms > 0.005) zn::log::write("ui", zn::log::Debug, "layout pass", ms);
  else if (phase == 4) zn::log::write("ui", zn::log::Trace, "paint", ms);
}
