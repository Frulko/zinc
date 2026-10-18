// Win32 stand-in for the posix parts shared by the macos, linux and null HALs (targets/common/hal_posix.cpp):
// the same exported set behind Windows calls. The window HAL (targets/macos/hal_sdl.cpp) is compiled with it.
// Faults are not trapped yet: hal_trap_faults is not called outside the POSIX hosts (docs/targets/windows.md).
#include "hal.h"
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern "C" {
#ifndef ZRT_HAL_OWNS_RUN
void hal_run(int (*step)(void)) { while (step()) {} }
#endif
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) {
  LARGE_INTEGER f, c;
  QueryPerformanceFrequency(&f);
  QueryPerformanceCounter(&c);
  return static_cast<uint64_t>(c.QuadPart) * 1000000ull / static_cast<uint64_t>(f.QuadPart);
}
void hal_sleep_us(uint64_t us) {
  if (us > 1000) Sleep(static_cast<DWORD>(us / 1000));
  else Sleep(1);   // the timer's resolution is ~16 ms anyway
}
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fflush(stdout); fwrite(s, 1, n, stderr); fflush(stderr); }
int hal_isatty(int fd) { return _isatty(fd) != 0; }
const char* hal_env(const char* name) { return getenv(name); }
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (512u << 20)
#endif
void hal_heap_region(void** base, size_t* size) {
  size_t n = ZRT_HEAP_BYTES;
  if (const char* e = getenv("ZINC_HEAP")) n = (size_t)_atoi64(e);
  *base = malloc(n);
  *size = *base ? n : 0;
}
void hal_panic(const char* msg, const char* file, int line) {
  fflush(stdout);
  if (file && *file) fprintf(stderr, "panic: %s (%s:%d)\n", msg, file, line);
  else fprintf(stderr, "panic: %s\n", msg);
  exit(101);
}
}
