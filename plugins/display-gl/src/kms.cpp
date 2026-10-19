// display-gl backend for Raspberry Pi (and any Linux with KMS): DRM/KMS + GBM + EGL + GLES2, fullscreen without X
// (Mesa vc4 on Pi 3, v3d on Pi 4/5). Input from evdev: keyboard, mouse (relative) and touchscreens (absolute).
#include "hal.h"
#include "zgl.h"
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <gbm.h>
#include <xf86drm.h>
#include <xf86drmMode.h>
#include <linux/input.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef ZP_DISPLAY_GL_MODE
#define ZP_DISPLAY_GL_MODE ""
#endif

static int fd = -1;
static drmModeModeInfo mode;
static uint32_t conn_id, crtc_id;
static drmModeCrtc* saved;
static gbm_device* gbm;
static gbm_surface* gs;
static gbm_bo* prev_bo;
static EGLDisplay dpy;
static EGLContext ctx;
static EGLSurface surf;
static bool first_frame = true;

// First card with a connected connector (Pi 4/5: card0 is often the render-only v3d node, card1 the vc4 display).
static bool open_card() {
  if (fd >= 0) return true;   // chosen already: zgl_backend_native asks before the init
  for (int i = 0; i < 4; i++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/dri/card%d", i);
    int f = open(path, O_RDWR | O_CLOEXEC);
    if (f < 0) continue;
    drmModeRes* r = drmModeGetResources(f);
    for (int c = 0; r && c < r->count_connectors; c++) {
      drmModeConnector* k = drmModeGetConnector(f, r->connectors[c]);
      if (!k) continue;
      if (k->connection == DRM_MODE_CONNECTED && k->count_modes > 0) {
        int want_w = 0, want_h = 0;  // option "mode": "1920x1080" picks that size; else the preferred mode
        const char* want_mode = getenv("ZINC_GL_MODE");   // at run time too: a benchmark compares several modes of one build
        sscanf(want_mode && *want_mode ? want_mode : ZP_DISPLAY_GL_MODE, "%dx%d", &want_w, &want_h);
        mode = k->modes[0];
        for (int m = 0; m < k->count_modes; m++) {
          bool hit = want_w ? (k->modes[m].hdisplay == want_w && k->modes[m].vdisplay == want_h) : (k->modes[m].type & DRM_MODE_TYPE_PREFERRED);
          if (hit) { mode = k->modes[m]; break; }
        }
        uint32_t crtc = 0;
        if (drmModeEncoder* e = k->encoder_id ? drmModeGetEncoder(f, k->encoder_id) : nullptr) { crtc = e->crtc_id; drmModeFreeEncoder(e); }
        for (int e = 0; !crtc && e < k->count_encoders; e++) {
          drmModeEncoder* en = drmModeGetEncoder(f, k->encoders[e]);
          if (!en) continue;
          for (int j = 0; j < r->count_crtcs; j++) if (en->possible_crtcs & (1u << j)) { crtc = r->crtcs[j]; break; }
          drmModeFreeEncoder(en);
        }
        conn_id = k->connector_id;
        drmModeFreeConnector(k);
        if (crtc) { crtc_id = crtc; drmModeFreeResources(r); fd = f; return true; }
        continue;
      }
      drmModeFreeConnector(k);
    }
    if (r) drmModeFreeResources(r);
    close(f);
  }
  return false;
}

// ---------- evdev ----------
static int ev[16], nev;
static int32_t absx[16][2], absy[16][2];  // min/max per device (touchscreens)
static float px, py;
static uint32_t keys;
static bool pdown, quit, mouse;

// The mouse pointer is the display controller's cursor plane (drmModeSetCursor): a 64x64 ARGB image the scan-out adds, so it costs the GPU nothing
// and a frame never has to be redrawn for it. Shown from the first movement of a relative device (a touchscreen has no pointer to show).
static gbm_bo* cur_bo;
static bool cur_on, cur_ready;
static const char* ARROW[] = {  // X outline, . fill
  "X          ", "XX         ", "X.X        ", "X..X       ", "X...X      ", "X....X     ", "X.....X    ", "X......X   ", "X.......X  ", "X........X ",
  "X.....XXXXX", "X..X..X    ", "X.X X..X   ", "XX  X..X   ", "X    X..X  ", "     X..X  ", "      XX   "};
static void make_cursor() {
  cur_ready = true;
  cur_bo = gbm ? gbm_bo_create(gbm, 64, 64, GBM_FORMAT_ARGB8888, GBM_BO_USE_CURSOR | GBM_BO_USE_WRITE) : nullptr;
  if (!cur_bo) return;
  static uint32_t px64[64 * 64];
  for (int y = 0; y < 17; y++)
    for (int x = 0; ARROW[y][x]; x++) px64[y * 64 + x] = ARROW[y][x] == 'X' ? 0xFF000000u : ARROW[y][x] == '.' ? 0xFFFFFFFFu : 0;
  gbm_bo_write(cur_bo, px64, sizeof px64);
}
static void move_cursor(float x, float y, int32_t W, int32_t H) {
  if (!cur_ready) make_cursor();
  if (!cur_bo) return;
  if (!cur_on) { cur_on = drmModeSetCursor(fd, crtc_id, gbm_bo_get_handle(cur_bo).u32, 64, 64) == 0; if (!cur_on) return; }
  drmModeMoveCursor(fd, crtc_id, (int)(x * mode.hdisplay / W), (int)(y * mode.vdisplay / H));
}

static void open_inputs() {
  for (int i = 0; i < 32 && nev < 16; i++) {
    char path[32];
    snprintf(path, sizeof path, "/dev/input/event%d", i);
    int f = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (f < 0) continue;
    input_absinfo a;
    absx[nev][0] = 0; absx[nev][1] = 0; absy[nev][0] = 0; absy[nev][1] = 0;
    if (ioctl(f, EVIOCGABS(ABS_X), &a) == 0) { absx[nev][0] = a.minimum; absx[nev][1] = a.maximum; }
    if (ioctl(f, EVIOCGABS(ABS_Y), &a) == 0) { absy[nev][0] = a.minimum; absy[nev][1] = a.maximum; }
    ev[nev++] = f;
  }
}

static uint32_t key_bit(int code) {
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
    case KEY_ENTER: return HAL_START;
    case KEY_TAB: return HAL_SELECT;
  }
  return 0;
}

void zgl_backend_poll(HalInput* in, int32_t W, int32_t H) {
  input_event e;
  for (int d = 0; d < nev; d++) {
    while (read(ev[d], &e, sizeof e) == (ssize_t)sizeof e) {
      if (e.type == EV_KEY) {
        if (e.code == KEY_ESC && e.value) quit = true;
        if (e.code == BTN_LEFT || e.code == BTN_TOUCH) pdown = e.value != 0;
        if (uint32_t b = key_bit(e.code)) keys = e.value ? keys | b : keys & ~b;
      } else if (e.type == EV_REL) {
        mouse = true;
        if (e.code == REL_X) px += e.value;
        if (e.code == REL_Y) py += e.value;
        if (e.code == REL_WHEEL) in->wheel += e.value;
      } else if (e.type == EV_ABS) {
        if ((e.code == ABS_X || e.code == ABS_MT_POSITION_X) && absx[d][1] > absx[d][0]) px = (float)(e.value - absx[d][0]) * W / (absx[d][1] - absx[d][0]);
        if ((e.code == ABS_Y || e.code == ABS_MT_POSITION_Y) && absy[d][1] > absy[d][0]) py = (float)(e.value - absy[d][0]) * H / (absy[d][1] - absy[d][0]);
      }
    }
  }
  px = px < 0 ? 0 : px > W - 1 ? W - 1 : px;
  py = py < 0 ? 0 : py > H - 1 ? H - 1 : py;
  static bool info = getenv("ZINC_GL_INFO") != nullptr, was_down;
  if (info && pdown != was_down) { was_down = pdown; fprintf(stderr, "gl-info: pointer %s at %.0f,%.0f\n", pdown ? "down" : "up", px, py); }
  in->buttons = keys; in->px = px; in->py = py; in->pdown = pdown; in->quit = quit;
  if (mouse && !first_frame) move_cursor(px, py, W, H);
  in->ntouch = 0;  // ponytail: single pointer; multitouch slots when a touch UI needs them
}

// ---------- display ----------
// The EGL extensions for the GL replay's capability record (runtime/gl_caps.h), which ZINC_GL_INFO prints with the rest of the context.
extern "C" const char* zgl_backend_egl() { return dpy ? eglQueryString(dpy, EGL_EXTENSIONS) : nullptr; }

bool zgl_backend_init(const HalConfig* cfg) {
  if (!open_card()) { fprintf(stderr, "display-gl: no connected display on /dev/dri/card*\n"); return false; }
  gbm = gbm_create_device(fd);
  gs = gbm ? gbm_surface_create(gbm, mode.hdisplay, mode.vdisplay, GBM_FORMAT_XRGB8888, GBM_BO_USE_SCANOUT | GBM_BO_USE_RENDERING) : nullptr;
  if (!gs) { fprintf(stderr, "display-gl: gbm surface failed\n"); return false; }
  auto platform = (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  dpy = platform ? platform(EGL_PLATFORM_GBM_KHR, gbm, nullptr) : eglGetDisplay((EGLNativeDisplayType)gbm);
  if (!eglInitialize(dpy, nullptr, nullptr)) { fprintf(stderr, "display-gl: eglInitialize failed\n"); return false; }
  eglBindAPI(EGL_OPENGL_ES_API);
  // a depth buffer lets the GL renderer skip what opaque rectangles hide (ZN-412.01); a config without one is taken when there is none.
  // 8 stencil bits are asked for first: without them the renderer fills LINE and POLY in CPU tiles (eglChooseConfig puts the configs with the
  // smallest stencil first, so a list that does not name it gets none: a Pi 3 drew the map of the navigation on one core)
  // ZINC_GL_MSAA=4: a multisampled window, to measure it against the replay's own antialiased edges (ZN-725; off: see docs/reports/raspberry-pi.md)
  const int samples = getenv("ZINC_GL_MSAA") ? atoi(getenv("ZINC_GL_MSAA")) : 0;
  EGLConfig cfgs[64], chosen = nullptr;
  for (int k = 0; k < 4 && !chosen; k++) {
    const int depth = k & 1 ? 0 : 16, stencil = k & 2 ? 0 : 8;
    const EGLint attr[] = {EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 0, EGL_DEPTH_SIZE, depth,
                           EGL_STENCIL_SIZE, stencil, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_SAMPLE_BUFFERS, samples > 1, EGL_SAMPLES, samples > 1 ? samples : 0, EGL_NONE};
    EGLint n = 0;
    eglChooseConfig(dpy, attr, cfgs, 64, &n);
    for (int i = 0; i < n && !chosen; i++) {
      EGLint id;
      if (eglGetConfigAttrib(dpy, cfgs[i], EGL_NATIVE_VISUAL_ID, &id) && id == GBM_FORMAT_XRGB8888) chosen = cfgs[i];
    }
  }
  if (!chosen) { fprintf(stderr, "display-gl: no XRGB8888 EGL config\n"); return false; }
  const EGLint cattr[] = {EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE};
  ctx = eglCreateContext(dpy, chosen, EGL_NO_CONTEXT, cattr);
  surf = eglCreateWindowSurface(dpy, chosen, (EGLNativeWindowType)gs, nullptr);
  if (ctx == EGL_NO_CONTEXT || surf == EGL_NO_SURFACE || !eglMakeCurrent(dpy, surf, surf, ctx)) { fprintf(stderr, "display-gl: EGL context failed\n"); return false; }
  saved = drmModeGetCrtc(fd, crtc_id);
  open_inputs();
  px = cfg->width / 2.f; py = cfg->height / 2.f;
  GLint got = 0;
  glGetIntegerv(GL_SAMPLES, &got);
  fprintf(stderr, "display-gl: %dx%d@%d, %s%s\n", mode.hdisplay, mode.vdisplay, mode.vrefresh, glGetString(GL_RENDERER), got > 1 ? ", 4x MSAA" : "");
  return true;
}

int32_t zgl_backend_scale() { return 1; }   // the panel's own pixels
void zgl_backend_size(int32_t* w, int32_t* h) { *w = mode.hdisplay; *h = mode.vdisplay; }
// A program that names no size draws at the mode's (ZN-734), as on the framebuffer: no small surface scaled up by the GPU.
void zgl_backend_native(int32_t* w, int32_t* h) { if (open_card()) { *w = mode.hdisplay; *h = mode.vdisplay; } }

static void drop_fb(gbm_bo* bo, void* data) { uint32_t id = (uint32_t)(uintptr_t)data; if (id) drmModeRmFB(fd, id); (void)bo; }
static uint32_t fb_of(gbm_bo* bo) {
  if (void* d = gbm_bo_get_user_data(bo)) return (uint32_t)(uintptr_t)d;
  uint32_t id = 0;
  drmModeAddFB(fd, gbm_bo_get_width(bo), gbm_bo_get_height(bo), 24, 32, gbm_bo_get_stride(bo), gbm_bo_get_handle(bo).u32, &id);
  gbm_bo_set_user_data(bo, (void*)(uintptr_t)id, drop_fb);
  return id;
}
static void flipped(int, unsigned, unsigned, unsigned, void* data) { *(bool*)data = false; }

// Page flip on vblank: the frame loop is paced by the display refresh. The wait for a flip to complete happens at the
// start of the NEXT swap, not right after requesting it: the CPU work of frame N+1 then overlaps the GPU work and the
// vblank wait of frame N, and a frame ready just before a vblank is flipped at that vblank. ZINC_GL_PIPE=0 waits
// straight after the request (one frame less latency, no overlap).
static gbm_bo* pending_bo;
static bool flip_pending;
static void wait_flip() {
  drmEventContext evc = {};
  evc.version = 2;
  evc.page_flip_handler = flipped;
  pollfd p = {fd, POLLIN, 0};
  while (flip_pending && poll(&p, 1, 100) > 0) drmHandleEvent(fd, &evc);
  if (!flip_pending && pending_bo) {   // the queued buffer is on screen now: the one it replaced is free
    if (prev_bo) gbm_surface_release_buffer(gs, prev_bo);
    prev_bo = pending_bo;
    pending_bo = nullptr;
  }
}
void zgl_backend_swap() {
  static const bool pipe = !getenv("ZINC_GL_PIPE") || atoi(getenv("ZINC_GL_PIPE")) != 0;
  eglSwapBuffers(dpy, surf);
  gbm_bo* bo = gbm_surface_lock_front_buffer(gs);
  uint32_t id = fb_of(bo);
  if (first_frame) {
    first_frame = false;
    if (drmModeSetCrtc(fd, crtc_id, id, 0, 0, &conn_id, 1, &mode)) fprintf(stderr, "display-gl: drmModeSetCrtc failed (is another program the DRM master?)\n");
    prev_bo = bo;
    return;
  }
  if (flip_pending) wait_flip();
  if (flip_pending) { gbm_surface_release_buffer(gs, bo); return; }   // the previous flip never completed (100 ms): drop this frame
  flip_pending = true;
  if (drmModePageFlip(fd, crtc_id, id, DRM_MODE_PAGE_FLIP_EVENT, &flip_pending) == 0) pending_bo = bo;
  else { flip_pending = false; gbm_surface_release_buffer(gs, bo); return; }
  if (!pipe) wait_flip();
}

void zgl_backend_shutdown() {
  if (saved) { drmModeSetCrtc(fd, saved->crtc_id, saved->buffer_id, saved->x, saved->y, &conn_id, 1, &saved->mode); drmModeFreeCrtc(saved); }
  eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  eglDestroySurface(dpy, surf);
  eglDestroyContext(dpy, ctx);
  eglTerminate(dpy);
  if (gs) gbm_surface_destroy(gs);
  if (gbm) gbm_device_destroy(gbm);
  for (int i = 0; i < nev; i++) close(ev[i]);
  if (fd >= 0) close(fd);
}
