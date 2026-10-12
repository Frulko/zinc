// display-fbdev: Linux framebuffer output plus evdev input (docs/plugins/display-fbdev.md).
// The program's surface (zinc.json width x height) is shown 1:1 when it matches the framebuffer, otherwise scaled
// (nearest, aspect kept, centered). Only damaged rows are rendered and written. /dev/fb0 missing or unusable:
// init returns 0 and the target HAL keeps the screen (headless builds under QEMU/docker).
#include "hal.h"
#include "render_bands.h"
#include <algorithm>
#include <atomic>
#include <vector>
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
// ZINC_RENDER_THREADS: rasterizer and converter threads (1 = the old single-thread path). Leaked on purpose: the workers
// wait on its condition variable until the process ends, and destroying it at exit would hang (glibc waits for waiters).
static zbands::Pool& pool = *new zbands::Pool;
static bool stats, crc_on, fuse;     // ZINC_FBDEV_STATS / _CRC / _FUSE (see fb_present)
static double skip_s;                // ZINC_FBDEV_SKIP_S: seconds after the first frame left out of the stats

static uint64_t now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint64_t)t.tv_sec * 1000000u + t.tv_nsec / 1000; }
static inline uint32_t pack(uint32_t c) {
  return (((c >> 16 & 255) >> (8 - rl)) << ro) | (((c >> 8 & 255) >> (8 - gl)) << go) | (((c & 255) >> (8 - bl)) << bo) | amask;
}
// ---------------------------------------------------------------- output: converting a surface row to the framebuffer format
enum { FMT_GENERIC, FMT_565, FMT_8888 };
static int fmt = FMT_GENERIC;      // exact layouts get a branch-free loop, anything else the generic one
static void conv_row(const uint32_t* s, uint8_t* row, int x0, int n) {
  if (fmt == FMT_565) {
    uint16_t* d = (uint16_t*)row + x0;
    for (int i = 0; i < n; i++) { uint32_t c = s[i]; d[i] = (uint16_t)(((c >> 8) & 0xF800) | ((c >> 5) & 0x07E0) | ((c >> 3) & 0x001F)); }
  } else if (fmt == FMT_8888) {
    uint32_t* d = (uint32_t*)row + x0;
    for (int i = 0; i < n; i++) d[i] = s[i] | amask;
  } else if (bpp == 32) {
    uint32_t* d = (uint32_t*)row + x0;
    for (int i = 0; i < n; i++) d[i] = pack(s[i]);
  } else if (bpp == 16) {
    uint16_t* d = (uint16_t*)row + x0;
    for (int i = 0; i < n; i++) d[i] = (uint16_t)pack(s[i]);
  } else {
    uint8_t* d = row + x0 * 3;
    for (int i = 0; i < n; i++, d += 3) { uint32_t v = pack(s[i]); d[0] = v; d[1] = v >> 8; d[2] = v >> 16; }
  }
}
/** Framebuffer row y from the surface row `src`, columns x0..x1 (framebuffer coordinates); xm maps them when scaled. */
static void put_row(int y, int x0, int x1, const uint32_t* src, const int* xm) {
  uint8_t* row = fbmem + (size_t)y * pitch;
  if (!xm) { conv_row(src + (x0 - dx), row, x0, x1 - x0); return; }
  static thread_local std::vector<uint32_t> tmp;   // scaled: gather the columns, then convert them in one go
  if ((int)tmp.size() < x1 - x0) tmp.resize(x1 - x0);
  for (int x = x0; x < x1; x++) tmp[x - x0] = src[xm[x - dx]];
  conv_row(tmp.data(), row, x0, x1 - x0);
}

// ---------------------------------------------------------------- input (evdev)
struct Dev { int fd; int32_t minx, maxx, miny, maxy; bool abs, mt; };
static Dev devs[16];
static int ndev;
static uint32_t held;
static float px, py;
// A press and its release can both arrive between two polls (a quick tap on a screen drawn 20 times a second): the press is then shown
// for one poll and released at the next, instead of never being seen.
struct Latch {
  bool down, fresh, gone;
  void set(bool v) { if (v) { down = fresh = true; gone = false; } else if (fresh) gone = true; else down = false; }
  void shown() { if (gone) down = false; fresh = gone = false; }
};
static Latch mouse_btn, touch_btn;
static bool quit_key;
static float wheel;
static int slot;
static struct { int id; float x, y; bool fresh, gone; } slots[HAL_MAX_TOUCH];   // fresh, gone: as Latch, for a finger

// ZINC_FBDEV_SIM=<file> (ZN-129): the framebuffer is a plain file with a fixed screeninfo, so the format conversion and the letterbox run anywhere, on a Mac too.
//   ZINC_FBDEV_SIM_FORMAT=<w>x<h>x<bpp> (default 640x480x32; 16 = RGB565, 24 = RGB888 in BGR byte order, 32 = XRGB8888 with alpha 0xFF)
//   ZINC_FBDEV_SIM_INPUT=<file>: raw `struct input_event` records played back one SYN_REPORT per poll as a multitouch screen the size of the framebuffer.
static const char* sim_fb = getenv("ZINC_FBDEV_SIM");
static const char* sim_input = getenv("ZINC_FBDEV_SIM_INPUT");
static bool bit(const unsigned long* b, int n) { return b[n / (8 * sizeof(long))] >> (n % (8 * sizeof(long))) & 1; }
static void open_inputs() {
  if (sim_fb) {   // the scripted screen: no ioctl on a plain file
    if (sim_input) { int f = open(sim_input, O_RDONLY | O_CLOEXEC); if (f >= 0) devs[ndev++] = Dev{f, 0, fw - 1, 0, fh - 1, true, true}; }
    for (auto& s : slots) s.id = -1;
    px = W / 2.0f; py = H / 2.0f;
    return;
  }
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
  bool frameDone = false;
  // a script: one frame of events (up to SYN_REPORT) per poll; a device: everything it has sent, so the pointer never lags behind the finger
  while (!(sim_fb && frameDone) && (n = read(d.fd, e, sim_fb ? sizeof(input_event) : sizeof e)) > 0) {
    for (int i = 0; i < (int)(n / sizeof(input_event)); i++) {
      const input_event& v = e[i];
      if (v.type == EV_SYN && v.code == SYN_REPORT) frameDone = true;
      if (v.type == EV_KEY) {
        if (v.code == KEY_ESC && v.value == 1) quit_key = true;
        else if (v.code == BTN_LEFT) mouse_btn.set(v.value != 0);
        else if (v.code == BTN_TOUCH) touch_btn.set(v.value != 0);
        else if (uint32_t b = button_of(v.code)) { if (v.value) held |= b; else held &= ~b; }
      } else if (v.type == EV_REL) {
        if (v.code == REL_X) px += v.value;
        else if (v.code == REL_Y) py += v.value;
        else if (v.code == REL_WHEEL) wheel += v.value;
        px = px < 0 ? 0 : px > W - 1 ? W - 1 : px; py = py < 0 ? 0 : py > H - 1 ? H - 1 : py;
      } else if (v.type == EV_ABS && d.abs) {
        static int32_t ax, ay;
        if (v.code == ABS_MT_SLOT) slot = v.value < HAL_MAX_TOUCH ? v.value : HAL_MAX_TOUCH - 1;
        else if (v.code == ABS_MT_TRACKING_ID) {
          auto& s = slots[slot];
          if (v.value >= 0) { s.id = v.value; s.fresh = true; s.gone = false; } else if (s.fresh) s.gone = true; else s.id = -1;
        }
        else if (v.code == ABS_MT_POSITION_X) { float y; to_surface(d, v.value, 0, &slots[slot].x, &y); }
        else if (v.code == ABS_MT_POSITION_Y) { float x; to_surface(d, 0, v.value, &x, &slots[slot].y); }
        else if (!d.mt && v.code == ABS_X) { ax = v.value; to_surface(d, ax, ay, &px, &py); }
        else if (!d.mt && v.code == ABS_Y) { ay = v.value; to_surface(d, ax, ay, &px, &py); }
      }
    }
  }
}

// ---------------------------------------------------------------- hardware layers on KMS planes (ZN-731)
// While a frame holds a picture that lies in device memory (hal.h HalPicture: the dmabuf of a video decoder), the picture is shown by an
// overlay plane of the display's compositor (the HVS of a Raspberry Pi scales and converts it) and the software frame by a second overlay
// plane above it, ARGB8888, transparent where the rasterizer left a hole. Two buffers take turns on that plane; each commit shows the
// frame and its pictures at the same refresh. The mode and the console's primary plane (/dev/fb0) are never touched: the planes and
// their buffers belong to this process's DRM file, the kernel removes them when it is closed, by us or by a crash, and the console is
// what it was.
// Every frame takes that way when the display has the planes (ZN-735), with or without a picture: /dev/fb0 is the buffer on the screen,
// and a frame converted into it while the screen reads it shows as bands of the new frame beside bands of the old one. The frame is
// written to the buffer that is not shown and one commit shows it at the refresh. ZINC_FBDEV_FLIP=0: the frames go to /dev/fb0 as before
// and the planes are taken only while a picture is shown.
/** A row of a picture's place as the plane above the picture wants it: `n` pixels of the frame at `s`, written opaque at `d` by conv_row.
 *  A hole is transparent. `w`, when given, is the same row drawn over white holes: where the two differ the pixel lets some of the
 *  picture through (hal.h hal_layer_pixel). */
static void punch(const uint32_t* s, const uint32_t* w, uint32_t* d, int n) {
  for (int i = 0; i < n; i++) {
    if (s[i] == HAL_LAYER_HOLE) d[i] = 0;
    else if (w && w[i] != s[i]) d[i] = hal_layer_pixel(s[i], w[i]);
  }
}
/** Whether something is drawn over the hole in these pixels. */
static bool covered(const uint32_t* s, int n) { for (int i = 0; i < n; i++) if (s[i] != HAL_LAYER_HOLE) return true; return false; }
static uint32_t* over;   // the rows of the pictures drawn over white holes (surface size, allocated with the first picture)

#if __has_include(<drm/drm.h>) && __has_include(<drm/drm_mode.h>) && __has_include(<drm/drm_fourcc.h>)
#include <drm/drm.h>
#include <drm/drm_mode.h>
#include <drm/drm_fourcc.h>
#include <poll.h>
#include <errno.h>
#define ZP_FBDEV_KMS 1
namespace kms {
enum { FB, CRTC, SX, SY, SW, SH, CX, CY, CW, CH, ZPOS, RANGE, ENCODING, NPROP };
enum { OVERLAY = 0, PRIMARY = 1 };   // a plane's "type" property
static const char* const names[NPROP] = {"FB_ID", "CRTC_ID", "SRC_X", "SRC_Y", "SRC_W", "SRC_H", "CRTC_X", "CRTC_Y", "CRTC_W", "CRTC_H", "zpos", "COLOR_RANGE", "COLOR_ENCODING"};
struct Plane { uint32_t id, prop[NPROP]; };
struct Buffer { uint32_t fb, pitch; uint8_t* map; size_t len; };
struct Shown { uint32_t serial, fb; HalLayer at; int32_t w, h, full_range, bt709; };
static int fd = -1;
static uint32_t crtc;
static Plane top, under[HAL_MAX_LAYERS];
static Buffer buf[2];
static int back;                       // the buffer the next frame is written to; the other one is on the screen
static Shown lay[HAL_MAX_LAYERS];      // the pictures of the frame presented next
static int nlay;
static std::vector<uint32_t> replaced, retired;   // framebuffers of pictures that left: with the next commit, and off the screen once its refresh came
static bool pending;                   // a commit waits for its refresh
static bool failed;                    // the display refused the planes: /dev/fb0 until the program ends
static bool flip;                      // every frame goes through the two buffers (the file stays open), not only the frames with a picture
static bool refuse;                    // ZINC_FBDEV_PLANES=refuse: no picture is taken on a plane
static int full, idle;                 // buffers still to write whole; frames since the last picture
struct Area { int x0, y0, x1, y1; };
static Area behind;                    // what the buffer on the screen holds and the other one does not yet
static struct { uint8_t* mem; int pitch, bpp, fmt; uint32_t amask; } fb0;   // /dev/fb0's layout, while the frame goes to the plane
static uint32_t pictures, frames, direct;   // statistics: pictures adopted, frames committed, frames written straight into /dev/fb0
static uint64_t asked, wrote;          // statistics: pixels of the frames' damage, pixels written to the buffers (the damage before comes too)

static int io(unsigned long req, void* arg) { int r; do r = ioctl(fd, req, arg); while (r < 0 && (errno == EINTR || errno == EAGAIN)); return r; }
static bool describe(uint32_t id, Plane* p, uint64_t* type) {
  uint32_t ids[64]; uint64_t vals[64];
  drm_mode_obj_get_properties g = {};
  g.props_ptr = (uintptr_t)ids; g.prop_values_ptr = (uintptr_t)vals; g.count_props = 64; g.obj_id = id; g.obj_type = DRM_MODE_OBJECT_PLANE;
  if (io(DRM_IOCTL_MODE_OBJ_GETPROPERTIES, &g) < 0 || g.count_props > 64) return false;
  *p = Plane{id, {}};
  for (uint32_t i = 0; i < g.count_props; i++) {
    drm_mode_get_property q = {};
    q.prop_id = ids[i];
    if (io(DRM_IOCTL_MODE_GETPROPERTY, &q) < 0) continue;
    if (!strcmp(q.name, "type")) *type = vals[i];
    for (int k = 0; k < NPROP; k++) if (!strcmp(q.name, names[k])) p->prop[k] = ids[i];
  }
  return p->prop[FB] && p->prop[CRTC] && p->prop[SW] && p->prop[CW];
}
static void close_file() {
  for (Buffer& b : buf) { if (b.map) munmap(b.map, b.len); b = Buffer{}; }
  if (fd >= 0) close(fd);   // the planes, the framebuffers and the buffers go with it
  fd = -1; nlay = 0; pending = false; replaced.clear(); retired.clear();
}
static int card = -1;   // the display's card once its planes were found: their ids do not change, a later open only makes the buffers
/** The screen's CRTC, a free overlay plane per picture and one for the frame above them. */
static bool find_planes() {
  uint32_t crtcs[16], ids[128];
  drm_mode_card_res res = {};
  res.crtc_id_ptr = (uintptr_t)crtcs; res.count_crtcs = 16;
  drm_mode_get_plane_res pr = {};
  pr.plane_id_ptr = (uintptr_t)ids; pr.count_planes = 128;
  if (io(DRM_IOCTL_MODE_GETRESOURCES, &res) < 0 || res.count_crtcs > 16 || io(DRM_IOCTL_MODE_GETPLANERESOURCES, &pr) < 0 || pr.count_planes > 128) return false;
  // the screen is where the console is: the CRTC of the primary plane that shows a framebuffer
  uint32_t mask = 0;
  crtc = 0;
  for (uint32_t i = 0; i < pr.count_planes && !crtc; i++) {
    drm_mode_get_plane gp = {};
    gp.plane_id = ids[i];
    Plane p; uint64_t type = ~0ull;
    if (io(DRM_IOCTL_MODE_GETPLANE, &gp) < 0 || !gp.crtc_id || !gp.fb_id || !describe(ids[i], &p, &type) || type != PRIMARY) continue;
    for (uint32_t k = 0; k < res.count_crtcs; k++) if (crtcs[k] == gp.crtc_id) { crtc = gp.crtc_id; mask = 1u << k; }
  }
  drm_mode_crtc cr = {};
  cr.crtc_id = crtc;
  if (!crtc || io(DRM_IOCTL_MODE_GETCRTC, &cr) < 0 || cr.mode.hdisplay != fw || cr.mode.vdisplay != fh) return false;
  int n = 0;   // the first free ones under, for the pictures, the next one above for the frame
  for (uint32_t i = 0; i < pr.count_planes && n <= HAL_MAX_LAYERS; i++) {
    uint32_t fmts[128];
    drm_mode_get_plane gp = {};
    gp.plane_id = ids[i]; gp.format_type_ptr = (uintptr_t)fmts; gp.count_format_types = 128;
    Plane p; uint64_t type = ~0ull;
    if (io(DRM_IOCTL_MODE_GETPLANE, &gp) < 0 || gp.fb_id || !(gp.possible_crtcs & mask) || gp.count_format_types > 128 || !describe(ids[i], &p, &type) || type != OVERLAY || !p.prop[ZPOS]) continue;
    bool argb = false;
    for (uint32_t k = 0; k < gp.count_format_types; k++) if (fmts[k] == DRM_FORMAT_ARGB8888) argb = true;
    if (n < HAL_MAX_LAYERS) under[n++] = p; else if (argb) { top = p; n++; }
  }
  return n == HAL_MAX_LAYERS + 1;
}
/** The display's file with its planes and two buffers for the frame. */
static bool open_file() {
  for (int c = card < 0 ? 0 : card; c < (card < 0 ? 4 : card + 1) && fd < 0; c++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/dri/card%d", c);
    if ((fd = open(path, O_RDWR | O_CLOEXEC)) < 0) continue;
    drm_set_client_cap planes = {DRM_CLIENT_CAP_UNIVERSAL_PLANES, 1}, atomic = {DRM_CLIENT_CAP_ATOMIC, 1};
    bool ok = io(DRM_IOCTL_SET_CLIENT_CAP, &planes) == 0 && io(DRM_IOCTL_SET_CLIENT_CAP, &atomic) == 0 && (card == c || find_planes());
    for (Buffer& b : buf) {
      drm_mode_create_dumb cd = {};
      cd.width = fw; cd.height = fh; cd.bpp = 32;
      if (!ok || io(DRM_IOCTL_MODE_CREATE_DUMB, &cd) < 0) { ok = false; break; }
      drm_mode_fb_cmd2 f = {};
      f.width = fw; f.height = fh; f.pixel_format = DRM_FORMAT_ARGB8888; f.handles[0] = cd.handle; f.pitches[0] = cd.pitch;
      drm_mode_map_dumb md = {};
      md.handle = cd.handle;
      void* m = io(DRM_IOCTL_MODE_ADDFB2, &f) == 0 && io(DRM_IOCTL_MODE_MAP_DUMB, &md) == 0 ? mmap(nullptr, cd.size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, md.offset) : MAP_FAILED;
      if (m == MAP_FAILED) { ok = false; break; }
      b = Buffer{f.fb_id, cd.pitch, (uint8_t*)m, (size_t)cd.size};
    }
    if (ok) { card = c; return true; }
    close_file();
  }
  return false;
}
/** The frames go to the two buffers from here: both are still to write whole, and /dev/fb0's layout is kept for the way back. */
static void take() { fb0 = {fbmem, pitch, bpp, fmt, amask}; full = 2; back = 0; behind = Area{}; }
struct Request {
  uint32_t objs[HAL_MAX_LAYERS + 1], counts[HAL_MAX_LAYERS + 1], props[(HAL_MAX_LAYERS + 1) * NPROP], nobj = 0, nprop = 0;
  uint64_t vals[(HAL_MAX_LAYERS + 1) * NPROP];
  const Plane* p = nullptr;
  void set(int k, uint64_t v) { if (p->prop[k]) { props[nprop] = p->prop[k]; vals[nprop++] = v; counts[nobj - 1]++; } }
  /** Plane `pl` shows framebuffer `fb` (sw x sh pixels) at x, y, w, h of the screen; fb 0: it shows nothing. */
  void plane(const Plane& pl, uint32_t fb, int sw, int sh, int x, int y, int w, int h, int zpos) {
    p = &pl; objs[nobj] = pl.id; counts[nobj++] = 0;
    set(FB, fb); set(CRTC, fb ? crtc : 0);
    set(SX, 0); set(SY, 0); set(SW, (uint64_t)sw << 16); set(SH, (uint64_t)sh << 16);
    set(CX, (uint64_t)(int64_t)x); set(CY, (uint64_t)(int64_t)y); set(CW, w); set(CH, h);
    if (fb) set(ZPOS, zpos);
  }
};
/** The frame's buffer `b` above, the pictures under it, as one commit (or its test). */
static int commit(int b, uint32_t flags) {
  Request r;
  for (int k = 0; k < HAL_MAX_LAYERS; k++) {
    if (k >= nlay) { r.plane(under[k], 0, 0, 0, 0, 0, 0, 0, 0); continue; }
    const Shown& s = lay[k];
    r.plane(under[k], s.fb, s.w, s.h, s.at.x, s.at.y, s.at.w, s.at.h, 1 + k);
    r.set(RANGE, s.full_range ? 1 : 0);        // ponytail: the values of the kernel's enums (limited, full; BT.601, BT.709), not looked up by name
    r.set(ENCODING, s.bt709 ? 1 : 0);
  }
  r.plane(top, buf[b].fb, fw, fh, 0, 0, fw, fh, 1 + HAL_MAX_LAYERS);
  drm_mode_atomic a = {};
  a.flags = flags; a.count_objs = r.nobj; a.objs_ptr = (uintptr_t)r.objs; a.count_props_ptr = (uintptr_t)r.counts; a.props_ptr = (uintptr_t)r.props; a.prop_values_ptr = (uintptr_t)r.vals;
  return io(DRM_IOCTL_MODE_ATOMIC, &a) < 0 ? errno : 0;
}
/** A picture's dmabufs as a framebuffer of the display: no pixel is read. 0: the display does not take it. */
static uint32_t adopt(const HalPicture& p) {
  drm_mode_fb_cmd2 f = {};
  f.width = p.w; f.height = p.h; f.pixel_format = p.format;
  bool ok = p.nplanes > 0 && p.nplanes <= 4;
  for (int i = 0; ok && i < p.nplanes; i++) {
    drm_prime_handle h = {};
    h.fd = p.fd[i];
    if (io(DRM_IOCTL_PRIME_FD_TO_HANDLE, &h) < 0) { ok = false; break; }
    f.handles[i] = h.handle; f.pitches[i] = p.pitch[i]; f.offsets[i] = p.offset[i];
    if (p.modifier && p.modifier != DRM_FORMAT_MOD_INVALID) { f.modifier[i] = p.modifier; f.flags = DRM_MODE_FB_MODIFIERS; }
  }
  ok = ok && io(DRM_IOCTL_MODE_ADDFB2, &f) == 0;
  // the framebuffer holds the buffer from here; the handle of a dmabuf is the same at each import and is closed once
  for (int i = 0; i < 4; i++) {
    bool seen = !f.handles[i];
    for (int k = 0; k < i; k++) if (f.handles[k] == f.handles[i]) seen = true;
    drm_gem_close g = {f.handles[i], 0};
    if (!seen) io(DRM_IOCTL_GEM_CLOSE, &g);
  }
  return ok ? f.fb_id : 0;
}
/** The refresh of the last commit: the pacing of the frames, and the moment the pictures it replaced are off the screen. */
static void wait_refresh() {
  pollfd p = {fd, POLLIN, 0};
  for (int r; pending && ((r = poll(&p, 1, 100)) > 0 || (r < 0 && errno == EINTR));) {   // a signal (the one that ends the program) is not the refresh
    if (r < 0) continue;
    char ev[256];
    const ssize_t n = read(fd, ev, sizeof ev);
    for (ssize_t i = 0; i + (ssize_t)sizeof(drm_event) <= n;) {
      const drm_event* e = (const drm_event*)(ev + i);
      if (e->type == DRM_EVENT_FLIP_COMPLETE) pending = false;
      if (!e->length) break;
      i += e->length;
    }
    if (n <= 0) break;
  }
  pending = false;
  for (uint32_t id : retired) io(DRM_IOCTL_MODE_RMFB, &id);
  retired.clear();
}
}  // namespace kms

/** HalDisplay.layers: the pictures of the next frame. Each one the display can show on a plane gets its framebuffer here; the commit is
 *  fb_present's, with the frame. */
static uint32_t fb_layers(const HalLayer* l, int32_t n) {
  using namespace kms;
  if (n <= 0 || kms::failed || refuse) { for (int k = 0; k < nlay; k++) replaced.push_back(lay[k].fb); nlay = 0; return 0; }
  if (kms::fd < 0) {
    const uint64_t t0 = now_us();
    if (!open_file()) { kms::failed = true; return 0; }
    if (stats) fprintf(stderr, "fbdev planes: taken in %.1f ms\n", (now_us() - t0) / 1e3);
    take();
  }
  Shown next[HAL_MAX_LAYERS];
  uint32_t took = 0;
  int m = 0;
  bool moved = false;
  for (int k = 0; k < n && m < HAL_MAX_LAYERS; k++) {
    const HalPicture& p = *l[k].pic;
    Shown s = {p.serial, 0, l[k], p.w, p.h, p.full_range, p.bt709};
    for (int j = 0; j < nlay; j++) if (lay[j].serial == p.serial && lay[j].fb) { s.fb = lay[j].fb; lay[j].fb = 0; }   // the picture of the frame before, still shown
    if (!s.fb) { s.fb = adopt(p); pictures += s.fb != 0; }
    if (!s.fb) continue;
    const Shown& was = lay[m];
    if (m >= nlay || was.at.x != s.at.x || was.at.y != s.at.y || was.at.w != s.at.w || was.at.h != s.at.h || was.w != s.w || was.h != s.h) moved = true;
    next[m++] = s; took |= 1u << k;
  }
  for (int j = 0; j < nlay; j++) if (lay[j].fb) replaced.push_back(lay[j].fb);
  moved = moved || m != nlay;
  for (int j = 0; j < m; j++) lay[j] = next[j];
  nlay = m;
  // a new place or size is tried before the frame is drawn with its hole: what the compositor cannot do (too small, no memory left) is
  // drawn in software instead
  if (moved && nlay) if (const int e = commit(back, DRM_MODE_ATOMIC_TEST_ONLY)) {
    if (e == EACCES || e == EPERM) { kms::failed = true; fprintf(stderr, "fbdev: another program owns the display (DRM master): pictures are drawn in software\n"); }
    for (int j = 0; j < nlay; j++) replaced.push_back(lay[j].fb);
    nlay = 0;
    return 0;
  }
  return took;
}
#endif

// ---------------------------------------------------------------- HalDisplay
static void on_signal(int) { sig_quit = 1; }

static int fb_init(const HalConfig* cfg) {
  fb_var_screeninfo var; fb_fix_screeninfo fix;
  if (sim_fb) {
    int sw = 640, sh = 480, sb = 32;
    if (const char* f = getenv("ZINC_FBDEV_SIM_FORMAT")) sscanf(f, "%dx%dx%d", &sw, &sh, &sb);
    if (sb != 16 && sb != 24 && sb != 32) return 0;
    fd = open(sim_fb, O_RDWR | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0) return 0;
    memset(&var, 0, sizeof var); memset(&fix, 0, sizeof fix);
    var.xres = sw; var.yres = sh; var.bits_per_pixel = sb;
    if (sb == 16) { var.red = {11, 5, 0}; var.green = {5, 6, 0}; var.blue = {0, 5, 0}; }
    else { var.red = {16, 8, 0}; var.green = {8, 8, 0}; var.blue = {0, 8, 0}; if (sb == 32) var.transp = {24, 8, 0}; }
    fix.line_length = sw * sb / 8 + 32;   // padded: the pitch is not the width
    fix.smem_len = (size_t)fix.line_length * sh;
    if (ftruncate(fd, fix.smem_len) < 0) { close(fd); fd = -1; return 0; }
  } else {
  fd = open(ZP_DISPLAY_FBDEV_DEVICE, O_RDWR | O_CLOEXEC);
  if (fd < 0) return 0;
  if (ioctl(fd, FBIOGET_VSCREENINFO, &var) < 0 || ioctl(fd, FBIOGET_FSCREENINFO, &fix) < 0 || (var.bits_per_pixel != 16 && var.bits_per_pixel != 24 && var.bits_per_pixel != 32)) {
    close(fd); fd = -1; return 0;
  }
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
  tty = sim_fb ? -1 : open("/dev/tty0", O_RDWR | O_CLOEXEC);
  if (tty >= 0 && ioctl(tty, KDSETMODE, KD_GRAPHICS) < 0) { close(tty); tty = -1; }
  signal(SIGINT, on_signal); signal(SIGTERM, on_signal);
  if (ZP_DISPLAY_FBDEV_INPUT) open_inputs();
  fmt = FMT_GENERIC;
  if (bpp == 16 && rl == 5 && gl == 6 && bl == 5 && ro == 11 && go == 5 && bo == 0) fmt = FMT_565;
  else if (bpp == 32 && rl == 8 && gl == 8 && bl == 8 && ro == 16 && go == 8 && bo == 0) fmt = FMT_8888;
  pool.init();
  auto on = [](const char* n) { const char* e = getenv(n); return e && *e && *e != '0'; };
  skip_s = getenv("ZINC_FBDEV_SKIP_S") ? atof(getenv("ZINC_FBDEV_SKIP_S")) : 0;
  stats = on("ZINC_FBDEV_STATS"); crc_on = on("ZINC_FBDEV_CRC"); fuse = on("ZINC_FBDEV_FUSE");
  fprintf(stderr, "fbdev: %s %dx%d %d bpp, surface %dx%d at %d,%d size %dx%d, %d input device(s)\n", ZP_DISPLAY_FBDEV_DEVICE, fw, fh, bpp, W, H, dx, dy, dw, dh, ndev);
#ifdef ZP_FBDEV_KMS
  // When the screen's compositor has the planes, every frame goes to them (kms::flip, the file stays open) and hardware layers are
  // offered for a surface shown 1:1. ZINC_FBDEV_FLIP=0: the frames go to /dev/fb0 and the planes are left alone until a picture comes.
  // ZINC_FBDEV_PLANES=0: no layer, a decoder gives pixels and every picture is drawn in software.
  // ZINC_FBDEV_PLANES=refuse: the layers are offered and every one is refused, as a display whose compositor cannot place a picture
  // does: the software path of a picture that came as a dmabuf (what a turned or blended film takes), to test and to measure it.
  const char* pl = getenv("ZINC_FBDEV_PLANES");
  const uint64_t k0 = now_us();
  const char* fl = getenv("ZINC_FBDEV_FLIP");
  const bool layers = !xmap && !(pl && *pl == '0'), flip = !(fl && *fl == '0');
  const char* why = sim_fb ? nullptr : flip ? "no KMS plane to take" : "ZINC_FBDEV_FLIP=0";
  if (!sim_fb && hal_display && hal_display->init == fb_init && (layers || flip) && kms::open_file()) {
    if (layers) {
      hal_display->layers = fb_layers;
      kms::refuse = pl && *pl == 'r';
      fprintf(stderr, "fbdev: pictures in device memory go to a plane of the display (found in %.1f ms)%s\n", (now_us() - k0) / 1e3, kms::refuse ? ", refused as asked" : "");
    }
    // the commit is tried before the first frame: a display another program holds says so here, not at the first frame
    const int e = flip ? kms::commit(0, DRM_MODE_ATOMIC_TEST_ONLY) : 0;
    if (flip && !e) { kms::flip = true; kms::take(); why = nullptr; }
    else { kms::close_file(); if (e) why = e == EACCES || e == EPERM ? "another program owns the display" : strerror(e); }
  }
  // the path the frames take, said once: what a torn picture is checked against
  if (kms::flip) fprintf(stderr, "fbdev: frames go to the buffer that is not shown, one flip at the refresh (KMS plane, two buffers, 32 bpp; ZINC_FBDEV_FLIP=0: /dev/fb0)\n");
  else if (why) fprintf(stderr, "fbdev: frames are written into /dev/fb0, the buffer on the screen (%s)\n", why);
#endif
  return 1;
}

// Bands: 16 rows, pulled by the pool's threads. A band rasterizes its rows (phase 1) and converts them to the
// framebuffer (phase 2); every framebuffer row belongs to exactly one band, so bands never write the same byte.
enum { BAND_ROWS = 16 };
struct Job { const HalFrame* f; int phase; };
static std::atomic<uint64_t> cpu_render, cpu_convert;   // thread time of the frame in microseconds (stats only)
static void convert_rows(const HalFrame* f, int a, int b) {
  if (!xmap) { for (int y = a; y < b; y++) put_row(y, f->x0, f->x1, surf + (size_t)y * W, nullptr); return; }
  int j0 = (int)((double)a * dh / H) - 1, j1 = (int)((double)b * dh / H) + 2;
  if (j0 < 0) j0 = 0;
  if (j1 > dh) j1 = dh;
  for (int j = j0; j < j1; j++) if (ymap[j] >= a && ymap[j] < b) put_row(dy + j, dx, dx + dw, surf + (size_t)ymap[j] * W, xmap);
}
static void band(void* p, int32_t a, int32_t b) {
  const Job* j = (const Job*)p;
  uint64_t t0 = stats ? now_us() : 0;
  if (j->phase & 1) j->f->render(surf + (size_t)a * W, a, b);
  uint64_t t1 = stats ? now_us() : 0;
  if (j->phase & 2) convert_rows(j->f, a, b);
  if (j->phase & 4) j->f->render_holes(over + (size_t)a * W, a, b, 0xFFFFFF);
  if (stats) { cpu_render += t1 - t0; cpu_convert += now_us() - t1; }
}

struct Sample { float raster, vsync, convert, total, cpu_render, cpu_convert; int rows; };
static std::vector<Sample> samples;
static uint64_t first_us, last_us_end;

// Default: rasterize all bands (parallel), wait for the vertical blank, then convert all bands (parallel), so the
// framebuffer is written right behind the vblank, ahead of the scan-out beam. ZINC_FBDEV_FUSE=1: each band converts
// its rows right after rasterizing them (cache hot), then the vsync wait: fewer passes over memory, but the write
// is no longer timed to the beam.
#ifdef ZP_FBDEV_KMS
/** The surface's rectangle `a` into the framebuffer, whatever the frame's damage. */
static void convert_area(kms::Area a) {
  HalFrame u = {};
  u.x0 = a.x0; u.y0 = a.y0; u.x1 = a.x1; u.y1 = a.y1;
  Job job{&u, 2};
  pool.run(a.y0, a.y1, BAND_ROWS, band, &job);
}
/** The frame goes to the plane above the pictures. The buffer that is not on the screen gets what it lacks (this frame's damage and
 *  the one before, which went to the other buffer), with its holes, and one commit shows it with the pictures at the next refresh. */
static void planes_present(const HalFrame* f, bool has) {
  using namespace kms;
  const Area now = has ? Area{f->x0, f->y0, f->x1, f->y1} : Area{};
  Area a = now;
  if (behind.x1 > behind.x0) a = a.x1 > a.x0 ? Area{std::min(a.x0, behind.x0), std::min(a.y0, behind.y0), std::max(a.x1, behind.x1), std::max(a.y1, behind.y1)} : behind;
  if (full) { a = Area{0, 0, W, H}; full--; }
  const bool turn = a.x1 > a.x0 && a.y1 > a.y0;   // nothing to write: the buffer on the screen stays, only the pictures change
  asked += (uint64_t)(now.x1 - now.x0) * (now.y1 - now.y0);
  if (turn) {
    wrote += (uint64_t)(a.x1 - a.x0) * (a.y1 - a.y0);
    const Buffer& b = buf[back];
    fbmem = b.map; pitch = b.pitch; bpp = 32; fmt = FMT_8888; amask = 0xFF000000u;
    convert_area(a);
    // the rows where the frame draws over a picture are drawn once more, over white holes (punch)
    Area r[HAL_MAX_LAYERS];
    int c0 = fh, c1 = 0;
    for (int k = 0; k < nlay; k++) {
      const HalLayer& l = lay[k].at;
      r[k] = Area{std::max(l.x, a.x0), std::max(l.y, a.y0), std::min(l.x + l.w, a.x1), std::min(l.y + l.h, a.y1)};
      for (int y = r[k].y0; y < r[k].y1 && r[k].x0 < r[k].x1; y++) if (covered(surf + (size_t)y * W + r[k].x0, r[k].x1 - r[k].x0)) { c0 = std::min(c0, y); c1 = std::max(c1, y + 1); }
    }
    if (c1 > c0 && f->render_holes) {
      if (!over) over = (uint32_t*)malloc((size_t)W * H * 4);
      Job white{f, 4};
      if (over) pool.run(c0, c1, BAND_ROWS, band, &white); else c1 = c0;
    } else c1 = c0;
    for (int k = 0; k < nlay; k++)
      for (int y = r[k].y0; y < r[k].y1 && r[k].x0 < r[k].x1; y++)
        punch(surf + (size_t)y * W + r[k].x0, y >= c0 && y < c1 ? over + (size_t)y * W + r[k].x0 : nullptr, (uint32_t*)(b.map + (size_t)y * b.pitch) + r[k].x0, r[k].x1 - r[k].x0);
    fbmem = fb0.mem; pitch = fb0.pitch; bpp = fb0.bpp; fmt = fb0.fmt; amask = fb0.amask;
  }
  const int e = commit(turn ? back : back ^ 1, DRM_MODE_PAGE_FLIP_EVENT | DRM_MODE_ATOMIC_NONBLOCK);
  if (!e) {
    pending = true; frames++;
    retired.insert(retired.end(), replaced.begin(), replaced.end());
    replaced.clear();
    if (turn) { back ^= 1; behind = now; }
  } else if (e == EBUSY) full = 2;   // the commit before this one is not on the screen yet (no refresh seen in 100 ms): this frame is skipped, both buffers are written whole again
  else {
    fprintf(stderr, "fbdev: the display refused the planes (%s): frames are written into /dev/fb0, pictures are drawn in software\n", strerror(e));
    kms::failed = true;
  }
  idle = nlay ? 0 : idle + 1;
}
#endif

static void fb_present(const HalFrame* f) {
  bool has = f->y1 > f->y0 && f->x1 > f->x0;
  uint64_t t0 = now_us();
  static uint64_t started;
  if (!started) started = t0;
  bool count = stats && (t0 - started) / 1e6 >= skip_s;
  if (count && !first_us) first_us = t0;
  cpu_render = 0; cpu_convert = 0;
  bool planes = false;
#ifdef ZP_FBDEV_KMS
  // a display that refused, or two seconds without a picture when only the pictures take the planes: back to /dev/fb0, which gets the
  // whole surface, and the planes go
  if (kms::fd >= 0 && (kms::failed || (!kms::flip && kms::idle > 2 * ZP_DISPLAY_FBDEV_FPS))) { convert_area(kms::Area{0, 0, W, H}); kms::close_file(); kms::idle = 0; kms::flip = false; }
  planes = kms::fd >= 0;
  if (has && !planes) kms::direct++;
#endif
  Job job{f, fuse && !planes ? 3 : 1};
  if (has) pool.run(f->y0, f->y1, BAND_ROWS, band, &job);
  uint64_t t1 = now_us();
#ifdef ZP_FBDEV_KMS
  if (planes) kms::wait_refresh();   // the buffer written next was on the screen until the last commit's refresh
#endif
  // pacing: the null HAL has no vsync; wait for the display's, or sleep to the configured rate
  if (vsync && !planes) { int z = 0; if (sim_fb || ioctl(fd, FBIO_WAITFORVSYNC, &z) < 0) vsync = false; }
  if (!planes) {
    // A wait that does not wait is no pacing either: the kernel's framebuffer emulation waits for its first CRTC, and the DSI screen of a
    // Raspberry Pi is on another one (60 waits returned in 0.1 ms, ZN-731: the loop ran at 120 frames a second and a core was spent on
    // it). A wait that returned at once, less than a period after the last frame, is that case: the clock holds the rate.
    uint64_t period = 1000000u / ZP_DISPLAY_FBDEV_FPS, t = now_us();
    if (last_us && t - last_us < period - 1000 && (!vsync || t - t1 < 1000)) usleep((useconds_t)(period - (t - last_us)));
    last_us = now_us();
  }
  uint64_t t2 = now_us();
#ifdef ZP_FBDEV_KMS
  if (planes) planes_present(f, has);
#endif
  if (has && !fuse && !planes) { job.phase = 2; pool.run(f->y0, f->y1, BAND_ROWS, band, &job); }
  uint64_t t3 = now_us();
  last_us_end = t3;
  if (count && samples.size() < 100000) samples.push_back({(t1 - t0) / 1e3f, (t2 - t1) / 1e3f, (t3 - t2) / 1e3f, (t3 - t0) / 1e3f, cpu_render / 1e3f, cpu_convert / 1e3f, has ? f->y1 - f->y0 : 0});
}

static void fb_poll(HalInput* in) {
  // the null HAL counts a frame budget (60 by default) for headless tests; on a real screen only ZINC_FRAMES does
  static bool budget = getenv("ZINC_FRAMES") != nullptr;
  if (!budget) in->quit = 0;
  for (int i = 0; i < ndev; i++) read_dev(devs[i]);
  in->buttons |= held;
  in->ntouch = 0;
  for (auto& s : slots) {
    if (s.id >= 0 && in->ntouch < HAL_MAX_TOUCH) in->touch[in->ntouch++] = HalTouch{s.id, s.x, s.y};
    if (s.gone) s.id = -1;
    s.fresh = s.gone = false;
  }
  if (in->ntouch) { px = in->touch[0].x; py = in->touch[0].y; }
  in->px = px; in->py = py;
  in->pdown = mouse_btn.down || touch_btn.down || in->ntouch > 0;
  mouse_btn.shown(); touch_btn.shown();
  in->wheel += wheel; wheel = 0;
  if (quit_key || sig_quit) in->quit = 1;
}

static uint32_t crc32_of(const uint32_t* p, size_t n) {
  uint32_t c = ~0u;
  for (size_t i = 0; i < n; i++) for (int k = 0; k < 4; k++) { c ^= (p[i] >> (8 * k)) & 255; for (int b = 0; b < 8; b++) c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1; }
  return ~c;
}
static void report(const char* name, float Sample::*m) {
  std::vector<float> v; for (auto& x : samples) v.push_back(x.*m);
  std::sort(v.begin(), v.end());
  double sum = 0; for (float x : v) sum += x;
  fprintf(stderr, "fbdev stats: %-12s p50=%6.2f p99=%6.2f mean=%6.2f max=%6.2f ms\n", name, v[v.size() / 2], v[(size_t)(v.size() * 0.99)], sum / v.size(), v.back());
}
static void fb_shutdown() {
  if (stats && !samples.empty()) {
    fprintf(stderr, "fbdev stats: threads=%d fuse=%d frames=%zu wall=%.2f s effective=%.1f fps\n", pool.threads, (int)fuse, samples.size(), (last_us_end - first_us) / 1e6, samples.size() * 1e6 / (double)(last_us_end - first_us));
    report("raster", &Sample::raster); report("vsync", &Sample::vsync); report("convert", &Sample::convert); report("present", &Sample::total);
    report("cpu-render", &Sample::cpu_render); report("cpu-convert", &Sample::cpu_convert);
    // ZINC_FBDEV_STATS=2: every frame, to tell the frames that repaint a large part (a film's picture) from the others
    if (atoi(getenv("ZINC_FBDEV_STATS")) > 1) for (auto& x : samples) fprintf(stderr, "fbdev frame: rows=%d raster=%.2f cpu-render=%.2f ms\n", x.rows, x.raster, x.cpu_render);
  }
  if (crc_on) fprintf(stderr, "fbdev crc: %08x\n", crc32_of(surf, (size_t)W * H));
#ifdef ZP_FBDEV_KMS
  if (stats && kms::pictures) fprintf(stderr, "fbdev planes: %u pictures shown from their dmabuf, %u frames committed\n", kms::pictures, kms::frames);
  // the proof of the path taken: no frame of a flipping run is written into /dev/fb0, and a commit writes little more than the damage
  if (stats) fprintf(stderr, "fbdev flip: %u commits at the refresh, %u frames written into /dev/fb0 while it was on the screen\n", kms::frames, kms::direct);
  if (stats && kms::frames) fprintf(stderr, "fbdev flip: damage %.1f%% of the surface a commit, written to its buffer %.1f%%\n", 100.0 * kms::asked / kms::frames / ((double)W * H), 100.0 * kms::wrote / kms::frames / ((double)W * H));
  if (kms::fd >= 0) convert_area(kms::Area{0, 0, W, H});   // the last frame stays on the console's buffer, under the plane until it goes
  kms::close_file();   // the planes go, the console's is there again
#endif
  if (tty >= 0) { ioctl(tty, KDSETMODE, KD_TEXT); close(tty); tty = -1; }
  for (int i = 0; i < ndev; i++) close(devs[i].fd);
  ndev = 0;
  if (fd >= 0) close(fd);
  fd = -1;
}

static HalDisplay fbdev = {fb_init, fb_present, fb_poll, fb_shutdown, 0, 0, nullptr, nullptr};   // layers: set by fb_init when the screen has the planes
static int registered = (hal_display = &fbdev, 0);
