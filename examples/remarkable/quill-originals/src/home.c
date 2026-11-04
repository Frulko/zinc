// The launcher: one row per line of demos.txt ("Title|binary args"). A tap writes the row's number and exits 42 (session.sh runs that demo and
// comes back here), Quitter exits 0 (the lease brings xochitl back). The engine lives per process, so this program leaves before a demo starts.
#include "lab.h"
#include <signal.h>

extern int quill_init(void);
extern int quill_width(void);
extern int quill_height(void);
extern int quill_stride(void);
extern unsigned char *quill_buffer(void);
extern unsigned long quill_swap_ex(int x, int y, int w, int h, int mode, int full, int content);
extern void quill_process_events(void);

enum { MAX_ROWS = 20, ROW_H = 150 };
static volatile sig_atomic_t quit_now = 0;
static void on_term(int s) { (void)s; quit_now = 1; }

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: home demos.txt choice-file\n"); return 2; }
  signal(SIGTERM, on_term);
  char titles[MAX_ROWS][64];
  int rows = 0;
  FILE *f = fopen(argv[1], "r");
  if (!f) { perror(argv[1]); return 1; }
  char line[256];
  while (rows < MAX_ROWS && fgets(line, sizeof line, f)) {
    char *bar = strchr(line, '|');
    if (!bar) continue;
    *bar = 0;
    snprintf(titles[rows++], sizeof titles[0], "%s", line);
  }
  fclose(f);
  if (quill_init() != 0) { fprintf(stderr, "home: quill_init failed\n"); return 1; }
  int W = quill_width(), H = quill_height(), S = quill_stride();
  unsigned char *fb = quill_buffer();
  fill(fb, S, 0, 0, W, H, 0xffffffff);
  fill(fb, S, 0, BAR_H - 4, W, 4, 0xff000000);
  text(fb, S, 30, 28, "X QUITTER", GLYPH_SCALE, 0xff000000);
  text(fb, S, 560, 34, "QUILL - VRAIS BINAIRES", 5, 0xff000000);
  for (int i = 0; i < rows; i++) {
    int y = BAR_H + i * ROW_H;
    fill(fb, S, 0, y + ROW_H - 3, W, 3, 0xff000000);
    text(fb, S, 50, y + 50, titles[i], 7, 0xff000000);
  }
  quill_swap_ex(0, 0, W, H, 3, 1, 0);
  struct touch t;
  if (touch_open(&t, W, H) != 0) { fprintf(stderr, "home: no touch panel\n"); return 1; }
  while (!quit_now) {
    int x, y;
    quill_process_events();
    if (!touch_tap(&t, 100, &x, &y)) continue;
    if (y < BAR_H) return 0;
    int row = (y - BAR_H) / ROW_H;
    if (row >= rows) continue;
    f = fopen(argv[2], "w");
    if (!f) return 1;
    fprintf(f, "%d\n", row + 1);
    fclose(f);
    return 42;
  }
  return 0;
}
