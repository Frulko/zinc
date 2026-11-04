// What the launcher (home.c) and the toolbar (bar.c) share: a 5x7 font, the evdev touch reader, the band's size.
#pragma once
#include <fcntl.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/time.h>
#include <unistd.h>

enum { BAR_H = 110, GLYPH_SCALE = 7 };

// Classic 5x7 columns, ASCII 0x20 to 0x5A: titles are written in capitals without accents.
static const uint8_t FONT[][5] = {
  {0,0,0,0,0},{0,0,0x5F,0,0},{0,7,0,7,0},{0x14,0x7F,0x14,0x7F,0x14},{0x24,0x2A,0x7F,0x2A,0x12},{0x23,0x13,8,0x64,0x62},{0x36,0x49,0x55,0x22,0x50},{0,5,3,0,0},
  {0,0x1C,0x22,0x41,0},{0,0x41,0x22,0x1C,0},{0x14,8,0x3E,8,0x14},{8,8,0x3E,8,8},{0,0x50,0x30,0,0},{8,8,8,8,8},{0,0x60,0x60,0,0},{0x20,0x10,8,4,2},
  {0x3E,0x51,0x49,0x45,0x3E},{0,0x42,0x7F,0x40,0},{0x42,0x61,0x51,0x49,0x46},{0x21,0x41,0x45,0x4B,0x31},{0x18,0x14,0x12,0x7F,0x10},{0x27,0x45,0x45,0x45,0x39},{0x3C,0x4A,0x49,0x49,0x30},{1,0x71,9,5,3},
  {0x36,0x49,0x49,0x49,0x36},{6,0x49,0x49,0x29,0x1E},{0,0x36,0x36,0,0},{0,0x56,0x36,0,0},{8,0x14,0x22,0x41,0},{0x14,0x14,0x14,0x14,0x14},{0,0x41,0x22,0x14,8},{2,1,0x51,9,6},
  {0x32,0x49,0x79,0x41,0x3E},{0x7E,0x11,0x11,0x11,0x7E},{0x7F,0x49,0x49,0x49,0x36},{0x3E,0x41,0x41,0x41,0x22},{0x7F,0x41,0x41,0x22,0x1C},{0x7F,0x49,0x49,0x49,0x41},{0x7F,9,9,9,1},{0x3E,0x41,0x49,0x49,0x7A},
  {0x7F,8,8,8,0x7F},{0,0x41,0x7F,0x41,0},{0x20,0x40,0x41,0x3F,1},{0x7F,8,0x14,0x22,0x41},{0x7F,0x40,0x40,0x40,0x40},{0x7F,2,0xC,2,0x7F},{0x7F,4,8,0x10,0x7F},{0x3E,0x41,0x41,0x41,0x3E},
  {0x7F,9,9,9,6},{0x3E,0x41,0x51,0x21,0x5E},{0x7F,9,0x19,0x29,0x46},{0x46,0x49,0x49,0x49,0x31},{1,1,0x7F,1,1},{0x3F,0x40,0x40,0x40,0x3F},{0x1F,0x20,0x40,0x20,0x1F},{0x3F,0x40,0x38,0x40,0x3F},
  {0x63,0x14,8,0x14,0x63},{7,8,0x70,8,7},{0x61,0x51,0x49,0x45,0x43},
};

static void fill(unsigned char *fb, int stride, int x, int y, int w, int h, uint32_t bgrx) {
  for (int j = y; j < y + h; j++) {
    uint32_t *row = (uint32_t *)(fb + (size_t)j * stride);
    for (int i = x; i < x + w; i++) row[i] = bgrx;
  }
}
static void text(unsigned char *fb, int stride, int x, int y, const char *s, int scale, uint32_t bgrx) {
  for (; *s; s++, x += 6 * scale) {
    int c = *s >= 'a' && *s <= 'z' ? *s - 32 : *s;
    if (c < 0x20 || c > 0x5A) continue;
    for (int col = 0; col < 5; col++) for (int row = 0; row < 7; row++)
      if (FONT[c - 0x20][col] >> row & 1) fill(fb, stride, x + col * scale, y + row * scale, scale, scale, bgrx);
  }
}

// The touch panel, never grabbed. A new finger reads as a tap in panel pixels (TOUCH_FLIPX, TOUCH_FLIPY: see the README).
struct raw_event { struct timeval time; uint16_t type, code; int32_t value; };
struct abs_info { int32_t value, minimum, maximum, fuzz, flat, resolution; };
#define ABS_INFO(code) (0x80184540 + (code))
struct touch { int fd, max_x, max_y, x, y, fresh, W, H; };

static int touch_open(struct touch *t, int W, int H) {
  memset(t, 0, sizeof *t);
  t->W = W; t->H = H; t->fd = -1;
  for (int i = 0; i < 16 && t->fd < 0; i++) {
    char path[64], name[128] = "";
    snprintf(path, sizeof path, "/sys/class/input/event%d/device/name", i);
    FILE *f = fopen(path, "r");
    if (!f) continue;
    if (!fgets(name, sizeof name, f)) name[0] = 0;
    fclose(f);
    if (!strstr(name, "touch")) continue;
    snprintf(path, sizeof path, "/dev/input/event%d", i);
    t->fd = open(path, O_RDONLY | O_NONBLOCK);
  }
  if (t->fd < 0) return -1;
  struct abs_info a;
  t->max_x = ioctl(t->fd, ABS_INFO(53), &a) == 0 ? a.maximum : W - 1;
  t->max_y = ioctl(t->fd, ABS_INFO(54), &a) == 0 ? a.maximum : H - 1;
  fprintf(stderr, "quill-originals: touch max %dx%d\n", t->max_x, t->max_y);
  return 0;
}
/** Waits up to ms; 1 and a position when a finger landed. */
static int touch_tap(struct touch *t, int ms, int *x, int *y) {
  struct pollfd p = {t->fd, POLLIN, 0};
  if (poll(&p, 1, ms) <= 0) return 0;
  struct raw_event e[32];
  ssize_t n = read(t->fd, e, sizeof e);
  for (int i = 0; i < (int)(n / (ssize_t)sizeof e[0]); i++) {
    if (e[i].type == 3 && e[i].code == 57 && e[i].value != -1) t->fresh = 1;     // ABS_MT_TRACKING_ID
    else if (e[i].type == 3 && e[i].code == 53) t->x = e[i].value;
    else if (e[i].type == 3 && e[i].code == 54) t->y = e[i].value;
    else if (e[i].type == 0 && t->fresh) {                                       // the report that names its position
      t->fresh = 0;
      *x = (int)((int64_t)t->x * (t->W - 1) / t->max_x);
      *y = (int)((int64_t)t->y * (t->H - 1) / t->max_y);
      if (getenv("TOUCH_FLIPX")) *x = t->W - 1 - *x;
      if (getenv("TOUCH_FLIPY")) *y = t->H - 1 - *y;
      fprintf(stderr, "quill-originals: tap %d,%d\n", *x, *y);
      return 1;
    }
  }
  return 0;
}
