#include "../../targets/n3ds/frame_profile.h"
#include "zn/alloc_stats.h"
#include <stdlib.h>
#include <stddef.h>
static uint64_t now = 1000, nativeSteps = 0;
extern "C" uint64_t zn_physics2d_step_count() { return nativeSteps; }
extern "C" void hal_log_err(const char*, size_t) {}
extern "C" uint64_t hal_time_us() { return now; }
extern "C" uint32_t zrt_prof_last_frame(uint32_t* p, uint32_t n) {
  if (n < 9) return 0;
  for (int i = 0; i < 9; i++) p[i] = i == 2 ? 500 : 0;
  return 9;
}
int main(int argc, char**) {
  using namespace zn::n3ds::capture;
  setenv("ZINC_FRAME_CAPTURE", "1", 1);
  init();
  for (int i = 0; i < (argc > 1 ? 3605 : 8); i++) {
    const bool stereo = i >= 4;
    begin(true, stereo);
    phases(); add(Wait, 10000); add(GpuSurfaces, 2); add(Vblanks, 1);
    zn::rt::gAllocs += 10; nativeSteps += 2;
    if (stereo) {
      now += 8000; end(false); begin(false, true);
      phases(); add(GpuSurfaces, 1); zn::rt::gAllocs += 10; nativeSteps++;
      now += 8715;
    } else now += 16715;
    end(true);
  }
  finish();
}
