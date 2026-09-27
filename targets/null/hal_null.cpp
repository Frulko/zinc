// Headless HAL (RT-12): no screen, virtual clock (TST-10). Frame budget from ZINC_FRAMES (default 60).
#include "hal.h"
#include <stdlib.h>

static int32_t frames_left = 60, w = 320, h = 240;

extern "C" {
void hal_init(const HalConfig* cfg) {
  w = cfg->width; h = cfg->height;
  if (const char* f = getenv("ZINC_FRAMES")) frames_left = atoi(f);
}
void hal_shutdown(void) {}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}
void hal_poll_input(HalInput* in) {
  in->buttons = 0; in->px = in->py = 0; in->pdown = 0;
  in->quit = frames_left-- <= 0;
}
void hal_present(const HalDrawList*) {}
void hal_surface_size(int* ow, int* oh) { *ow = w; *oh = h; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
}
