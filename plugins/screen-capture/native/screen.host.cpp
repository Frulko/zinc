// zinc:screen-capture: the part every platform shares, included by the backend (screen.macos.mm). A capture is a slot with its runtime image;
// frame() points the image at the backend's newest frame (on macOS the pixel buffer ScreenCaptureKit filled: no copy), or draws the fake
// source's next frame. Everything here runs on the program's thread.
// The fake sources ("Zinc Fake Screen" and "Zinc Fake Window"): a pattern whose pixels are a function of the frame index only, one frame per
// frame() call. They are the only sources with ZINC_FAKE_SCREEN=1 and in a deterministic run (ZINC_DETERMINISTIC, unless ZINC_FAKE_SCREEN=0),
// so a test never captures the screen of the person at the machine.
#define ZRT_HOSTED_CPP
#include "zinc_native_screencapture.h"
#include "zrt_raster.h"
#include "backend.h"
#include <dlfcn.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef SC_BACKEND   // compiled alone: no capture but the fake sources
static const char* NO_BACKEND = "screen capture is not available on this platform yet (macOS only)";
int sc_backend_permission(bool) { return 2; }
bool sc_backend_list(bool, bool, int, int, std::string& err) { err = NO_BACKEND; return false; }
int sc_backend_list_state(std::vector<ScSource>&, std::string& err) { err = NO_BACKEND; return -1; }
int sc_backend_open(const char*, int, int, int, bool, int*, int*, std::string& err) { err = NO_BACKEND; return -1; }
int sc_backend_state(int, std::string&) { return -1; }
bool sc_backend_take(int, const uint32_t**, int*) { return false; }
void sc_backend_close(int) {}
#endif

// Headless programs (no zinc:gfx) do not link the rasterizer: images are then a no-op (-1). Loaded by zinc, each fallback asks the process
// for the real function first (as plugins/camera does).
template <class F> static F sc_host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_create(int32_t w, int32_t h) { static auto f = sc_host_fn("_ZN3zrt6raster10dyn_createEii", &dyn_create); return f ? f(w, h) : -1; }
__attribute__((weak)) int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t s) { static auto f = sc_host_fn("_ZN3zrt6raster8dyn_wrapEiiPKji", &dyn_wrap); return f ? f(w, h, px, s) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = sc_host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) uint32_t* dyn_pixels(int32_t id) { static auto f = sc_host_fn("_ZN3zrt6raster10dyn_pixelsEi", &dyn_pixels); return f ? f(id) : nullptr; }
__attribute__((weak)) void dyn_destroy(int32_t id) { static auto f = sc_host_fn("_ZN3zrt6raster11dyn_destroyEi", &dyn_destroy); if (f) f(id); }
}}

namespace {
const char FS = '\x1f', RS = '\x1e';

struct Cap {
  bool used = false, fake = false;
  int be = -1, w = 0, h = 0, fps = 0, index = -1, img = -1, stride = 0;
  std::vector<uint32_t> own;          // black before the first frame; the fake source's frames
  const uint32_t* px = nullptr;       // what the image shows: own, or the backend's newest frame
};
std::vector<Cap> caps;
std::vector<int32_t> thumbs;          // the runtime images of the last list
std::string err;
int listing = 0;                      // the last list: 0 running, 1 done, -1 failed
std::string listed;                   // its records

const char* env(const char* k) { const char* v = getenv(k); return v ? v : ""; }
bool fake_only() {
  if (!strcmp(env("ZINC_FAKE_SCREEN"), "0")) return false;
  return *env("ZINC_FAKE_SCREEN") || (*env("ZINC_DETERMINISTIC") && !*env("ZINC_REALTIME"));
}
bool refused() {
  char why[512];
  if (!zn_host_permission || !zn_host_permission("screen", "screen", why, sizeof why)) return false;
  err = std::string("screen capture: ") + why;
  return true;
}
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
Cap* at(int32_t h) { return h >= 0 && h < (int32_t)caps.size() && caps[h].used ? &caps[h] : nullptr; }

// The fake sources' frame `idx`: a dark blue gradient (a desktop), a light window moving 4 pixels a frame, and the index in binary on a row
// of 16 cells on top (white = 1). Integers only.
void pattern(uint32_t* px, int w, int h, int idx) {
  const int band = h / 16 > 1 ? h / 16 : 1, ww = w / 3, wh = h / 3;
  const int wx = (idx * 4) % (w - ww > 1 ? w - ww : 1), wy = h / 3;
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) {
      uint32_t c = 0x102040 + (uint32_t)(y * 96 / h);
      if (y < band) c = (idx >> (15 - x * 16 / w)) & 1 ? 0xFFFFFF : 0x202020;
      else if (x >= wx && x < wx + ww && y >= wy && y < wy + wh) c = y < wy + wh / 8 ? 0x5865F2 : 0xF2F3F5;
      px[(size_t)y * w + x] = c;
    }
}
struct Fake { std::string id, kind, name; int w, h; };
/** The fake screen and window, and ZINC_FAKE_WINDOWS=n windows in all ("Zinc Fake Window 2"...: a list long enough to scroll). */
const std::vector<Fake>& fakes() {
  static std::vector<Fake> all;
  if (all.empty()) {
    all.push_back({"zinc:fake-screen", "screen", "Zinc Fake Screen", 1280, 800});
    all.push_back({"zinc:fake-window", "window", "Zinc Fake Window", 800, 600});
    const int n = atoi(env("ZINC_FAKE_WINDOWS"));
    for (int i = 2; i <= n && i <= 64; i++) all.push_back({"zinc:fake-window-" + std::to_string(i), "window", "Zinc Fake Window " + std::to_string(i), 800, 600});
  }
  return all;
}
const Fake* fake_of(const std::string& id) { for (const Fake& f : fakes()) if (id == f.id) return &f; return nullptr; }
void clear_thumbs() { for (int32_t t : thumbs) zrt::raster::dyn_destroy(t); thumbs.clear(); }
std::string record(const ScSource& s, int32_t thumb, int32_t icon) {
  return s.id + FS + s.kind + FS + s.name + FS + s.app + FS + std::to_string(s.w) + FS + std::to_string(s.h) + FS + std::to_string(thumb) + FS + std::to_string(icon) + RS;
}
int32_t thumb_of(const ScSource& s) {
  if (s.tw <= 0 || s.th <= 0 || s.thumb.size() < (size_t)s.tw * s.th) return -1;
  const int32_t img = zrt::raster::dyn_create(s.tw, s.th);
  uint32_t* d = img >= 0 ? zrt::raster::dyn_pixels(img) : nullptr;
  if (!d) return -1;
  memcpy(d, s.thumb.data(), s.thumb.size() * 4);
  zrt::raster::dyn_update(img, nullptr, 0);
  thumbs.push_back(img);
  return img;
}
/** The application icon as a runtime image with alpha (freed with the thumbnails), -1 for none. */
int32_t icon_of(const ScSource& s) {
  if (s.icon.size() < (size_t)SC_ICON * SC_ICON) return -1;
  const int32_t img = zrt::raster::dyn_create(SC_ICON, SC_ICON);
  uint32_t* d = img >= 0 ? zrt::raster::dyn_pixels(img) : nullptr;
  if (!d) return -1;
  memcpy(d, s.icon.data(), s.icon.size() * 4);
  zrt::raster::dyn_set_alpha(img, true);
  zrt::raster::dyn_update(img, nullptr, 0);
  thumbs.push_back(img);
  return img;
}
/** The fake application's icon: a blurple rounded square with a white bar (a window), alpha outside the corners. */
void fake_icon(ScSource& s) {
  s.icon.assign((size_t)SC_ICON * SC_ICON, 0);
  const int r = SC_ICON / 5;
  for (int y = 0; y < SC_ICON; y++)
    for (int x = 0; x < SC_ICON; x++) {
      const int dx = x < r ? r - x : x >= SC_ICON - r ? x - (SC_ICON - r - 1) : 0, dy = y < r ? r - y : y >= SC_ICON - r ? y - (SC_ICON - r - 1) : 0;
      if (dx * dx + dy * dy > r * r) continue;
      const bool bar = y >= SC_ICON / 3 && y < SC_ICON / 3 + SC_ICON / 8 && x >= SC_ICON / 5 && x < SC_ICON - SC_ICON / 5;
      s.icon[(size_t)y * SC_ICON + x] = bar ? 0xFFFFFFFF : 0xFF5865F2;
    }
}
}  // namespace

struct HostScreenCapture : NativeScreenCapture {
  int32_t permission(bool ask) override {
    err.clear();
    if (refused()) return 2;
    return fake_only() ? 1 : sc_backend_permission(ask && !*env("ZINC_BACKGROUND"));
  }
  bool list(bool screens, bool windows, int32_t tw, int32_t th) override {
    err.clear(); listed.clear(); listing = 0;
    clear_thumbs();
    if (refused()) { listing = -1; return false; }
    if (fake_only()) {
      for (const Fake& f : fakes()) {
        if (!(f.kind != "screen" ? windows : screens)) continue;
        ScSource s; s.id = f.id; s.kind = f.kind; s.name = f.name; s.app = "Zinc"; s.w = f.w; s.h = f.h;
        if (tw > 0 && th > 0) { s.tw = tw; s.th = th; sc_fit(f.w, f.h, s.tw, s.th); s.thumb.resize((size_t)s.tw * s.th); pattern(s.thumb.data(), s.tw, s.th, 0); }
        if (f.kind == "window") fake_icon(s);
        listed += record(s, thumb_of(s), icon_of(s));
      }
      listing = 1;
      return true;
    }
    if (!sc_backend_list(screens, windows, tw, th, err)) { err = "screen capture: " + err; listing = -1; return false; }
    return true;
  }
  int32_t listState() override {
    if (listing != 0) return listing;
    std::vector<ScSource> out;
    std::string why;
    const int s = sc_backend_list_state(out, why);
    if (s < 0) { err = "screen capture: " + why; listing = -1; }
    else if (s > 0) { for (const ScSource& x : out) listed += record(x, thumb_of(x), icon_of(x)); listing = 1; }
    return listing;
  }
  zrt::String sources() override { return str(listing == 1 ? listed : std::string()); }
  zrt::String error() override { return str(err); }
  int32_t open(zrt::String idIn, int32_t w, int32_t h, int32_t fps, bool cursor) override {
    err.clear();
    if (refused()) return -1;
    std::string id = cstr(idIn);
    if (fps <= 0) fps = 30;
    if (fps > 60) fps = 60;
    Cap c;
    c.fps = fps;
    if (fake_only()) {
      const Fake* f = fake_of(id.empty() ? fakes()[0].id : id);
      if (!f) { err = "screen capture: no source '" + id + "' (only the fake sources with ZINC_FAKE_SCREEN or in a deterministic run)"; return -1; }
      c.fake = true; c.w = w; c.h = h;
      sc_fit(f->w, f->h, c.w, c.h);
    } else {
      std::string why;
      c.be = sc_backend_open(id.c_str(), w, h, fps, cursor, &c.w, &c.h, why);
      if (c.be < 0) { err = "screen capture: " + why; return -1; }
    }
    c.used = true;
    c.own.assign((size_t)c.w * c.h, 0);
    c.px = c.own.data(); c.stride = c.w;
    int32_t slot = 0;
    while (slot < (int32_t)caps.size() && caps[slot].used) slot++;
    if (slot == (int32_t)caps.size()) caps.emplace_back();
    caps[slot] = std::move(c);
    Cap& k = caps[slot];
    k.px = k.own.data();
    k.img = zrt::raster::dyn_wrap(k.w, k.h, k.own.data(), k.w);   // black until the first frame
    return slot;
  }
  int32_t state(int32_t h) override {
    Cap* c = at(h);
    if (!c) return -1;
    if (c->fake) return 1;
    std::string why;
    const int s = sc_backend_state(c->be, why);
    if (s < 0) err = "screen capture: " + why;
    return s;
  }
  zrt::Array<double> format(int32_t h) override {
    zrt::Array<double> r = zrt::Array<double>::with_cap(4);
    Cap* c = at(h);
    double v[4] = {0, 0, 0, 0};
    if (c) {   // the fake source makes one frame per call; a real one is polled twice per frame so a frame waits half a period at most
      v[0] = c->w; v[1] = c->h; v[2] = c->fps;
      v[3] = c->fake ? 1000 / c->fps : 500 / c->fps < 4 ? 4 : 500 / c->fps;
    }
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 4;
    return r;
  }
  int32_t frame(int32_t h) override {
    Cap* c = at(h);
    if (!c) return -1;
    if (c->fake) {
      pattern(c->own.data(), c->w, c->h, ++c->index);
      if (c->img >= 0) zrt::raster::dyn_update(c->img, c->own.data(), c->w);
    } else if (sc_backend_take(c->be, &c->px, &c->stride)) {
      c->index++;
      if (c->img >= 0) zrt::raster::dyn_update(c->img, c->px, c->stride);   // the image shows the backend's buffer itself
    }
    return c->index;
  }
  int32_t image(int32_t h) override { Cap* c = at(h); return c ? c->img : -1; }
  zrt::Array<uint8_t> snapshot(int32_t h) override {
    Cap* c = at(h);
    const int32_t n = c ? c->w * c->h : 0;
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n * 4);
    uint8_t* o = (uint8_t*)r.a->data;
    for (int32_t y = 0; c && y < c->h; y++)
      for (int32_t x = 0; x < c->w; x++) {
        const uint32_t p = c->px[(size_t)y * c->stride + x];
        uint8_t* d = o + ((size_t)y * c->w + x) * 4;
        d[0] = (uint8_t)(p >> 16); d[1] = (uint8_t)(p >> 8); d[2] = (uint8_t)p; d[3] = 255;
      }
    r.a->len = n * 4;
    return r;
  }
  void close(int32_t h) override {
    Cap* c = at(h);
    if (!c) return;
    if (c->img >= 0) zrt::raster::dyn_destroy(c->img);   // first: the image may show the backend's buffer
    if (c->be >= 0) sc_backend_close(c->be);
    *c = Cap();
  }
};

NativeScreenCapture* zinc_create_ScreenCapture() {
  static HostScreenCapture inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
