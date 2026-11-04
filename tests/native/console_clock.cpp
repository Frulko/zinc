#include <cassert>
#include "../../targets/console/host_console.cpp"

namespace zn::rt { const char* gDeviceProfile = nullptr; }
static uint64_t ticks = 1000000;
extern "C" uint64_t hal_time_us() { return ticks; }

int main() {
  assert(nowMs() == 1000);
  zn::loop::holdClock(true);
  ticks += 5000000;
  assert(nowMs() == 1000);
  zn::loop::stepClock(20);
  assert(nowMs() == 1020);
  zn::loop::holdClock(false);
  assert(nowMs() == 1020);
  ticks += 50000;
  assert(nowMs() == 1070);
}
