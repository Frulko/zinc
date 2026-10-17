// PlayStation 2 HAL (EE, ps2sdk + newlib): TTY text output, heap, clock, pads through libpad (rom0:PADMAN), and the
// shared software rasterizer shown with gsKit: damaged rows are rendered into a CT32 texture in RAM, the texture
// manager uploads it when it changed, and a textured sprite fills the double-buffered, vsynced framebuffer.
#include "hal.h"
#ifdef ZN_CONSOLE_PLATFORM
#include "console_pad.h"   // Zinc Next's console core: the built-in pad session, the stick as the d-pad
#include "console_audio.h"  // zinc:audio's mix (ZN-759)
#include <string.h>
#include <libmc.h>
#include <sys/stat.h>
#include <audsrv.h>
#include <sbv_patches.h>
#endif
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

#ifdef ZN_CONSOLE_PLATFORM
// ZN-759: the DualShock 2 as zinc:gfx gamepad 0 (both sticks, the pressure of each button, both motors), zinc:audio through audsrv (SPU2) and
// zinc:storage on the memory card in slot 1.
extern "C" { extern unsigned char libsd_irx[], audsrv_irx[]; extern unsigned int size_libsd_irx, size_audsrv_irx; }   // ps2.cmake: bin2c of ps2sdk's IRX
static int padSetup = 0;          // 0 analog mode asked next, 1 pressure mode, 2 the motors, 3 ready
static bool motors = false, pressure = false;
static int rumbleLeft = 0;        // frames until the motors stop
static bool cardOk = false;
static int cardState = 0;   // libmc: 0 no card, 1 a card not formatted, 2 formatted
static void consolePad(int st, const padButtonStatus& b, HalInput* in) {
  if (st == PAD_STATE_STABLE) {   // each request of libpad waits for the pad to be stable again
    if (padSetup == 0) { if (padSetMainMode(0, 0, PAD_MMODE_DUALSHOCK, PAD_MMODE_LOCK) == 1) padSetup = 1; }
    else if (padSetup == 1) { pressure = padInfoPressMode(0, 0) == 1 && padEnterPressMode(0, 0) == 1; padSetup = 2; }
    else if (padSetup == 2) {
      if (padInfoAct(0, 0, -1, 0) > 0) { const char align[6] = {0, 1, (char)0xff, (char)0xff, (char)0xff, (char)0xff}; motors = padSetActAlign(0, 0, align) == 1; }
      padSetup = 3;
    }
  }
  const bool analog = (b.mode >> 4) == 0x7;
  if (analog) in->buttons |= zn_console_stick(b.ljoy_h, b.ljoy_v);
  // W3C order: CROSS CIRCLE SQUARE TRIANGLE, L1 R1, L2 R2 (the triggers), SELECT START, L3 R3, the d-pad
  static const uint16_t w3c[][2] = {{PAD_CROSS, 0}, {PAD_CIRCLE, 1}, {PAD_SQUARE, 2}, {PAD_TRIANGLE, 3}, {PAD_L1, 4}, {PAD_R1, 5}, {PAD_L2, 6}, {PAD_R2, 7},
    {PAD_SELECT, 8}, {PAD_START, 9}, {PAD_L3, 10}, {PAD_R3, 11}, {PAD_UP, 12}, {PAD_DOWN, 13}, {PAD_LEFT, 14}, {PAD_RIGHT, 15}};
  HalGamepad& g = in->pad[0];
  if (g.rumble_ms > 0 && motors) {   // low: the big motor's strength, high: the small one (on or off)
    const char act[6] = {(char)(g.rumble_high > 0.5f ? 1 : 0), (char)(g.rumble_low * 255), 0, 0, 0, 0};
    padSetActDirect(0, 0, act);
    rumbleLeft = g.rumble_ms * 60 / 1000 + 1;
  } else if (rumbleLeft > 0 && --rumbleLeft == 0 && motors) { const char off[6] = {0, 0, 0, 0, 0, 0}; padSetActDirect(0, 0, off); }
  g.connected = 1;
  strcpy(g.name, analog ? "DualShock 2" : "PS2 pad (digital)");
  g.buttons = 0;
  for (auto& m : w3c) if (!(b.btns & m[0])) g.buttons |= 1u << m[1];
  g.axes[0] = analog ? (b.ljoy_h - 128) / 127.0f : 0; g.axes[1] = analog ? (b.ljoy_v - 128) / 127.0f : 0;
  g.axes[2] = analog ? (b.rjoy_h - 128) / 127.0f : 0; g.axes[3] = analog ? (b.rjoy_v - 128) / 127.0f : 0;
  for (float& v : g.value) v = 0;
  if (pressure && analog) {   // how hard each button is pressed, 0..255
    const unsigned char p[][2] = {{b.cross_p, 0}, {b.circle_p, 1}, {b.square_p, 2}, {b.triangle_p, 3}, {b.l1_p, 4}, {b.r1_p, 5}, {b.l2_p, 6}, {b.r2_p, 7},
      {b.up_p, 12}, {b.down_p, 13}, {b.left_p, 14}, {b.right_p, 15}};
    for (auto& x : p) g.value[x[1]] = x[0] / 255.0f;
  }
  g.trigger[0] = pressure && analog ? b.l2_p / 255.0f : (g.buttons >> 6 & 1); g.trigger[1] = pressure && analog ? b.r2_p / 255.0f : (g.buttons >> 7 & 1);
  g.rumble_ms = 0;
}
// sound: audsrv on the IOP (the SPU2), 48 kHz stereo, kept three blocks ahead from the end of each frame
static void audioPump() {
  static int state = 0;   // 0 not opened, 1 playing, -1 failed
  static int16_t block[1024 * 2] __attribute__((aligned(64)));
  if (!zn_console_audio_rate() || state < 0) return;
  if (state == 0) {
    int r = 0;
    state = -1;
    sbv_patch_enable_lmb();   // a retail BIOS loads IOP modules from EE memory only once patched
    if (SifExecModuleBuffer(libsd_irx, size_libsd_irx, 0, nullptr, &r) < 0 || SifExecModuleBuffer(audsrv_irx, size_audsrv_irx, 0, nullptr, &r) < 0) return;
    if (audsrv_init() != 0) return;
    audsrv_fmt_t fmt = {48000, 16, 2};
    if (audsrv_set_format(&fmt) != 0) return;
    audsrv_set_volume(MAX_VOLUME);
    state = 1;
  }
  while (audsrv_queued() < (int)sizeof block * 3 && audsrv_available() >= (int)sizeof block) {
    zn_console_audio_render(block, 1024);
    audsrv_play_audio((const char*)block, sizeof block);
  }
}
extern "C" {
int zn_console_audio_output(void) { return 1; }
// the memory card in slot 1: mc0:/ZINC/, where zinc:storage keeps storage.kv (rom0:MCMAN and MCSERV, through the IOP's file system)
const char* zn_console_data_dir(void) { return cardOk ? "mc0:/ZINC/" : ""; }
const char* hal_device(const char* q, const char*) {
  if (!strcmp(q, "storage")) return cardOk ? "mc0:/ZINC/storage.kv (memory card, slot 1)" : cardState == 1 ? "the memory card in slot 1 is not formatted (the PS2's browser formats it): storage.kv where the ELF runs" : "no memory card in slot 1: storage.kv where the ELF runs";
  return nullptr;
}
}
#endif

extern "C" {
void hal_init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  SifInitRpc(0);
  pad_ok = SifLoadModule("rom0:SIO2MAN", 0, nullptr) >= 0 && SifLoadModule("rom0:PADMAN", 0, nullptr) >= 0 &&
           padInit(0) == 1 && padPortOpen(0, 0, pad_buf) != 0;
#ifdef ZN_CONSOLE_PLATFORM
  if (SifLoadModule("rom0:MCMAN", 0, nullptr) >= 0 && SifLoadModule("rom0:MCSERV", 0, nullptr) >= 0) {
    // the card in slot 1: present, formatted? An unformatted card holds nothing: ZINC_FORMAT_CARD=1 (an emulator test's fresh card) formats it,
    // a person formats theirs in the PS2's browser
    int type = 0, free = 0, format = 0, r = -1;
    if (mcInit(MC_TYPE_MC) >= 0 && mcGetInfo(0, 0, &type, &free, &format) == 0) { mcSync(0, nullptr, &r); cardState = r >= -2 && type == 2 ? (format ? 2 : 1) : 0; }
    const char* fmt = getenv("ZINC_FORMAT_CARD");
    if (cardState == 1 && fmt && *fmt == '1' && mcFormat(0, 0) == 0) { mcSync(0, nullptr, &r); if (r == 0) cardState = 2; }
    mkdir("mc0:/ZINC", 0777);   // a card answers when its folder holds the store, or a new one can be made there (never truncating one)
    FILE* f = fopen("mc0:/ZINC/storage.kv", "rb");
    if (!f) f = fopen("mc0:/ZINC/storage.kv", "wb");
    cardOk = f != nullptr;
    if (f) fclose(f);
  }
#endif
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
  if (ZINC_FRAMES) atexit([] { for (;;) SleepThread(); });   // a frame budget (the emulator tests): the last frame stays on the screen for the emulator's shot instead of the BIOS
}
void hal_shutdown(void) { if (pad_ok) padPortClose(0, 0); }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)clock() * 1000000u / CLOCKS_PER_SEC; }
void hal_sleep_us(uint64_t us) { uint64_t end = hal_time_us() + us; while (hal_time_us() < end) {} }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char* name) { return getenv(name); }
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  fflush(stdout);
  SleepThread();
  for (;;) {}
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {
#ifdef ZN_CONSOLE_PLATFORM
  audioPump();
#endif
  if (!gs) return;
  if (dirty) { gsKit_TexManager_invalidate(gs, &tex); dirty = false; }
  gsKit_TexManager_bind(gs, &tex);
  // the frame in the middle of the screen (a PAL console shows 640x512: the rows around a 448-row frame are cleared, not old video memory)
  const float x = (float)((gs->Width - W) / 2), y = (float)((gs->Height - H) / 2);
  if (gs->Width != W || gs->Height != H) gsKit_clear(gs, GS_SETREG_RGBAQ(0, 0, 0, 0x80, 0));
  gsKit_prim_sprite_texture(gs, &tex, x, y, 0, 0, x + W, y + H, W, H, 1, GS_SETREG_RGBAQ(0x80, 0x80, 0x80, 0x80, 0));
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
#ifdef ZN_CONSOLE_PLATFORM
  in->pad[0].buttons = 0;   // a frame the pad does not answer (while it starts) holds nothing, scripted buttons included
#endif
  if ((st == PAD_STATE_STABLE || st == PAD_STATE_FINDCTP1) && padRead(0, 0, &b)) {
    for (auto& m : map) if (!(b.btns & m[0])) in->buttons |= m[1];  // active low
#ifdef ZN_CONSOLE_PLATFORM
    consolePad(st, b, in);   // analog mode, pressure, motors, gamepad 0
#endif
  }
  const int32_t frame = frames++;
#ifdef ZN_CONSOLE_PLATFORM
  const uint32_t scripted = zn_console_script(frame);
  in->buttons |= scripted;
  in->pad[0].buttons |= zn_console_w3c(scripted);
  if (scripted) in->pad[0].connected = 1;
#endif
  in->px = in->py = 0; in->pdown = 0;
  in->quit = ZINC_FRAMES && frame >= ZINC_FRAMES;
  if (in->quit && frame == ZINC_FRAMES && gs) {   // the last frame of a budget as host:zinc-shot.ppm (Play!: its vfs/host directory): no emulator screenshot option
    if (FILE* f = fopen("host:zinc-shot.ppm", "wb")) {
      fprintf(f, "P6\n%d %d\n255\n", (int)W, (int)H);
      for (int32_t i = 0; i < W * H; i++) { const u32 c = tex.Mem[i]; const unsigned char p[3] = {(unsigned char)c, (unsigned char)(c >> 8), (unsigned char)(c >> 16)}; fwrite(p, 1, 3, f); }
      fclose(f);
    }
  }
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
