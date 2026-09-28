// ST7789 / ILI9341 LCD driver for ESP32 (plugins/display-st7789), esp_lcd panel IO over SPI or an 8-bit i80
// (Intel 8080 parallel) bus. Band rendering: the shared rasterizer renders `lines` rows of the damage into a small
// buffer, they are converted to RGB565 into one of two DMA buffers and sent while the next band renders. No full
// framebuffer in RAM (240x320 would need 150 KiB). Both controllers speak MIPI DCS (CASET/RASET/RAMWR), so no
// controller-specific esp_lcd component is needed.
//
// Damage: each band first renders only the damaged rectangles (HalFrame.render_damage) over a sentinel colour; bands
// no rectangle touches are skipped, and a band sends only the bounding box of what changed. Two small changes far
// apart (a clock at the top, a chart at the bottom) therefore cost two small transfers, not the rows in between.
//
// Extras for boards like the ESP32-2432S022: LEDC PWM backlight (`bl`, `brightness`, zinc_display_backlight()) and
// a CST820 / CST816 capacitive touch controller on I2C (`touch: "cst820"`) read in poll() as the pointer.
// Options -> ZP_DISPLAY_ST7789_*: controller, bus, mosi, sclk, data, wr, rd, cs, dc, rst, bl, brightness, hz, lines,
// xoff, yoff, madctl, invert, touch, tsda, tscl, taddress, tswap, tflipx, tflipy, debug.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_io_i80.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define OPT(k) ZP_DISPLAY_ST7789_##k
static int W, H, L;
static uint32_t* band;        // W x L rendered pixels
static uint16_t* dma[2];      // RGB565 (big endian on the wire), ping-pong
static int turn;
static bool inplace;          // ESP32 i80: RGB565 is written over the band itself (the bus copies it at once)
static esp_lcd_panel_io_handle_t io;
static int frames;
static uint32_t crc = 2166136261u;
static bool pwm;              // backlight on LEDC

static void cmd(int c, const uint8_t* p, int n) { if (io) esp_lcd_panel_io_tx_param(io, c, p, n); }

/** Backlight level 0..255 (PWM when `bl` is set; zinc:device calls it). */
extern "C" void zinc_display_backlight(int32_t level) {
  if (!pwm) return;
  level = level < 0 ? 0 : level > 255 ? 255 : level;
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, level == 255 ? 256u : (uint32_t)level);  // 256: always on
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

static bool open_spi() {
  spi_bus_config_t bus = {};
  bus.sclk_io_num = (gpio_num_t)OPT(SCLK); bus.mosi_io_num = (gpio_num_t)OPT(MOSI); bus.miso_io_num = GPIO_NUM_NC;
  bus.quadwp_io_num = GPIO_NUM_NC; bus.quadhd_io_num = GPIO_NUM_NC; bus.max_transfer_sz = W * L * 2;
  esp_lcd_panel_io_spi_config_t ic = {};
  ic.cs_gpio_num = (gpio_num_t)OPT(CS); ic.dc_gpio_num = (gpio_num_t)OPT(DC); ic.pclk_hz = OPT(HZ);
  ic.lcd_cmd_bits = 8; ic.lcd_param_bits = 8; ic.spi_mode = 0; ic.trans_queue_depth = 2;
  return spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO) == ESP_OK &&
         esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)SPI2_HOST, &ic, &io) == ESP_OK;
}

// 8-bit Intel 8080 bus (ESP32: the I2S peripheral in LCD mode; ESP32-S3: LCD_CAM). On the ESP32, tx_color copies
// the band into the bus' own DMA buffer before it returns, so the CPU keeps rendering while the previous band goes
// out, and no ping-pong buffers are needed (15 KiB of internal RAM left to the Zinc heap).
static bool open_i80() {
  static const int data[] = {OPT(DATA)};
  if (sizeof data / sizeof data[0] != 8) { printf("st7789: i80 needs 8 data pins\n"); return false; }
  if (OPT(RD) >= 0) { gpio_set_direction((gpio_num_t)OPT(RD), GPIO_MODE_OUTPUT); gpio_set_level((gpio_num_t)OPT(RD), 1); }  // never read
  esp_lcd_i80_bus_config_t bc = {};
  bc.dc_gpio_num = (gpio_num_t)OPT(DC); bc.wr_gpio_num = (gpio_num_t)OPT(WR); bc.clk_src = LCD_CLK_SRC_DEFAULT;
  for (int i = 0; i < 8; i++) bc.data_gpio_nums[i] = (gpio_num_t)data[i];
  bc.bus_width = 8; bc.max_transfer_bytes = (size_t)W * L * 2; bc.dma_burst_size = 64;
  esp_lcd_i80_bus_handle_t bus;
  if (esp_lcd_new_i80_bus(&bc, &bus) != ESP_OK) return false;
  esp_lcd_panel_io_i80_config_t ic = {};
  ic.cs_gpio_num = (gpio_num_t)OPT(CS); ic.pclk_hz = OPT(HZ); ic.trans_queue_depth = 2;
  ic.dc_levels.dc_idle_level = 0; ic.dc_levels.dc_cmd_level = 0; ic.dc_levels.dc_dummy_level = 0; ic.dc_levels.dc_data_level = 1;
  ic.lcd_cmd_bits = 8; ic.lcd_param_bits = 8;
  return esp_lcd_new_panel_io_i80(bus, &ic, &io) == ESP_OK;
}

// ---- CST820 / CST816 touch (I2C, 7-bit address 0x15): 0x02 finger count, 0x03..0x06 X high/low, Y high/low (12 bits).
static i2c_master_dev_handle_t tp;
static float tx, ty;          // last touch point, kept after release so the pointer-up lands where the finger left
static bool open_touch() {
  i2c_master_bus_config_t bc = {};
  bc.i2c_port = -1; bc.sda_io_num = (gpio_num_t)OPT(TSDA); bc.scl_io_num = (gpio_num_t)OPT(TSCL);
  bc.clk_source = I2C_CLK_SRC_DEFAULT; bc.glitch_ignore_cnt = 7; bc.flags.enable_internal_pullup = 1;
  i2c_master_bus_handle_t bus;
  if (i2c_new_master_bus(&bc, &bus) != ESP_OK) return false;
  if (i2c_master_probe(bus, OPT(TADDRESS), 50) != ESP_OK) { printf("st7789: no touch controller at 0x%02x (SDA %d, SCL %d)\n", OPT(TADDRESS), OPT(TSDA), OPT(TSCL)); return false; }
  i2c_device_config_t dc = {};
  dc.dev_addr_length = I2C_ADDR_BIT_LEN_7; dc.device_address = OPT(TADDRESS); dc.scl_speed_hz = 400000;
  if (i2c_master_bus_add_device(bus, &dc, &tp) != ESP_OK) return false;
  const uint8_t no_sleep[2] = {0xFE, 0xFF};  // keep answering on I2C (the chip naps after 2 s idle otherwise)
  i2c_master_transmit(tp, no_sleep, 2, 50);
  return true;
}

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height; L = OPT(LINES);
  bool par = !strcmp(OPT(BUS), "i80");
#if CONFIG_IDF_TARGET_ESP32
  inplace = par;
#endif
  band = (uint32_t*)malloc((size_t)W * L * 4);
  if (!inplace) for (int i = 0; i < 2; i++) dma[i] = (uint16_t*)heap_caps_malloc((size_t)W * L * 2, MALLOC_CAP_DMA);
  if (!band || (!inplace && (!dma[0] || !dma[1]))) { printf("st7789: out of memory for %d-line bands\n", L); return 0; }
  bool ili = !strcmp(OPT(CONTROLLER), "ili9341");
  // debug 2: checksum only, no bus at all (Espressif QEMU never completes SPI DMA and has no I2S LCD mode);
  // debug 3: the same without the per-frame log and the frame budget (long QEMU runs, e.g. memory figures)
  if (OPT(DEBUG) >= 2 || !(par ? open_i80() : open_spi())) {
    io = nullptr;
    if (!OPT(DEBUG)) { printf("st7789: %s setup failed, display driver disabled\n", par ? "i80" : "SPI"); return 0; }
    printf("st7789: no bus I/O, frames are only checksummed (debug)\n");
  }
  if (OPT(RST) >= 0) {
    gpio_set_direction((gpio_num_t)OPT(RST), GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)OPT(RST), 0); vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level((gpio_num_t)OPT(RST), 1); vTaskDelay(pdMS_TO_TICKS(120));
  }
  cmd(0x01, nullptr, 0); vTaskDelay(pdMS_TO_TICKS(150));  // software reset
  cmd(0x11, nullptr, 0); vTaskDelay(pdMS_TO_TICKS(120));  // sleep out
  if (par && !ili) {
    // ponytail: the ST7789 panel tuning LovyanGFX (the board vendor's library) sends: porch, gate, VCOM, power,
    // 60 Hz frame rate, gamma. Only on i80 (the ESP32-2432S022); SPI panels keep the controller's reset defaults.
    static const uint8_t seq[] = {
      0xB2, 5, 0x0c, 0x0c, 0x00, 0x33, 0x33,  0xB7, 1, 0x35,  0xBB, 1, 0x28,  0xC0, 1, 0x0C,  0xC2, 2, 0x01, 0xFF,
      0xC3, 1, 0x10,  0xC4, 1, 0x20,  0xC6, 1, 0x0f,  0xD0, 2, 0xa4, 0xa1,  0xB0, 2, 0x00, 0xC0,
      0xE0, 14, 0xd0, 0x00, 0x02, 0x07, 0x0a, 0x28, 0x32, 0x44, 0x42, 0x06, 0x0e, 0x12, 0x14, 0x17,
      0xE1, 14, 0xd0, 0x00, 0x02, 0x07, 0x0a, 0x28, 0x31, 0x54, 0x47, 0x0e, 0x1c, 0x17, 0x1b, 0x1e,
      0x38, 0};  // idle mode off
    for (size_t i = 0; i < sizeof seq; i += 2 + seq[i + 1]) cmd(seq[i], seq[i + 1] ? &seq[i + 2] : nullptr, seq[i + 1]);
  }
  const uint8_t colmod = 0x55;                             // 16 bits per pixel
  const uint8_t madctl = (uint8_t)(OPT(MADCTL) >= 0 ? OPT(MADCTL) : ili ? 0x48 : 0x00);
  cmd(0x3A, &colmod, 1);
  cmd(0x36, &madctl, 1);
  bool inv = OPT(INVERT) >= 0 ? OPT(INVERT) != 0 : !ili;  // most ST7789 modules need inversion on
  cmd(inv ? 0x21 : 0x20, nullptr, 0);
  cmd(0x29, nullptr, 0);  // display on
  if (OPT(BL) >= 0) {
    // PWM backlight: 5 kHz, 8 bits (inaudible, no visible flicker); a plain GPIO when LEDC is unavailable
    ledc_timer_config_t t = {};
    t.speed_mode = LEDC_LOW_SPEED_MODE; t.duty_resolution = LEDC_TIMER_8_BIT; t.timer_num = LEDC_TIMER_0; t.freq_hz = 5000; t.clk_cfg = LEDC_AUTO_CLK;
    ledc_channel_config_t c = {};
    c.gpio_num = OPT(BL); c.speed_mode = LEDC_LOW_SPEED_MODE; c.channel = LEDC_CHANNEL_0; c.timer_sel = LEDC_TIMER_0; c.duty = 0; c.hpoint = 0;
    pwm = ledc_timer_config(&t) == ESP_OK && ledc_channel_config(&c) == ESP_OK;
    if (pwm) zinc_display_backlight(OPT(BRIGHTNESS));
    else { gpio_set_direction((gpio_num_t)OPT(BL), GPIO_MODE_OUTPUT); gpio_set_level((gpio_num_t)OPT(BL), 1); }
  }
  bool touch = strcmp(OPT(TOUCH), "none") && OPT(DEBUG) < 2 && open_touch();
  tx = W / 2.0f; ty = H / 2.0f;
  printf("st7789: %s %dx%d over %s, %d-line bands%s\n", OPT(CONTROLLER), W, H, par ? "i80" : "SPI", L, touch ? ", touch" : "");
  return 1;
}

static const uint32_t UNTOUCHED = 0xFF000000u;  // never produced by the rasterizer (pixels are 0x00RRGGBB)

/** Converts rows [ry0, ry1) x [x0, x1) of the band to RGB565 and sends them. */
static void send(int y, int ry0, int ry1, int x0, int x1) {
  uint16_t* out = inplace ? (uint16_t*)band : dma[turn];  // in place: each write lands behind the pixels still to read
  uint16_t* o = out;
  for (int r = ry0; r < ry1; r++) {
    const uint32_t* p = band + (size_t)(r - y) * W;
    for (int x = x0; x < x1; x++) {
      uint32_t c = p[x];
      uint16_t v = (uint16_t)(((c >> 8) & 0xF800) | ((c >> 5) & 0x07E0) | ((c >> 3) & 0x1F));
      *o++ = (uint16_t)(v >> 8 | v << 8);
    }
  }
  int cx0 = x0 + OPT(XOFF), cx1 = x1 - 1 + OPT(XOFF), cy0 = ry0 + OPT(YOFF), cy1 = ry1 - 1 + OPT(YOFF);
  uint8_t ca[4] = {(uint8_t)(cx0 >> 8), (uint8_t)cx0, (uint8_t)(cx1 >> 8), (uint8_t)cx1};
  uint8_t ra[4] = {(uint8_t)(cy0 >> 8), (uint8_t)cy0, (uint8_t)(cy1 >> 8), (uint8_t)cy1};
  cmd(0x2A, ca, 4);  // tx_param waits for the queued colour transfer, so the other buffer is free again
  cmd(0x2B, ra, 4);
  size_t bytes = (size_t)(x1 - x0) * (ry1 - ry0) * 2;
  if (io) esp_lcd_panel_io_tx_color(io, 0x2C, out, bytes);
  if (OPT(DEBUG) && OPT(DEBUG) != 3) { const uint8_t* p = (const uint8_t*)out; for (size_t i = 0; i < bytes; i++) { crc ^= p[i]; crc *= 16777619u; } }
  turn ^= 1;
}

static int sent_px;  // pixels sent this frame (debug log)
static void present(const HalFrame* f) {
  if (f->y1 <= f->y0 || f->x1 <= f->x0) return;
  sent_px = 0;
  for (int y = f->y0; y < f->y1; y += L) {
    int ye = y + L < f->y1 ? y + L : f->y1;
    int bx0 = f->x0, bx1 = f->x1, by0 = y, by1 = ye;
    if (f->render_damage) {
      for (int r = 0; r < ye - y; r++) for (int x = f->x0; x < f->x1; x++) band[r * W + x] = UNTOUCHED;
      f->render_damage(band, y, ye);  // overlaps with the DMA of the previous band
      bx0 = f->x1; bx1 = f->x0; by0 = ye; by1 = y;
      for (int r = y; r < ye; r++) {
        const uint32_t* p = band + (size_t)(r - y) * W;
        int a = f->x0, b = f->x1;
        while (a < b && p[a] == UNTOUCHED) a++;
        if (a == b) continue;
        while (p[b - 1] == UNTOUCHED) b--;
        if (a < bx0) bx0 = a;
        if (b > bx1) bx1 = b;
        if (r < by0) by0 = r;
        by1 = r + 1;
      }
      if (by0 >= by1) continue;  // nothing changed in these rows
      bool holes = false;        // two rectangles side by side: render the rows whole instead
      for (int r = by0; r < by1 && !holes; r++) for (int x = bx0; x < bx1; x++) if (band[(r - y) * W + x] == UNTOUCHED) { holes = true; break; }
      if (holes) f->render(band, y, ye);
    } else f->render(band, y, ye);
    send(y, by0, by1, bx0, bx1);
    sent_px += (bx1 - bx0) * (by1 - by0);
  }
  frames++;
  if (OPT(DEBUG) == 3) {  // summary every 100 presented frames: how much of the screen the damage really costs
    static int n = 0, full = 0; static int64_t sum = 0; static int peak = 0;
    n++; sum += sent_px; peak = sent_px > peak ? sent_px : peak; full += sent_px >= W * H * 9 / 10;
    if (n == 100) {
      printf("st7789: 100 frames, %d px sent per frame on average (%d%% of the screen), max %d px, %d near-full\n",
             (int)(sum / n), (int)(sum * 100 / n / (W * H)), peak, full);
      n = 0; sum = 0; peak = 0; full = 0;
    }
  }
  if (OPT(DEBUG) && OPT(DEBUG) != 3) { printf("st7789: frame %d rows %d-%d sent %d px crc %08x\n", frames, (int)f->y0, (int)f->y1, sent_px, (unsigned)crc); crc = 2166136261u; }
}

/** True when a touch controller answered at init (zinc:device hasTouch()). */
extern "C" int32_t zinc_display_touch(void) { return tp != nullptr; }

static void poll(HalInput* in) {
  if (!OPT(DEBUG) || OPT(DEBUG) == 3) in->quit = 0;  // the ESP32 HAL's QEMU frame budget
  if (!tp) return;
  uint8_t reg = 0x02, b[5];
  if (i2c_master_transmit_receive(tp, &reg, 1, b, sizeof b, 20) != ESP_OK) return;
  bool down = (b[0] & 0x0F) != 0;
  if (down) {
    float x = (float)((b[1] & 0x0F) << 8 | b[2]), y = (float)((b[3] & 0x0F) << 8 | b[4]);
    if (OPT(TSWAP)) { float s = x; x = y; y = s; }
    if (OPT(TFLIPX)) x = W - 1 - x;
    if (OPT(TFLIPY)) y = H - 1 - y;
    tx = x < 0 ? 0 : x > W - 1 ? W - 1 : x;
    ty = y < 0 ? 0 : y > H - 1 ? H - 1 : y;
  }
  in->px = tx; in->py = ty; in->pdown = down;
  in->ntouch = down ? 1 : 0;
  if (down) in->touch[0] = HalTouch{0, tx, ty};
}

static HalDisplay drv = {init, present, poll, nullptr, 0};
static int reg = (hal_display = &drv, 0);
