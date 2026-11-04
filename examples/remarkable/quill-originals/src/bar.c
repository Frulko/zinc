// LD_PRELOAD into an unmodified Quill demo: a band on top of the panel with a way out, without touching the demo's source.
// Every swap of the demo stamps the band into the framebuffer first; a thread reads the touch panel and a finger in the band ends the demo with
// SIGTERM, which every demo handles. EVIOCGRAB is ignored so that the demo's grab of the touch panel does not hide it from this thread.
// Nothing else changes: the demo's pixels, modes and timing reach the same libquill.so.
#define _GNU_SOURCE
#include "lab.h"
#include <dlfcn.h>
#include <pthread.h>
#include <signal.h>
#include <stdarg.h>

#define EVIOCGRAB_REQ 0x40044590
static int W, H, STRIDE;
static unsigned char *FB;
static unsigned long (*real_swap_ex)(int, int, int, int, int, int, int);
static unsigned long (*real_swap)(int, int, int, int, int, int);

int ioctl(int fd, unsigned long req, ...) {
  static int (*real)(int, unsigned long, void *);
  if (!real) real = (int (*)(int, unsigned long, void *))dlsym(RTLD_NEXT, "ioctl");
  va_list v; va_start(v, req); void *arg = va_arg(v, void *); va_end(v);
  if (req == EVIOCGRAB_REQ) return 0;
  return real(fd, req, arg);
}

static void stamp(void) {
  const char *title = getenv("QUILL_DEMO_TITLE");
  fill(FB, STRIDE, 0, 0, W, BAR_H, 0xffffffff);
  fill(FB, STRIDE, 0, BAR_H - 4, W, 4, 0xff000000);
  text(FB, STRIDE, 30, 28, "< RETOUR", GLYPH_SCALE, 0xff000000);
  if (title) text(FB, STRIDE, 460, 34, title, 5, 0xff000000);
}
static void *watch_touch(void *unused) {
  (void)unused;
  struct touch t;
  if (touch_open(&t, W, H) != 0) return NULL;
  for (;;) {
    int x, y;
    if (touch_tap(&t, 1000, &x, &y) && y < BAR_H) {
      kill(getpid(), SIGTERM);
      sleep(3);     // a demo that does not leave: the launcher must come back anyway
      _exit(0);
    }
  }
}

int quill_init(void) {
  int (*real)(void) = (int (*)(void))dlsym(RTLD_NEXT, "quill_init");
  real_swap_ex = (unsigned long (*)(int, int, int, int, int, int, int))dlsym(RTLD_NEXT, "quill_swap_ex");
  real_swap = (unsigned long (*)(int, int, int, int, int, int))dlsym(RTLD_NEXT, "quill_swap");
  int r = real();
  if (r != 0) return r;
  W = ((int (*)(void))dlsym(RTLD_NEXT, "quill_width"))();
  H = ((int (*)(void))dlsym(RTLD_NEXT, "quill_height"))();
  STRIDE = ((int (*)(void))dlsym(RTLD_NEXT, "quill_stride"))();
  FB = ((unsigned char *(*)(void))dlsym(RTLD_NEXT, "quill_buffer"))();
  pthread_t th;
  pthread_create(&th, NULL, watch_touch, NULL);
  return 0;
}
unsigned long quill_swap_ex(int x, int y, int w, int h, int mode, int full, int content) {
  stamp();
  return real_swap_ex(x, y, w, h, mode, full, content);
}
unsigned long quill_swap(int x, int y, int w, int h, int mode, int full) {
  stamp();
  return real_swap(x, y, w, h, mode, full);
}
