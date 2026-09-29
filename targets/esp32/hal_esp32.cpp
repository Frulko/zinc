// ESP32 HAL (ESP-IDF v6.0, TGT-ESP-01..03): UART log, esp_timer clock, heap in internal DRAM, FreeRTOS delays.
// Display (esp_lcd SPI) and GPIO buttons come with the board profile; QEMU runs headless.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_task_wdt.h"
#include "esp_debug_helpers.h"

extern int zinc_program_main(int argc, char** argv);

extern "C" {
static int frames_left = 60;
void hal_init(const HalConfig*) { printf("zinc:start\n"); }
void hal_shutdown(void) { printf("zinc:exit\n"); fflush(stdout); }
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)esp_timer_get_time(); }
void hal_sleep_us(uint64_t us) { vTaskDelay(pdMS_TO_TICKS(us / 1000 ? us / 1000 : 1)); }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char*) { return nullptr; }
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (160u << 10)
#endif
// TGT-ESP-02: the TLSF region is reserved once, in internal DRAM
static size_t heap_got = 0;   // bytes handed to the Zinc heap so far (internal RAM)
static const uint32_t INTERNAL = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
void hal_heap_region(void** base, size_t* size) {
#ifdef ZRT_HEAP_PSRAM
  // zinc.json psram (docs/boards.md): the heap goes to external PSRAM when the chip found it at boot
  if (heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) >= ZRT_HEAP_BYTES && (*base = heap_caps_malloc(ZRT_HEAP_BYTES, MALLOC_CAP_SPIRAM))) {
    *size = ZRT_HEAP_BYTES;
    heap_got = ZRT_HEAP_BYTES;
    return;
  }
  printf("zinc: no PSRAM, heap in internal RAM\n");
#endif
  size_t largest = heap_caps_get_largest_free_block(INTERNAL);
  size_t want = ZRT_HEAP_BYTES;
  if (largest < want + 8192) want = largest > 16384 ? largest - 8192 : 0;  // leave room for FreeRTOS/IDF
  *size = want;
  *base = want ? heap_caps_malloc(want, INTERNAL) : nullptr;
  if (!*base) *size = 0;
  heap_got = *size;
}
// The classic ESP32's internal RAM is several blocks (the largest ~110 KiB): the rest of ZRT_HEAP_BYTES comes from
// the next largest ones, keeping HEAP_RESERVE free for ESP-IDF (drivers, FreeRTOS objects, esp_timer, I2C...).
static const size_t HEAP_RESERVE = 24 << 10;   // 21 KiB stayed free with 32: the drivers allocate at init, then little
int hal_heap_region_more(int i, void** base, size_t* size) {
  if (heap_got >= ZRT_HEAP_BYTES) {
    if (i > 0) printf("zinc: heap %u KiB in %d blocks, %u KiB internal RAM left\n", (unsigned)(heap_got >> 10), i + 1, (unsigned)(heap_caps_get_free_size(INTERNAL) >> 10));
    return 0;
  }
  size_t left = heap_caps_get_free_size(INTERNAL), largest = heap_caps_get_largest_free_block(INTERNAL);
  size_t want = ZRT_HEAP_BYTES - heap_got;
  if (left < HEAP_RESERVE + 8192) want = 0;
  else if (want > left - HEAP_RESERVE) want = left - HEAP_RESERVE;
  if (want > largest - 64) want = largest > 64 ? largest - 64 : 0;  // allocator header
  if (want < 8192 || !(*base = heap_caps_malloc(want, INTERNAL))) {
    printf("zinc: heap %u KiB in %d block(s), %u KiB internal RAM left\n", (unsigned)(heap_got >> 10), i + 1, (unsigned)(left >> 10));
    return 0;
  }
  *size = want;
  heap_got += want;
  return 1;
}
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  esp_backtrace_print(24);   // the faulting task: decode with xtensa-esp32-elf-addr2line -e <app>.elf
  printf("zinc:exit\n");
  fflush(stdout);
  for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
void hal_frame_begin(void) {}
// Task watchdog on the frame loop (only when the project enables CONFIG_ESP_TASK_WDT_EN): a frame that never ends
// panics with a backtrace and reboots instead of freezing the screen.
void hal_frame_end(void) {
  static int wdt = -1;
  if (wdt < 0) wdt = esp_task_wdt_add(nullptr) == ESP_OK;
  else if (wdt) esp_task_wdt_reset();
  vTaskDelay(1);
}
void hal_poll_input(HalInput* in) { in->buttons = 0; in->px = in->py = 0; in->pdown = 0; in->quit = frames_left-- <= 0; }
void hal_present(const HalFrame*) {}
void hal_surface_size(int* w, int* h) { *w = 320; *h = 240; }
double hal_fixed_dt(void) { return 1.0 / 30.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
void app_main(void) {
  zinc_program_main(0, nullptr);
  for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
}
