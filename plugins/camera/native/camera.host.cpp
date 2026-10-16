// zinc:camera: the part every platform shares, included by the backends (camera.macos.mm, camera.linux.cpp; camera.rpi1.cpp is Linux's). A camera is a slot with its source frame (the backend's or the fake
// camera's), the shown frame (options applied) wrapped as a zinc:gfx runtime image, and its frame index. Everything runs on the program's
// thread when index.ts calls frame(); the backend (backend.h) captures on its own thread and hands over its newest frame.
// The fake camera ("Zinc Fake Camera"): a test pattern at the asked size whose pixels are a function of the frame index only (pattern(),
// written again in camera.sim.ts), one frame per frame() call. It is the only camera with ZINC_FAKE_CAMERA=1 (or plugins.camera.fake) and in
// a deterministic run (ZINC_DETERMINISTIC, unless ZINC_FAKE_CAMERA=0), and the camera devices() gives when the machine has none.
// ZINC_FAKE_CAMERA=N (2 to 8) lists N of them (front, back, external, ...), for the camera pickers of programs and their tests.
#define ZRT_HOSTED_CPP
#include "zinc_native_camera.h"
#include "zrt_raster.h"
#include "backend.h"
#include <dlfcn.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <atomic>
#include <memory>
#include <string>
#include <thread>
#include <vector>
#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBI_WRITE_NO_STDIO
#include "stb/stb_image_write.h"
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef ZP_CAMERA_FAKE
#define ZP_CAMERA_FAKE 0
#endif

#ifndef CAM_BACKEND   // compiled alone (a target without a backend file, which defines it and includes this one): only the fake camera
int cam_backend_permission(bool) { return 1; }
int cam_backend_list(CamDevice*, int) { return 0; }
int cam_backend_open(const char*, int, int, int, int*, int*, double*, char* err, int n) { snprintf(err, n, "no camera backend on this platform"); return -1; }
int cam_backend_state(int, char*, int) { return 1; }
bool cam_backend_take(int, uint32_t*, int, int, uint32_t*) { return false; }
void cam_backend_close(int) {}
#endif

// Headless programs (no zinc:gfx) do not link the rasterizer: images are then a no-op (-1). Loaded by zinc, each fallback asks the process
// for the real function first (as plugins/gphoto2 does).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster8dyn_wrapEiiPKji", &dyn_wrap); return f ? f(w, h, px, s) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) uint32_t* dyn_pixels(int32_t id) { static auto f = host_fn("_ZN3zrt6raster10dyn_pixelsEi", &dyn_pixels); return f ? f(id) : nullptr; }
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
int fakes() { const int n = atoi(env("ZINC_FAKE_CAMERA")); return n < 2 ? 1 : n > 8 ? 8 : n; }
bool is_fake(const std::string& id) { return id.rfind(FAKE_ID, 0) == 0; }
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
// PNG encodes (encodePng): a copy of the frame is deflated on its own thread, 100 ms or more for a 1280x720 picture from a real camera;
// the program polls pngReady and takes the bytes (and writes them with zinc:fs, under the app's permissions)
struct PngJob { std::atomic<int> state{0}; std::vector<uint8_t> out; };   // 0 encoding, 1 done
std::vector<std::shared_ptr<PngJob>> jobs;
void encode(std::vector<uint8_t>& out, const uint8_t* rgb, int w, int h) {
  stbi_write_png_to_func([](void* ctx, void* d, int n) { auto* o = (std::vector<uint8_t>*)ctx; o->insert(o->end(), (uint8_t*)d, (uint8_t*)d + n); }, &out, w, h, 3, rgb, w * 3);
}
std::vector<uint8_t> rgb_of(const uint32_t* px, size_t n) {
  std::vector<uint8_t> rgb(n * 3);
  for (size_t i = 0; i < n; i++) { uint32_t p = px[i]; rgb[i * 3] = (uint8_t)(p >> 16); rgb[i * 3 + 1] = (uint8_t)(p >> 8); rgb[i * 3 + 2] = (uint8_t)p; }
  return rgb;
}
zrt::Array<uint8_t> bytes(const std::vector<uint8_t>& v) {
  zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)v.size());
  if (!v.empty()) memcpy(r.a->data, v.data(), v.size());
  r.a->len = (int32_t)v.size();
  return r;
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
bool plain(const Cam& c) { return !c.mirror && c.brightness == 0 && c.contrast == 1; }
// the pixels on screen: the source itself without options (no copy per frame), else shown
const uint32_t* view(const Cam& c) { return plain(c) ? c.src.data() : c.shown.data(); }
// source -> shown with the options, then the image is marked changed (and points at the pixels to show)
void present(Cam& c) {
  if (plain(c)) { if (c.img >= 0) zrt::raster::dyn_update(c.img, c.src.data(), c.w); return; }
  for (int y = 0; y < c.h; y++) {
    const uint32_t* s = c.src.data() + (size_t)y * c.w;
    uint32_t* d = c.shown.data() + (size_t)y * c.w;
    for (int x = 0; x < c.w; x++) {
      uint32_t p = s[c.mirror ? c.w - 1 - x : x];
      d[x] = (uint32_t)c.lut[(p >> 16) & 255] << 16 | (uint32_t)c.lut[(p >> 8) & 255] << 8 | c.lut[p & 255];
    }
  }
  if (c.img >= 0) zrt::raster::dyn_update(c.img, c.shown.data(), c.w);
}
const char* fake_position(int i) { static const char* p[3] = {"front", "back", "external"}; return p[i % 3]; }
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
    if (out.empty() && !no_fake()) {
      const int n = fakes();
      if (n == 1) out = std::string(FAKE_ID) + FS + FAKE_NAME + FS + "unknown" + RS;
      else for (int i = 0; i < n; i++)   // the second one has a long name: pickers must cut names, not their position
        out += (i ? std::string(FAKE_ID) + "-" + std::to_string(i + 1) : std::string(FAKE_ID)) + FS + FAKE_NAME + (i == 1 ? std::string(" 2 with a rather long device name") : i ? " " + std::to_string(i + 1) : std::string()) + FS + fake_position(i) + RS;
    }
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
    if (is_fake(dev) && !no_fake()) { c.fake = true; c.w = w; c.h = h; c.fps = fps; }
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
  int32_t state(int32_t h) override {
    Cam* c = at(h);
    if (!c) return -1;
    if (c->fake) return 1;
    char why[512] = "";
    const int s = cam_backend_state(c->be, why, sizeof why);
    if (s < 0) err = std::string("camera: ") + why;
    return s;
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
    const uint32_t* px = n ? view(*c) : nullptr;
    for (int32_t i = 0; i < n; i++) {
      uint32_t p = px[i];
      o[i * 4] = (uint8_t)(p >> 16); o[i * 4 + 1] = (uint8_t)(p >> 8); o[i * 4 + 2] = (uint8_t)p; o[i * 4 + 3] = 255;
    }
    r.a->len = n * 4;
    return r;
  }
  zrt::Array<uint8_t> png(int32_t h) override {
    Cam* c = at(h);
    std::vector<uint8_t> out;
    if (c) { std::vector<uint8_t> rgb = rgb_of(view(*c), c->shown.size()); encode(out, rgb.data(), c->w, c->h); }
    return bytes(out);
  }
  bool copyFrame(int32_t h, int32_t image) override {
    Cam* c = at(h);
    uint32_t* d = c ? zrt::raster::dyn_pixels(image) : nullptr;
    if (!d) return false;
    const uint32_t* s = view(*c);
    for (size_t i = 0, n = c->shown.size(); i < n; i++) d[i] = s[i] | 0xFF000000u;   // opaque, whichever way the image reads its top byte
    zrt::raster::dyn_update(image, nullptr, 0);
    return true;
  }
  int32_t encodePng(int32_t h) override {
    Cam* c = at(h);
    if (!c) return -1;
    auto job = std::make_shared<PngJob>();
    int32_t id = 0;
    while (id < (int32_t)jobs.size() && jobs[id]) id++;
    if (id == (int32_t)jobs.size()) jobs.emplace_back();
    jobs[id] = job;
    std::vector<uint8_t> rgb = rgb_of(view(*c), c->shown.size());
    if (*env("ZINC_DETERMINISTIC")) { encode(job->out, rgb.data(), c->w, c->h); job->state = 1; }   // a test: ready at the same frame on every machine
    else std::thread([job, rgb = std::move(rgb), w = c->w, hh = c->h]() { encode(job->out, rgb.data(), w, hh); job->state = 1; }).detach();
    return id;
  }
  int32_t pngReady(int32_t job) override { return job >= 0 && job < (int32_t)jobs.size() && jobs[job] ? jobs[job]->state.load() : -1; }
  zrt::Array<uint8_t> takePng(int32_t job) override {
    if (pngReady(job) != 1) return bytes({});
    zrt::Array<uint8_t> r = bytes(jobs[job]->out);
    jobs[job].reset();
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
