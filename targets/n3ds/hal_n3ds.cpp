// Nintendo 3DS HAL (devkitARM + libctru; the console core of targets/console, ZN-457): text through svcOutputDebugString (Azahar logs it as
// Debug.Emulated), the system tick as the clock, the pad, and the frames on the top screen (400x240, RGBA8; the 3DS framebuffer is rotated:
// columns of 240 pixels, bottom to top): replayed on the PICA200 (c3d_n3ds.cpp, ZN-469), both eyes in stereo and the bottom screen's window
// included, or, with ZINC_N3DS_GPU=0, the shared software rasterizer, swapped at vblank.
#include "hal.h"
#include "console_pad.h"
#include "console_audio.h"
#include "console_net.h"
#include <math.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <3ds.h>
#include "frame_profile.h"
#include <new>

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0   // a frame budget built in (the emulator tests), 0: until the program ends or the system asks to quit
#endif
#ifndef ZRT_HEAP_BYTES
#ifdef ZN_CONSOLE_AOT
#define ZRT_HEAP_BYTES (16u << 20)   // the n3ds profile's heap (src/frontend/profile.cpp): a compiled program's objects live there
#else
// the interpreter keeps its objects in malloc's heap (src/rt/alloc.cpp): the runtime's own heap holds only what the natives make (Tokyo's
// long flight: 1 KB at most, out of the 16 MB it took before)
#define ZRT_HEAP_BYTES (4u << 20)
#endif
#endif

// libctru's split (see memoryHold): the GPU's memory, the heap gets the rest (Tokyo on an Old 3DS, a long flight with stereo and the night:
// 19.2 MB of linear memory at most)
extern "C" u32 __ctru_linear_heap_size = 24u << 20;
extern "C" u32 __ctru_heap_size;
static const int32_t kScreenW = 400, kScreenH = 240;
static int32_t W = kScreenW, H = kScreenH, frames = 0;
static uint32_t* rows = nullptr;   // the software frame, 0x00RRGGBB
static bool gfxOn = false;
static int32_t stale[2][2] = {{0, 0}, {0, 0}};   // per framebuffer, the rows [first, end) it has not got yet
static int back = 0;                              // the framebuffer drawn this frame
static const uint32_t* shown = nullptr;           // the framebuffer on the screen since the last swap
static bool gpuOn = false;                        // the PICA200 draws the frames
extern "C" __attribute__((weak)) bool zn_c3d_init(int32_t w, int32_t h);   // c3d_n3ds.cpp
extern "C" __attribute__((weak)) bool zn_c3d_draw(const HalFrame* f, int target, bool always);
extern "C" __attribute__((weak)) bool zn_c3d_window(const HalCmdList* l, int32_t w, int32_t h);
extern "C" __attribute__((weak)) void zn_c3d_end(void);
extern "C" __attribute__((weak)) void zn_c3d_wait(void);
extern "C" __attribute__((weak)) void zn_c3d_fini(void);
static bool bottomNew = false;                    // the bottom screen got a frame from the CPU since the last swap
static bool bottomGpu = false;                    // the GPU frame being built draws the bottom screen
// Stereoscopic 3D (ZN-759, zinc:hardware setStereo / stereoEye): while the program asks for it and the 3D slider is up, the frames alternate between
// the left and the right eye; a left frame goes to GFX_LEFT with no swap, the right one to GFX_RIGHT, then both are shown at the vblank.
static bool stereoAsked = false, stereoOn = false;
static int eye = 0;   // the eye of the frame being drawn
// The bottom screen (320x240, touch): the program's first zinc:gfx window (openWindow), its stylus that window's pointer.
static int32_t bottomId = 0;
static bool bottomShown = false;
static const uint32_t* bottomFb = nullptr;    // the bottom framebuffer last drawn
static const uint32_t* rightFb = nullptr;     // the right eye's framebuffer last drawn (stereo)
// a framebuffer of the panel (rotated: columns of `rowsH` pixels, bottom to top, RGBA8) as a PPM of w x h (the emulator tests' shots)
static void ppm(const char* path, const uint32_t* fb, int32_t w, int32_t h, int32_t rowsH) {
  FILE* f = fopen(path, "wb");
  if (!f) return;
  fprintf(f, "P6\n%d %d\n255\n", (int)w, (int)h);
  for (int32_t y = 0; y < h; y++)
    for (int32_t x = 0; x < w; x++) {
      const uint32_t c = fb[x * rowsH + (rowsH - 1 - y)];
      const unsigned char p[3] = {(unsigned char)(c >> 24), (unsigned char)(c >> 16), (unsigned char)(c >> 8)};
      fwrite(p, 1, 3, f);
    }
  fclose(f);
}
static touchPosition touch;
static bool touching = false;
static bool isNew3ds = false, cstickOn = false;
// the 3D slider; ZINC_3D_SLIDER (tools/build-console-core --env) stands in for it where the emulator's is down (its settings are the user's)
static float slider() {
  static float forced = -2;
  if (forced == -2) { const char* v = getenv("ZINC_3D_SLIDER"); forced = v && *v ? (float)atof(v) : -1; }
  const float s = osGet3DSliderState();
  return s > 0 || forced < 0 ? s : forced;
}
static HalGamepad lastPad;          // the pad, for the bottom window's input too
static uint32_t lastButtons = 0;

// also sdmc:/zinc.log: Azahar logs debug strings only at its Debug level, which its default log filter (*:Info) hides; the runner reads the file
// (<Azahar's user directory>/sdmc/zinc.log, removed before each run). Appended to: on a console, the runs of a session follow each other there.
static FILE* logFile = nullptr;
static char logBuffer[16384];
static void out(const char* s, size_t n) {
  svcOutputDebugString(s, (s32)n);
  if (!logFile) {
    logFile = fopen("sdmc:/zinc.log", "a");
    if (logFile && zn::n3ds::capture::enabled()) setvbuf(logFile, logBuffer, _IOFBF, sizeof logBuffer);
  }
  if (logFile) { fwrite(s, 1, n, logFile); fputc('\n', logFile); if (!zn::n3ds::capture::enabled()) fflush(logFile); }
}

// Sound (ZN-759): zinc:audio's mix at 22050 Hz. ndsp (the DSP) when its firmware is on the SD card (sdmc:/3ds/dspfirm.cdc, dumped from the
// console), else CSND: one looping mono buffer written ahead of where the hardware plays, by the clock. Both are fed on the program's thread.
static const int kRate = 22050;
static int audioPath = 0;   // 0 not opened, 1 ndsp, 2 csnd, -1 none
static ndspWaveBuf waves[4];
static int16_t* wavePcm = nullptr;
static const uint32_t kWave = 1024;   // frames a wave buffer
static int16_t* csndBuf = nullptr;
static const uint32_t kCsnd = 8192;   // frames of the CSND loop (0.37 s)
static int csndChannel = -1;
static uint64_t csndStart = 0, csndWritten = 0;
static void audioOpen() {
  if (ndspInit() == 0) {
    audioPath = 1;
    ndspSetOutputMode(NDSP_OUTPUT_STEREO);
    ndspChnSetInterp(0, NDSP_INTERP_LINEAR);
    ndspChnSetRate(0, kRate);
    ndspChnSetFormat(0, NDSP_FORMAT_STEREO_PCM16);
    wavePcm = (int16_t*)linearAlloc(kWave * 4 * 4);
    memset(waves, 0, sizeof waves);
    for (int i = 0; i < 4; i++) { waves[i].data_pcm16 = wavePcm + i * kWave * 2; waves[i].nsamples = kWave; waves[i].status = NDSP_WBUF_DONE; }
    return;
  }
  if (csndInit() == 0) {
    for (int c = 8; c < CSND_NUM_CHANNELS && csndChannel < 0; c++) if (csndChannels & BIT(c)) csndChannel = c;
    csndBuf = (int16_t*)linearAlloc(kCsnd * 2);
    if (csndChannel >= 0 && csndBuf) {
      memset(csndBuf, 0, kCsnd * 2);
      GSPGPU_FlushDataCache(csndBuf, kCsnd * 2);
      if (csndPlaySound(csndChannel, SOUND_REPEAT | SOUND_FORMAT_16BIT, kRate, 1.0f, 0.0f, csndBuf, csndBuf, kCsnd * 2) == 0) {
        audioPath = 2;
        csndStart = svcGetSystemTick();
        csndWritten = kCsnd / 4;   // start writing a little ahead of the play position
        return;
      }
    }
  }
  audioPath = -1;
}
static void audioPump() {
  if (!zn_console_audio_rate()) return;
  if (!audioPath) audioOpen();
  if (audioPath == 1) {
    for (auto& w : waves)
      if (w.status == NDSP_WBUF_DONE || w.status == NDSP_WBUF_FREE) {
        zn_console_audio_render(w.data_pcm16, (int)kWave);
        DSP_FlushDataCache(w.data_pcm16, kWave * 4);
        ndspChnWaveBufAdd(0, &w);
      }
  } else if (audioPath == 2) {
    const uint64_t played = (svcGetSystemTick() - csndStart) * kRate / SYSCLOCK_ARM11;
    const uint64_t want = played + 2048;   // 90 ms ahead
    if (csndWritten < played) csndWritten = played + 256;   // a long frame: skip what was already played
    static int16_t lr[512 * 2];
    while (csndWritten < want) {
      const uint32_t n = (uint32_t)(want - csndWritten < 512 ? want - csndWritten : 512);
      zn_console_audio_render(lr, (int)n);
      for (uint32_t i = 0; i < n; i++) csndBuf[(csndWritten + i) % kCsnd] = (int16_t)((lr[i * 2] + lr[i * 2 + 1]) / 2);
      csndWritten += n;
    }
    GSPGPU_FlushDataCache(csndBuf, kCsnd * 2);
  }
}

extern "C" {
int zn_console_audio_output(void) { return 1; }
const char* zn_console_audio_backend(void) { return audioPath == 1 ? "ndsp" : audioPath == 2 ? "CSND (no DSP firmware on the SD card)" : audioPath < 0 ? "none" : "ndsp"; }
// zinc:sys device() (ZN-759, zinc:hardware): the battery, Wi-Fi, the accelerometer and gyroscope, the microphone's level, the 3D slider
const char* hal_device(const char* q, const char* arg) {
  static char out[160];
  if (!strcmp(q, "battery")) {
    static int up = 0;
    if (!up) up = ptmuInit() == 0 ? 1 : -1;
    if (up < 0) return nullptr;
    u8 level = 5, charging = 0;
    bool adapter = false;
    double pct = -1;
    static int mcu = 0;
    if (!mcu) mcu = mcuHwcInit() == 0 ? 1 : -1;
    u8 p = 0;
    PTMU_GetBatteryLevel(&level);
    // the percentage where mcu::HWC answers and agrees with ptm's five steps (Azahar's says 0 or 1)
    if (mcu > 0 && MCUHWC_GetBatteryLevel(&p) == 0 && p / 100.0 > level / 5.0 - 0.25 && p / 100.0 < level / 5.0 + 0.25) pct = p / 100.0;
    PTMU_GetBatteryChargeState(&charging); PTMU_GetAdapterState(&adapter);
    snprintf(out, sizeof out, "{\"level\":%.2f,\"charging\":%s,\"source\":\"%s\"}", pct >= 0 ? pct : level / 5.0, charging ? "true" : "false", adapter ? "ac" : "none");
    return out;
  }
  if (!strcmp(q, "network")) {
    static int up = 0;
    if (!up) up = acInit() == 0 ? 1 : -1;
    u32 st = 0;
    if (up < 0 || ACU_GetWifiStatus(&st) != 0) return "{\"online\":false,\"type\":\"wifi\"}";
    char ssid[33] = "";
    if (st) ACU_GetSSID(ssid);
    snprintf(out, sizeof out, "{\"online\":%s,\"type\":\"wifi\",\"ssid\":\"%s\",\"bars\":%d}", st ? "true" : "false", ssid, (int)osGetWifiStrength());
    return out;
  }
  if (!strcmp(q, "motion") || !strcmp(q, "gyro")) {
    static bool on = false;
    static float dps = 0;
    if (!on) { on = true; HIDUSER_EnableAccelerometer(); HIDUSER_EnableGyroscope(); HIDUSER_GetGyroscopeRawToDpsCoefficient(&dps); }
    if (q[0] == 'm') {   // about 512 a g; x right, y the screen's up, z out of it, the web's signs
      accelVector a; hidAccelRead(&a);
      snprintf(out, sizeof out, "{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f}", a.x / 512.0f * 9.80665f, a.z / 512.0f * 9.80665f, -a.y / 512.0f * 9.80665f);
    } else {
      angularRate g; hidGyroRead(&g);
      snprintf(out, sizeof out, "{\"x\":%.1f,\"y\":%.1f,\"z\":%.1f}", g.x * dps, g.z * dps, g.y * dps);
    }
    return out;
  }
  if (!strcmp(q, "microphone")) {   // the RMS of the last 1/30 s of the MIC service's 16 kHz samples, 1 at about a third of full scale
    static int up = 0;
    static u8* buf = nullptr;
    static u32 size = 0;
    if (!up) {
      up = -1;
      size = 0x30000;
      buf = (u8*)memalign(0x1000, size);
      if (buf && micInit(buf, size) == 0 && MICU_StartSampling(MICU_ENCODING_PCM16_SIGNED, MICU_SAMPLE_RATE_16360, 0, micGetSampleDataSize(), true) == 0) up = 1;
    }
    if (up < 0) return nullptr;
    const u32 n = 545, total = micGetSampleDataSize() / 2, end = micGetLastSampleOffset() / 2;
    const int16_t* pcm = (const int16_t*)buf;
    double sum = 0;
    for (u32 i = 0; i < n; i++) { const int16_t v = pcm[(end + total - 1 - i) % total]; sum += (double)v * v; }
    const double rms = sqrt(sum / n) / 10000.0;
    snprintf(out, sizeof out, "{\"level\":%.3f}", rms > 1 ? 1.0 : rms);
    return out;
  }
  if (!strcmp(q, "stereo")) {
    if (arg && *arg) stereoAsked = arg[0] == '1';
    snprintf(out, sizeof out, "%.2f", slider());
    return out;
  }
  if (!strcmp(q, "eye")) return stereoOn && eye ? "1" : "0";
  return nullptr;
}
// the bottom screen as the program's window (runtime/gfx.cpp openWindow): the first window opened, at most 320x240
int32_t hal_win_open(int32_t id, const char*, int32_t w, int32_t h) {
  if (bottomId || !gfxOn || w > 320 || h > 240) return 0;
  bottomId = id;
  return 1;
}
void hal_win_close(int32_t id) { if (id == bottomId) bottomId = 0; else if (id == 0) bottomId = 0; }
int32_t hal_win_state(int32_t id) { return id == 0 || (id == bottomId && bottomId) ? 1 : 0; }
void hal_win_input(int32_t id, HalInput* in, int32_t* w, int32_t* h) {
  *w = 320; *h = 240;
  if (id != bottomId) return;
  in->pad[0] = lastPad; in->buttons = lastButtons;
  in->px = touch.px; in->py = touch.py; in->pdown = touching;
  in->ntouch = touching ? 1 : 0;
  if (touching) { in->touch[0].id = 0; in->touch[0].x = touch.px; in->touch[0].y = touch.py; }
}
void hal_win_present(int32_t id, const uint32_t* px, int32_t pw, int32_t ph) {
  if (id != bottomId || !gfxOn) return;
  u32* fb = (u32*)gfxGetFramebuffer(GFX_BOTTOM, GFX_LEFT, nullptr, nullptr);
  if (!fb) return;   // the screens closed (null only before gfxInitDefault and after gfxExit)
  for (int32_t x = 0; x < 320 && x < pw; x++)
    for (int32_t y = 0; y < 240 && y < ph; y++) { const uint32_t c = px[(size_t)y * pw + x]; fb[x * 240 + (239 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
  bottomShown = true;
  bottomNew = true;
  bottomFb = fb;
}
void hal_win_current(int32_t) {}
int32_t hal_win_draw(int32_t id, const HalCmdList* l, int32_t pw, int32_t ph) {   // the bottom window on the GPU (runtime/gfx.cpp endWindow)
  if (id != bottomId) return 0;
  if (!gpuOn || pw > 320 || ph > 240) { zn::n3ds::capture::add(zn::n3ds::capture::SoftwareSurfaces, 1); return 0; }
  if (!zn_c3d_window(l, pw, ph)) return 0;
  bottomShown = true;
  bottomGpu = true;
  return 1;
}
void zn_console_echo(const char* s, size_t n) {   // the program's lines, one debug string each (newlib's stdout has no device here)
  for (size_t b = 0; b < n;) { size_t e = b; while (e < n && s[e] != '\n') e++; if (e > b) out(s + b, e - b); b = e + 1; }
}
// The memory. An original 3DS or 2DS gives a program 64 MB (the APPLICATION region), its code and linked data included; libctru splits what is
// left between the heap (malloc, the runtime's heap) and the linear heap (what the GPU reads), by default 24 MB of heap and the rest linear,
// at most 32. A Zinc program needs the heap more: the linear heap is fixed (__ctru_linear_heap_size, below) and the heap gets the rest.
// Azahar gives a .3dsx 96 MB whatever the model it emulates: as an Old 3DS the HAL holds the difference out of the heap at its start, so a
// program that does not fit a real console does not fit there either (tools/console-run runs the cores as an Old 3DS).
static size_t heldBack = 0;
static bool leaving = false;
// an end asked for on another thread (the card's reader, on the other core): the main thread owns the screens and draws them, so it makes
// the end at its next poll (hal_poll_input). Closed under it, it wrote its next frame through a null framebuffer: a data abort in
// hal_win_present on a real Old 3DS (Tokyo) instead of the message.
static char pendingWhy[256];
static volatile int pendingStatus = -1;
// a clean end with a message (the log has `zinc:exit N`): the screens closed, back to the Homebrew Launcher, instead of a black screen
static void leave(const char* why, int status) {
  if (threadGetCurrent()) {   // libctru gives the main thread no Thread object: this is another thread
    if (pendingStatus < 0) { snprintf(pendingWhy, sizeof pendingWhy, "%s", why); pendingStatus = status; }
    for (;;) svcSleepThread(1000000000LL);   // parked until the process ends
  }
  out(why, strlen(why));
  char b[32];
  const int k = snprintf(b, sizeof b, "zinc:exit %d", status);
  out(b, (size_t)k);
  if (leaving) svcExitProcess();   // the end itself failed
  leaving = true;
  hal_shutdown();
  exit(status);
}
static size_t heapUsed() { const size_t u = (size_t)mallinfo().uordblks; return u > heldBack ? u - heldBack : 0; }   // the held block left out
static size_t heapFree() { const size_t h = __ctru_heap_size - heldBack, u = heapUsed(); return h > u ? h - u : 0; }
extern "C" size_t zn_console_heap_held(void) { return heldBack; }   // sdpack.cpp's heap numbers leave it out
extern "C" size_t zn_console_heap_largest(void);
static void oom(size_t asked, bool linear = false) {
  char b[240];
  snprintf(b, sizeof b, "zinc: out of memory on the 3DS (asked %lu KB%s; heap %lu of %lu KB in use, its largest free block %lu KB; linear memory %lu KB free)",
           (unsigned long)(asked / 1024), linear ? " of linear memory" : "", (unsigned long)(heapUsed() / 1024), (unsigned long)((__ctru_heap_size - heldBack) / 1024),
           (unsigned long)(zn_console_heap_largest() / 1024), (unsigned long)(linearSpaceFree() / 1024));
  leave(b, 3);
}
static void outOfMemory() { oom(0); }   // operator new's handler
// Every malloc and linearAlloc of the core goes through these (n3ds.cmake links with --wrap): an allocation of the main thread that fails
// ends the program with the line above. Unchecked, a null block was written through and the console froze on a black screen (Tokyo on an
// Old 3DS). Another thread gets the null and checks it (sdpack.cpp's reader drops that read and asks again later); its operator new ends.
void* __real_malloc(size_t);
void* __real_calloc(size_t, size_t);
void* __real_realloc(void*, size_t);
void* __real_memalign(size_t, size_t);
static bool mainThread() { return threadGetCurrent() == nullptr; }
void* __wrap_malloc(size_t n) { void* p = __real_malloc(n); if (!p && n && mainThread()) oom(n); return p; }
void* __wrap_calloc(size_t k, size_t n) { void* p = __real_calloc(k, n); if (!p && k && n && mainThread()) oom(k * n); return p; }
void* __wrap_realloc(void* q, size_t n) { void* p = __real_realloc(q, n); if (!p && n && mainThread()) oom(n); return p; }
void* __wrap_memalign(size_t a, size_t n) { void* p = __real_memalign(a, n); if (!p && n && mainThread()) oom(n); return p; }
void* __real_linearAlloc(size_t);
void* __real_linearMemAlign(size_t, size_t);
void* __wrap_linearAlloc(size_t n) { void* p = __real_linearAlloc(n); if (!p && n) oom(n, true); return p; }
void* __wrap_linearMemAlign(size_t n, size_t a) { void* p = __real_linearMemAlign(n, a); if (!p && n) oom(n, true); return p; }
// the largest block malloc can give now (sdpack.cpp's numbers): a heap with room enough in all can still fail a large block when it is in pieces
extern "C" size_t zn_console_heap_largest(void) {
  size_t lo = 0, hi = heapFree();
  while (hi - lo > 16 * 1024) {
    const size_t mid = lo + (hi - lo) / 2;
    void* p = __real_malloc(mid);
    if (p) { free(p); lo = mid; } else hi = mid;
  }
  return lo;
}
static void memoryHold() {   // once a run, before anything large is allocated
  static bool done = false;
  if (done) return;
  done = true;
  std::set_new_handler(outOfMemory);
  bool n = false;
  APT_CheckNew3DS(&n);
  const u32 app = osGetMemRegionSize(MEMREGION_APPLICATION), old = 64u << 20;
  s64 emulator = 0;   // Azahar (and Citra) answer svcGetSystemInfo(0x20000, 0) with non-zero (Azahar 2126: 2); a console refuses the call
  static void* volatile held = nullptr;   // kept: a malloc whose block nobody reads is dropped by the compiler
  if (!n && app > old && R_SUCCEEDED(svcGetSystemInfo(&emulator, 0x20000, 0)) && emulator != 0 && (held = __real_malloc(app - old)))
    heldBack = app - old;
}
static void memoryLine() {   // once a run, on the console too, the screens up: n3ds: old, app 64 MB, heap 38 MB (34 MB free), linear 22 MB (16 MB free)
  static bool said = false;
  if (said) return;
  said = true;
  bool n = false;
  APT_CheckNew3DS(&n);
  char held[64] = "";
  if (heldBack) snprintf(held, sizeof held, " (an Old 3DS's: the emulator gives %lu)", (unsigned long)((osGetMemRegionSize(MEMREGION_APPLICATION)) >> 20));
  char b[220];
  const int k = snprintf(b, sizeof b, "n3ds: %s, app %lu MB%s, heap %lu MB (%lu MB free), linear %lu MB (%lu MB free)", n ? "new" : "old",
                         (unsigned long)((osGetMemRegionSize(MEMREGION_APPLICATION) - heldBack) >> 20), held,
                         (unsigned long)((__ctru_heap_size - heldBack) >> 20), (unsigned long)(heapFree() >> 20),
                         (unsigned long)(__ctru_linear_heap_size >> 20), (unsigned long)(linearSpaceFree() >> 20));
  out(b, (size_t)(k > 0 ? k : 0));
}
void hal_init(const HalConfig* cfg) {
  memoryHold();
  zn::n3ds::capture::init();
  W = cfg->width < kScreenW ? cfg->width : kScreenW;
  H = cfg->height < kScreenH ? cfg->height : kScreenH;
  if (!cfg->gfx) { memoryLine(); return; }
  gfxInitDefault();
  gfxSetScreenFormat(GFX_TOP, GSP_RGBA8_OES);
  gfxSetDoubleBuffering(GFX_TOP, true);
  gfxSetScreenFormat(GFX_BOTTOM, GSP_RGBA8_OES);
  gfxSetDoubleBuffering(GFX_BOTTOM, true);
  APT_CheckNew3DS(&isNew3ds);
  zn::n3ds::capture::model(isNew3ds);
  if (isNew3ds) osSetSpeedupEnable(true);
  cstickOn = isNew3ds && irrstInit() == 0;
  rows = (uint32_t*)memalign(64, (size_t)W * H * 4);
  if (!rows || !gfxGetFramebuffer(GFX_TOP, GFX_LEFT, nullptr, nullptr)) leave("zinc: no memory for the screens on the 3DS", 3);
  memset(rows, 0, (size_t)W * H * 4);
  gfxOn = true;
  const char* g = getenv("ZINC_N3DS_GPU");
  gpuOn = !(g && *g == '0') && zn_c3d_init && zn_c3d_init(W, H);
  memoryLine();
}
void hal_shutdown(void) {
  zn::n3ds::capture::finish();
  if (logFile) fflush(logFile);
  zn_console_net_down();   // soc:u released, or the next app cannot start it
  if (gpuOn) zn_c3d_fini();
  if (gfxOn) gfxExit();
  gpuOn = gfxOn = false;   // a frame after this draws nowhere (an atexit handler's)
}
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return svcGetSystemTick() * 1000000ull / SYSCLOCK_ARM11; }
void hal_sleep_us(uint64_t us) { svcSleepThread((s64)(us > 1000000u ? 1000000u : us) * 1000); }
void hal_log(const char* s, size_t n) { zn_console_echo(s, n); }
void hal_log_err(const char* s, size_t n) { zn_console_echo(s, n); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) {
  memoryHold();
  *size = ZRT_HEAP_BYTES;
  *base = __real_malloc(*size);
  if (*base) return;
  char b[160];
  snprintf(b, sizeof b, "zinc: no room for the runtime's %lu MB heap on the 3DS (%lu MB of heap free)", (unsigned long)(ZRT_HEAP_BYTES >> 20), (unsigned long)(heapFree() >> 20));
  leave(b, 3);
}
void hal_panic(const char* msg, const char* file, int line) {
  char b[256];
  int k = file && *file ? snprintf(b, sizeof b, "panic: %s (%s:%d)", msg, file, line) : snprintf(b, sizeof b, "panic: %s", msg);
  leave(b, 101);
}
void hal_frame_begin(void) { zn::n3ds::capture::begin(eye == 0, stereoOn); }
void hal_frame_end(void) {
  zn::n3ds::capture::phases();
  audioPump();
  if (!gfxOn) return;
  // stereo: the left eye's frame waits for the right one; both buffers of the eye get every row (the frames alternate)
  const bool want = stereoAsked && slider() > 0;
  if (want != stereoOn) { stereoOn = want; gfxSet3D(want); eye = 0; stale[0][0] = stale[1][0] = 0; stale[0][1] = stale[1][1] = H; }
  if (gpuOn) {   // citro3d transfers and swaps what it drew; a bottom frame the CPU wrote is swapped here
    if (stereoOn && eye == 0) { eye = 1; return; }   // the right eye's frame closes the GPU frame
    eye = 0;
    if (bottomGpu) { bottomFb = (const uint32_t*)gfxGetFramebuffer(GFX_BOTTOM, GFX_LEFT, nullptr, nullptr); bottomGpu = false; }
    zn_c3d_end();
    zn::n3ds::capture::end(true);
    if (bottomNew) { gfxFlushBuffers(); gfxScreenSwapBuffers(GFX_BOTTOM, false); bottomNew = false; }
    return;
  }
  bottomNew = false;
  if (stereoOn) {
    u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, eye ? GFX_RIGHT : GFX_LEFT, nullptr, nullptr);
    for (int32_t x = 0; x < W; x++)
      for (int32_t y = 0; y < H; y++) { const uint32_t c = rows[(size_t)y * W + x]; fb[x * kScreenH + (kScreenH - 1 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
    if (eye == 0) { shown = fb; eye = 1; return; }   // shown: the left eye's, for a shot
    rightFb = fb;
    eye = 0;
    back ^= 1;   // the mono path's double-buffer parity follows the swaps
    gfxFlushBuffers(); gfxSwapBuffers();
    { zn::n3ds::capture::Scope waitScope(zn::n3ds::capture::Wait); gspWaitForVBlank(); }
    zn::n3ds::capture::end(true);
    return;
  }
  // the top screen is double-buffered: the buffer drawn now last got the rows of two frames ago, so it takes every row changed since
  const int b = back;
  back ^= 1;
  u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, GFX_LEFT, nullptr, nullptr);
  for (int32_t x = 0; x < W && stale[b][1] > stale[b][0]; x++)   // the panel is portrait: a column of the image is a row of the framebuffer, from the bottom
    for (int32_t y = stale[b][0]; y < stale[b][1]; y++) { const uint32_t c = rows[(size_t)y * W + x]; fb[x * kScreenH + (kScreenH - 1 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
  stale[b][0] = H; stale[b][1] = 0;
  gfxFlushBuffers(); gfxSwapBuffers();
    { zn::n3ds::capture::Scope waitScope(zn::n3ds::capture::Wait); gspWaitForVBlank(); }
  shown = fb;
  zn::n3ds::capture::end(true);
}
extern "C" __attribute__((weak)) int zn_player_poll(void) { return 0; }   // the console player (targets/console/player_console.cpp, ZN-792): 1 ends the program
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{KEY_DUP, HAL_UP}, {KEY_DDOWN, HAL_DOWN}, {KEY_DLEFT, HAL_LEFT}, {KEY_DRIGHT, HAL_RIGHT}, {KEY_CPAD_UP, HAL_UP},
    {KEY_CPAD_DOWN, HAL_DOWN}, {KEY_CPAD_LEFT, HAL_LEFT}, {KEY_CPAD_RIGHT, HAL_RIGHT}, {KEY_A, HAL_A},
    {KEY_B, HAL_B}, {KEY_X, HAL_X}, {KEY_Y, HAL_Y}, {KEY_L, HAL_L}, {KEY_R, HAL_R}, {KEY_START, HAL_START}, {KEY_SELECT, HAL_SELECT}};
  if (pendingStatus >= 0) leave(pendingWhy, pendingStatus);   // another thread's end, made here
  hidScanInput();
  if (cstickOn) irrstScanInput();
  const u32 held = hidKeysHeld();
  in->buttons = 0;
  for (auto& m : map) if (held & m[0]) in->buttons |= m[1];   // the circle pad is the d-pad too
  // the pad as gamepad 0 (W3C order, by position: B south, A east, Y west, X north; ZL ZR the triggers), the circle pad the left stick and the
  // New 3DS's C-stick the right one
  static const uint32_t w3c[][2] = {{KEY_B, 0}, {KEY_A, 1}, {KEY_Y, 2}, {KEY_X, 3}, {KEY_L, 4}, {KEY_R, 5}, {KEY_ZL, 6}, {KEY_ZR, 7}, {KEY_SELECT, 8},
    {KEY_START, 9}, {KEY_DUP, 12}, {KEY_DDOWN, 13}, {KEY_DLEFT, 14}, {KEY_DRIGHT, 15}};
  HalGamepad& g = in->pad[0];
  g.connected = 1;
  strcpy(g.name, isNew3ds ? "New Nintendo 3DS" : "Nintendo 3DS");
  g.buttons = 0;
  for (auto& m : w3c) if (held & m[0]) g.buttons |= 1u << m[1];
  g.trigger[0] = held & KEY_ZL ? 1 : 0; g.trigger[1] = held & KEY_ZR ? 1 : 0;
  circlePosition c;
  hidCircleRead(&c);
  g.axes[0] = c.dx / 156.0f; g.axes[1] = -c.dy / 156.0f;
  g.axes[2] = g.axes[3] = 0;
  if (cstickOn) { circlePosition cs; irrstCstickRead(&cs); g.axes[2] = cs.dx / 146.0f; g.axes[3] = -cs.dy / 146.0f; }
  g.rumble_ms = 0;   // no motor in a 3DS
  const uint32_t scripted = zn_console_script(frames);
  in->buttons |= scripted;
  g.buttons |= zn_console_w3c(scripted);
  // the stylus on the bottom screen: the bottom window's pointer, else the main one's (in the bottom screen's pixels)
  touching = (held & KEY_TOUCH) != 0;
  if (touching) hidTouchRead(&touch);
  in->px = in->py = 0; in->pdown = 0;
  if (!bottomId && touching) { in->px = touch.px; in->py = touch.py; in->pdown = 1; }
  lastPad = g; lastButtons = in->buttons;
  const int32_t frame = frames++;
  const bool budgetOver = ZINC_FRAMES && frame >= ZINC_FRAMES;
  if (budgetOver && frame == ZINC_FRAMES && gpuOn) zn_c3d_wait();   // the GPU's last frame is on the screens
  if (budgetOver && frame == ZINC_FRAMES && shown) {   // the last frame of a budget as sdmc:/zinc-shot.ppm (the emulator tests), read back from
    ppm("sdmc:/zinc-shot.ppm", shown, W, H, kScreenH);   // the framebuffer the screen shows (rotated, RGBA8), not from the HAL's own frame
    if (bottomFb) ppm("sdmc:/zinc-shot-bottom.ppm", bottomFb, 320, 240, 240); else remove("sdmc:/zinc-shot-bottom.ppm");   // and the bottom screen
    if (stereoOn && rightFb) ppm("sdmc:/zinc-shot-right.ppm", rightFb, W, H, kScreenH); else remove("sdmc:/zinc-shot-right.ppm");   // the right eye
  }
  // START and SELECT held together for a second leave the program (back to the Homebrew Launcher): HOME's "close" would close the launcher too
  static int32_t leaving = 0;
  leaving = (in->buttons & (HAL_START | HAL_SELECT)) == (HAL_START | HAL_SELECT) ? leaving + 1 : 0;   // the pad's or an input script's
  in->quit = !aptMainLoop() || budgetOver || leaving >= 60;
  in->quit |= zn_player_poll();   // the workstation stopped it, or sent another program
}
void hal_present(const HalFrame* f) {
  if (gpuOn) {   // the eye's target (the left one when mono); the buffer its display transfer writes is the one shown after the swap
    const bool right = stereoOn && eye;
    u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, right ? GFX_RIGHT : GFX_LEFT, nullptr, nullptr);
    if (zn_c3d_draw(f, right ? 1 : 0, stereoOn)) { if (right) rightFb = fb; else shown = fb; }
    return;
  }
  if (!rows || f->y1 <= f->y0) return;
  zn::n3ds::capture::add(zn::n3ds::capture::SoftwareSurfaces, 1);
  f->render(rows + (size_t)f->y0 * W, f->y0, f->y1);
  for (auto& r : stale) { if (f->y0 < r[0]) r[0] = f->y0; if (f->y1 > r[1]) r[1] = f->y1; }   // both buffers miss these rows
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
// Stereo renders two callbacks per refresh; a fixed 1/60 per eye doubles simulation time.
double hal_fixed_dt(void) { return 0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
