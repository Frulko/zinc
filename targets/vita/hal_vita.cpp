// PS Vita HAL (VitaSDK + newlib; the console core of next/targets/console, ZN-455/ZN-457): text through sceClibPrintf (Vita3K logs it), the process
// clock, the pad, and the shared software rasterizer shown in one 32-bit framebuffer in CDRAM (960x544), flipped at vblank. The first, simple path:
// band threads on the three user cores and the GXM replay come later (docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 3.4).
#include "hal.h"
#include "console_pad.h"
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <psp2/ctrl.h>
#include <psp2/display.h>
#include <psp2/kernel/clib.h>
#include <psp2/kernel/processmgr.h>
#include <psp2/kernel/sysmem.h>
#include <psp2/kernel/threadmgr.h>
#include <psp2/power.h>

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0   // a frame budget built in (the emulator tests), 0: until the program ends
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (192u << 20)   // the vita profile's heap (next/src/frontend/profile.cpp)
#endif

extern "C" { int _newlib_heap_size_user = 224 * 1024 * 1024; }   // newlib's heap (VitaSDK's default is 128 MiB): the profile's 192 MiB and the engine

static const int32_t kScreenW = 960, kScreenH = 544;
static int32_t W = kScreenW, H = kScreenH, frames = 0;
static uint32_t* rows = nullptr;   // the software frame, 0x00RRGGBB
static uint32_t* fb = nullptr;     // the displayed framebuffer (CDRAM), 0xAABBGGRR

static void out(const char* s, size_t n) { sceClibPrintf("%.*s", (int)n, s); }
// The last frame of a frame budget as ux0:data/zinc-shot.ppm (Vita3K: <pref-path>/ux0/data/): Vita3K has no screenshot option to call, so the
// shot is read back from the display: the buffer, pitch and format sceDisplay scans out (what the emulator shows), not the HAL's own frame
static void shot() {
  SceDisplayFrameBuf d;
  memset(&d, 0, sizeof d);
  d.size = sizeof d;
  if (sceDisplayGetFrameBuf(&d, SCE_DISPLAY_SETBUF_NEXTFRAME) < 0 || !d.base || d.pixelformat != SCE_DISPLAY_PIXELFORMAT_A8B8G8R8) return;
  FILE* f = fopen("ux0:data/zinc-shot.ppm", "wb");
  if (!f) return;
  fprintf(f, "P6\n%d %d\n255\n", (int)d.width, (int)d.height);
  for (uint32_t y = 0; y < d.height; y++)
    for (uint32_t x = 0; x < d.width; x++) {
      const uint32_t c = ((const uint32_t*)d.base)[y * d.pitch + x];
      const unsigned char p[3] = {(unsigned char)c, (unsigned char)(c >> 8), (unsigned char)(c >> 16)};
      fwrite(p, 1, 3, f);
    }
  fclose(f);
}

extern "C" {
void zn_console_echo(const char* s, size_t n) { out(s, n); }   // the program's lines: newlib's stdout goes to tty0:, which Vita3K does not show
void hal_init(const HalConfig* cfg) {
  W = cfg->width < kScreenW ? cfg->width : kScreenW;
  H = cfg->height < kScreenH ? cfg->height : kScreenH;
  sceCtrlSetSamplingMode(SCE_CTRL_MODE_ANALOG);
  // the clocks a game asks for (the default ARM clock is 333 MHz): the software raster runs on the ARM (Pocket3D's Vita profile)
  scePowerSetArmClockFrequency(444); scePowerSetBusClockFrequency(222); scePowerSetGpuClockFrequency(222); scePowerSetGpuXbarClockFrequency(166);
  if (!cfg->gfx) return;
  rows = (uint32_t*)memalign(64, (size_t)W * H * 4);
  const SceSize size = (kScreenW * kScreenH * 4 + 0x3FFFF) & ~0x3FFFFu;   // CDRAM blocks are 256 KiB aligned
  const SceUID block = sceKernelAllocMemBlock("zinc framebuffer", SCE_KERNEL_MEMBLOCK_TYPE_USER_CDRAM_RW, size, nullptr);
  if (block < 0 || sceKernelGetMemBlockBase(block, (void**)&fb) < 0) { fb = nullptr; return; }
  memset(fb, 0, size);
  SceDisplayFrameBuf d;
  memset(&d, 0, sizeof d);
  d.size = sizeof d; d.base = fb; d.pitch = kScreenW; d.pixelformat = SCE_DISPLAY_PIXELFORMAT_A8B8G8R8; d.width = kScreenW; d.height = kScreenH;
  sceDisplaySetFrameBuf(&d, SCE_DISPLAY_SETBUF_NEXTFRAME);
}
void hal_shutdown(void) {}
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)sceKernelGetProcessTimeWide(); }
void hal_sleep_us(uint64_t us) { sceKernelDelayThread(us > 1000000u ? 1000000u : (SceUInt)us); }
void hal_log(const char* s, size_t n) { fflush(stdout); out(s, n); }
void hal_log_err(const char* s, size_t n) { fflush(stdout); out(s, n); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); if (!*base) *size = 0; }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) sceClibPrintf("panic: %s (%s:%d)\n", msg, file, line); else sceClibPrintf("panic: %s\n", msg);
  sceKernelExitProcess(101);
  for (;;) {}
}
void hal_frame_begin(void) {}
void hal_frame_end(void) { sceDisplayWaitVblankStart(); }
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{SCE_CTRL_UP, HAL_UP}, {SCE_CTRL_DOWN, HAL_DOWN}, {SCE_CTRL_LEFT, HAL_LEFT}, {SCE_CTRL_RIGHT, HAL_RIGHT},
    {SCE_CTRL_CROSS, HAL_A}, {SCE_CTRL_CIRCLE, HAL_B}, {SCE_CTRL_SQUARE, HAL_X}, {SCE_CTRL_TRIANGLE, HAL_Y}, {SCE_CTRL_LTRIGGER, HAL_L},
    {SCE_CTRL_RTRIGGER, HAL_R}, {SCE_CTRL_START, HAL_START}, {SCE_CTRL_SELECT, HAL_SELECT}};
  SceCtrlData pad;
  memset(&pad, 0, sizeof pad);
  in->buttons = 0;
  if (sceCtrlPeekBufferPositive(0, &pad, 1) > 0) {
    for (auto& m : map) if (pad.buttons & m[0]) in->buttons |= m[1];
    in->buttons |= zn_console_stick(pad.lx, pad.ly);
  }
  in->buttons |= zn_console_script(frames);
  in->px = in->py = 0; in->pdown = 0;
  const int32_t frame = frames++;
  in->quit = ZINC_FRAMES && frame >= ZINC_FRAMES;
  if (in->quit && frame == ZINC_FRAMES) shot();
}
void hal_present(const HalFrame* f) {
  if (!rows || !fb || f->y1 <= f->y0) return;
  f->render(rows + (size_t)f->y0 * W, f->y0, f->y1);
  // a smaller surface (zinc.json targets.vita, 480x272: the PSP's) is shown scaled by a whole factor, in the middle of the screen
  const int32_t k = kScreenW / W < kScreenH / H ? kScreenW / W : kScreenH / H, ox = (kScreenW - W * k) / 2, oy = (kScreenH - H * k) / 2;
  for (int32_t y = f->y0; y < f->y1; y++) {   // 0x00RRGGBB -> A8B8G8R8
    const uint32_t* s = rows + (size_t)y * W;
    uint32_t* d = fb + (size_t)(oy + y * k) * kScreenW + ox;
    for (int32_t x = 0; x < W; x++) {
      const uint32_t c = 0xFF000000u | (s[x] & 0xFF) << 16 | (s[x] & 0xFF00) | (s[x] >> 16 & 0xFF);
      for (int32_t i = 0; i < k; i++) d[x * k + i] = c;
    }
    for (int32_t j = 1; j < k; j++) memcpy(d + (size_t)j * kScreenW, d, (size_t)W * k * 4);
  }
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
