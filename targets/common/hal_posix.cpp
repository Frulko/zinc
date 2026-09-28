// POSIX parts shared by the macos, linux and null HALs.
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>
#include <signal.h>
#include <pthread.h>

extern "C" {
#ifndef ZRT_HAL_OWNS_RUN
void hal_run(int (*step)(void)) { while (step()) {} }
#endif
void* hal_alloc(size_t n) { return malloc(n); }
void hal_free(void* p) { free(p); }
uint64_t hal_time_us(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * 1000000u + (uint64_t)ts.tv_nsec / 1000u;
}
void hal_sleep_us(uint64_t us) { usleep((useconds_t)(us > 1000000 ? 1000000 : us)); }
void hal_log(const char* s, size_t n) { fwrite(s, 1, n, stdout); fflush(stdout); }
void hal_log_err(const char* s, size_t n) { fflush(stdout); fwrite(s, 1, n, stderr); fflush(stderr); }
int hal_isatty(int fd) { return isatty(fd); }
const char* hal_env(const char* name) { return getenv(name); }
#ifndef ZRT_HEAP_BYTES
#define ZRT_HEAP_BYTES (512u << 20)
#endif
void hal_heap_region(void** base, size_t* size) {
  size_t n = ZRT_HEAP_BYTES;
  if (const char* e = getenv("ZINC_HEAP")) n = (size_t)atoll(e);
  *base = malloc(n);
  *size = *base ? n : 0;
}
void hal_panic(const char* msg, const char* file, int line) {
  fflush(stdout);
  if (file && *file) fprintf(stderr, "panic: %s (%s:%d)\n", msg, file, line);
  else fprintf(stderr, "panic: %s\n", msg);
  exit(101);
}

// Crash policy (docs/dev-mode.md): fatal signals of the main thread go to the runtime, which longjmps back to its
// guarded step (red box / restart). The handler runs on its own stack so stack overflows are caught too.
static void (*fault_cb)(const char*);
static pthread_t fault_thread;
static void on_signal(int sig) {
  if (!fault_cb || !pthread_equal(pthread_self(), fault_thread)) { signal(sig, SIG_DFL); raise(sig); return; }
  fault_cb(sig == SIGSEGV ? "SIGSEGV (invalid memory access)" : sig == SIGBUS ? "SIGBUS (invalid memory access)"
           : sig == SIGFPE ? "SIGFPE (arithmetic fault)" : sig == SIGILL ? "SIGILL (illegal instruction)" : "SIGABRT (abort)");
}
void hal_trap_faults(void (*cb)(const char* what)) {
  static const int sigs[] = {SIGSEGV, SIGBUS, SIGFPE, SIGILL, SIGABRT};
  static char* alt;
  fault_cb = cb;
  fault_thread = pthread_self();
  if (cb && !alt) {
    stack_t st = {};
    st.ss_size = 1 << 16;
    st.ss_sp = alt = (char*)malloc(st.ss_size);
    sigaltstack(&st, nullptr);
  }
  struct sigaction sa = {};
  sa.sa_handler = cb ? on_signal : SIG_DFL;
  sa.sa_flags = SA_ONSTACK | SA_NODEFER;  // NODEFER: the handler longjmps out, the signal must not stay blocked
  for (int s : sigs) sigaction(s, &sa, nullptr);
}
}
