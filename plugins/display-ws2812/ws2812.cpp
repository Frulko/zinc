// WS2812 / NeoPixel matrix display driver (plugins/display-ws2812). The shared rasterizer renders the damaged rows
// (0x00RRGGBB); the frame is mapped to LED order (wiring, origin corner, rotation), brightness-capped, gamma-corrected
// and pushed only when something changed.
//   esp32: RMT TX channel + bytes encoder (no managed component needed), one data pin;
//   linux/rpi1: SPI at 2.4 MHz on /dev/spidev0.0, 3 SPI bits per WS2812 bit (MOSI = data);
//   macos: emulator window with round LED dots (emu_sdl.h).
// Options: plugin.json (defaults) and zinc.json "display": { "driver": "ws2812", ... } -> ZP_DISPLAY_WS2812_*.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define OPT(k) ZP_DISPLAY_WS2812_##k
static int W, H, N;                  // matrix size (the program surface), LED count
static uint32_t* fb;                 // W*H rendered pixels
static uint8_t* leds;                // N*3 bytes in wire order
static uint8_t lut[256];             // gamma + brightness
static int pos[3];                   // byte position of R, G, B in the wire order
static int frames;

// Logical (x, y) -> LED index along the data chain.
static int led_index(int x, int y) {
  int pw = W, ph = H, rot = ((OPT(ROTATE) / 90) % 4 + 4) % 4, t;
  for (int i = 0; i < rot; i++) { t = x; x = ph - 1 - y; y = t; t = pw; pw = ph; ph = t; }  // 90 deg clockwise steps
  const char* o = OPT(ORIGIN);
  if (strstr(o, "right")) x = pw - 1 - x;
  if (strstr(o, "bottom")) y = ph - 1 - y;
  int line = OPT(VERTICAL) ? x : y, p = OPT(VERTICAL) ? y : x, len = OPT(VERTICAL) ? ph : pw;
  if (OPT(SERPENTINE) && (line & 1)) p = len - 1 - p;
  return line * len + p;
}

static uint32_t fnv(const uint8_t* p, int n) { uint32_t h = 2166136261u; while (n--) { h ^= *p++; h *= 16777619u; } return h; }

// ---------- device back ends: open() returns false when there is no device ----------
#if defined(ESP_PLATFORM)
#include "driver/rmt_tx.h"
#include "driver/rmt_encoder.h"
static rmt_channel_handle_t chan;
static rmt_encoder_handle_t enc;
static bool dev_open() {
  rmt_tx_channel_config_t cc = {};
  cc.gpio_num = (gpio_num_t)OPT(PIN); cc.clk_src = RMT_CLK_SRC_DEFAULT; cc.resolution_hz = 10000000;  // 0.1 us ticks
  cc.mem_block_symbols = 64; cc.trans_queue_depth = 1;
  rmt_bytes_encoder_config_t ec = {};
  ec.bit0 = {4, 1, 8, 0};  // 0: 0.4 us high, 0.8 us low
  ec.bit1 = {8, 1, 4, 0};  // 1: 0.8 us high, 0.4 us low
  ec.flags.msb_first = 1;
  if (rmt_new_tx_channel(&cc, &chan) != ESP_OK || rmt_new_bytes_encoder(&ec, &enc) != ESP_OK || rmt_enable(chan) != ESP_OK) return false;
  return true;
}
// the line idles low between frames: that is the >280 us reset latch, no reset symbol needed
static void dev_push(const uint8_t* p, int n) {
  if (!chan) return;
  if (rmt_tx_wait_all_done(chan, 100) != ESP_OK) {  // the previous frame owns the buffer until then; QEMU never finishes
    printf("ws2812: RMT stalled, LED output stopped\n");
    chan = nullptr;
    return;
  }
  static uint8_t* tx; if (!tx) tx = (uint8_t*)malloc(n);
  memcpy(tx, p, n);
  rmt_transmit_config_t tc = {};
  rmt_transmit(chan, enc, tx, n, &tc);
}
static void dev_close() { if (chan) { rmt_tx_wait_all_done(chan, 100); rmt_disable(chan); } }
static void dev_idle() {}
#elif defined(__APPLE__) && !defined(WS2812_STUB)
#include "emu_sdl.h"
static bool dev_open() { return emu::open("ws2812 matrix", W, H, OPT(SCALE), true); }
static void dev_push(const uint8_t*, int) { emu::show(fb, 0x161616); emu::frame(); }
static void dev_idle() { emu::frame(); }  // vsync paces the loop
static void dev_close() { emu::close(); }
#else
#include "hw.h"   // linux spidev, or a chip model in the simulator (ZN-126)
static zn_spi* spi;
static uint8_t* bits;  // 9 SPI bytes per LED + reset gap
static bool dev_open() {
  spi = zn_spi_open(OPT(SPIDEV), 2400000, 0);
  if (!spi) return false;
  bits = (uint8_t*)calloc((size_t)N * 9 + 96, 1);
  return true;
}
static void dev_push(const uint8_t* p, int n) {
  if (!spi) return;
  uint8_t* o = bits;
  for (int i = 0; i < n; i++) {  // each data bit -> 1x0 pattern (0 = 100, 1 = 110), 24 SPI bits per byte
    uint32_t v = 0;
    for (int b = 7; b >= 0; b--) v = v << 3 | ((p[i] >> b) & 1 ? 6u : 4u);
    *o++ = v >> 16; *o++ = v >> 8; *o++ = v;
  }
  if (!zn_spi_write(spi, bits, n * 3 + 96)) perror("ws2812: spi write");  // trailing zeros = reset latch
}
static void dev_idle() {}
static void dev_close() { zn_spi_close(spi); spi = nullptr; }
#endif

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height; N = W * H;
  fb = (uint32_t*)calloc((size_t)N, 4);
  leds = (uint8_t*)calloc((size_t)N, 3);
  for (int i = 0; i < 256; i++) lut[i] = (uint8_t)lrintf(powf(i / 255.f, (float)OPT(GAMMA)) * OPT(BRIGHTNESS));
  for (int k = 0; k < 3; k++) { const char* c = strchr(OPT(ORDER), "RGB"[k]); pos[k] = c ? (int)(c - OPT(ORDER)) % 3 : k; }
  if (!dev_open()) {
    if (!OPT(DEBUG)) { printf("ws2812: no device, display driver disabled\n"); return 0; }
    printf("ws2812: no device, frames are only checksummed (debug)\n");
  }
  printf("ws2812: %dx%d matrix, %d LEDs\n", W, H, N);
  return 1;
}

static void present(const HalFrame* f) {
  if (f->y1 <= f->y0 || f->x1 <= f->x0) { dev_idle(); return; }  // nothing changed: nothing to send
  f->render(fb + (size_t)f->y0 * W, f->y0, f->y1);
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++) {
      uint32_t c = fb[y * W + x];
      uint8_t* o = leds + led_index(x, y) * 3;
      o[pos[0]] = lut[(c >> 16) & 255]; o[pos[1]] = lut[(c >> 8) & 255]; o[pos[2]] = lut[c & 255];
    }
  dev_push(leds, N * 3);
  frames++;
  if (OPT(DEBUG)) printf("ws2812: frame %d crc %08x\n", frames, (unsigned)fnv(leds, N * 3));
}

// ESP32 HAL stops after its QEMU frame budget; a real matrix runs forever unless debug is on.
static void poll(HalInput* in) {
#ifdef ESP_PLATFORM
  if (!OPT(DEBUG)) in->quit = 0;
#else
  (void)in;
#endif
}

static void shutdown() { dev_close(); }

static HalDisplay drv = {init, present, poll, shutdown, 0, 0};
static int reg = (hal_display = &drv, 0);
