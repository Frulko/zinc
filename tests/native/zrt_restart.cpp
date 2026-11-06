// The runtime after a crash-restart (ZRT_CRASH=2, runtime/zrt.cpp app_main; ZN-994): the first run panics inside its frame, the
// restarted run must still get redraws (zrt_redraw) and job results (zrt::Jobs). Built with runtime/zrt.cpp and the null HAL by
// tests/t0/zrt_restart.sh.
#include "zrt.h"
#include "zrt_jobs.h"
#include <cstdio>
#include <cstdlib>
#include <unistd.h>

namespace zrt { extern Fn<void(double)> frame_cb; bool idle_frame = false; }   // idle_frame: runtime/gfx.cpp, not linked
extern "C" void zrt_redraw(void);

static int run = 0, frames = 0, redraws = 0, settled = 0;
static zrt::Jobs jobs;

struct Redraw : zrt::Poller {
  bool poll() override { if (run == 2 && frames == 0 && !redraws) zrt_redraw(); return false; }   // before the first frame of the new run
};
static Redraw redraw;

static void start_job() {
  jobs.run<int32_t, int32_t>([](std::string&) { return 7; }, [](int32_t& v) { if (run == 2) settled += v; return v; });
}

static void init() {
  run++;
  frames = 0;
  if (run == 1) zrt::add_poller(&redraw);
  start_job();
  zrt::frame_cb = zrt::Fn<void(double)>([](double dt) {
    if (dt == 0) { redraws++; return; }
    frames++;
    if (run == 1 && frames == 2) zrt::panic("crash on purpose");
    if (run == 2 && frames == 3) start_job();
    for (int i = 0; run == 2 && frames == 5 && settled < 14 && i < 400; i++) { usleep(5000); jobs.poll(); }   // the worker's answers, 2 s at most
  });
}
static void deinit() {}

int main(int argc, char** argv) {
  setenv("ZINC_FRAMES", "12", 1);
  HalConfig cfg{};
  cfg.width = 64; cfg.height = 48;
  int code = zrt::app_main(cfg, argc, argv, init, deinit);
  std::printf("runs %d redraws %d settled %d exit %d\n", run, redraws, settled, code);
  bool ok = run == 2 && redraws == 1 && settled == 14;
  std::puts(ok ? "zrt_restart: redraws and jobs work after a crash-restart" : "zrt_restart: FAILED");
  return ok ? 0 : 1;
}
