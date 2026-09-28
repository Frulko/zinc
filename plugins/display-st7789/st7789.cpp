// ST7789 / ILI9341 SPI LCD driver for ESP32 (plugins/display-st7789), esp_lcd panel IO. Band rendering: the shared
// rasterizer renders `lines` rows of the damaged rectangle into a small buffer, they are converted to RGB565 into one
// of two DMA buffers and sent while the next band renders. No full framebuffer in RAM (240x320 would need 150 KiB).
// Both controllers speak MIPI DCS (CASET/RASET/RAMWR), so no controller-specific esp_lcd component is needed.
// Options -> ZP_DISPLAY_ST7789_*: controller, mosi, sclk, cs, dc, rst, bl, hz, lines, xoff, yoff, madctl, invert, debug.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define OPT(k) ZP_DISPLAY_ST7789_##k
static int W, H, L;
static uint32_t* band;        // W x L rendered pixels
static uint16_t* dma[2];      // RGB565 (big endian on the wire), ping-pong
static int turn;
static esp_lcd_panel_io_handle_t io;
static int frames;
static uint32_t crc = 2166136261u;

static void cmd(int c, const uint8_t* p, int n) { if (io) esp_lcd_panel_io_tx_param(io, c, p, n); }

static int init(const HalConfig* cfg) {
  W = cfg->width; H = cfg->height; L = OPT(LINES);
  band = (uint32_t*)malloc((size_t)W * L * 4);
  for (int i = 0; i < 2; i++) dma[i] = (uint16_t*)heap_caps_malloc((size_t)W * L * 2, MALLOC_CAP_DMA);
  if (!band || !dma[0] || !dma[1]) { printf("st7789: out of memory for %d-line bands\n", L); return 0; }
  bool ili = !strcmp(OPT(CONTROLLER), "ili9341");
  spi_bus_config_t bus = {};
  bus.sclk_io_num = (gpio_num_t)OPT(SCLK); bus.mosi_io_num = (gpio_num_t)OPT(MOSI); bus.miso_io_num = GPIO_NUM_NC;
  bus.quadwp_io_num = GPIO_NUM_NC; bus.quadhd_io_num = GPIO_NUM_NC; bus.max_transfer_sz = W * L * 2;
  esp_lcd_panel_io_spi_config_t ic = {};
  ic.cs_gpio_num = (gpio_num_t)OPT(CS); ic.dc_gpio_num = (gpio_num_t)OPT(DC); ic.pclk_hz = OPT(HZ);
  ic.lcd_cmd_bits = 8; ic.lcd_param_bits = 8; ic.spi_mode = 0; ic.trans_queue_depth = 2;
  // debug 2: checksum only, no SPI at all (Espressif QEMU never completes queued SPI DMA transfers)
  if (OPT(DEBUG) == 2 || spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO) != ESP_OK ||
      esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)SPI2_HOST, &ic, &io) != ESP_OK) {
    io = nullptr;
    if (!OPT(DEBUG)) { printf("st7789: SPI setup failed, display driver disabled\n"); return 0; }
    printf("st7789: no SPI I/O, frames are only checksummed (debug)\n");
  }
  if (OPT(RST) >= 0) {
    gpio_set_direction((gpio_num_t)OPT(RST), GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)OPT(RST), 0); vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level((gpio_num_t)OPT(RST), 1); vTaskDelay(pdMS_TO_TICKS(120));
  }
  cmd(0x01, nullptr, 0); vTaskDelay(pdMS_TO_TICKS(150));  // software reset
  cmd(0x11, nullptr, 0); vTaskDelay(pdMS_TO_TICKS(120));  // sleep out
  const uint8_t colmod = 0x55;                             // 16 bits per pixel
  const uint8_t madctl = (uint8_t)(OPT(MADCTL) >= 0 ? OPT(MADCTL) : ili ? 0x48 : 0x00);
  cmd(0x3A, &colmod, 1);
  cmd(0x36, &madctl, 1);
  bool inv = OPT(INVERT) >= 0 ? OPT(INVERT) != 0 : !ili;  // most ST7789 modules need inversion on
  cmd(inv ? 0x21 : 0x20, nullptr, 0);
  cmd(0x29, nullptr, 0);  // display on
  if (OPT(BL) >= 0) { gpio_set_direction((gpio_num_t)OPT(BL), GPIO_MODE_OUTPUT); gpio_set_level((gpio_num_t)OPT(BL), 1); }
  printf("st7789: %s %dx%d, %d-line bands\n", OPT(CONTROLLER), W, H, L);
  return 1;
}

static void present(const HalFrame* f) {
  if (f->y1 <= f->y0 || f->x1 <= f->x0) return;
  int x0 = f->x0, x1 = f->x1, n = x1 - x0;
  for (int y = f->y0; y < f->y1; y += L) {
    int ye = y + L < f->y1 ? y + L : f->y1;
    f->render(band, y, ye);  // overlaps with the DMA of the previous band
    uint16_t* o = dma[turn];
    for (int r = 0; r < ye - y; r++)
      for (int x = x0; x < x1; x++) {
        uint32_t c = band[r * W + x];
        uint16_t v = (uint16_t)(((c >> 8) & 0xF800) | ((c >> 5) & 0x07E0) | ((c >> 3) & 0x1F));
        *o++ = (uint16_t)(v >> 8 | v << 8);
      }
    int cx0 = x0 + OPT(XOFF), cx1 = x1 - 1 + OPT(XOFF), ry0 = y + OPT(YOFF), ry1 = ye - 1 + OPT(YOFF);
    uint8_t ca[4] = {(uint8_t)(cx0 >> 8), (uint8_t)cx0, (uint8_t)(cx1 >> 8), (uint8_t)cx1};
    uint8_t ra[4] = {(uint8_t)(ry0 >> 8), (uint8_t)ry0, (uint8_t)(ry1 >> 8), (uint8_t)ry1};
    cmd(0x2A, ca, 4);  // tx_param waits for the queued colour transfer, so the other buffer is free again
    cmd(0x2B, ra, 4);
    size_t bytes = (size_t)n * (ye - y) * 2;
    if (io) esp_lcd_panel_io_tx_color(io, 0x2C, dma[turn], bytes);
    if (OPT(DEBUG)) { const uint8_t* p = (const uint8_t*)dma[turn]; for (size_t i = 0; i < bytes; i++) { crc ^= p[i]; crc *= 16777619u; } }
    turn ^= 1;
  }
  frames++;
  if (OPT(DEBUG)) { printf("st7789: frame %d rows %d-%d crc %08x\n", frames, (int)f->y0, (int)f->y1, (unsigned)crc); crc = 2166136261u; }
}

static void poll(HalInput* in) { if (!OPT(DEBUG)) in->quit = 0; }  // the ESP32 HAL's QEMU frame budget

static HalDisplay drv = {init, present, poll, nullptr, 0};
static int reg = (hal_display = &drv, 0);
