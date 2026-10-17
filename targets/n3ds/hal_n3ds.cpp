// Nintendo 3DS HAL (devkitARM + libctru; the console core of next/targets/console, ZN-457): text through svcOutputDebugString (Azahar logs it as
// Debug.Emulated), the system tick as the clock, the pad, and the shared software rasterizer shown on the top screen (400x240, RGBA8; the 3DS
// framebuffer is rotated: columns of 240 pixels, bottom to top), swapped at vblank. The PICA200 replay comes later
// (docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 4.4).
#include "hal.h"
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <3ds.h>

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0   // a frame budget built in (the emulator tests), 0: until the program ends or the system asks to quit
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (16u << 20)   // the n3ds profile's heap (next/src/frontend/profile.cpp)
#endif

static const int32_t kScreenW = 400, kScreenH = 240;
static int32_t W = kScreenW, H = kScreenH, frames = 0;
static uint32_t* rows = nullptr;   // the software frame, 0x00RRGGBB
static bool gfxOn = false;

// also sdmc:/zinc.log: Azahar logs debug strings only at its Debug level, which its default log filter (*:Info) hides; the runner reads the file
// (<Azahar's user directory>/sdmc/zinc.log)
static FILE* logFile = nullptr;
static void out(const char* s, size_t n) {
  svcOutputDebugString(s, (s32)n);
  if (!logFile) logFile = fopen("sdmc:/zinc.log", "w");
  if (logFile) { fwrite(s, 1, n, logFile); fputc('\n', logFile); fflush(logFile); }
}

extern "C" {
void zn_console_echo(const char* s, size_t n) {   // the program's lines, one debug string each (newlib's stdout has no device here)
  for (size_t b = 0; b < n;) { size_t e = b; while (e < n && s[e] != '\n') e++; if (e > b) out(s + b, e - b); b = e + 1; }
}
void hal_init(const HalConfig* cfg) {
  W = cfg->width < kScreenW ? cfg->width : kScreenW;
  H = cfg->height < kScreenH ? cfg->height : kScreenH;
  if (!cfg->gfx) return;
  gfxInitDefault();
  gfxSetScreenFormat(GFX_TOP, GSP_RGBA8_OES);
  gfxSetDoubleBuffering(GFX_TOP, true);
  rows = (uint32_t*)memalign(64, (size_t)W * H * 4);
  gfxOn = true;
}
void hal_shutdown(void) { if (gfxOn) gfxExit(); }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return svcGetSystemTick() * 1000000ull / SYSCLOCK_ARM11; }
void hal_sleep_us(uint64_t us) { svcSleepThread((s64)(us > 1000000u ? 1000000u : us) * 1000); }
void hal_log(const char* s, size_t n) { zn_console_echo(s, n); }
void hal_log_err(const char* s, size_t n) { zn_console_echo(s, n); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); if (!*base) *size = 0; }
void hal_panic(const char* msg, const char* file, int line) {
  char b[256];
  int k = file && *file ? snprintf(b, sizeof b, "panic: %s (%s:%d)", msg, file, line) : snprintf(b, sizeof b, "panic: %s", msg);
  out(b, (size_t)(k > 0 ? k : 0));
  svcExitProcess();
}
void hal_frame_begin(void) {}
void hal_frame_end(void) { if (gfxOn) { gfxFlushBuffers(); gfxSwapBuffers(); gspWaitForVBlank(); } }
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{KEY_DUP, HAL_UP}, {KEY_DDOWN, HAL_DOWN}, {KEY_DLEFT, HAL_LEFT}, {KEY_DRIGHT, HAL_RIGHT}, {KEY_A, HAL_A},
    {KEY_B, HAL_B}, {KEY_X, HAL_X}, {KEY_Y, HAL_Y}, {KEY_L, HAL_L}, {KEY_R, HAL_R}, {KEY_START, HAL_START}, {KEY_SELECT, HAL_SELECT}};
  hidScanInput();
  const u32 held = hidKeysHeld();
  in->buttons = 0;
  for (auto& m : map) if (held & m[0]) in->buttons |= m[1];
  in->px = in->py = 0; in->pdown = 0;
  const bool budgetOver = ZINC_FRAMES && frames++ >= ZINC_FRAMES;
  if (budgetOver && frames == ZINC_FRAMES + 1 && rows)   // the last frame of a budget as sdmc:/zinc-shot.ppm (the emulator tests)
    if (FILE* f = fopen("sdmc:/zinc-shot.ppm", "wb")) {
      fprintf(f, "P6\n%d %d\n255\n", (int)W, (int)H);
      for (int32_t i = 0; i < W * H; i++) { const uint32_t c = rows[i]; const unsigned char p[3] = {(unsigned char)(c >> 16), (unsigned char)(c >> 8), (unsigned char)c}; fwrite(p, 1, 3, f); }
      fclose(f);
    }
  in->quit = !aptMainLoop() || budgetOver;
}
void hal_present(const HalFrame* f) {
  if (!rows || f->y1 <= f->y0) return;
  f->render(rows + (size_t)f->y0 * W, f->y0, f->y1);
  u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, GFX_LEFT, nullptr, nullptr);
  for (int32_t x = 0; x < W; x++)   // the panel is portrait: a column of the image is a row of the framebuffer, from the bottom
    for (int32_t y = f->y0; y < f->y1; y++) { const uint32_t c = rows[(size_t)y * W + x]; fb[x * kScreenH + (kScreenH - 1 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
