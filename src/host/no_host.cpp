// The optional graphics and I/O host is absent; QuickJS's language timers still use the real clock.
#include <chrono>
#include <cstdint>
#include <string>
#include <thread>

#include "host/permissions.h"
#include "zn/host.h"
#include "zn/loop.h"

namespace zn::host {
const void* glPresentHooks() { return nullptr; }
std::string fsReadRefused(const std::string& path) { return perm::check("fs:read", path); }
}  // namespace zn::host

namespace zn::loop {
double nowMs() {
  static const auto start = std::chrono::steady_clock::now();
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
}
double programMs() { return nowMs(); }
void wait(double ms) { if (ms > 0) std::this_thread::sleep_for(std::chrono::duration<double, std::milli>(ms)); }
bool active() { return false; }   // No host I/O can start without hostSys.
void (*idleWake)(void) = nullptr;
}  // namespace zn::loop

namespace zrt::raster {
void dyn_set_alpha(std::int32_t, bool) {}
}  // namespace zrt::raster
