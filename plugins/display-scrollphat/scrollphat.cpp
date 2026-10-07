// Pimoroni Scroll pHAT display driver (plugins/display-scrollphat): 11x5 single-colour LEDs driven by an ISSI
// IS31FL3730 matrix driver at I2C address 0x60. The shared rasterizer renders the frame; each pixel's luminance is
// thresholded to on/off (the chip has one global PWM brightness, no per-LED levels) and the 11 column bytes are sent
// only when they differ from what the chip shows.
//   rpi1/linux: /dev/i2c-1 (i2c-dev, through hw.h);  macos: emulator window with white LED dots (display-ws2812/emu_sdl.h).
// Registers (IS31FL3730 datasheet; Pimoroni's scroll-phat library IS31FL3730.py does the same):
//   0x00 configuration: 0x03 = matrix 1 only, 5x11 mode, audio off, running
//   0x01..0x0B matrix 1 data: one byte per column, bit y = row y
//   0x0C update column register: any write latches the data registers
//   0x19 PWM: 0..127, 128 (bit 7) = full brightness
// Options -> ZP_DISPLAY_SCROLLPHAT_*: address, i2c, brightness (0..255), threshold, invert, rotate (0/180), scale, debug.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define OPT(k) ZP_DISPLAY_SCROLLPHAT_##k
enum { COLS = 11, ROWS = 5 };
static int W, H;                // program surface (11x5 expected; a larger one shows its top-left corner)
static uint32_t* fb;            // W*H rendered pixels
static uint8_t cols[COLS];      // current frame, bit y = row y
static uint8_t shown[COLS];     // what the chip holds
static int frames;
static bool have_shown;

static uint32_t fnv(const uint8_t* p, int n) { uint32_t h = 2166136261u; while (n--) { h ^= *p++; h *= 16777619u; } return h; }
static int pwm() { int b = OPT(BRIGHTNESS); b = b < 0 ? 0 : b > 255 ? 255 : b; return (b * 128 + 127) / 255; }

// ---------- device back ends: open() returns false when there is no device ----------
#if defined(__APPLE__) && !defined(SCROLLPHAT_STUB)
#include "../display-ws2812/emu_sdl.h"
static uint32_t colors[COLS * ROWS];
static bool dev_open() { return emu::open("scroll phat", COLS, ROWS, OPT(SCALE), true); }
static bool dev_write(const uint8_t*, int) { return true; }
static void dev_show() {
  // warm white LEDs; the global brightness dims them (kept visible even at low settings)
  uint32_t v = 160 + (uint32_t)pwm() * 95 / 128, lit = v << 16 | (v * 245 / 255) << 8 | (v * 225 / 255);
  for (int y = 0; y < ROWS; y++)
    for (int x = 0; x < COLS; x++) colors[y * COLS + x] = (shown[x] >> y) & 1 ? lit : 0;
  emu::show(colors, 0x1C1C1C);
  emu::frame();
}
static void dev_close() { emu::close(); }
#else
#include "hw.h"   // i2c-dev on rpi1/linux, a chip model in the simulator (ZN-126)
static zn_i2c* bus;
static bool dev_open() { bus = zn_i2c_open(OPT(I2C), OPT(ADDRESS), -1, -1, 400000); return bus != nullptr; }
static bool dev_write(const uint8_t* p, int n) { return zn_i2c_write(bus, p, n); }
static void dev_show() {}
static void dev_close() {
  if (!bus) return;
  const uint8_t off[] = {0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF};  // blank the LEDs when the program ends
  dev_write(off, sizeof off);
  zn_i2c_close(bus);
  bus = nullptr;
}
#endif

/** Rendered pixel (x, y) of the 11x5 panel -> on/off, with the 180 degree rotation option. */
static bool lit(int x, int y) {
  if (OPT(ROTATE) == 180) { x = COLS - 1 - x; y = ROWS - 1 - y; }
  if (x >= W || y >= H) return false;
  uint32_t c = fb[y * W + x];
  int l = (((c >> 16) & 255) * 77 + ((c >> 8) & 255) * 150 + (c & 255) * 29) >> 8;
  if (OPT(INVERT)) l = 255 - l;
  return l >= OPT(THRESHOLD);
}

static void convert() {
  for (int x = 0; x < COLS; x++) {
    cols[x] = 0;
    for (int y = 0; y < ROWS; y++) if (lit(x, y)) cols[x] |= 1 << y;
  }
}

static bool send() {
  uint8_t b[1 + COLS + 1] = {0x01};  // data registers 0x01..0x0B, then 0x0C (update) in the same auto-incremented write
  memcpy(b + 1, cols, COLS);
  b[1 + COLS] = 0xFF;
  memcpy(shown, cols, COLS);
  have_shown = true;
  return dev_write(b, sizeof b);
}

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height;
  if (W != COLS || H != ROWS) printf("scrollphat: surface %dx%d, the pHAT shows the top-left 11x5\n", W, H);
  fb = (uint32_t*)calloc((size_t)W * H, 4);
  bool dev = dev_open();
  const uint8_t mode[] = {0x00, 0x03}, bright[] = {0x19, (uint8_t)pwm()};
  if (dev) dev = dev_write(mode, 2) && dev_write(bright, 2);
  if (!dev) {
    if (!OPT(DEBUG)) { printf("scrollphat: no IS31FL3730 at 0x%02x on %s, display driver disabled\n", OPT(ADDRESS), OPT(I2C)); return 0; }
    printf("scrollphat: no device, frames are only checksummed (debug)\n");
  }
  printf("scrollphat: 11x5, brightness %d/128\n", pwm());
  return 1;
}

static void present(const HalFrame* f) {
  if (f->y1 <= f->y0 || f->x1 <= f->x0) { dev_show(); return; }
  f->render(fb + (size_t)f->y0 * W, f->y0, f->y1);
  convert();
  if (have_shown && !memcmp(cols, shown, COLS)) { dev_show(); return; }  // the damage did not change a LED
  send();
  dev_show();
  frames++;
  if (OPT(DEBUG)) printf("scrollphat: frame %d crc %08x\n", frames, (unsigned)fnv(shown, COLS));
}

static void shutdown() { dev_close(); }

static HalDisplay drv = {init, present, nullptr, shutdown, 0, 0};
static int reg = (hal_display = &drv, 0);
