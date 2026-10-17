// PS Vita HAL (VitaSDK + newlib; the console core of next/targets/console, ZN-455/ZN-457): text through sceClibPrintf (Vita3K logs it), the process
// clock, the pad, and the shared software rasterizer shown in one 32-bit framebuffer in CDRAM (960x544), flipped at vblank. The first, simple path:
// band threads on the three user cores and the GXM replay come later (docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 3.4).
#include "hal.h"
#include "console_pad.h"
#include "console_audio.h"
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
#include <psp2/audioout.h>
#include <psp2/camera.h>
#include <psp2/motion.h>
#include <psp2/net/net.h>
#include <psp2/net/netctl.h>
#include <psp2/sysmodule.h>
#include <psp2/touch.h>
#include <psp2/appmgr.h>
#include <psp2/io/stat.h>

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

// Sound (ZN-759): zinc:audio's mix at 48 kHz, rendered on the program's thread at the end of each frame into a ring that a thread plays through a
// BGM port of 1024 frames, blocking.
static const uint32_t kAudioBlock = 1024;
static int16_t audioBuf[8192 * 2];
static ZnAudioRing ring = {audioBuf, 8192, 0, 0};
static int audioThread(SceSize, void*) {
  static int16_t block[kAudioBlock * 2];
  const int port = sceAudioOutOpenPort(SCE_AUDIO_OUT_PORT_TYPE_BGM, kAudioBlock, 48000, SCE_AUDIO_OUT_MODE_STEREO);
  if (port < 0) return 0;
  for (;;) { ring.take(block, kAudioBlock); sceAudioOutOutput(port, block); }
}
static void audioPump() {
  static bool running = false;
  if (!zn_console_audio_rate()) return;
  if (!running) {
    running = true;
    const SceUID t = sceKernelCreateThread("zinc audio", audioThread, 0x40, 0x4000, 0, 0, nullptr);
    if (t >= 0) sceKernelStartThread(t, 0, nullptr);
  }
  ring.fill(kAudioBlock, 3 * kAudioBlock);
}

// The touch panels (ZN-759): the front one is zinc:gfx's touch points and pointer, the rear one zinc:hardware rearTouches(); both mapped from their
// active area onto the program's surface.
static SceTouchPanelInfo panel[2];
static char rearJson[512] = "[]";
static void touchTo(int port, const SceTouchReport& r, float* x, float* y) {
  const SceTouchPanelInfo& i = panel[port];
  const float w = (float)(i.maxAaX - i.minAaX), h = (float)(i.maxAaY - i.minAaY);
  *x = w > 0 ? (r.x - i.minAaX) / w * W : r.x / 1920.0f * W;
  *y = h > 0 ? (r.y - i.minAaY) / h * H : r.y / 1088.0f * H;
}
// the network: Wi-Fi through SceNetCtl once the net module is loaded (on the first query)
static bool netUp() {
  static int state = 0;   // 0 not tried, 1 up, -1 failed
  if (state) return state > 0;
  state = -1;
  if (sceSysmoduleLoadModule(SCE_SYSMODULE_NET) < 0) return false;
  static char mem[256 * 1024];
  SceNetInitParam param = {mem, (int)sizeof mem, 0};
  const int r = sceNetInit(&param);
  if (r < 0 && r != (int)0x80410110) return false;   // SCE_NET_ERROR_EBUSY: already started
  if (sceNetCtlInit() < 0) return false;
  state = 1;
  return true;
}
static int64_t rumbleUntil = 0;

extern "C" {
// the app's writable folder (app0: is read-only): ux0:data/<title id>/, made on first use; zinc:storage and zinc:fs's relative paths land there
const char* zn_console_data_dir(void) {
  static char dir[64] = "";
  if (!dir[0]) {
    char id[16] = "";
    if (sceAppMgrAppParamGetString(0, 12, id, sizeof id) < 0 || !id[0]) strcpy(id, "ZINC");
    snprintf(dir, sizeof dir, "ux0:data/%s", id);
    sceIoMkdir(dir, 0777);
    strcat(dir, "/");
  }
  return dir;
}
int zn_console_audio_output(void) { return 1; }
// zinc:sys device() (ZN-759, zinc:hardware): battery, Wi-Fi, the accelerometer and gyroscope (sceMotion), the rear touch pad, the cameras
const char* hal_device(const char* q, const char*) {
  static char out[256];
  if (!strcmp(q, "battery")) {
    const int pct = scePowerGetBatteryLifePercent();
    snprintf(out, sizeof out, "{\"level\":%.2f,\"charging\":%s,\"source\":\"%s\"}", pct < 0 ? 1.0 : pct / 100.0, scePowerIsBatteryCharging() ? "true" : "false",
             scePowerIsPowerOnline() ? "usb" : "none");
    return out;
  }
  if (!strcmp(q, "network")) {
    int st = 0;
    if (!netUp() || sceNetCtlInetGetState(&st) < 0) return "{\"online\":false,\"type\":\"none\"}";
    SceNetCtlInfo info;
    memset(&info, 0, sizeof info);
    const bool on = st == SCE_NETCTL_STATE_CONNECTED;
    if (on) sceNetCtlInetGetInfo(SCE_NETCTL_INFO_GET_SSID, &info);
    snprintf(out, sizeof out, "{\"online\":%s,\"type\":\"wifi\",\"ssid\":\"%s\"}", on ? "true" : "false", on ? info.ssid : "");
    return out;
  }
  if (!strcmp(q, "motion") || !strcmp(q, "gyro")) {
    static bool started = false;
    if (!started) { started = true; sceMotionStartSampling(); }
    SceMotionSensorState m;
    memset(&m, 0, sizeof m);
    if (sceMotionGetSensorState(&m, 1) < 0) return nullptr;
    // the accelerometer reads in g with gravity pointing down (flat, face up: z -1); the web's sign (z +9.81 flat face up) and m/s²; the gyro in rad/s
    if (q[0] == 'm') snprintf(out, sizeof out, "{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f}", -m.accelerometer.x * 9.80665f, -m.accelerometer.y * 9.80665f, -m.accelerometer.z * 9.80665f);
    else snprintf(out, sizeof out, "{\"x\":%.2f,\"y\":%.2f,\"z\":%.2f}", m.gyro.x * 57.29578f, m.gyro.y * 57.29578f, m.gyro.z * 57.29578f);
    return out;
  }
  if (!strcmp(q, "reartouch")) return rearJson;
  if (!strcmp(q, "cameras")) {   // which cameras open (Vita3K may give none)
    static char cams[96] = "";
    if (!cams[0]) {
      bool ok[2];
      for (int d = 0; d < 2; d++) {
        SceCameraInfo info;
        memset(&info, 0, sizeof info);
        info.size = sizeof info; info.priority = SCE_CAMERA_PRIORITY_SHARE; info.format = SCE_CAMERA_FORMAT_ABGR; info.resolution = SCE_CAMERA_RESOLUTION_160_120;
        info.framerate = SCE_CAMERA_FRAMERATE_30_FPS; info.range = 1;
        ok[d] = sceCameraOpen(d, &info) >= 0;
        if (ok[d]) sceCameraClose(d);
      }
      snprintf(cams, sizeof cams, "{\"front\":%s,\"back\":%s}", ok[0] ? "true" : "false", ok[1] ? "true" : "false");
    }
    return cams;
  }
  return nullptr;
}
void zn_console_echo(const char* s, size_t n) { out(s, n); }   // the program's lines: newlib's stdout goes to tty0:, which Vita3K does not show
void hal_init(const HalConfig* cfg) {
  W = cfg->width < kScreenW ? cfg->width : kScreenW;
  H = cfg->height < kScreenH ? cfg->height : kScreenH;
  sceCtrlSetSamplingMode(SCE_CTRL_MODE_ANALOG);
  for (int port = 0; port < 2; port++) { sceTouchSetSamplingState(port, SCE_TOUCH_SAMPLING_STATE_START); sceTouchGetPanelInfo(port, &panel[port]); }
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
void hal_frame_end(void) { audioPump(); sceDisplayWaitVblankStart(); }
void hal_poll_input(HalInput* in) {
  static const uint32_t map[][2] = {{SCE_CTRL_UP, HAL_UP}, {SCE_CTRL_DOWN, HAL_DOWN}, {SCE_CTRL_LEFT, HAL_LEFT}, {SCE_CTRL_RIGHT, HAL_RIGHT},
    {SCE_CTRL_CROSS, HAL_A}, {SCE_CTRL_CIRCLE, HAL_B}, {SCE_CTRL_SQUARE, HAL_X}, {SCE_CTRL_TRIANGLE, HAL_Y}, {SCE_CTRL_LTRIGGER, HAL_L},
    {SCE_CTRL_RTRIGGER, HAL_R}, {SCE_CTRL_START, HAL_START}, {SCE_CTRL_SELECT, HAL_SELECT}};
  SceCtrlData pad;
  memset(&pad, 0, sizeof pad);
  pad.lx = pad.ly = pad.rx = pad.ry = 128;
  in->buttons = 0;
  if (sceCtrlPeekBufferPositive(0, &pad, 1) > 0) {
    for (auto& m : map) if (pad.buttons & m[0]) in->buttons |= m[1];
    in->buttons |= zn_console_stick(pad.lx, pad.ly);
  }
  // the Vita's pad as gamepad 0 (W3C order): both sticks; a motor only on a PS TV with a DualShock 3 (port 1), asked with sceCtrlSetActuator
  static const uint32_t w3c[][2] = {{SCE_CTRL_CROSS, 0}, {SCE_CTRL_CIRCLE, 1}, {SCE_CTRL_SQUARE, 2}, {SCE_CTRL_TRIANGLE, 3}, {SCE_CTRL_LTRIGGER, 4},
    {SCE_CTRL_RTRIGGER, 5}, {SCE_CTRL_SELECT, 8}, {SCE_CTRL_START, 9}, {SCE_CTRL_UP, 12}, {SCE_CTRL_DOWN, 13}, {SCE_CTRL_LEFT, 14}, {SCE_CTRL_RIGHT, 15}};
  HalGamepad& g = in->pad[0];
  const int64_t now = (int64_t)sceKernelGetProcessTimeWide();
  if (g.rumble_ms > 0) {
    SceCtrlActuator a;
    memset(&a, 0, sizeof a);
    a.small = g.rumble_high > 0 ? 255 : 0; a.large = (unsigned char)(g.rumble_low * 255);
    sceCtrlSetActuator(1, &a);
    rumbleUntil = now + (int64_t)g.rumble_ms * 1000;
  } else if (rumbleUntil && now >= rumbleUntil) { SceCtrlActuator a; memset(&a, 0, sizeof a); sceCtrlSetActuator(1, &a); rumbleUntil = 0; }
  g.connected = 1;
  strcpy(g.name, "PS Vita");
  g.buttons = 0;
  for (auto& m : w3c) if (pad.buttons & m[0]) g.buttons |= 1u << m[1];
  g.axes[0] = (pad.lx - 128) / 127.0f; g.axes[1] = (pad.ly - 128) / 127.0f; g.axes[2] = (pad.rx - 128) / 127.0f; g.axes[3] = (pad.ry - 128) / 127.0f;
  g.rumble_ms = 0;
  const uint32_t scripted = zn_console_script(frames);
  in->buttons |= scripted;
  g.buttons |= zn_console_w3c(scripted);
  // the front panel: touch points, the first one the pointer; the rear one: zinc:hardware's fingers
  in->px = in->py = 0; in->pdown = 0;
  SceTouchData t;
  memset(&t, 0, sizeof t);
  in->ntouch = 0;
  if (sceTouchPeek(SCE_TOUCH_PORT_FRONT, &t, 1) > 0)
    for (uint32_t i = 0; i < t.reportNum && in->ntouch < HAL_MAX_TOUCH; i++) {
      HalTouch& h = in->touch[in->ntouch++];
      h.id = t.report[i].id;
      touchTo(0, t.report[i], &h.x, &h.y);
    }
  if (in->ntouch) { in->px = in->touch[0].x; in->py = in->touch[0].y; in->pdown = 1; }
  memset(&t, 0, sizeof t);
  size_t at = 0;
  at += (size_t)snprintf(rearJson, sizeof rearJson, "[");
  if (sceTouchPeek(SCE_TOUCH_PORT_BACK, &t, 1) > 0)
    for (uint32_t i = 0; i < t.reportNum && at < sizeof rearJson - 40; i++) {
      float x, y;
      touchTo(1, t.report[i], &x, &y);
      at += (size_t)snprintf(rearJson + at, sizeof rearJson - at, "%s[%.0f,%.0f,%d]", i ? "," : "", x, y, (int)t.report[i].id);
    }
  snprintf(rearJson + at, sizeof rearJson - at, "]");
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
