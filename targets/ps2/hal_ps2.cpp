// PlayStation 2 HAL (EE, ps2sdk + newlib): text output, heap, clock. gsKit rendering and libpad input come next.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <kernel.h>

extern "C" {
static int frames_left = 60;
void hal_init(const HalConfig*) {}
void hal_shutdown(void) {}
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) { return (uint64_t)clock() * (1000000u / CLOCKS_PER_SEC); }
void hal_sleep_us(uint64_t) {}
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
int hal_isatty(int) { return 0; }
const char* hal_env(const char*) { return nullptr; }
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (16u << 20)
#endif
void hal_heap_region(void** base, size_t* size) { *size = ZRT_HEAP_BYTES; *base = malloc(*size); }
void hal_panic(const char* msg, const char* file, int line) {
  if (file && *file) printf("panic: %s (%s:%d)\n", msg, file, line); else printf("panic: %s\n", msg);
  fflush(stdout);
  SleepThread();
  for (;;) {}
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {}
void hal_poll_input(HalInput* in) { in->buttons = 0; in->px = in->py = 0; in->pdown = 0; in->quit = frames_left-- <= 0; }
void hal_present(const HalDrawList*) {}
void hal_surface_size(int* w, int* h) { *w = 640; *h = 448; }
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_run(int (*step)(void)) { while (step()) {} }
}
