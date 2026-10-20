// Nintendo 3DS HAL (devkitARM + libctru; the console core of targets/console, ZN-457): text through svcOutputDebugString (Azahar logs it as
// Debug.Emulated), the system tick as the clock, the pad, and the shared software rasterizer shown on the top screen (400x240, RGBA8; the 3DS
// framebuffer is rotated: columns of 240 pixels, bottom to top), swapped at vblank. The PICA200 replay comes later
// (docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 4.4).
#include "hal.h"
#include "console_pad.h"
#include "console_audio.h"
#include <math.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <3ds.h>

#ifndef ZINC_FRAMES
#define ZINC_FRAMES 0   // a frame budget built in (the emulator tests), 0: until the program ends or the system asks to quit
#endif
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (16u << 20)   // the n3ds profile's heap (src/frontend/profile.cpp)
#endif

static const int32_t kScreenW = 400, kScreenH = 240;
static int32_t W = kScreenW, H = kScreenH, frames = 0;
static uint32_t* rows = nullptr;   // the software frame, 0x00RRGGBB
static bool gfxOn = false;
static int32_t stale[2][2] = {{0, 0}, {0, 0}};   // per framebuffer, the rows [first, end) it has not got yet
static int back = 0;                              // the framebuffer drawn this frame
static const uint32_t* shown = nullptr;           // the framebuffer on the screen since the last swap
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
// (<Azahar's user directory>/sdmc/zinc.log)
static FILE* logFile = nullptr;
static void out(const char* s, size_t n) {
  svcOutputDebugString(s, (s32)n);
  if (!logFile) logFile = fopen("sdmc:/zinc.log", "w");
  if (logFile) { fwrite(s, 1, n, logFile); fputc('\n', logFile); fflush(logFile); }
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
  for (int32_t x = 0; x < 320 && x < pw; x++)
    for (int32_t y = 0; y < 240 && y < ph; y++) { const uint32_t c = px[(size_t)y * pw + x]; fb[x * 240 + (239 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
  bottomShown = true;
  bottomFb = fb;
}
void hal_win_current(int32_t) {}
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
  gfxSetScreenFormat(GFX_BOTTOM, GSP_RGBA8_OES);
  gfxSetDoubleBuffering(GFX_BOTTOM, true);
  APT_CheckNew3DS(&isNew3ds);
  cstickOn = isNew3ds && irrstInit() == 0;
  rows = (uint32_t*)memalign(64, (size_t)W * H * 4);
  memset(rows, 0, (size_t)W * H * 4);
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
void hal_frame_end(void) {
  audioPump();
  if (!gfxOn) return;
  // stereo: the left eye's frame waits for the right one; both buffers of the eye get every row (the frames alternate)
  const bool want = stereoAsked && slider() > 0;
  if (want != stereoOn) { stereoOn = want; gfxSet3D(want); eye = 0; stale[0][0] = stale[1][0] = 0; stale[0][1] = stale[1][1] = H; }
  if (stereoOn) {
    u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, eye ? GFX_RIGHT : GFX_LEFT, nullptr, nullptr);
    for (int32_t x = 0; x < W; x++)
      for (int32_t y = 0; y < H; y++) { const uint32_t c = rows[(size_t)y * W + x]; fb[x * kScreenH + (kScreenH - 1 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
    if (eye == 0) { shown = fb; eye = 1; return; }   // shown: the left eye's, for a shot
    rightFb = fb;
    eye = 0;
    back ^= 1;   // the mono path's double-buffer parity follows the swaps
    gfxFlushBuffers(); gfxSwapBuffers(); gspWaitForVBlank();
    return;
  }
  // the top screen is double-buffered: the buffer drawn now last got the rows of two frames ago, so it takes every row changed since
  const int b = back;
  back ^= 1;
  u32* fb = (u32*)gfxGetFramebuffer(GFX_TOP, GFX_LEFT, nullptr, nullptr);
  for (int32_t x = 0; x < W && stale[b][1] > stale[b][0]; x++)   // the panel is portrait: a column of the image is a row of the framebuffer, from the bottom
    for (int32_t y = stale[b][0]; y < stale[b][1]; y++) { const uint32_t c = rows[(size_t)y * W + x]; fb[x * kScreenH + (kScreenH - 1 - y)] = (c & 0xFFFFFF) << 8 | 0xFF; }
  stale[b][0] = H; stale[b][1] = 0;
  gfxFlushBuffers(); gfxSwapBuffers(); gspWaitForVBlank();
  shown = fb;
}
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{KEY_DUP, HAL_UP}, {KEY_DDOWN, HAL_DOWN}, {KEY_DLEFT, HAL_LEFT}, {KEY_DRIGHT, HAL_RIGHT}, {KEY_CPAD_UP, HAL_UP},
    {KEY_CPAD_DOWN, HAL_DOWN}, {KEY_CPAD_LEFT, HAL_LEFT}, {KEY_CPAD_RIGHT, HAL_RIGHT}, {KEY_A, HAL_A},
    {KEY_B, HAL_B}, {KEY_X, HAL_X}, {KEY_Y, HAL_Y}, {KEY_L, HAL_L}, {KEY_R, HAL_R}, {KEY_START, HAL_START}, {KEY_SELECT, HAL_SELECT}};
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
  if (budgetOver && frame == ZINC_FRAMES && shown) {   // the last frame of a budget as sdmc:/zinc-shot.ppm (the emulator tests), read back from
    ppm("sdmc:/zinc-shot.ppm", shown, W, H, kScreenH);   // the framebuffer the screen shows (rotated, RGBA8), not from the HAL's own frame
    if (bottomFb) ppm("sdmc:/zinc-shot-bottom.ppm", bottomFb, 320, 240, 240); else remove("sdmc:/zinc-shot-bottom.ppm");   // and the bottom screen
    if (stereoOn && rightFb) ppm("sdmc:/zinc-shot-right.ppm", rightFb, W, H, kScreenH); else remove("sdmc:/zinc-shot-right.ppm");   // the right eye
  }
  in->quit = !aptMainLoop() || budgetOver;
}
void hal_present(const HalFrame* f) {
  if (!rows || f->y1 <= f->y0) return;
  f->render(rows + (size_t)f->y0 * W, f->y0, f->y1);
  for (auto& r : stale) { if (f->y0 < r[0]) r[0] = f->y0; if (f->y1 > r[1]) r[1] = f->y1; }   // both buffers miss these rows
}
void hal_surface_size(int* w, int* h) { *w = W; *h = H; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
