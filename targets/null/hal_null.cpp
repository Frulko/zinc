// Headless HAL (RT-12): no screen, virtual clock (TST-10). Frame budget from ZINC_FRAMES (default 60).
#include "hal.h"
#include <stdlib.h>
#include <stdio.h>

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
// Headless: renders only when ZINC_SHOT asks for the last frame (golden images, UI-16).
static uint32_t* fb;
static void save_bmp(const char* path) {
  FILE* f = fopen(path, "wb");
  if (!f) return;
  int32_t row = (w * 3 + 3) & ~3, size = 54 + row * h;
  uint8_t hd[54] = {'B', 'M'};
  auto put = [&](int o, uint32_t v) { hd[o] = v & 255; hd[o + 1] = (v >> 8) & 255; hd[o + 2] = (v >> 16) & 255; hd[o + 3] = v >> 24; };
  put(2, size); put(10, 54); put(14, 40); put(18, w); put(22, h); hd[26] = 1; hd[28] = 24;
  fwrite(hd, 1, 54, f);
  uint8_t* line = (uint8_t*)calloc(row, 1);
  for (int32_t y = h - 1; y >= 0; y--) {
    for (int32_t x = 0; x < w; x++) { uint32_t p = fb[y * w + x]; line[x * 3] = p & 255; line[x * 3 + 1] = (p >> 8) & 255; line[x * 3 + 2] = (p >> 16) & 255; }
    fwrite(line, 1, row, f);
  }
  free(line);
  fclose(f);
}
void hal_present(const HalFrame* f) {
  const char* shot = getenv("ZINC_SHOT");
  if (!shot) return;
  if (!fb) fb = (uint32_t*)calloc((size_t)w * h, 4);
  if (f->y1 > f->y0) f->render(fb + (size_t)f->y0 * w, f->y0, f->y1);
  if (frames_left <= 0) save_bmp(shot);
}
void hal_surface_size(int* ow, int* oh) { *ow = w; *oh = h; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
}
