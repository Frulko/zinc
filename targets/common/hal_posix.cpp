// POSIX parts shared by the macos, linux and null HALs.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

extern "C" {
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * 1000000u + (uint64_t)ts.tv_nsec / 1000u;
}
void hal_sleep_us(uint64_t us) { usleep((useconds_t)(us > 1000000 ? 1000000 : us)); }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_panic(const char* msg, const char* file, int line) {
  fflush(stdout);
  if (file && *file) fprintf(stderr, "panic: %s (%s:%d)\n", msg, file, line);
  else fprintf(stderr, "panic: %s\n", msg);
  exit(101);
}
}
