// Sony PSP HAL (pspsdk + newlib; the console core of targets/console, ZN-455/ZN-457): text through stdout (PPSSPP prints it), the system clock,
// the pad, and the frames: replayed on the GE (gu_psp.cpp, ZN-468) or, with ZINC_PSP_GPU=0, the shared software rasterizer shown in one 32-bit
// framebuffer in VRAM (480x272, stride 512), flipped at vblank.
#include "hal.h"
#include "console_pad.h"
#include "console_audio.h"
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pspctrl.h>
#include <pspdisplay.h>
#include <pspiofilemgr.h>
#include <pspkernel.h>
#include <psppower.h>
#include <pspaudio.h>
#include <pspwlan.h>

PSP_MODULE_INFO("zinc", PSP_MODULE_USER, 1, 0);
PSP_MAIN_THREAD_ATTR(THREAD_ATTR_USER | THREAD_ATTR_VFPU);
PSP_MAIN_THREAD_STACK_SIZE_KB(1024);   // the interpreter's native recursion (a call is a C++ frame)
PSP_HEAP_SIZE_KB(-1024);               // the newlib heap takes the user memory but 1 MiB (threads, the kernel's own)

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0   // a frame budget built in (the emulator tests), 0: until the program ends or HOME quits
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (16u << 20)   // the psp profile's heap (src/frontend/profile.cpp)
#endif

static const int32_t kScreenW = 480, kScreenH = 272, kStride = 512;
static int32_t W = kScreenW, H = kScreenH, frames = 0;
static uint32_t* rows = nullptr;                                     // the software frame, 0x00RRGGBB
static uint32_t* const vram = (uint32_t*)(0x40000000u | 0x04000000u);   // VRAM through the uncached mirror: the display reads it at once
static volatile bool quitting = false;
static bool gpuOn = false, queued = false;   // the GE draws the frames; the last present queued a frame to swap at the vblank
extern "C" __attribute__((weak)) bool zn_gu_init(int32_t w, int32_t h);   // gu_psp.cpp
extern "C" __attribute__((weak)) bool zn_gu_present(const HalFrame* f);
extern "C" __attribute__((weak)) void zn_gu_swap(void);

static int exitCallback(int, int, void*) { quitting = true; return 0; }   // HOME, then "quit the game"
static int callbackThread(SceSize, void*) {
  sceKernelRegisterExitCallback(sceKernelCreateCallback("zinc exit", exitCallback, nullptr));
  sceKernelSleepThreadCB();
  return 0;
}

// PPSSPP's emulator device (pspautotests' common.h): PPSSPPHeadless prints what is sent there; on a PSP the device does not exist and nothing happens
static void emulatorOut(const char* s, size_t n) { sceIoDevctl("kemulator:", 2, (void*)s, (int)n, nullptr, 0); }   // 2: EMULATOR_DEVCTL__SEND_OUTPUT

// Sound (ZN-759): zinc:audio's mix at 44100 Hz, the PSP's own rate (its hardware resampler is audibly broken, so no other rate goes out), rendered on
// the program's thread at the end of each frame into a ring that a thread of priority 0x12 plays through a 1024-frame channel, blocking.
static const uint32_t kAudioBlock = 1024;
static int16_t audioBuf[8192 * 2] __attribute__((aligned(64)));
static ZnAudioRing ring = {audioBuf, 8192, 0, 0};
static int audioThread(SceSize, void*) {
  static int16_t block[kAudioBlock * 2] __attribute__((aligned(64)));
  const int ch = sceAudioChReserve(PSP_AUDIO_NEXT_CHANNEL, kAudioBlock, PSP_AUDIO_FORMAT_STEREO);
  if (ch < 0) return 0;
  for (;;) { ring.take(block, kAudioBlock); sceAudioOutputPannedBlocking(ch, PSP_AUDIO_VOLUME_MAX, PSP_AUDIO_VOLUME_MAX, block); }
}
static void audioPump() {
  static bool running = false;
  if (!zn_console_audio_rate()) return;
  if (!running) {
    running = true;
    const SceUID t = sceKernelCreateThread("zinc audio", audioThread, 0x12, 0x4000, THREAD_ATTR_USER, nullptr);
    if (t >= 0) sceKernelStartThread(t, 0, nullptr);
  }
  ring.fill(kAudioBlock, 3 * kAudioBlock);   // 70 ms ahead: a frame that takes three times its time is still heard
}

extern "C" {
int zn_console_audio_output(void) { return 1; }
// zinc:sys device() (ZN-759, zinc:hardware): the battery and the power cord, the Wi-Fi switch (a PSP joins no network here: it is off, or on and
// not connected); no motion, microphone, rear touch or 3D on a PSP
const char* hal_device(const char* q, const char*) {
  static char out[160];
  if (!strcmp(q, "battery")) {
    if (!scePowerIsBatteryExist()) return scePowerIsPowerOnline() ? "{\"level\":1,\"charging\":false,\"source\":\"ac\"}" : "";
    const int pct = scePowerGetBatteryLifePercent();
    snprintf(out, sizeof out, "{\"level\":%.2f,\"charging\":%s,\"source\":\"%s\"}", pct < 0 ? 1.0 : pct / 100.0, scePowerIsBatteryCharging() ? "true" : "false",
             scePowerIsPowerOnline() ? "ac" : "none");
    return out;
  }
  if (!strcmp(q, "network")) return sceWlanGetSwitchState() ? "{\"online\":false,\"type\":\"wifi\"}" : "{\"online\":false,\"type\":\"none\"}";
  return nullptr;
}
void zn_console_echo(const char* s, size_t n) { emulatorOut(s, n); }   // the program's lines (targets/console/core_main.cpp)
void hal_init(const HalConfig* cfg) {
  W = cfg->width < kScreenW ? cfg->width : kScreenW;
  H = cfg->height < kScreenH ? cfg->height : kScreenH;
  const SceUID t = sceKernelCreateThread("zinc callbacks", callbackThread, 0x11, 0x1000, 0, nullptr);
  if (t >= 0) sceKernelStartThread(t, 0, nullptr);
  scePowerSetClockFrequency(333, 333, 166);
  sceCtrlSetSamplingCycle(0);
  sceCtrlSetSamplingMode(PSP_CTRL_MODE_ANALOG);
  if (!cfg->gfx) return;
  const char* g = getenv("ZINC_PSP_GPU");
  if (!(g && *g == '0') && zn_gu_init && zn_gu_init(W, H)) { gpuOn = true; return; }
  rows = (uint32_t*)memalign(64, (size_t)W * H * 4);
  for (int32_t i = 0; i < kStride * kScreenH; i++) vram[i] = 0xFF000000u;
  sceDisplaySetMode(0, kScreenW, kScreenH);
  sceDisplaySetFrameBuf((void*)0x04000000u, kStride, PSP_DISPLAY_PIXEL_FORMAT_8888, PSP_DISPLAY_SETBUF_NEXTFRAME);
}
void hal_shutdown(void) {}
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)sceKernelGetSystemTimeWide(); }
void hal_sleep_us(uint64_t us) { sceKernelDelayThread(us > 1000000u ? 1000000u : (SceUInt)us); }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); emulatorOut(s, n); }
void hal_log_err(const char* s, size_t n) { fflush(stdout); fwrite(s, 1, n, stderr); fflush(stderr); emulatorOut(s, n); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); if (!*base) *size = 0; }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  fflush(stdout);
  sceKernelExitGame();
  for (;;) {}
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {
  audioPump();
  sceDisplayWaitVblankStart();
  if (queued) { zn_gu_swap(); queued = false; }
}
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{PSP_CTRL_UP, HAL_UP}, {PSP_CTRL_DOWN, HAL_DOWN}, {PSP_CTRL_LEFT, HAL_LEFT}, {PSP_CTRL_RIGHT, HAL_RIGHT},
    {PSP_CTRL_CROSS, HAL_A}, {PSP_CTRL_CIRCLE, HAL_B}, {PSP_CTRL_SQUARE, HAL_X}, {PSP_CTRL_TRIANGLE, HAL_Y}, {PSP_CTRL_LTRIGGER, HAL_L},
    {PSP_CTRL_RTRIGGER, HAL_R}, {PSP_CTRL_START, HAL_START}, {PSP_CTRL_SELECT, HAL_SELECT}};
  SceCtrlData pad;
  memset(&pad, 0, sizeof pad);
  pad.Lx = pad.Ly = 128;
  in->buttons = 0;
  if (sceCtrlPeekBufferPositive(&pad, 1) > 0) {
    for (auto& m : map) if (pad.Buttons & m[0]) in->buttons |= m[1];
    in->buttons |= zn_console_stick(pad.Lx, pad.Ly);
  }
  // the PSP's pad as gamepad 0 (zinc:gfx gamepad rows, W3C order): the analog nub is the left stick; no second stick, no analog triggers, no motor
  static const uint32_t w3c[][2] = {{PSP_CTRL_CROSS, 0}, {PSP_CTRL_CIRCLE, 1}, {PSP_CTRL_SQUARE, 2}, {PSP_CTRL_TRIANGLE, 3}, {PSP_CTRL_LTRIGGER, 4},
    {PSP_CTRL_RTRIGGER, 5}, {PSP_CTRL_SELECT, 8}, {PSP_CTRL_START, 9}, {PSP_CTRL_UP, 12}, {PSP_CTRL_DOWN, 13}, {PSP_CTRL_LEFT, 14}, {PSP_CTRL_RIGHT, 15}};
  HalGamepad& g = in->pad[0];
  g.connected = 1;
  strcpy(g.name, "PSP");
  g.buttons = 0;
  for (auto& m : w3c) if (pad.Buttons & m[0]) g.buttons |= 1u << m[1];
  g.axes[0] = (pad.Lx - 128) / 127.0f; g.axes[1] = (pad.Ly - 128) / 127.0f; g.axes[2] = g.axes[3] = 0;
  g.rumble_ms = 0;
  const uint32_t scripted = zn_console_script(frames);
  in->buttons |= scripted;
  in->pad[0].buttons |= zn_console_w3c(scripted);
  in->px = in->py = 0; in->pdown = 0;
  const int32_t frame = frames++;
  const bool budgetOver = ZINC_FRAMES && frame >= ZINC_FRAMES;
  if (budgetOver && frame == ZINC_FRAMES) sceIoDevctl("kemulator:", 0x20, nullptr, 0, nullptr, 0);   // EMIT_SCREENSHOT: PPSSPPHeadless --screenshot gets the last frame
  in->quit = quitting || budgetOver;
}
void hal_present(const HalFrame* f) {
  if (gpuOn) { queued = zn_gu_present(f); return; }
  if (!rows || f->y1 <= f->y0) return;
  f->render(rows + (size_t)f->y0 * W, f->y0, f->y1);
  for (int32_t y = f->y0; y < f->y1; y++) {   // 0x00RRGGBB -> the GE's 8888 (0xAABBGGRR)
    const uint32_t* s = rows + (size_t)y * W;
    uint32_t* d = vram + (size_t)y * kStride;
    for (int32_t x = 0; x < W; x++) { const uint32_t c = s[x]; d[x] = 0xFF000000u | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16 & 0xFF); }
  }
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
