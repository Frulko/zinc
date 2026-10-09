// zinc:gphoto2 for macos/linux/rpi1: libgphoto2 + TurboJPEG.
// One worker thread owns the Camera (libgphoto2 is not thread safe per camera) and runs jobs, events and the live
// view loop: gp_camera_capture_preview -> TurboJPEG decode at the smallest DCT scale covering the view box ->
// bilinear fit to the box -> triple buffer. The main thread (a zrt Poller) resolves promises, forwards events and
// swaps the newest frame into a runtime image (raster::dyn_wrap/dyn_update); it never waits on USB.
// The worker uses libc only (malloc, pthreads): nothing from zrt, whose heap belongs to the main thread.
// ZINC_FAKE_CAMERA=1 (or plugins.gphoto2.fake) generates a camera: an animated scene JPEG-encoded at 1024x683,
// 30 fps (ZINC_FAKE_CAMERA=max: as fast as possible), through the same decode path.
#include "zinc_native_gphoto2.h"
#include "zrt_raster.h"
#include <gphoto2/gphoto2.h>
#include <turbojpeg.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <unistd.h>
#include <sys/stat.h>
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // the engine's zinc.json permissions (src/host/permissions.cpp)

#ifndef ZP_GPHOTO2_FAKE
#define ZP_GPHOTO2_FAKE 0
#endif

namespace {
const char FS = '\x1f', RS = '\x1e';

double mono_ms() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e3 + t.tv_nsec / 1e6; }

struct Buf {  // growable C string (worker side)
  char* p = nullptr; size_t n = 0, cap = 0;
  void add(const char* s, size_t k) {
    if (n + k + 1 > cap) { cap = (n + k + 1) * 2; p = (char*)realloc(p, cap); }
    memcpy(p + n, s, k); n += k; p[n] = 0;
  }
  void add(const char* s) { add(s, strlen(s)); }
  void ch(char c) { add(&c, 1); }
  void num(double v) { char t[32]; snprintf(t, sizeof t, "%g", v); add(t); }
  char* take() { char* r = p ? p : (char*)calloc(1, 1); p = nullptr; n = cap = 0; return r; }
};

struct Img {  // 0x00RRGGBB pixels
  uint32_t* px = nullptr; int w = 0, h = 0; size_t cap = 0;
  void reserve(size_t n) { if (n > cap) { free(px); px = (uint32_t*)malloc(n * 4); cap = n; } }
};

enum Op { DETECT, OPEN, CLOSE, SUMMARY, CONFIG, GET, SET, CAPTURE, TRIGGER, DOWNLOAD, THUMB };
struct Job { int id; Op op; char* a; char* b; int w, h; Job* next; };
struct Done { int id; bool ok; char* text; char* kind; Img img; Done* next; };  // id 0: event

// ---- shared state (mu) ----
pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t cv = PTHREAD_COND_INITIALIZER;
pthread_t thread;
bool started = false, quit = false, live = false;
Job *jobs = nullptr, *jobs_tail = nullptr;
Done *done = nullptr, *done_tail = nullptr;
int view_w = 0, view_h = 0;
int live_w = 0, live_h = 0;  // size of the camera's live view JPEG (the coordinate space of changeafarea)
Img frames[3];               // triple buffer: worker writes frames[back], main shows frames[front]
int back = 0, ready = 1, front = 2;
bool fresh = false;
double cam_fps = 0, dec_ms = 0;

void push_done(Done* d) {
  pthread_mutex_lock(&mu);
  if (done_tail) done_tail->next = d; else done = d;
  done_tail = d;
  pthread_mutex_unlock(&mu);
}
void push_event(const char* kind, const char* text) {
  Done* d = (Done*)calloc(1, sizeof(Done));
  d->kind = strdup(kind); d->text = strdup(text); d->ok = true;
  push_done(d);
}

// ---------------------------------------------------------------- JPEG -> fitted pixels (worker)
tjhandle tjd, tjc;

inline uint32_t lerp(uint32_t a, uint32_t b, uint32_t w) {  // w: 0..255; channels 8 bits apart, modular arithmetic
  uint32_t rb = ((((b & 0xFF00FF) - (a & 0xFF00FF)) * w >> 8) + (a & 0xFF00FF)) & 0xFF00FF;
  uint32_t g = ((((b & 0x00FF00) - (a & 0x00FF00)) * w >> 8) + (a & 0x00FF00)) & 0x00FF00;
  return rb | g;
}
/** Bilinear resample, pixel centers aligned (8-bit weights), separable: one vertical blend per source pixel of the
 *  two rows needed, then one horizontal blend per output pixel. */
void resample(const Img& s, Img& d) {
  int* xo = (int*)malloc(sizeof(int) * d.w * 2);
  uint32_t* tmp = (uint32_t*)malloc(sizeof(uint32_t) * s.w);
  for (int x = 0; x < d.w; x++) {
    int f = (int)(((int64_t)(2 * x + 1) * s.w * 256) / (2 * d.w)) - 128;
    if (f < 0) f = 0;
    int x0 = f >> 8;
    if (x0 >= s.w - 1) { x0 = s.w - 1; f = x0 << 8; }
    xo[x * 2] = x0; xo[x * 2 + 1] = f & 255;
  }
  for (int y = 0; y < d.h; y++) {
    int f = (int)(((int64_t)(2 * y + 1) * s.h * 256) / (2 * d.h)) - 128;
    if (f < 0) f = 0;
    int y0 = f >> 8, wy = f & 255;
    if (y0 >= s.h - 1) { y0 = s.h - 1; wy = 0; }
    const uint32_t* r = s.px + (size_t)y0 * s.w;
    if (wy) { const uint32_t* r1 = r + s.w; for (int x = 0; x < s.w; x++) tmp[x] = lerp(r[x], r1[x], wy); r = tmp; }
    uint32_t* o = d.px + (size_t)y * d.w;
    for (int x = 0; x < d.w; x++) { int x0 = xo[x * 2], wx = xo[x * 2 + 1]; o[x] = wx ? lerp(r[x0], r[x0 + 1], wx) : r[x0] & 0xFFFFFF; }
  }
  free(tmp); free(xo);
}
/** Decodes into `dst`, fitted inside vw x vh (aspect kept; 0 = native size). Uses the smallest DCT scale that
 *  still covers the box, so a 24 MP file costs about a 1/8 decode and a live view about 1:1. */
bool decode_fit(const unsigned char* jpg, unsigned long n, int vw, int vh, Img& dst, Img& scratch, Buf& err, bool is_live = false) {
  int w, h, ss, cs;
  if (tjDecompressHeader3(tjd, jpg, n, &w, &h, &ss, &cs)) { err.add(tjGetErrorStr2(tjd)); return false; }
  if (is_live) { live_w = w; live_h = h; }
  int tw = w, th = h;
  if (vw > 0 && vh > 0) {
    if ((int64_t)w * vh > (int64_t)h * vw) { tw = vw; th = (int)((int64_t)h * vw / w); }
    else { th = vh; tw = (int)((int64_t)w * vh / h); }
    if (tw < 1) tw = 1;
    if (th < 1) th = 1;
  }
  int nsf, sw = w, sh = h;
  tjscalingfactor* sf = tjGetScalingFactors(&nsf);
  for (int i = 0; i < nsf; i++) {
    if (sf[i].num > sf[i].denom) continue;
    int cw = TJSCALED(w, sf[i]), ch = TJSCALED(h, sf[i]);
    if (cw >= tw && ch >= th && (int64_t)cw * ch < (int64_t)sw * sh) { sw = cw; sh = ch; }
  }
  Img& out = (sw == tw && sh == th) ? dst : scratch;
  out.reserve((size_t)sw * sh);
  if (tjDecompress2(tjd, jpg, n, (unsigned char*)out.px, sw, sw * 4, sh, TJPF_BGRX, TJFLAG_FASTDCT) && tjGetErrorCode(tjd) != TJERR_WARNING) {
    err.add(tjGetErrorStr2(tjd)); return false;
  }
  out.w = sw; out.h = sh;
  if (&out == &scratch) { dst.reserve((size_t)tw * th); dst.w = tw; dst.h = th; resample(scratch, dst); }
  else for (size_t i = 0, k = (size_t)sw * sh; i < k; i++) out.px[i] &= 0xFFFFFF;  // TurboJPEG fills X with 0xFF
  return true;
}

// ---------------------------------------------------------------- fake camera (worker)
struct FakeW { const char* path; const char* label; const char* type; bool ro; const char* choices; int cur; };
FakeW fake_ws[] = {
  {"/main/imgsettings/iso", "ISO Speed", "radio", false, "Auto|100|200|400|800|1600|3200|6400", 0},
  {"/main/capturesettings/aperture", "Aperture", "radio", false, "2.8|3.5|4|4.5|5.6|6.3|8|11|16", 4},
  {"/main/capturesettings/shutterspeed", "Shutter Speed", "radio", false, "1/4000|1/2000|1/1000|1/500|1/250|1/125|1/60|1/30|1/15|1/8", 5},
  {"/main/imgsettings/whitebalance", "WhiteBalance", "radio", false, "Auto|Daylight|Shadow|Cloudy|Tungsten|Fluorescent", 0},
  {"/main/capturesettings/focusmode", "Focus Mode", "radio", false, "One Shot|AI Focus|AI Servo|Manual", 0},
  {"/main/capturesettings/exposurecompensation", "Exposure Compensation", "radio", false, "-2|-1.7|-1.3|-1|-0.7|-0.3|0|0.3|0.7|1|1.3|1.7|2", 6},
  {"/main/imgsettings/imageformat", "Image Format", "radio", false, "Large Fine JPEG|Medium Fine JPEG|RAW|RAW + Large Fine JPEG", 0},
  {"/main/settings/capturetarget", "Capture Target", "radio", false, "Internal RAM|Memory card", 1},
  {"/main/status/cameramodel", "Camera Model", "text", true, "Zinc Fake Camera", 0},
  {"/main/status/batterylevel", "Battery Level", "text", true, "87%", 0},
};
const int FAKE_N = sizeof fake_ws / sizeof fake_ws[0];
/** i-th '|'-separated choice, or -1 when absent. */
int choice(const char* list, int i, char* out, size_t cap) {
  for (int k = 0; *list; k++) {
    const char* e = strchr(list, '|');
    size_t n = e ? (size_t)(e - list) : strlen(list);
    if (k == i) { if (n >= cap) n = cap - 1; memcpy(out, list, n); out[n] = 0; return k; }
    if (!e) break;
    list = e + 1;
  }
  return -1;
}
FakeW* fake_find(const char* name) {
  for (FakeW& w : fake_ws) { const char* s = strrchr(w.path, '/'); if (!strcmp(w.path, name) || !strcmp(s + 1, name)) return &w; }
  return nullptr;
}
double fake_num(const char* name) {  // numeric value of a setting ("1/125" -> 0.008)
  char v[64]; FakeW* w = fake_find(name);
  choice(w->choices, w->cur, v, sizeof v);
  const char* sl = strchr(v, '/');
  return sl ? atof(v) / atof(sl + 1) : atof(v);
}
/** Animated scene; exposure (ISO, shutter, aperture, compensation) and white balance change how it looks. */
void fake_scene(Img& im, int w, int h, double t) {
  im.reserve((size_t)w * h); im.w = w; im.h = h;
  double iso = fake_num("iso");
  double ev = fake_num("exposurecompensation") + log2((iso > 0 ? iso : 400) / 400) + log2(fake_num("shutterspeed") * 125) - 2 * log2(fake_num("aperture") / 5.6);
  double gain = pow(2, ev < -4 ? -4 : ev > 4 ? 4 : ev);
  static const double tints[][3] = {{1, 1, 1}, {1, 1, 1}, {1.15, 1, 0.82}, {1.08, 1, 0.9}, {0.72, 0.95, 1.4}, {0.9, 1.06, 1.12}};
  const double* tint = tints[fake_find("whitebalance")->cur];
  uint8_t lut[3][256];
  for (int c = 0; c < 3; c++) for (int v = 0; v < 256; v++) { double o = v * gain * tint[c]; lut[c][v] = (uint8_t)(o > 255 ? 255 : o); }
  int noise = (int)((iso > 0 ? iso : 400) / 6400 * 48);
  static const uint32_t checker[24] = {0x735244, 0xc29682, 0x627a9d, 0x576c43, 0x8580b1, 0x67bdaa, 0xd67e2c, 0x505ba6, 0xc15a63, 0x5e3c6c, 0x9dbc40, 0xe0a32e,
                                       0x383d96, 0x469449, 0xaf363c, 0xe7c71f, 0xbb5695, 0x0885a1, 0xf3f3f2, 0xc8c8c8, 0xa0a0a0, 0x7a7a79, 0x555555, 0x343434};
  double sun_x = w * (0.1 + 0.8 * fmod(t / 20, 1)), sun_y = h * 0.22, sun_r = h * 0.07;
  double ball_x = w * (0.62 + 0.25 * sin(t * 1.3)), ball_y = h * (0.8 - 0.16 * fabs(sin(t * 2.6))), ball_r = h * 0.06;
  int cs = (int)(h * 0.05), cx0 = (int)(w * 0.04), cy0 = h - 4 * (cs + 3) - (int)(h * 0.04);
  int* ridge = (int*)malloc(sizeof(int) * w * 2);
  for (int x = 0; x < w; x++) {
    double u = (double)x / w;
    ridge[x * 2] = (int)(h * (0.5 + 0.06 * sin(u * 11 + 1) + 0.03 * sin(u * 27)));
    ridge[x * 2 + 1] = (int)(h * (0.64 + 0.04 * sin(u * 7 + t * 0.4)));
  }
  uint32_t rng = 0x9e3779b9u ^ (uint32_t)(t * 1000);
  for (int y = 0; y < h; y++) {
    uint32_t* row = im.px + (size_t)y * w;
    double k = (double)y / (h * 0.62); if (k > 1) k = 1;
    uint32_t sky = (uint32_t)(40 + 130 * k) << 16 | (uint32_t)(90 + 110 * k) << 8 | (uint32_t)(170 + 60 * k);
    for (int x = 0; x < w; x++) {
      uint32_t c;
      if (y >= ridge[x * 2 + 1]) { int d = y - ridge[x * 2 + 1]; c = (uint32_t)(50 - d * 30 / h) << 16 | (uint32_t)(120 - d * 60 / h) << 8 | 55; }
      else if (y >= ridge[x * 2]) c = 0x4a5a78;
      else {
        double dx = x - sun_x, dy = y - sun_y, d2 = dx * dx + dy * dy;
        c = d2 < sun_r * sun_r ? 0xfff0c0 : sky;
      }
      double bx = x - ball_x, by = y - ball_y;
      if (bx * bx + by * by < ball_r * ball_r) { int s = (int)(255 - (bx + by + ball_r) * 70 / ball_r); if (s < 60) s = 60; if (s > 255) s = 255; c = (uint32_t)s << 16 | (uint32_t)(s / 5) << 8 | (uint32_t)(s / 6); }
      int px = x - cx0, py = y - cy0;
      if (px >= 0 && py >= 0 && px < 6 * (cs + 3) && py < 4 * (cs + 3) && px % (cs + 3) < cs && py % (cs + 3) < cs) c = checker[(py / (cs + 3)) * 6 + px / (cs + 3)];
      uint32_t r = lut[0][c >> 16 & 255], g = lut[1][c >> 8 & 255], b = lut[2][c & 255];
      if (noise) {
        rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
        int n = (int)(rng % (uint32_t)(2 * noise + 1)) - noise;
        r = (uint32_t)(r + n > 255 ? 255 : (int)r + n < 0 ? 0 : (int)r + n); g = (uint32_t)(g + n > 255 ? 255 : (int)g + n < 0 ? 0 : (int)g + n); b = (uint32_t)(b + n > 255 ? 255 : (int)b + n < 0 ? 0 : (int)b + n);
      }
      row[x] = r << 16 | g << 8 | b;
    }
  }
  free(ridge);
}
bool fake_jpeg(int w, int h, int quality, double t, unsigned char** jpg, unsigned long* n, Img& tmp) {
  if (!tjc) tjc = tjInitCompress();
  fake_scene(tmp, w, h, t);
  *jpg = nullptr; *n = 0;
  return tjCompress2(tjc, (unsigned char*)tmp.px, w, 0, h, TJPF_BGRX, jpg, n, TJSAMP_420, quality, TJFLAG_FASTDCT) == 0;
}

// ---------------------------------------------------------------- worker
GPContext* ctx;
Camera* cam;
CameraFile* pf;
bool fake, fake_max, w_open;
int fake_shots = 0;
double t0 = 0;
Img scratch, gen;

bool gp_fail(int r, Buf& out) { if (r >= GP_OK) return false; out.add("gphoto2: "); out.add(gp_result_as_string(r)); return true; }
bool write_file(const char* path, const void* p, size_t n) {
  FILE* f = fopen(path, "wb");
  if (!f) return false;
  bool ok = fwrite(p, 1, n, f) == n;
  return fclose(f) == 0 && ok;
}
/** Local file for camera path folder/name under dir. */
void local_path(const char* dir, const char* cam_path, Buf& out) {
  if (!dir[0]) dir = ".";
  mkdir(dir, 0755);
  const char* s = strrchr(cam_path, '/');
  out.add(dir); out.ch('/'); out.add(s ? s + 1 : cam_path);
}
bool fake_file(const char* cam_path, const char* dir, Buf& out) {
  unsigned char* jpg; unsigned long n;
  Buf local; local_path(dir, cam_path, local);
  bool ok = fake_jpeg(1920, 1280, 92, mono_ms() / 1000 - t0, &jpg, &n, scratch) && write_file(local.p, jpg, n);
  tjFree(jpg);
  if (!ok) { out.add("gphoto2: cannot write "); out.add(local.p); free(local.p); return false; }
  out.add(local.p); free(local.p);
  return true;
}
bool download(const char* cam_path, const char* dir, Buf& out) {
  if (fake) return fake_file(cam_path, dir, out);
  char folder[1024];
  const char* s = strrchr(cam_path, '/');
  if (!s) { out.add("gphoto2: bad camera path"); return false; }
  snprintf(folder, sizeof folder, "%.*s", (int)(s - cam_path), cam_path);
  CameraFile* f;
  gp_file_new(&f);
  Buf local; local_path(dir, cam_path, local);
  int r = gp_camera_file_get(cam, folder[0] ? folder : "/", s + 1, GP_FILE_TYPE_NORMAL, f, ctx);
  if (r >= GP_OK) r = gp_file_save(f, local.p);
  gp_file_unref(f);
  bool bad = gp_fail(r, out);
  if (!bad) out.add(local.p);
  free(local.p);
  return !bad;
}

void close_camera() {
  if (pf) { gp_file_unref(pf); pf = nullptr; }
  if (cam) { gp_camera_exit(cam, ctx); gp_camera_unref(cam); cam = nullptr; }
  w_open = false;
  pthread_mutex_lock(&mu); live = false; cam_fps = 0; pthread_mutex_unlock(&mu);
}

/** Config tree: every leaf widget as a record. */
void walk(CameraWidget* w, const char* parent, Buf& out) {
  const char *name, *label; CameraWidgetType t; int ro = 0;
  gp_widget_get_name(w, &name); gp_widget_get_label(w, &label); gp_widget_get_type(w, &t); gp_widget_get_readonly(w, &ro);
  char path[512]; snprintf(path, sizeof path, "%s/%s", parent, name);
  if (t == GP_WIDGET_WINDOW || t == GP_WIDGET_SECTION) {
    for (int i = 0, n = gp_widget_count_children(w); i < n; i++) { CameraWidget* c; if (gp_widget_get_child(w, i, &c) >= GP_OK) walk(c, path, out); }
    return;
  }
  static const char* names[] = {"window", "section", "text", "range", "toggle", "radio", "menu", "button", "date"};
  if (out.n) out.ch(RS);
  out.add(path); out.ch(FS); out.add(label); out.ch(FS); out.add(names[t]); out.ch(FS); out.add(ro ? "1" : "0"); out.ch(FS);
  float lo = 0, hi = 0, step = 0;
  if (t == GP_WIDGET_TEXT || t == GP_WIDGET_RADIO || t == GP_WIDGET_MENU) { const char* v = nullptr; gp_widget_get_value(w, &v); if (v) out.add(v); }
  else if (t == GP_WIDGET_RANGE) { float v = 0; gp_widget_get_value(w, &v); gp_widget_get_range(w, &lo, &hi, &step); out.num(v); }
  else if (t == GP_WIDGET_TOGGLE || t == GP_WIDGET_DATE) { int v = 0; gp_widget_get_value(w, &v); out.num(v); }
  out.ch(FS); out.num(lo); out.ch(FS); out.num(hi); out.ch(FS); out.num(step);
  if (t == GP_WIDGET_RADIO || t == GP_WIDGET_MENU)
    for (int i = 0, n = gp_widget_count_choices(w); i < n; i++) { const char* c; if (gp_widget_get_choice(w, i, &c) >= GP_OK) { out.ch(FS); out.add(c); } }
}
/** Single widget by name (or path): get_single_config when the driver has it, else the full tree. */
const char* leaf(const char* name) { const char* s = strrchr(name, '/'); return s ? s + 1 : name; }
int find_widget(const char* name, CameraWidget** root, CameraWidget** w) {
  name = leaf(name);
  int r = gp_camera_get_single_config(cam, name, w, ctx);
  if (r >= GP_OK) { *root = *w; return r; }
  if ((r = gp_camera_get_config(cam, root, ctx)) < GP_OK) return r;
  if ((r = gp_widget_get_child_by_name(*root, name, w)) < GP_OK) { gp_widget_free(*root); *root = nullptr; }
  return r;
}

bool run(Job* j, Buf& out, Img& img) {
  if (j->op == DETECT) {
    if (fake) { out.add("Zinc Fake Camera"); out.ch(FS); out.add("usb:fake"); return true; }
    CameraList* l; gp_list_new(&l);
    int r = gp_camera_autodetect(l, ctx);
    for (int i = 0; r >= GP_OK && i < gp_list_count(l); i++) {
      const char *m, *p; gp_list_get_name(l, i, &m); gp_list_get_value(l, i, &p);
      if (i) out.ch(RS);
      out.add(m); out.ch(FS); out.add(p);
    }
    gp_list_free(l);
    return !gp_fail(r, out);
  }
  if (j->op == THUMB) {
    FILE* f = fopen(j->a, "rb");
    if (!f) { out.add("gphoto2: cannot read "); out.add(j->a); return false; }
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    unsigned char* p = (unsigned char*)malloc(n > 0 ? n : 1);
    bool ok = fread(p, 1, n, f) == (size_t)n && decode_fit(p, n, j->w, j->h, img, scratch, out);
    fclose(f); free(p);
    return ok;
  }
  if (j->op == OPEN) {
    close_camera();
    if (fake) { w_open = true; out.add("Zinc Fake Camera"); return true; }
    gp_camera_new(&cam);
    if (j->a[0]) {
      CameraAbilitiesList* al; gp_abilities_list_new(&al); gp_abilities_list_load(al, ctx);
      int i = gp_abilities_list_lookup_model(al, j->a);
      if (i >= 0) { CameraAbilities a; gp_abilities_list_get_abilities(al, i, &a); gp_camera_set_abilities(cam, a); }
      gp_abilities_list_free(al);
    }
    if (j->b[0]) {
      GPPortInfoList* pl; gp_port_info_list_new(&pl); gp_port_info_list_load(pl);
      int i = gp_port_info_list_lookup_path(pl, j->b);
      if (i >= 0) { GPPortInfo pi; gp_port_info_list_get_info(pl, i, &pi); gp_camera_set_port_info(cam, pi); }
      gp_port_info_list_free(pl);
    }
    int r = gp_camera_init(cam, ctx);
    if (gp_fail(r, out)) { gp_camera_unref(cam); cam = nullptr; return false; }
    w_open = true;
    CameraAbilities a; gp_camera_get_abilities(cam, &a);
    out.add(a.model);
    return true;
  }
  if (j->op == CLOSE) { close_camera(); return true; }
  if (!w_open) { out.add("gphoto2: no camera open"); return false; }
  if (fake) {
    switch (j->op) {
      case SUMMARY: out.add("Manufacturer: Zinc\nModel: Zinc Fake Camera\nVersion: 1.0\nSerial Number: 0000000001\nVendor Extension: generated frames (ZINC_FAKE_CAMERA)\n"); return true;
      case CONFIG:
        for (int i = 0; i < FAKE_N; i++) {
          FakeW& w = fake_ws[i]; char v[64];
          if (i) out.ch(RS);
          out.add(w.path); out.ch(FS); out.add(w.label); out.ch(FS); out.add(w.type); out.ch(FS); out.add(w.ro ? "1" : "0"); out.ch(FS);
          choice(w.choices, w.cur, v, sizeof v); out.add(v); out.add("\x1f" "0\x1f" "0\x1f" "0");
          if (!w.ro) for (int k = 0; choice(w.choices, k, v, sizeof v) >= 0; k++) { out.ch(FS); out.add(v); }
        }
        return true;
      case GET: case SET: {
        FakeW* w = fake_find(j->a);
        if (!w) { out.add("gphoto2: unknown widget "); out.add(j->a); return false; }
        char v[64];
        if (j->op == GET) { choice(w->choices, w->cur, v, sizeof v); out.add(v); return true; }
        if (w->ro) { out.add("gphoto2: read-only widget"); return false; }
        for (int k = 0; choice(w->choices, k, v, sizeof v) >= 0; k++) if (!strcmp(v, j->b)) { w->cur = k; return true; }
        out.add("gphoto2: bad value "); out.add(j->b); return false;
      }
      case CAPTURE: case TRIGGER: {
        char path[128]; snprintf(path, sizeof path, "/store_00020001/DCIM/100ZINC/IMG_%04d.JPG", ++fake_shots);
        usleep(150000);  // shutter + write
        if (j->op == TRIGGER) { push_event("file", path); return true; }
        return j->a[0] ? fake_file(path, j->a, out) : (out.add(path), true);
      }
      case DOWNLOAD: return fake_file(j->a, j->b, out);
      default: return false;
    }
  }
  switch (j->op) {
    case SUMMARY: { CameraText t; if (gp_fail(gp_camera_get_summary(cam, &t, ctx), out)) return false; out.add(t.text); return true; }
    case CONFIG: {
      CameraWidget* root;
      if (gp_fail(gp_camera_get_config(cam, &root, ctx), out)) return false;
      walk(root, "", out);
      gp_widget_free(root);
      return true;
    }
    case GET: case SET: {
      CameraWidget *root = nullptr, *w = nullptr;
      int r = find_widget(j->a, &root, &w);
      if (gp_fail(r, out)) return false;
      CameraWidgetType t; gp_widget_get_type(w, &t);
      if (j->op == GET) {
        if (t == GP_WIDGET_RANGE) { float v = 0; gp_widget_get_value(w, &v); out.num(v); }
        else if (t == GP_WIDGET_TOGGLE || t == GP_WIDGET_DATE) { int v = 0; gp_widget_get_value(w, &v); out.num(v); }
        else if (t != GP_WIDGET_BUTTON) { const char* v = nullptr; gp_widget_get_value(w, &v); if (v) out.add(v); }
      } else {
        if (t == GP_WIDGET_RANGE) { float v = (float)atof(j->b); r = gp_widget_set_value(w, &v); }
        else if (t == GP_WIDGET_TOGGLE || t == GP_WIDGET_DATE) { int v = atoi(j->b); r = gp_widget_set_value(w, &v); }
        else r = gp_widget_set_value(w, j->b);
        if (r >= GP_OK) r = root == w ? gp_camera_set_single_config(cam, leaf(j->a), w, ctx) : gp_camera_set_config(cam, root, ctx);
      }
      gp_widget_free(root);
      return !gp_fail(r, out);
    }
    case CAPTURE: {
      CameraFilePath p;
      if (gp_fail(gp_camera_capture(cam, GP_CAPTURE_IMAGE, &p, ctx), out)) return false;
      Buf cp; cp.add(p.folder); if (cp.n && cp.p[cp.n - 1] != '/') cp.ch('/'); cp.add(p.name);
      bool ok = j->a[0] ? download(cp.p, j->a, out) : (out.add(cp.p), true);
      free(cp.p);
      return ok;
    }
    case TRIGGER: return !gp_fail(gp_camera_trigger_capture(cam, ctx), out);
    case DOWNLOAD: return download(j->a, j->b, out);
    default: return false;
  }
}

void poll_events(int ms) {
  for (int k = 0; k < 8 && cam; k++) {
    CameraEventType t; void* data = nullptr;
    if (gp_camera_wait_for_event(cam, k ? 0 : ms, &t, &data, ctx) < GP_OK) return;
    if (t == GP_EVENT_FILE_ADDED && data) {
      CameraFilePath* p = (CameraFilePath*)data;
      Buf b; b.add(p->folder); if (b.n && b.p[b.n - 1] != '/') b.ch('/'); b.add(p->name);
      push_event("file", b.p); free(b.p);
    }
    free(data);
    if (t == GP_EVENT_TIMEOUT) return;
  }
}

/** One live view frame: preview JPEG -> fitted pixels in frames[back] -> published. */
int fails = 0, win_frames = 0;
double win_t0 = 0, last_frame = 0, next_due = 0;
void live_frame(int vw, int vh) {
  const unsigned char* jpg = nullptr; unsigned long n = 0; unsigned char* own = nullptr;
  Buf err;
  bool ok;
  if (fake) {
    last_frame = mono_ms();
    if (!fake_max) {  // 30 fps deadlines, like a camera's live view clock
      if (next_due < last_frame - 100) next_due = last_frame;
      if (next_due > last_frame) usleep((useconds_t)((next_due - last_frame) * 1000));
      next_due += 1000.0 / 30;
      last_frame = mono_ms();
    }
    ok = fake_jpeg(1024, 683, 75, last_frame / 1000 - t0, &own, &n, gen);
    jpg = own;
  } else {
    if (!pf) gp_file_new(&pf);
    int r = gp_camera_capture_preview(cam, pf, ctx);
    ok = !gp_fail(r, err);
    const char* d = nullptr;
    if (ok) { gp_file_get_data_and_size(pf, &d, &n); jpg = (const unsigned char*)d; }
  }
  double t = mono_ms();
  ok = ok && decode_fit(jpg, n, vw, vh, frames[back], scratch, err, true);
  double ms = mono_ms() - t;
  if (own) tjFree(own);
  if (!ok) {
    if (++fails >= 10) {  // unplugged, or the body left live view mode
      pthread_mutex_lock(&mu); live = false; cam_fps = 0; pthread_mutex_unlock(&mu);
      push_event("error", err.p ? err.p : "live view failed");
      fails = 0;
    }
    free(err.p);
    return;
  }
  fails = 0;
  win_frames++;
  if (win_t0 == 0) win_t0 = t;
  pthread_mutex_lock(&mu);
  int b = back; back = ready; ready = b; fresh = true;
  dec_ms = dec_ms == 0 ? ms : dec_ms * 0.9 + ms * 0.1;
  if (t - win_t0 >= 1000) { cam_fps = win_frames * 1000 / (t - win_t0); win_frames = 0; win_t0 = t; }
  pthread_mutex_unlock(&mu);
}

void* worker(void*) {
  ctx = gp_context_new();
  tjd = tjInitDecompress();
  t0 = mono_ms() / 1000;
  int n = 0;
  for (;;) {
    pthread_mutex_lock(&mu);
    while (!quit && !jobs && !w_open) pthread_cond_wait(&cv, &mu);
    if (quit) { pthread_mutex_unlock(&mu); break; }
    Job* j = jobs;
    if (j) { jobs = j->next; if (!jobs) jobs_tail = nullptr; }
    bool lv = live;
    int vw = view_w, vh = view_h;
    if (!lv) { cam_fps = 0; win_frames = 0; win_t0 = 0; }
    pthread_mutex_unlock(&mu);
    if (j) {
      Buf out; Done* d = (Done*)calloc(1, sizeof(Done));
      d->id = j->id;
      d->ok = run(j, out, d->img);
      d->text = out.take();
      free(j->a); free(j->b); free(j);
      push_done(d);
    } else if (lv && w_open) {
      live_frame(vw, vh);
      if (!fake && ++n % 10 == 0) poll_events(0);
    } else if (fake) usleep(20000);
    else poll_events(100);
  }
  close_camera();
  tjDestroy(tjd);
  if (tjc) tjDestroy(tjc);
  gp_context_unref(ctx);
  return nullptr;
}

char* cstr(const zrt::String& s) { char* p = (char*)malloc(s.bytes() + 1); memcpy(p, s.ptr(), s.bytes()); p[s.bytes()] = 0; return p; }
zrt::String zstr(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
}  // namespace

// Headless programs (no zinc:gfx) do not link the rasterizer: these weak fallbacks make images a no-op (-1 ids).
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_create(int32_t, int32_t) { return -1; }
__attribute__((weak)) int32_t dyn_wrap(int32_t, int32_t, const uint32_t*, int32_t) { return -1; }
__attribute__((weak)) void dyn_update(int32_t, const uint32_t*, int32_t) {}
__attribute__((weak)) uint32_t* dyn_pixels(int32_t) { return nullptr; }
__attribute__((weak)) void dyn_destroy(int32_t) {}
}}

// ---------------------------------------------------------------- main thread
struct HostGphoto2 : NativeGphoto2, zrt::Poller {
  static const int MAXP = 64;
  zrt::Ref<zrt::PromiseObj<zrt::String>> pend[MAXP];
  int pend_id[MAXP] = {};
  Op pend_op[MAXP] = {};
  int seq = 0, inflight = 0;
  bool opened = false, want_live = false;
  zrt::Fn<void(zrt::String, zrt::String)> cb;
  int32_t img = -1, iw = 0, ih = 0;
  int shown = 0;
  double shown_t0 = 0, shown_fps = 0;

  zrt::Promise<zrt::String> submit(Op op, const zrt::String& a, const zrt::String& b, int w = 0, int h = 0) {
    auto pr = zrt::Promise<zrt::String>::make_pending();
    int slot = -1;
    for (int i = 0; i < MAXP && slot < 0; i++) if (!pend[i].p) slot = i;
    if (slot < 0) { pr.p->reject(zrt::make<zrt::Error>(zstr("gphoto2: too many pending requests"))); return pr; }
    Job* j = (Job*)calloc(1, sizeof(Job));
    j->id = ++seq; j->op = op; j->a = cstr(a); j->b = cstr(b); j->w = w; j->h = h;
    pend[slot] = pr.p; pend_id[slot] = j->id; pend_op[slot] = op; inflight++;
    pthread_mutex_lock(&mu);
    if (!started) { started = true; pthread_create(&thread, nullptr, worker, nullptr); }
    if (jobs_tail) jobs_tail->next = j; else jobs = j;
    jobs_tail = j;
    pthread_cond_signal(&cv);
    pthread_mutex_unlock(&mu);
    return pr;
  }
  /** zinc.json "permissions" (ZN-322): a camera needs "camera"; the engine answers through zn_host_permission (absent in older engines: allowed). */
  bool refuse(zrt::Promise<zrt::String>& pr) {
    char why[512];
    if (!zn_host_permission || !zn_host_permission("camera", "gphoto2", why, sizeof why)) return false;
    pr = zrt::Promise<zrt::String>::make_pending();
    pr.p->reject(zrt::make<zrt::Error>(zstr(why)));
    return true;
  }
  zrt::Promise<zrt::String> detect() override { zrt::Promise<zrt::String> pr; if (refuse(pr)) return pr; return submit(DETECT, zrt::String(), zrt::String()); }
  zrt::Promise<zrt::String> open(zrt::String model, zrt::String port) override { zrt::Promise<zrt::String> pr; if (refuse(pr)) return pr; return submit(OPEN, model, port); }
  zrt::Promise<zrt::String> close() override { return submit(CLOSE, zrt::String(), zrt::String()); }
  zrt::Promise<zrt::String> summary() override { return submit(SUMMARY, zrt::String(), zrt::String()); }
  zrt::Promise<zrt::String> config() override { return submit(CONFIG, zrt::String(), zrt::String()); }
  zrt::Promise<zrt::String> get(zrt::String name) override { return submit(GET, name, zrt::String()); }
  zrt::Promise<zrt::String> set(zrt::String name, zrt::String value) override { return submit(SET, name, value); }
  zrt::Promise<zrt::String> capture(zrt::String dir) override { return submit(CAPTURE, dir, zrt::String()); }
  zrt::Promise<zrt::String> trigger() override { return submit(TRIGGER, zrt::String(), zrt::String()); }
  zrt::Promise<zrt::String> download(zrt::String path, zrt::String dir) override { return submit(DOWNLOAD, path, dir); }
  zrt::Promise<zrt::String> thumbnail(zrt::String path, int32_t w, int32_t h) override { return submit(THUMB, path, zrt::String(), w, h); }
  void onEvent(zrt::Fn<void(zrt::String, zrt::String)> f) override { cb = f; }
  void liveView(bool on) override { pthread_mutex_lock(&mu); live = want_live = on; pthread_cond_signal(&cv); pthread_mutex_unlock(&mu); }
  void setViewSize(int32_t w, int32_t h) override { pthread_mutex_lock(&mu); view_w = w; view_h = h; pthread_mutex_unlock(&mu); }
  int32_t liveImage() override { return img; }
  double cameraFps() override { pthread_mutex_lock(&mu); double v = cam_fps; pthread_mutex_unlock(&mu); return v; }
  double shownFps() override { return shown_fps; }
  int32_t liveWidth() override { return live_w; }
  int32_t liveHeight() override { return live_h; }
  double decodeMs() override { pthread_mutex_lock(&mu); double v = dec_ms; pthread_mutex_unlock(&mu); return v; }

  bool poll() override {
    if (!started) return false;
    pthread_mutex_lock(&mu);
    Done* d = done; done = done_tail = nullptr;
    bool got = fresh;
    if (got) { int f = front; front = ready; ready = f; fresh = false; }
    want_live = live;
    pthread_mutex_unlock(&mu);
    if (got) {  // newest frame: the worker never touches frames[front]
      const Img& f = frames[front];
      if (img < 0 || f.w != iw || f.h != ih) { if (img >= 0) zrt::raster::dyn_destroy(img); img = zrt::raster::dyn_wrap(f.w, f.h, f.px, f.w); iw = f.w; ih = f.h; }
      else zrt::raster::dyn_update(img, f.px, f.w);
      shown++;
    }
    double now = zrt::now_ms();
    if (now - shown_t0 >= 1000) { shown_fps = shown_t0 > 0 ? shown * 1000 / (now - shown_t0) : 0; shown = 0; shown_t0 = now; }
    bool handled = d != nullptr;
    while (d) {
      Done* next = d->next;
      if (!d->id) {
        if (cb) { zrt::Fn<void(zrt::String, zrt::String)> f = cb; f(zstr(d->kind), zstr(d->text)); zrt::check_uncaught(); }
      } else {
        for (int i = 0; i < MAXP; i++) if (pend[i].p && pend_id[i] == d->id) {
          zrt::Ref<zrt::PromiseObj<zrt::String>> p = pend[i];
          pend[i] = nullptr; inflight--;
          if (!d->ok) p->reject(zrt::make<zrt::Error>(zstr(d->text)));
          else if (d->img.px) {  // thumbnail: copied into a runtime-owned image
            int32_t id = zrt::raster::dyn_create(d->img.w, d->img.h);
            if (id >= 0) memcpy(zrt::raster::dyn_pixels(id), d->img.px, (size_t)d->img.w * d->img.h * 4);
            char s[16]; snprintf(s, sizeof s, "%d", (int)id);
            p->resolve(zstr(s));
          } else {
            if (pend_op[i] == OPEN) opened = true;
            if (pend_op[i] == CLOSE) opened = false;
            p->resolve(zstr(d->text));
          }
          break;
        }
      }
      free(d->text); free(d->kind); free(d->img.px); free(d);
      d = next;
    }
    return inflight > 0 || opened || want_live || handled;  // handled: callbacks may have queued new requests
  }
  void shutdown() override {
    cb = nullptr;
    for (auto& p : pend) p = nullptr;
    if (!started) return;
    pthread_mutex_lock(&mu); quit = true; pthread_cond_signal(&cv); pthread_mutex_unlock(&mu);
    pthread_join(thread, nullptr);
    started = false;
  }
};

NativeGphoto2* zinc_create_Gphoto2() {
  static HostGphoto2 g;
  g.rc = zrt::IMMORTAL;
  fake = ZP_GPHOTO2_FAKE;
  if (const char* e = getenv("ZINC_FAKE_CAMERA")) { fake = fake || (e[0] && strcmp(e, "0") != 0); fake_max = !strcmp(e, "max"); }
  zrt::add_poller(&g);
  return &g;
}
