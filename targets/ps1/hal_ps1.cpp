// PlayStation 1 HAL (PSn00bSDK, PS-EXE): BIOS TTY log, VSync/hblank clock, pads through the BIOS driver, and the
// shared software rasterizer uploaded to VRAM (15 bpp, damaged bands only, double-buffered display).
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <psxapi.h>
#include <psxgpu.h>
#include <psxpad.h>

extern int zinc_program_main(int argc, char** argv);

// PCSX-Redux debug registers (expansion region 2): a 32-bit read returns "PCSX"; an 8-bit write runs Lua exec slot N
// (targets/ps1/shot.lua: screenshot); a 16-bit write quits the emulator with that exit code in -testmode.
// Nothing answers there on a console.
#define REDUX_ID (*(volatile uint32_t*)0xbf802080)
#define REDUX_SLOT (*(volatile uint8_t*)0xbf802081)
#define REDUX_EXIT (*(volatile uint16_t*)0xbf802082)

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0  // frame budget (zinc run / zinc test build it in); 0 = run until the console is switched off
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (256u << 10)
#endif

static int32_t W = 320, H = 240, frames = 0;
static DISPENV disp[2];
static int back = 0;               // buffer being uploaded; the other one is on screen
static bool swap = false;          // back buffer complete, show it at the next VSync
static int32_t pd0 = 0, pd1 = 0;   // rows uploaded to the other buffer last frame (it misses them)
static uint8_t pad_buf[2][34];
static uint64_t vbl_us = 16683;    // NTSC; PAL set in hal_init

extern "C" {
void hal_init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  ResetGraph(0);
  if (GetVideoMode() == MODE_PAL) vbl_us = 20000;
  // ponytail: one 320x240 (or profile size) framebuffer pair stacked in VRAM; PAL shows it letterboxed
  SetDefDispEnv(&disp[0], 0, 0, W, H);
  SetDefDispEnv(&disp[1], 0, H, W, H);
  PutDispEnv(&disp[1]);
  InitPAD(pad_buf[0], 34, pad_buf[1], 34);
  StartPAD();
  ChangeClearPAD(0);
  printf("zinc:start\n");
}
void hal_shutdown(void) { StopPAD(); }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) {
  // vblank count + hblanks since it (~64 us); VSync(-1)/VSync(1) are PSn00bSDK's counters
  int v = VSync(-1), h = VSync(1);
  if (VSync(-1) != v) { v++; h = 0; }  // a vblank came in between
  return (uint64_t)v * vbl_us + (uint64_t)h * 64u;
}
void hal_sleep_us(uint64_t us) {
  uint64_t end = hal_time_us() + us;
  while (hal_time_us() + vbl_us <= end) VSync(0);
  while (hal_time_us() < end) {}
}
static void tty(const char* s, size_t n) { for (size_t i = 0; i < n; i++) putchar(s[i]); }
void hal_log(const char* s, size_t n) { tty(s, n); }
void hal_log_err(const char* s, size_t n) { tty(s, n); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char*) { return nullptr; }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); }
[[noreturn]] static void stop(int code) {
  printf("zinc:exit\n");
  if (REDUX_ID == 0x58534350) { REDUX_SLOT = 1; REDUX_EXIT = (uint16_t)code; }
  for (;;) VSync(0);
}
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  stop(101);
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {
  VSync(0);
  if (swap) { PutDispEnv(&disp[back]); SetDispMask(1); back ^= 1; swap = false; }
}
void hal_poll_input(HalInput* in) {
  static const uint16_t map[][2] = {{PAD_UP, HAL_UP}, {PAD_DOWN, HAL_DOWN}, {PAD_LEFT, HAL_LEFT}, {PAD_RIGHT, HAL_RIGHT},
    {PAD_CROSS, HAL_A}, {PAD_CIRCLE, HAL_B}, {PAD_SQUARE, HAL_X}, {PAD_TRIANGLE, HAL_Y}, {PAD_L1, HAL_L}, {PAD_R1, HAL_R},
    {PAD_START, HAL_START}, {PAD_SELECT, HAL_SELECT}};
  const PADTYPE* p = (const PADTYPE*)pad_buf[0];
  in->buttons = 0;
  if (p->stat == 0 && (p->type == PAD_ID_DIGITAL || p->type == PAD_ID_ANALOG || p->type == PAD_ID_ANALOG_STICK))
    for (auto& m : map) if (!(p->btn & m[0])) in->buttons |= m[1];  // active low
  in->px = in->py = 0; in->pdown = 0;
  in->quit = ZINC_FRAMES && frames++ >= ZINC_FRAMES;
}
// Rows are rendered 16 at a time into RAM, converted to 15 bpp and DMA'd with LoadImage.
static uint32_t rows[320 * 16];
static uint16_t px16[2][320 * 16];  // ping-pong: convert one band while the previous one uploads
void hal_present(const HalFrame* f) {
  // the back buffer also missed what changed last frame (it went to the other buffer): upload the union
  int32_t y0 = f->y0, y1 = f->y1;
  if (pd1 > pd0) { if (y1 <= y0) { y0 = pd0; y1 = pd1; } else { if (pd0 < y0) y0 = pd0; if (pd1 > y1) y1 = pd1; } }
  pd0 = f->y0; pd1 = f->y1;
  if (y1 <= y0) return;
  const int32_t band = (int32_t)(sizeof rows / sizeof rows[0]) / W;
  int k = 0;
  for (int32_t b = y0; b < y1; b += band, k ^= 1) {
    int32_t e = b + band < y1 ? b + band : y1, n = (e - b) * W;
    f->render(rows, b, e);
    DrawSync(0);  // the buffer about to be reused has left
    uint16_t* o = px16[k];
    for (int32_t i = 0; i < n; i++) { uint32_t c = rows[i]; o[i] = (uint16_t)((c >> 19 & 31) | (c >> 6 & 0x3e0) | (c << 7 & 0x7c00)); }
    RECT r = {0, (int16_t)(back * H + b), (int16_t)W, (int16_t)(e - b)};
    LoadImage(&r, (const uint32_t*)o);
  }
  DrawSync(0);
  swap = true;
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }  // virtual clock: one step per frame (deterministic, sim parity)
void hal_run(int (*step)(void)) { while (step()) {} }
}

int main(int argc, char** argv) { stop(zinc_program_main(argc, argv)); }
