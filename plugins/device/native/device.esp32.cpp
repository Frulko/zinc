// zinc:device on ESP32: backlight through the display driver (plugins/display-st7789 zinc_display_backlight), IDF
// heap figures, chip info.
#include "zinc_native_device.h"
#include <stdio.h>
#include "esp_heap_caps.h"
#include "esp_chip_info.h"
#include "esp_private/esp_clk.h"

extern "C" __attribute__((weak)) void zinc_display_backlight(int32_t level);
extern "C" __attribute__((weak)) int32_t zinc_display_touch(void);

struct EspDevice : NativeDevice {
  bool setBacklight(int32_t level) override {
    if (!zinc_display_backlight) return false;
    zinc_display_backlight(level);
    return true;
  }
  bool hasTouch() override { return zinc_display_touch && zinc_display_touch(); }
  // byte-addressable internal RAM (the 32-bit-only IRAM left over is not usable as heap for most data)
  int32_t heapFree() override { return (int32_t)heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT); }
  int32_t heapMinFree() override { return (int32_t)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT); }
  int32_t zincHeapUsed() override { return (int32_t)zrt::heap_used(); }
  int32_t zincHeapSize() override { return (int32_t)zrt::heap_budget(); }
  int32_t frameUs() override { return (int32_t)zrt::stats.frame_us; }
  int32_t drawCmds() override { return (int32_t)zrt::stats.draw_cmds; }
  int32_t cpuMhz() override { return esp_clk_cpu_freq() / 1000000; }
  zrt::String chip() override {
    esp_chip_info_t c;
    esp_chip_info(&c);
    char b[48];
    int n = snprintf(b, sizeof b, "%s rev %d.%d, %d core%s", c.model == CHIP_ESP32S3 ? "ESP32-S3" : "ESP32",
                     c.revision / 100, c.revision % 100, c.cores, c.cores > 1 ? "s" : "");
    return zrt::String::from(b, (uint32_t)(n < (int)sizeof b ? n : (int)sizeof b - 1));
  }
};

NativeDevice* zinc_create_Device() {
  static EspDevice s;
  s.rc = zrt::IMMORTAL;
  return &s;
}
