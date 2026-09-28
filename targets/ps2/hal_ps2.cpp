// PlayStation 2 HAL (EE, ps2sdk + newlib): TTY text output, heap, clock, pads through libpad (rom0:PADMAN), and the
// shared software rasterizer shown with gsKit: damaged rows are rendered into a CT32 texture in RAM, the texture
// manager uploads it when it changed, and a textured sprite fills the double-buffered, vsynced framebuffer.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <malloc.h>
#include <time.h>
#include <kernel.h>
#include <sifrpc.h>
#include <loadfile.h>
#include <libpad.h>
#include <gsKit.h>
#include <dmaKit.h>

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0  // frame budget (zinc run builds it in); 0 = run until switched off
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (16u << 20)
#endif

static int32_t W = 640, H = 448, frames = 0;
static GSGLOBAL* gs = nullptr;
static GSTEXTURE tex;
static bool dirty = false;
static bool pad_ok = false;
static char pad_buf[256] __attribute__((aligned(64)));

extern "C" {
void hal_init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  SifInitRpc(0);
  pad_ok = SifLoadModule("rom0:SIO2MAN", 0, nullptr) >= 0 && SifLoadModule("rom0:PADMAN", 0, nullptr) >= 0 &&
           padInit(0) == 1 && padPortOpen(0, 0, pad_buf) != 0;
  if (!cfg->gfx) return;
  gs = gsKit_init_global();  // NTSC/PAL from the ROM, 640x448 interlaced, double-buffered
  gs->PSM = GS_PSM_CT24;
  gs->ZBuffering = GS_SETTING_OFF;
  dmaKit_init(D_CTRL_RELE_OFF, D_CTRL_MFD_OFF, D_CTRL_STS_UNSPEC, D_CTRL_STD_OFF, D_CTRL_RCYC_8, 1 << DMA_CHANNEL_GIF);
  dmaKit_chan_init(DMA_CHANNEL_GIF);
  gsKit_init_screen(gs);
  gsKit_mode_switch(gs, GS_ONESHOT);
  gsKit_TexManager_init(gs);
  tex.Width = W; tex.Height = H; tex.PSM = GS_PSM_CT32; tex.Filter = GS_FILTER_NEAREST;
  tex.Mem = (u32*)memalign(128, gsKit_texture_size_ee(W, H, GS_PSM_CT32));
}
void hal_shutdown(void) { if (pad_ok) padPortClose(0, 0); }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)clock() * 1000000u / CLOCKS_PER_SEC; }
void hal_sleep_us(uint64_t us) { uint64_t end = hal_time_us() + us; while (hal_time_us() < end) {} }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char*) { return nullptr; }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  fflush(stdout);
  SleepThread();
  for (;;) {}
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {
  if (!gs) return;
  if (dirty) { gsKit_TexManager_invalidate(gs, &tex); dirty = false; }
  gsKit_TexManager_bind(gs, &tex);
  gsKit_prim_sprite_texture(gs, &tex, 0, 0, 0, 0, W, H, W, H, 1, GS_SETREG_RGBAQ(0x80, 0x80, 0x80, 0x80, 0));
  gsKit_queue_exec(gs);
  gsKit_sync_flip(gs);  // waits for vsync
  gsKit_TexManager_nextFrame(gs);
}
void hal_poll_input(HalInput* in) {
  static const uint16_t map[][2] = {{PAD_UP, HAL_UP}, {PAD_DOWN, HAL_DOWN}, {PAD_LEFT, HAL_LEFT}, {PAD_RIGHT, HAL_RIGHT},
    {PAD_CROSS, HAL_A}, {PAD_CIRCLE, HAL_B}, {PAD_SQUARE, HAL_X}, {PAD_TRIANGLE, HAL_Y}, {PAD_L1, HAL_L}, {PAD_R1, HAL_R},
    {PAD_START, HAL_START}, {PAD_SELECT, HAL_SELECT}};
  in->buttons = 0;
  struct padButtonStatus b;
  int st = pad_ok ? padGetState(0, 0) : PAD_STATE_DISCONN;
  if ((st == PAD_STATE_STABLE || st == PAD_STATE_FINDCTP1) && padRead(0, 0, &b))
    for (auto& m : map) if (!(b.btns & m[0])) in->buttons |= m[1];  // active low
  in->px = in->py = 0; in->pdown = 0;
  in->quit = ZINC_FRAMES && frames++ >= ZINC_FRAMES;
}
void hal_present(const HalFrame* f) {
  if (!gs || f->y1 <= f->y0) return;
  u32* rows = tex.Mem + (size_t)f->y0 * W;
  f->render((uint32_t*)rows, f->y0, f->y1);
  for (int32_t i = 0, n = (f->y1 - f->y0) * W; i < n; i++) {  // 0x00RRGGBB -> GS CT32 (A=0x80 is opaque)
    u32 c = rows[i];
    rows[i] = 0x80000000u | (c & 0xff) << 16 | (c & 0xff00) | (c >> 16 & 0xff);
  }
  FlushCache(0);  // the texture goes to the GS by DMA
  dirty = true;
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
