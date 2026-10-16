// zinc:camera: the part every platform shares, included by the backends (camera.macos.mm, camera.linux.cpp; camera.rpi1.cpp is Linux's). A camera is a slot with its source frame (the backend's or the fake
// camera's), the shown frame (options applied) wrapped as a zinc:gfx runtime image, and its frame index. Everything runs on the program's
// thread when index.ts calls frame(); the backend (backend.h) captures on its own thread and hands over its newest frame.
// The fake camera ("Zinc Fake Camera"): a test pattern at the asked size whose pixels are a function of the frame index only (pattern(),
// written again in camera.sim.ts), one frame per frame() call. It is the only camera with ZINC_FAKE_CAMERA=1 (or plugins.camera.fake) and in
// a deterministic run (ZINC_DETERMINISTIC, unless ZINC_FAKE_CAMERA=0), and the camera devices() gives when the machine has none.
#define ZRT_HOSTED_CPP
#include "zinc_native_camera.h"
#include "zrt_raster.h"
#include "backend.h"
#include <dlfcn.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef ZP_CAMERA_FAKE
#define ZP_CAMERA_FAKE 0
#endif

#ifndef CAM_BACKEND   // compiled alone (a target without a backend file, which defines it and includes this one): only the fake camera
int cam_backend_permission(bool) { return 1; }
int cam_backend_list(CamDevice*, int) { return 0; }
int cam_backend_open(const char*, int, int, int, int*, int*, double*, char* err, int n) { snprintf(err, n, "no camera backend on this platform"); return -1; }
bool cam_backend_take(int, uint32_t*, int, int, uint32_t*) { return false; }
void cam_backend_close(int) {}
#endif

// Headless programs (no zinc:gfx) do not link the rasterizer: images are then a no-op (-1). Loaded by zinc, each fallback asks the process
// for the real function first (as plugins/gphoto2 does).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster8dyn_wrapEiiPKji", &dyn_wrap); return f ? f(w, h, px, s) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) void dyn_destroy(int32_t id) { static auto f = host_fn("_ZN3zrt6raster11dyn_destroyEi", &dyn_destroy); if (f) f(id); }
}}

namespace {
const char FS = '\x1f', RS = '\x1e';
const char* FAKE_ID = "zinc:fake-camera";
const char* FAKE_NAME = "Zinc Fake Camera";

struct Cam {
  bool used = false, fake = false, mirror = false;
  int be = -1, w = 0, h = 0, index = -1, img = -1;
  double fps = 0, brightness = 0, contrast = 1;
  uint32_t seq = 0;
  uint8_t lut[256];
  std::vector<uint32_t> src, shown;
};
std::vector<Cam> cams;
std::string err;

const char* env(const char* k) { const char* v = getenv(k); return v ? v : ""; }
bool no_fake() { return !strcmp(env("ZINC_FAKE_CAMERA"), "0"); }
bool fake_only() {
  if (no_fake()) return false;
  if (*env("ZINC_FAKE_CAMERA")) return true;
  return ZP_CAMERA_FAKE || (*env("ZINC_DETERMINISTIC") && !*env("ZINC_REALTIME"));
}
bool refused() {
  char why[512];
  if (!zn_host_permission || !zn_host_permission("camera", "camera", why, sizeof why)) return false;
  err = std::string("camera: ") + why;
  return true;
}
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
Cam* at(int32_t h) { return h >= 0 && h < (int32_t)cams.size() && cams[h].used ? &cams[h] : nullptr; }

// The fake camera's frame `idx`: a row of 16 cells with the index in binary (white = 1) on top, eight colour bars, a grey ramp and an orange
// square moving 4 pixels a frame along it. Integers only, so camera.sim.ts draws the same pixels.
void pattern(uint32_t* px, int w, int h, int idx) {
  static const uint32_t bars[8] = {0xFFFFFF, 0xFFFF00, 0x00FFFF, 0x00FF00, 0xFF00FF, 0xFF0000, 0x0000FF, 0x000000};
  const int band = h / 12, split = h * 2 / 3, s = h / 6 > 2 ? h / 6 : 2;
  const int sx = (idx * 4) % (w - s > 1 ? w - s : 1), sy = split + (h - split - s) / 2;
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) {
      uint32_t c;
      if (y < band) c = (idx >> (15 - x * 16 / w)) & 1 ? 0xFFFFFF : 0x202020;
      else if (y < split) c = bars[x * 8 / w];
      else c = (uint32_t)(w > 1 ? x * 255 / (w - 1) : 0) * 0x010101;
      if (x >= sx && x < sx + s && y >= sy && y < sy + s) c = 0xFF8000;
      px[y * w + x] = c;
    }
}
void make_lut(Cam& c) {
  for (int v = 0; v < 256; v++) {
    int r = (int)floor((v - 128) * c.contrast + 128 + c.brightness * 255 + 0.5);
    c.lut[v] = (uint8_t)(r < 0 ? 0 : r > 255 ? 255 : r);
  }
}
// source -> shown with the options, then the image is marked changed
void present(Cam& c) {
  const bool plain = !c.mirror && c.brightness == 0 && c.contrast == 1;
  for (int y = 0; y < c.h; y++) {
    const uint32_t* s = c.src.data() + (size_t)y * c.w;
    uint32_t* d = c.shown.data() + (size_t)y * c.w;
    if (plain) { memcpy(d, s, (size_t)c.w * 4); continue; }
    for (int x = 0; x < c.w; x++) {
      uint32_t p = s[c.mirror ? c.w - 1 - x : x];
      d[x] = (uint32_t)c.lut[(p >> 16) & 255] << 16 | (uint32_t)c.lut[(p >> 8) & 255] << 8 | c.lut[p & 255];
    }
  }
  if (c.img >= 0) zrt::raster::dyn_update(c.img, c.shown.data(), c.w);
}
}  // namespace

struct HostCamera : NativeCamera {
  int32_t permission(bool ask) override {
    err.clear();
    if (refused()) return 2;
    return fake_only() ? 1 : cam_backend_permission(ask);
  }
  zrt::String devices() override {
    err.clear();
    if (refused()) return str("");
    std::string out;
    if (!fake_only()) {
      CamDevice d[16];
      int n = cam_backend_list(d, 16);
      for (int i = 0; i < n; i++) out += std::string(d[i].id) + FS + d[i].name + FS + d[i].position + RS;
    }
    if (out.empty() && !no_fake()) out = std::string(FAKE_ID) + FS + FAKE_NAME + FS + "unknown" + RS;
    return str(out);
  }
  zrt::String error() override { return str(err); }
  int32_t open(zrt::String idIn, int32_t w, int32_t h, int32_t fps) override {
    err.clear();
    if (refused()) return -1;
    std::string dev = cstr(idIn);
    if (w <= 0 || h <= 0) { w = 640; h = 480; }
    if (fps <= 0) fps = 30;
    w = w < 16 ? 16 : w > 4096 ? 4096 : w;
    h = h < 16 ? 16 : h > 4096 ? 4096 : h;
    Cam c;
    if (dev.empty()) {   // the first camera devices() lists
      std::string all = cstr(devices());
      if (!err.empty()) return -1;
      if (all.empty()) { err = "camera: no camera on this machine"; return -1; }
      dev = all.substr(0, all.find(FS));
    }
    if (dev == FAKE_ID && !no_fake()) { c.fake = true; c.w = w; c.h = h; c.fps = fps; }
    else if (fake_only()) { err = "camera: no camera '" + dev + "' (only the fake camera '" + FAKE_ID + "' with ZINC_FAKE_CAMERA or in a deterministic run)"; return -1; }
    else {
      char why[512] = "";
      c.be = cam_backend_open(dev.c_str(), w, h, fps, &c.w, &c.h, &c.fps, why, sizeof why);
      if (c.be < 0) { err = std::string("camera: ") + why; return -1; }
    }
    c.used = true;
    c.src.assign((size_t)c.w * c.h, 0);
    c.shown.assign((size_t)c.w * c.h, 0);
    make_lut(c);
    int32_t slot = 0;
    while (slot < (int32_t)cams.size() && cams[slot].used) slot++;
    if (slot == (int32_t)cams.size()) cams.emplace_back();
    cams[slot] = std::move(c);
    Cam& k = cams[slot];
    k.img = zrt::raster::dyn_wrap(k.w, k.h, k.shown.data(), k.w);   // black until the first frame
    return slot;
  }
  zrt::Array<double> format(int32_t h) override {
    zrt::Array<double> r = zrt::Array<double>::with_cap(4);
    Cam* c = at(h);
    double v[4] = {0, 0, 0, 0};
    if (c) {   // the fake camera makes one frame per call; a real one is polled twice per frame so a frame waits half a period at most
      v[0] = c->w; v[1] = c->h; v[2] = c->fps;
      v[3] = c->fake ? 1000 / c->fps : 500 / c->fps < 4 ? 4 : 500 / c->fps;
    }
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 4;
    return r;
  }
  int32_t frame(int32_t h) override {
    Cam* c = at(h);
    if (!c) return -1;
    if (c->fake) { pattern(c->src.data(), c->w, c->h, ++c->index); present(*c); }
    else if (cam_backend_take(c->be, c->src.data(), c->w, c->h, &c->seq)) { c->index++; present(*c); }
    return c->index;
  }
  int32_t image(int32_t h) override { Cam* c = at(h); return c ? c->img : -1; }
  void setOption(int32_t h, zrt::String nameIn, double v) override {
    Cam* c = at(h);
    if (!c) return;
    std::string name = cstr(nameIn);
    if (name == "mirror") c->mirror = v != 0;
    else if (name == "brightness") c->brightness = v < -1 ? -1 : v > 1 ? 1 : v;
    else if (name == "contrast") c->contrast = v < 0 ? 0 : v > 2 ? 2 : v;
    else return;
    make_lut(*c);
    if (c->index >= 0) present(*c);
  }
  zrt::Array<uint8_t> snapshot(int32_t h) override {
    Cam* c = at(h);
    int32_t n = c ? c->w * c->h : 0;
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n * 4);
    uint8_t* o = (uint8_t*)r.a->data;
    for (int32_t i = 0; i < n; i++) {
      uint32_t p = c->shown[i];
      o[i * 4] = (uint8_t)(p >> 16); o[i * 4 + 1] = (uint8_t)(p >> 8); o[i * 4 + 2] = (uint8_t)p; o[i * 4 + 3] = 255;
    }
    r.a->len = n * 4;
    return r;
  }
  void close(int32_t h) override {
    Cam* c = at(h);
    if (!c) return;
    if (c->be >= 0) cam_backend_close(c->be);
    if (c->img >= 0) zrt::raster::dyn_destroy(c->img);
    *c = Cam();
  }
};

NativeCamera* zinc_create_Camera() {
  static HostCamera inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
