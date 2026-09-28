// SSD1306 I2C OLED display driver (plugins/display-ssd1306), 128x64 or 128x32. The shared rasterizer renders one
// 8-row page at a time; pixels become 1 bit (threshold, 4x4 Bayer or Floyd-Steinberg dithering) and only the changed
// column span of each changed page is sent.
//   esp32: i2c_master driver;  linux/rpi1: /dev/i2c-1 (i2c-dev);  macos: emulator window (square pixels).
// Options -> ZP_DISPLAY_SSD1306_*: address, sda, scl, freq, i2c, dither, threshold, invert, flip, contrast, scale, debug.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define OPT(k) ZP_DISPLAY_SSD1306_##k
static int W, H, P;          // width, height, pages
static uint32_t* band;       // W x 8 rendered pixels
static uint8_t* shown;       // W*P bytes last sent (page-major, bit 0 = top row), what the panel holds
static uint8_t* next;        // W*P bytes of the current frame
static int16_t* err;         // Floyd-Steinberg: error of the current and next row (2 x (W+2))
static int mode;             // 0 threshold, 1 bayer, 2 fs
static int frames;

static uint32_t fnv(const uint8_t* p, int n) { uint32_t h = 2166136261u; while (n--) { h ^= *p++; h *= 16777619u; } return h; }

// ---------- device back ends ----------
#if defined(ESP_PLATFORM)
#include "driver/i2c_master.h"
static i2c_master_dev_handle_t dev;
static bool dev_open() {
  i2c_master_bus_config_t bc = {};
  bc.i2c_port = -1; bc.sda_io_num = (gpio_num_t)OPT(SDA); bc.scl_io_num = (gpio_num_t)OPT(SCL);
  bc.clk_source = I2C_CLK_SRC_DEFAULT; bc.glitch_ignore_cnt = 7; bc.flags.enable_internal_pullup = 1;
  i2c_master_bus_handle_t bus;
  if (i2c_new_master_bus(&bc, &bus) != ESP_OK || i2c_master_probe(bus, OPT(ADDRESS), 50) != ESP_OK) return false;
  i2c_device_config_t dc = {};
  dc.dev_addr_length = I2C_ADDR_BIT_LEN_7; dc.device_address = OPT(ADDRESS); dc.scl_speed_hz = OPT(FREQ);
  return i2c_master_bus_add_device(bus, &dc, &dev) == ESP_OK;
}
static bool dev_write(const uint8_t* p, int n) { return dev && i2c_master_transmit(dev, p, n, 100) == ESP_OK; }
static void dev_show() {}
static void dev_close() {}
#elif defined(__APPLE__)
#include "../display-ws2812/emu_sdl.h"
static uint32_t* colors;
static bool dev_open() { colors = (uint32_t*)calloc((size_t)W * H, 4); return emu::open("ssd1306 oled", W, H, OPT(SCALE), false); }
static bool dev_write(const uint8_t*, int) { return true; }
static void dev_show() {
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++) colors[y * W + x] = (shown[(y >> 3) * W + x] >> (y & 7)) & 1 ? 0xDFF3FF : 0;
  emu::show(colors, 0x0A0A0A);
  emu::frame();
}
static void dev_close() { emu::close(); }
#elif defined(__linux__)
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>
static int fd = -1;
static bool dev_open() {
  fd = open(OPT(I2C), O_RDWR);
  return fd >= 0 && ioctl(fd, I2C_SLAVE, OPT(ADDRESS)) >= 0;
}
static bool dev_write(const uint8_t* p, int n) { return fd >= 0 && write(fd, p, n) == n; }
static void dev_show() {}
static void dev_close() { if (fd >= 0) close(fd); }
#else
static bool dev_open() { return false; }
static bool dev_write(const uint8_t*, int) { return false; }
static void dev_show() {}
static void dev_close() {}
#endif

static bool cmds(const uint8_t* c, int n) {  // control byte 0x00: command stream
  uint8_t b[32] = {0};
  memcpy(b + 1, c, n);
  return dev_write(b, n + 1);
}

// Luminance (0..255) of a rendered pixel -> 1 bit.
static const uint8_t BAYER[16] = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};
static void convert_page(int p) {
  uint8_t* out = next + p * W;
  memset(out, 0, W);
  int16_t *cur = err, *nxt = err + W + 2;
  for (int r = 0; r < 8 && p * 8 + r < H; r++) {
    int y = p * 8 + r;
    for (int x = 0; x < W; x++) {
      uint32_t c = band[r * W + x];
      int l = (((c >> 16) & 255) * 77 + ((c >> 8) & 255) * 150 + (c & 255) * 29) >> 8;
      if (OPT(INVERT)) l = 255 - l;
      bool on;
      if (mode == 2) {
        int v = l + cur[x + 1];
        on = v >= 128;
        int e = v - (on ? 255 : 0);
        cur[x + 2] += e * 7 / 16; nxt[x] += e * 3 / 16; nxt[x + 1] += e * 5 / 16; nxt[x + 2] += e / 16;
      } else {
        on = mode == 1 ? l > BAYER[(y & 3) * 4 + (x & 3)] * 16 + 8 : l >= OPT(THRESHOLD);
      }
      if (on) out[x] |= 1 << r;
    }
    if (mode == 2) { memcpy(cur, nxt, (W + 2) * 2); memset(nxt, 0, (W + 2) * 2); }
  }
}

static bool send_page(int p) {
  const uint8_t *a = next + p * W, *b = shown + p * W;
  int x0 = 0, x1 = W - 1;
  while (x0 < W && a[x0] == b[x0]) x0++;
  if (x0 == W) return true;
  while (a[x1] == b[x1]) x1--;
  uint8_t win[6] = {0x21, (uint8_t)x0, (uint8_t)x1, 0x22, (uint8_t)p, (uint8_t)p};  // column and page window
  static uint8_t data[1 + 128];
  data[0] = 0x40;  // control byte 0x40: data stream
  memcpy(data + 1, a + x0, x1 - x0 + 1);
  bool ok = cmds(win, 6) && dev_write(data, x1 - x0 + 2);
  memcpy((uint8_t*)b + x0, a + x0, x1 - x0 + 1);
  return ok;
}

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height; P = (H + 7) / 8;
  if (W > 128 || H > 64) { printf("ssd1306: surface %dx%d is larger than 128x64\n", W, H); return 0; }
  band = (uint32_t*)calloc((size_t)W * 8, 4);
  shown = (uint8_t*)malloc((size_t)W * P); next = (uint8_t*)calloc((size_t)W * P, 1);
  memset(shown, 0xFF, (size_t)W * P);  // unknown panel contents: the first frame sends everything
  err = (int16_t*)calloc((size_t)(W + 2) * 2, 2);
  mode = !strcmp(OPT(DITHER), "fs") ? 2 : !strcmp(OPT(DITHER), "bayer") ? 1 : 0;
  bool dev = dev_open();
  const uint8_t flip = OPT(FLIP) ? 0 : 1;
  const uint8_t seq[] = {0xAE, 0xD5, 0x80, 0xA8, (uint8_t)(H - 1), 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x00,
                         (uint8_t)(0xA0 | flip), (uint8_t)(flip ? 0xC8 : 0xC0), 0xDA, (uint8_t)(H == 64 ? 0x12 : 0x02),
                         0x81, (uint8_t)OPT(CONTRAST), 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0x2E, 0xAF};
  if (dev) dev = cmds(seq, sizeof seq);
  if (!dev) {
    if (!OPT(DEBUG)) { printf("ssd1306: no display at 0x%02x, display driver disabled\n", OPT(ADDRESS)); return 0; }
    printf("ssd1306: no display, frames are only checksummed (debug)\n");
  }
  printf("ssd1306: %dx%d, dither %s\n", W, H, OPT(DITHER));
  return 1;
}

static void present(const HalFrame* f) {
  if (f->y1 <= f->y0 || f->x1 <= f->x0) { dev_show(); return; }
  // error diffusion depends on the rows above: re-dither the whole screen; threshold/bayer only the damaged pages
  int p0 = mode == 2 ? 0 : f->y0 / 8, p1 = mode == 2 ? P : (f->y1 + 7) / 8;
  if (mode == 2) memset(err, 0, (size_t)(W + 2) * 4);
  for (int p = p0; p < p1 && p < P; p++) {
    int y1 = p * 8 + 8 < f->h ? p * 8 + 8 : f->h;
    f->render(band, p * 8, y1);
    convert_page(p);
    send_page(p);
  }
  dev_show();
  frames++;
  if (OPT(DEBUG)) printf("ssd1306: frame %d crc %08x\n", frames, (unsigned)fnv(shown, W * P));
}

// ESP32 HAL stops after its QEMU frame budget; a real screen runs forever unless debug is on.
static void poll(HalInput* in) {
#ifdef ESP_PLATFORM
  if (!OPT(DEBUG)) in->quit = 0;
#else
  (void)in;
#endif
}
static void shutdown() { dev_close(); }

static HalDisplay drv = {init, present, poll, shutdown};
static int reg = (hal_display = &drv, 0);
