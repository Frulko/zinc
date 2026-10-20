// Just enough of ESP-IDF for display-st7789 to run on the host (ZN-128): esp_lcd panel IO calls reach a chip model through `zn_stub_lcd` instead of a bus, GPIO and LEDC are recorded.
// A write to the model is [kind, command, bytes...] with kind 0 = parameters (esp_lcd_panel_io_tx_param) and 1 = colour data (tx_color).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "hw.h"

typedef int esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
typedef int gpio_num_t;
#define GPIO_NUM_NC -1
enum { GPIO_MODE_OUTPUT = 2 };
static inline int gpio_set_direction(gpio_num_t, int) { return ESP_OK; }
static inline int gpio_set_level(gpio_num_t, int) { return ESP_OK; }
static inline int64_t esp_timer_get_time() { return 0; }
#define MALLOC_CAP_DMA 1
static inline void* heap_caps_malloc(size_t n, int) { return malloc(n); }

/** The chip behind the panel IO of the test (a zn_hw_model); null: opening the bus fails. */
inline const zn_hw_model* zn_stub_lcd = nullptr;
struct zn_stub_io { int dummy; };
typedef zn_stub_io* esp_lcd_panel_io_handle_t;
static inline esp_lcd_panel_io_handle_t zn_stub_open() { if (!zn_stub_lcd) return nullptr; static zn_stub_io io; return &io; }
static inline esp_err_t esp_lcd_panel_io_tx_param(esp_lcd_panel_io_handle_t, int cmd, const void* p, size_t n) {
  std::vector<uint8_t> b{0, (uint8_t)cmd};
  if (p) b.insert(b.end(), (const uint8_t*)p, (const uint8_t*)p + n);
  return zn_stub_lcd->write(zn_stub_lcd->user, b.data(), (int)b.size()) ? ESP_OK : ESP_FAIL;
}
static inline esp_err_t esp_lcd_panel_io_tx_color(esp_lcd_panel_io_handle_t, int cmd, const void* p, size_t n) {
  std::vector<uint8_t> b{1, (uint8_t)cmd};
  b.insert(b.end(), (const uint8_t*)p, (const uint8_t*)p + n);
  return zn_stub_lcd->write(zn_stub_lcd->user, b.data(), (int)b.size()) ? ESP_OK : ESP_FAIL;
}

// SPI bus
enum { SPI2_HOST = 1, SPI_DMA_CH_AUTO = 3 };
struct spi_bus_config_t { int sclk_io_num, mosi_io_num, miso_io_num, quadwp_io_num, quadhd_io_num; size_t max_transfer_sz; };
struct esp_lcd_panel_io_spi_config_t { int cs_gpio_num, dc_gpio_num, pclk_hz, lcd_cmd_bits, lcd_param_bits, spi_mode, trans_queue_depth; };
typedef void* esp_lcd_spi_bus_handle_t;
static inline esp_err_t spi_bus_initialize(int, const spi_bus_config_t*, int) { return ESP_OK; }
static inline esp_err_t esp_lcd_new_panel_io_spi(esp_lcd_spi_bus_handle_t, const esp_lcd_panel_io_spi_config_t*, esp_lcd_panel_io_handle_t* io) { *io = zn_stub_open(); return *io ? ESP_OK : ESP_FAIL; }

// i80 bus
enum { LCD_CLK_SRC_DEFAULT = 0 };
struct esp_lcd_i80_bus_config_t { int dc_gpio_num, wr_gpio_num, clk_src; int data_gpio_nums[16]; int bus_width; size_t max_transfer_bytes; int dma_burst_size; };
struct esp_lcd_i80_dc_levels { int dc_idle_level, dc_cmd_level, dc_dummy_level, dc_data_level; };
struct esp_lcd_panel_io_i80_config_t { int cs_gpio_num, pclk_hz, trans_queue_depth; esp_lcd_i80_dc_levels dc_levels; int lcd_cmd_bits, lcd_param_bits; };
typedef void* esp_lcd_i80_bus_handle_t;
static inline esp_err_t esp_lcd_new_i80_bus(const esp_lcd_i80_bus_config_t*, esp_lcd_i80_bus_handle_t* b) { *b = (void*)1; return ESP_OK; }
static inline esp_err_t esp_lcd_new_panel_io_i80(esp_lcd_i80_bus_handle_t, const esp_lcd_panel_io_i80_config_t*, esp_lcd_panel_io_handle_t* io) { *io = zn_stub_open(); return *io ? ESP_OK : ESP_FAIL; }

// LEDC (backlight): the last duty is kept for the test
enum { LEDC_LOW_SPEED_MODE = 0, LEDC_TIMER_8_BIT = 8, LEDC_TIMER_0 = 0, LEDC_AUTO_CLK = 0, LEDC_CHANNEL_0 = 0 };
struct ledc_timer_config_t { int speed_mode, duty_resolution, timer_num, freq_hz, clk_cfg; };
struct ledc_channel_config_t { int gpio_num, speed_mode, channel, timer_sel, duty, hpoint; };
inline uint32_t zn_stub_duty = 0;
static inline esp_err_t ledc_timer_config(const ledc_timer_config_t*) { return ESP_OK; }
static inline esp_err_t ledc_channel_config(const ledc_channel_config_t*) { return ESP_OK; }
static inline esp_err_t ledc_set_duty(int, int, uint32_t d) { zn_stub_duty = d; return ESP_OK; }
static inline esp_err_t ledc_update_duty(int, int) { return ESP_OK; }
