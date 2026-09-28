// Hot-reload host for `zinc dev` (docs/dev-mode.md). It owns the HAL (window, input, heap region) and stays alive;
// the program — generated code, runtime, modules, plugins — is a shared library loaded with dlopen. On
// "reload <path>" (from the dev CLI on fd ZINC_DEV_FD) the running version returns from its event loop, tears down
// (deinit, pollers, timers), is unloaded, and the new one starts from its entry in the same window.
// The HAL source is included with a few functions renamed so the host can wrap them.
#define hal_init hal_init_real
#define hal_shutdown hal_shutdown_real
#define hal_poll_input hal_poll_input_real
#include ZINC_HAL_SRC
#undef hal_init
#undef hal_shutdown
#undef hal_poll_input
#define ZRT_HAL_OWNS_RUN
#define hal_heap_region hal_heap_region_real
#include "../targets/common/hal_posix.cpp"
#undef hal_heap_region
#include <dlfcn.h>
#include <poll.h>
#include <string.h>

static int dev_fd = -1;
static char pending[1024];  // next version to load
static bool stop_host, user_quit, inited, gfx, announced;
static uint64_t t_load;

static void send(const char* s) { if (dev_fd >= 0 && write(dev_fd, s, strlen(s)) < 0) dev_fd = -1; }
static void announce() {
  if (announced) return;
  announced = true;
  char m[64];
  snprintf(m, sizeof m, "ready %.1f\n", (double)(hal_time_us() - t_load) / 1000.0);
  send(m);
}
// Lines from the dev CLI: "reload <path>", "quit". wait_ms > 0 blocks up to that long for one read.
static void read_commands(int wait_ms) {
  static char buf[2048];
  static int n;
  if (dev_fd < 0) return;
  pollfd p = {dev_fd, POLLIN, 0};
  while (poll(&p, 1, wait_ms) > 0) {
    int r = (int)read(dev_fd, buf + n, sizeof buf - 1 - n);
    if (r <= 0) { stop_host = true; return; }  // the dev CLI is gone
    n += r;
    buf[n] = 0;
    for (char* nl; (nl = strchr(buf, '\n'));) {
      *nl = 0;
      if (!strncmp(buf, "reload ", 7)) snprintf(pending, sizeof pending, "%s", buf + 7);
      else if (!strcmp(buf, "quit")) stop_host = true;
      n -= (int)(nl + 1 - buf);
      memmove(buf, nl + 1, (size_t)n + 1);
    }
    if (wait_ms) return;
  }
}

static void* current = nullptr;  // the loaded program version
extern "C" {
// Symbols the HAL (linked into this host) takes from the runtime, which lives in the reloadable module: forward them.
// ponytail: display plugins (hal_display) are not used under zinc dev — the host HAL keeps its own window.
HalDisplay* hal_display = nullptr;
void zrt_redraw(void) { if (current) if (auto f = (void (*)(void))dlsym(current, "zrt_redraw")) f(); }
void hal_pen_push(const HalPen* p) { if (current) if (auto f = (void (*)(const HalPen*))dlsym(current, "hal_pen_push")) f(p); }
void hal_init(const HalConfig* c) {
  if (inited) return;  // the window outlives program versions
  inited = true;
  gfx = c->gfx != 0;
  hal_init_real(c);
}
void hal_shutdown(void) {}
void hal_poll_input(HalInput* in) { hal_poll_input_real(in); if (in->quit) user_quit = true; }
// One TLSF region for every version: each new version re-initializes it, so the old heap is discarded wholesale.
void hal_heap_region(void** base, size_t* size) {
  static void* b;
  static size_t s;
  if (!b) hal_heap_region_real(&b, &s);
  *base = b;
  *size = s;
}
// The program's event loop; returns early when a new version is waiting.
void hal_run(int (*step)(void)) {
  while (!pending[0] && !stop_host) {
    int more = step();
    announce();
    if (!more) break;
    read_commands(0);
  }
}
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "usage: zinc_host <program.so> [args...]\n"); return 2; }
  if (const char* fd = getenv("ZINC_DEV_FD")) dev_fd = atoi(fd);
  snprintf(pending, sizeof pending, "%s", argv[1]);
  argv[1] = argv[0];
  int rc = 0;
  while (pending[0] && !stop_host && !user_quit) {
    char path[1024];
    snprintf(path, sizeof path, "%s", pending);
    pending[0] = 0;
    t_load = hal_time_us();
    announced = false;
    if (void* h = dlopen(path, RTLD_NOW | RTLD_LOCAL)) {
      current = h;
      if (auto entry = (int (*)(int, char**))dlsym(h, "zinc_app_main")) rc = entry(argc - 1, argv + 1);
      else fprintf(stderr, "zinc dev: %s has no zinc_app_main\n", path);
      current = nullptr;
      dlclose(h);
    } else {
      fprintf(stderr, "zinc dev: %s\n", dlerror());
    }
    announce();
    // the program ended: keep the window responsive until the next version (or exit without a dev CLI)
    while (!pending[0] && !stop_host && !user_quit && dev_fd >= 0) {
      if (gfx) { HalInput in = {}; hal_poll_input(&in); }
      read_commands(30);
    }
  }
  if (inited) hal_shutdown_real();
  return rc;
}
