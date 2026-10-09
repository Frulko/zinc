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
        sscanf(ZP_DISPLAY_GL_MODE, "%dx%d", &want_w, &want_h);
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
static bool pdown, quit;

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
  in->ntouch = 0;  // ponytail: single pointer; multitouch slots when a touch UI needs them
}

// ---------- display ----------
// ZINC_GL_INFO=1: what the driver offers (renderer choices are made from these numbers, docs/reports/gpu-renderer-design.md).
static void print_info() {
  auto has = [](const char* list, const char* name) { return list && strstr(list, name) ? "yes" : "no"; };
  const char* ext = (const char*)glGetString(GL_EXTENSIONS);
  const char* eext = eglQueryString(dpy, EGL_EXTENSIONS);
  fprintf(stderr, "gl-info: vendor=%s renderer=%s version=%s glsl=%s\n", glGetString(GL_VENDOR), glGetString(GL_RENDERER), glGetString(GL_VERSION), glGetString(GL_SHADING_LANGUAGE_VERSION));
  fprintf(stderr, "gl-info: egl=%s\n", eglQueryString(dpy, EGL_VERSION));
  static const char* const names[] = {"GL_OES_EGL_image_external", "GL_EXT_texture_format_BGRA8888", "GL_OES_texture_npot", "GL_OES_packed_depth_stencil",
    "GL_EXT_multisampled_render_to_texture", "GL_OES_rgb8_rgba8", "GL_EXT_unpack_subimage", "GL_OES_vertex_array_object", "GL_OES_standard_derivatives",
    "GL_EXT_shader_texture_lod", "GL_OES_depth_texture", "GL_OES_element_index_uint"};
  for (const char* n : names) fprintf(stderr, "gl-info: %s=%s\n", n, has(ext, n));
  static const char* const enames[] = {"EGL_KHR_image_base", "EGL_EXT_image_dma_buf_import", "EGL_EXT_image_dma_buf_import_modifiers", "EGL_KHR_surfaceless_context", "EGL_MESA_platform_gbm"};
  for (const char* n : enames) fprintf(stderr, "gl-info: %s=%s\n", n, has(eext, n));
  GLint v = 0, r[2] = {0, 0}, p = 0;
  glGetIntegerv(GL_MAX_TEXTURE_SIZE, &v);
  fprintf(stderr, "gl-info: max_texture_size=%d\n", v);
  glGetIntegerv(GL_MAX_VERTEX_ATTRIBS, &v); fprintf(stderr, "gl-info: max_vertex_attribs=%d\n", v);
  glGetIntegerv(GL_MAX_TEXTURE_IMAGE_UNITS, &v); fprintf(stderr, "gl-info: max_texture_image_units=%d\n", v);
  glGetIntegerv(GL_MAX_FRAGMENT_UNIFORM_VECTORS, &v); fprintf(stderr, "gl-info: max_fragment_uniform_vectors=%d\n", v);
  glGetShaderPrecisionFormat(GL_FRAGMENT_SHADER, GL_HIGH_FLOAT, r, &p);
  fprintf(stderr, "gl-info: fragment highp float: range=%d,%d precision=%d bits (0 = unsupported)\n", r[0], r[1], p);
  glGetShaderPrecisionFormat(GL_FRAGMENT_SHADER, GL_MEDIUM_FLOAT, r, &p);
  fprintf(stderr, "gl-info: fragment mediump float: range=%d,%d precision=%d bits\n", r[0], r[1], p);
  for (int samples = 2; samples <= 8; samples *= 2) {
    const EGLint a[] = {EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_SAMPLES, samples, EGL_NONE};
    EGLConfig c[16];
    EGLint n = 0, xrgb = 0, id;
    eglChooseConfig(dpy, a, c, 16, &n);
    for (int i = 0; i < n; i++) if (eglGetConfigAttrib(dpy, c[i], EGL_NATIVE_VISUAL_ID, &id) && id == GBM_FORMAT_XRGB8888) xrgb++;
    fprintf(stderr, "gl-info: EGL configs with >= %d samples: %d (XRGB8888 window: %d)\n", samples, n, xrgb);
  }
}

bool zgl_backend_init(const HalConfig* cfg) {
  if (!open_card()) { fprintf(stderr, "display-gl: no connected display on /dev/dri/card*\n"); return false; }
  gbm = gbm_create_device(fd);
  gs = gbm ? gbm_surface_create(gbm, mode.hdisplay, mode.vdisplay, GBM_FORMAT_XRGB8888, GBM_BO_USE_SCANOUT | GBM_BO_USE_RENDERING) : nullptr;
  if (!gs) { fprintf(stderr, "display-gl: gbm surface failed\n"); return false; }
  auto platform = (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
  dpy = platform ? platform(EGL_PLATFORM_GBM_KHR, gbm, nullptr) : eglGetDisplay((EGLNativeDisplayType)gbm);
  if (!eglInitialize(dpy, nullptr, nullptr)) { fprintf(stderr, "display-gl: eglInitialize failed\n"); return false; }
  eglBindAPI(EGL_OPENGL_ES_API);
  // a depth buffer lets the GL renderer skip what opaque rectangles hide (ZN-412.01); a config without one is taken when there is none
  EGLConfig cfgs[64], chosen = nullptr;
  for (int depth = 16; depth >= 0 && !chosen; depth -= 16) {
    const EGLint attr[] = {EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 0, EGL_DEPTH_SIZE, depth,
                           EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_NONE};
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
  if (getenv("ZINC_GL_INFO")) print_info();
  open_inputs();
  px = cfg->width / 2.f; py = cfg->height / 2.f;
  fprintf(stderr, "display-gl: %dx%d@%d, %s\n", mode.hdisplay, mode.vdisplay, mode.vrefresh, glGetString(GL_RENDERER));
  return true;
}

void zgl_backend_size(int32_t* w, int32_t* h) { *w = mode.hdisplay; *h = mode.vdisplay; }

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
