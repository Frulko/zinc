// A stand-in for Quill's engine shim (integrations/remarkable-ink/quill) for tests/t1/sidecar_session.sh: a Paper Pro's RGB32 buffer
// in memory, and one line per swap in $FAKEQUILL_LOG ("swap x,y wxh mode M full F", the thread's id, the first pixel of the rectangle,
// "at" the monotonic time in ms).
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static unsigned char* buf;
static FILE* log_;
int quill_init(void) { buf = calloc(1620 * 2160, 4); log_ = fopen(getenv("FAKEQUILL_LOG"), "w"); return buf && log_ ? 0 : 1; }
int quill_width(void) { return 1620; }
int quill_height(void) { return 2160; }
int quill_stride(void) { return 1620 * 4; }
unsigned char* quill_buffer(void) { return buf; }
unsigned long quill_swap_ex(int x, int y, int w, int h, int mode, int full, int content) {
  const unsigned char* p = buf + ((size_t)y * 1620 + x) * 4;
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  fprintf(log_, "swap %d,%d %dx%d mode %d full %d content %d thread %lx pixel %02x%02x%02x%02x at %ld\n", x, y, w, h, mode, full, content,
          (unsigned long)pthread_self(), p[3], p[2], p[1], p[0], (long)(t.tv_sec * 1000 + t.tv_nsec / 1000000));
  fflush(log_);
  return 0;
}
void quill_process_events(void) {}
