// display-fbdev: Linux framebuffer output plus evdev input (docs/plugins/display-fbdev.md).
// The program's surface (zinc.json width x height) is shown 1:1 when it matches the framebuffer, otherwise scaled
// (nearest, aspect kept, centered). Only damaged rows are rendered and written. /dev/fb0 missing or unusable:
// init returns 0 and the target HAL keeps the screen (headless builds under QEMU/docker).
#include "hal.h"
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/fb.h>
#include <linux/kd.h>
#include <linux/input.h>

#ifndef ZP_DISPLAY_FBDEV_DEVICE
#define ZP_DISPLAY_FBDEV_DEVICE "/dev/fb0"
#endif
#ifndef ZP_DISPLAY_FBDEV_INPUT
#define ZP_DISPLAY_FBDEV_INPUT 1
#endif
#ifndef ZP_DISPLAY_FBDEV_GRAB
#define ZP_DISPLAY_FBDEV_GRAB 1
#endif
#ifndef ZP_DISPLAY_FBDEV_FPS
#define ZP_DISPLAY_FBDEV_FPS 60
#endif

static int fd = -1, tty = -1;
static uint8_t* fbmem;
static size_t fblen;
static int fw, fh, bpp, pitch;
static int W, H, dx, dy, dw, dh;   // surface size and its rectangle on the framebuffer
static int *xmap, *ymap;           // framebuffer column/row -> surface column/row
static uint32_t* surf;             // rendered surface (0x00RRGGBB)
static int ro, go, bo, rl, gl, bl; // channel offsets / lengths
static uint32_t amask;
static bool vsync = true;
static uint64_t last_us;
static volatile sig_atomic_t sig_quit;

static uint64_t now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint64_t)t.tv_sec * 1000000u + t.tv_nsec / 1000; }
static inline uint32_t pack(uint32_t c) {
  return (((c >> 16 & 255) >> (8 - rl)) << ro) | (((c >> 8 & 255) >> (8 - gl)) << go) | (((c & 255) >> (8 - bl)) << bo) | amask;
}
static void put_row(int y, int x0, int x1, const uint32_t* src, const int* xm) {
  uint8_t* row = fbmem + (size_t)y * pitch;
  for (int x = x0; x < x1; x++) {
    uint32_t v = pack(src[xm ? xm[x - dx] : x - dx]);
    if (bpp == 32) ((uint32_t*)row)[x] = v;
    else if (bpp == 16) ((uint16_t*)row)[x] = (uint16_t)v;
    else { uint8_t* p = row + x * 3; p[0] = v; p[1] = v >> 8; p[2] = v >> 16; }
  }
}

// ---------------------------------------------------------------- input (evdev)
struct Dev { int fd; int32_t minx, maxx, miny, maxy; bool abs, mt; };
static Dev devs[16];
static int ndev;
static uint32_t held;
static float px, py;
static bool mouse_down, touch_down, quit_key;
static float wheel;
static int slot;
static struct { int id; float x, y; } slots[HAL_MAX_TOUCH];

static bool bit(const unsigned long* b, int n) { return b[n / (8 * sizeof(long))] >> (n % (8 * sizeof(long))) & 1; }
static void open_inputs() {
  for (int i = 0; i < 32 && ndev < 16; i++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/input/event%d", i);
    int f = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (f < 0) continue;
    unsigned long ev[1] = {0}, keys[KEY_MAX / (8 * sizeof(long)) + 1] = {0}, abs[ABS_MAX / (8 * sizeof(long)) + 1] = {0};
    ioctl(f, EVIOCGBIT(0, sizeof ev), ev);
    ioctl(f, EVIOCGBIT(EV_KEY, sizeof keys), keys);
    ioctl(f, EVIOCGBIT(EV_ABS, sizeof abs), abs);
    Dev d = {f, 0, 1, 0, 1, false, false};
    if (bit(ev, EV_ABS)) {
      d.mt = bit(abs, ABS_MT_POSITION_X);
      input_absinfo ax, ay;
      if (ioctl(f, EVIOCGABS(d.mt ? ABS_MT_POSITION_X : ABS_X), &ax) == 0 && ioctl(f, EVIOCGABS(d.mt ? ABS_MT_POSITION_Y : ABS_Y), &ay) == 0 && ax.maximum > ax.minimum) {
        d.abs = true; d.minx = ax.minimum; d.maxx = ax.maximum; d.miny = ay.minimum; d.maxy = ay.maximum;
      }
    }
    if (!bit(ev, EV_KEY) && !bit(ev, EV_REL) && !d.abs) { close(f); continue; }
    // keyboards are grabbed so keystrokes do not also reach the console behind the video
    if (ZP_DISPLAY_FBDEV_GRAB && bit(keys, KEY_ESC)) ioctl(f, EVIOCGRAB, 1);
    devs[ndev++] = d;
  }
  for (auto& s : slots) s.id = -1;
  px = W / 2.0f; py = H / 2.0f;
}
static uint32_t button_of(int code) {
  switch (code) {
    case KEY_UP: case KEY_W: return HAL_UP;
    case KEY_DOWN: case KEY_S: return HAL_DOWN;
    case KEY_LEFT: case KEY_A: return HAL_LEFT;
    case KEY_RIGHT: case KEY_D: return HAL_RIGHT;
    case KEY_SPACE: case KEY_Z: return HAL_A;
    case KEY_X: return HAL_B;
    case KEY_C: return HAL_X;
    case KEY_V: return HAL_Y;
    case KEY_Q: return HAL_L;
    case KEY_E: return HAL_R;
    case KEY_ENTER: case KEY_KPENTER: return HAL_START;
    case KEY_TAB: return HAL_SELECT;
  }
  return 0;
}
/** Device coordinates -> surface coordinates (through the letterbox). */
static void to_surface(const Dev& d, int32_t vx, int32_t vy, float* sx, float* sy) {
  float fx = (vx - d.minx) * (float)fw / (d.maxx - d.minx + 1), fy = (vy - d.miny) * (float)fh / (d.maxy - d.miny + 1);
  *sx = (fx - dx) * W / dw; *sy = (fy - dy) * H / dh;
}
static void read_dev(Dev& d) {
  input_event e[64];
  ssize_t n;
  while ((n = read(d.fd, e, sizeof e)) > 0) {
    for (int i = 0; i < (int)(n / sizeof(input_event)); i++) {
      const input_event& v = e[i];
      if (v.type == EV_KEY) {
        if (v.code == KEY_ESC && v.value == 1) quit_key = true;
        else if (v.code == BTN_LEFT) mouse_down = v.value != 0;
        else if (v.code == BTN_TOUCH) touch_down = v.value != 0;
        else if (uint32_t b = button_of(v.code)) { if (v.value) held |= b; else held &= ~b; }
      } else if (v.type == EV_REL) {
        if (v.code == REL_X) px += v.value;
        else if (v.code == REL_Y) py += v.value;
        else if (v.code == REL_WHEEL) wheel += v.value;
        px = px < 0 ? 0 : px > W - 1 ? W - 1 : px; py = py < 0 ? 0 : py > H - 1 ? H - 1 : py;
      } else if (v.type == EV_ABS && d.abs) {
        static int32_t ax, ay;
        if (v.code == ABS_MT_SLOT) slot = v.value < HAL_MAX_TOUCH ? v.value : HAL_MAX_TOUCH - 1;
        else if (v.code == ABS_MT_TRACKING_ID) slots[slot].id = v.value;
        else if (v.code == ABS_MT_POSITION_X) { float y; to_surface(d, v.value, 0, &slots[slot].x, &y); }
        else if (v.code == ABS_MT_POSITION_Y) { float x; to_surface(d, 0, v.value, &x, &slots[slot].y); }
        else if (!d.mt && v.code == ABS_X) { ax = v.value; to_surface(d, ax, ay, &px, &py); }
        else if (!d.mt && v.code == ABS_Y) { ay = v.value; to_surface(d, ax, ay, &px, &py); }
      }
    }
  }
}

// ---------------------------------------------------------------- HalDisplay
static void on_signal(int) { sig_quit = 1; }

static int fb_init(const HalConfig* cfg) {
  fd = open(ZP_DISPLAY_FBDEV_DEVICE, O_RDWR | O_CLOEXEC);
  if (fd < 0) return 0;
  fb_var_screeninfo var; fb_fix_screeninfo fix;
  if (ioctl(fd, FBIOGET_VSCREENINFO, &var) < 0 || ioctl(fd, FBIOGET_FSCREENINFO, &fix) < 0 || (var.bits_per_pixel != 16 && var.bits_per_pixel != 24 && var.bits_per_pixel != 32)) {
    close(fd); fd = -1; return 0;
  }
  fw = var.xres; fh = var.yres; bpp = var.bits_per_pixel; pitch = fix.line_length; fblen = fix.smem_len;
  fbmem = (uint8_t*)mmap(nullptr, fblen, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (fbmem == MAP_FAILED) { close(fd); fd = -1; return 0; }
  fbmem += (size_t)var.yoffset * pitch + (size_t)var.xoffset * (bpp / 8);
  ro = var.red.offset; go = var.green.offset; bo = var.blue.offset;
  rl = var.red.length; gl = var.green.length; bl = var.blue.length;
  amask = var.transp.length ? ((1u << var.transp.length) - 1) << var.transp.offset : 0;
  W = cfg->width; H = cfg->height;
  surf = (uint32_t*)calloc((size_t)W * H, 4);
  if (W == fw && H == fh) { dx = dy = 0; dw = W; dh = H; }
  else {  // ponytail: nearest-neighbour scaling; match zinc.json width/height to the framebuffer for 1:1 copies
    double k = (double)fw / W < (double)fh / H ? (double)fw / W : (double)fh / H;
    dw = (int)(W * k); dh = (int)(H * k); dx = (fw - dw) / 2; dy = (fh - dh) / 2;
    xmap = (int*)malloc(sizeof(int) * dw); ymap = (int*)malloc(sizeof(int) * dh);
    for (int x = 0; x < dw; x++) xmap[x] = (int)((x + 0.5) * W / dw);
    for (int y = 0; y < dh; y++) ymap[y] = (int)((y + 0.5) * H / dh);
  }
  for (int y = 0; y < fh; y++) memset(fbmem + (size_t)y * pitch, 0, (size_t)fw * (bpp / 8));
  // console in graphics mode: no text cursor or kernel messages over the picture (needs a VT; ignored otherwise)
  tty = open("/dev/tty0", O_RDWR | O_CLOEXEC);
  if (tty >= 0 && ioctl(tty, KDSETMODE, KD_GRAPHICS) < 0) { close(tty); tty = -1; }
  signal(SIGINT, on_signal); signal(SIGTERM, on_signal);
  if (ZP_DISPLAY_FBDEV_INPUT) open_inputs();
  fprintf(stderr, "fbdev: %s %dx%d %d bpp, surface %dx%d at %d,%d size %dx%d, %d input device(s)\n", ZP_DISPLAY_FBDEV_DEVICE, fw, fh, bpp, W, H, dx, dy, dw, dh, ndev);
  return 1;
}

static void fb_present(const HalFrame* f) {
  if (f->y1 > f->y0 && f->x1 > f->x0) f->render(surf + (size_t)f->y0 * W, f->y0, f->y1);
  // pacing: the null HAL has no vsync; wait for the display's, or sleep to the configured rate
  if (vsync) { int z = 0; if (ioctl(fd, FBIO_WAITFORVSYNC, &z) < 0) vsync = false; }
  if (!vsync) {
    uint64_t period = 1000000u / ZP_DISPLAY_FBDEV_FPS, t = now_us();
    if (last_us && t - last_us < period) usleep((useconds_t)(period - (t - last_us)));
    last_us = now_us();
  }
  if (f->y1 <= f->y0 || f->x1 <= f->x0) return;
  if (!xmap) {
    for (int y = f->y0; y < f->y1; y++) put_row(y, f->x0, f->x1, surf + (size_t)y * W, nullptr);
    return;
  }
  int j0 = (int)((double)f->y0 * dh / H) - 1, j1 = (int)((double)f->y1 * dh / H) + 2;
  if (j0 < 0) j0 = 0;
  if (j1 > dh) j1 = dh;
  for (int j = j0; j < j1; j++) if (ymap[j] >= f->y0 && ymap[j] < f->y1) put_row(dy + j, dx, dx + dw, surf + (size_t)ymap[j] * W, xmap);
}

static void fb_poll(HalInput* in) {
  // the null HAL counts a frame budget (60 by default) for headless tests; on a real screen only ZINC_FRAMES does
  static bool budget = getenv("ZINC_FRAMES") != nullptr;
  if (!budget) in->quit = 0;
  for (int i = 0; i < ndev; i++) read_dev(devs[i]);
  in->buttons |= held;
  in->ntouch = 0;
  for (auto& s : slots) if (s.id >= 0 && in->ntouch < HAL_MAX_TOUCH) in->touch[in->ntouch++] = HalTouch{s.id, s.x, s.y};
  if (in->ntouch) { px = in->touch[0].x; py = in->touch[0].y; }
  in->px = px; in->py = py;
  in->pdown = mouse_down || touch_down || in->ntouch > 0;
  in->wheel += wheel; wheel = 0;
  if (quit_key || sig_quit) in->quit = 1;
}

static void fb_shutdown() {
  if (tty >= 0) { ioctl(tty, KDSETMODE, KD_TEXT); close(tty); tty = -1; }
  for (int i = 0; i < ndev; i++) close(devs[i].fd);
  ndev = 0;
  if (fd >= 0) close(fd);
  fd = -1;
}

static HalDisplay fbdev = {fb_init, fb_present, fb_poll, fb_shutdown};
static int registered = (hal_display = &fbdev, 0);
