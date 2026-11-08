// Headless HAL (RT-12): no screen, virtual clock (TST-10). Frame budget from ZINC_FRAMES (default 60).
// Captures (ZINC_SHOT) are rasterized by the runtime (runtime/gfx.cpp), so nothing is rendered here.
// ZINC_REALTIME=1 paces the frames to the display rate (hal_fixed_dt, 60 a second) on the real clock, so ZINC_FRAMES=60 lasts a second and a
// program waiting on timers, threads or the network gets its results within its frames; ZINC_DURATION=ms ends the run after that long (ZN-1005).
#include "hal.h"
#include <stdint.h>
#include <stdlib.h>

static int32_t frames_left = 60, w = 320, h = 240;
static uint64_t period_us = 0, next_us = 0, end_us = 0;   // the pacing (0: as fast as the frames come), the next frame's start, the run's end (0: none)

extern "C" {
__attribute__((weak)) int zn_player_poll(void) { return 0; }   // the console player (targets/console/player_console.cpp): 1 to stop the program
void hal_init(const HalConfig* cfg) {
  w = cfg->width; h = cfg->height;
  const char* rt = getenv("ZINC_REALTIME");
  const char* d = getenv("ZINC_DURATION");
  const uint64_t now = hal_time_us();
  period_us = rt && *rt && *rt != '0' ? static_cast<uint64_t>(1e6 / 60.0 + 0.5) : 0;
  next_us = now;
  end_us = d && atof(d) > 0 ? now + static_cast<uint64_t>(atof(d) * 1000) : 0;
  const char* f = getenv("ZINC_FRAMES");
  frames_left = f ? atoi(f) : end_us ? INT32_MAX : 60;   // a duration alone: frames until it is over
}
void hal_shutdown(void) {}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}
void hal_poll_input(HalInput* in) {
  if (period_us) {   // an absolute deadline, so the sleeps do not drift; a frame late by more than a period does not make the next ones hurry
    next_us += period_us;
    uint64_t now = hal_time_us();
    if (now > next_us + period_us) next_us = now;
    while (now < next_us) { hal_sleep_us(next_us - now); now = hal_time_us(); }   // a sleep lasts a second at most
  }
  in->buttons = 0; in->px = in->py = 0; in->pdown = 0;
  in->quit = frames_left-- <= 0 || (end_us && hal_time_us() >= end_us);
  in->quit |= zn_player_poll();
}
void hal_present(const HalFrame*) {}
void hal_surface_size(int* ow, int* oh) { *ow = w; *oh = h; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
}
