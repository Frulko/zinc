// ESP32 HAL (ESP-IDF v6.0, TGT-ESP-01..03): UART log, esp_timer clock, heap in internal DRAM, FreeRTOS delays.
// Display (esp_lcd SPI) and GPIO buttons come with the board profile; QEMU runs headless.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

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
void hal_heap_region(void** base, size_t* size) {
#ifdef ZRT_HEAP_PSRAM
  // zinc.json psram (docs/boards.md): the heap goes to external PSRAM when the chip found it at boot
  if (heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) >= ZRT_HEAP_BYTES && (*base = heap_caps_malloc(ZRT_HEAP_BYTES, MALLOC_CAP_SPIRAM))) {
    *size = ZRT_HEAP_BYTES;
    return;
  }
  printf("zinc: no PSRAM, heap in internal RAM\n");
#endif
  size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  size_t want = ZRT_HEAP_BYTES;
  if (largest < want + 8192) want = largest > 16384 ? largest - 8192 : 0;  // leave room for FreeRTOS/IDF
  *size = want;
  *base = want ? heap_caps_malloc(want, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) : nullptr;
  if (!*base) *size = 0;
}
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  printf("zinc:exit\n");
  fflush(stdout);
  for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
void hal_frame_begin(void) {}
void hal_frame_end(void) { vTaskDelay(1); }
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
