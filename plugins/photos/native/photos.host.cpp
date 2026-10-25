// zinc:photos: the part every platform shares, included by photos.macos.mm (PhotoKit on macOS and iOS) after it defines its backend
// (backend.h); compiled alone (Linux, Windows) it has the fake library only. Jobs (loads, saves) are polled from the program's thread.
// The fake library (ZINC_FAKE_PHOTOS=<folder>, and in a deterministic run): the PNG and JPEG files of the folder are the assets (dated by
// their modification time, newest first), each subfolder a user album, "Recents" all of them and "Screenshots" the files whose name starts
// with Screenshot. A save writes IMG_0001.png (or .jpg) into the folder or the album's subfolder. ZINC_FAKE_PHOTOS_ACCESS = granted (the
// default), limited, denied or undetermined (which a request turns into granted) is what the fake person answered.
#define ZRT_HOSTED_CPP
#include "zinc_native_photos.h"
#include "zrt_raster.h"
#include "backend.h"
#include <dirent.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <algorithm>
#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBI_WRITE_NO_STDIO
#include "stb/stb_image_write.h"
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#include "stb/stb_image.h"
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

#ifndef PH_BACKEND   // no photo library on this platform: the fake one only
int ph_backend_permission(int, bool, std::string& err) { err = "photos: no photo library on this platform (ZINC_FAKE_PHOTOS=<folder> lends one)"; return 2; }
bool ph_backend_manage_limited(std::shared_ptr<PhJob>) { return false; }
bool ph_backend_albums(std::vector<PhAlbum>&, std::string& err) { err = "photos: no photo library on this platform"; return false; }
bool ph_backend_assets(const std::string&, int, int, std::vector<PhAsset>&, std::string& err) { err = "photos: no photo library on this platform"; return false; }
void ph_backend_load(const std::string&, int, int, std::shared_ptr<PhJob> job) { job->result = "photos: no photo library on this platform"; job->state = -1; }
void ph_backend_save(std::vector<uint8_t>, const std::string&, std::shared_ptr<PhJob> job) { job->result = "photos: no photo library on this platform"; job->state = -1; }
#endif

// Headless programs (no zinc:gfx) do not link the rasterizer: copy() is then a no-op. Loaded by zinc, each fallback asks the process for the
// real function first (as plugins/camera does).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) uint32_t* dyn_pixels(int32_t id) { static auto f = host_fn("_ZN3zrt6raster10dyn_pixelsEi", &dyn_pixels); return f ? f(id) : nullptr; }
}}

namespace {
const char FS = '\x1f', RS = '\x1e';
const int FULL = 4096;   // ponytail: "the whole picture" is fitted in 4096, the largest texture of the phone profiles
std::vector<std::shared_ptr<PhJob>> jobs;
std::string err;

const char* env(const char* k) { const char* v = getenv(k); return v ? v : ""; }
std::string folder() { return env("ZINC_FAKE_PHOTOS"); }
bool fake() {
#ifndef PH_BACKEND
  return true;
#else
  return *env("ZINC_FAKE_PHOTOS") || (*env("ZINC_DETERMINISTIC") && !*env("ZINC_REALTIME"));
#endif
}
bool refused(int level) {   // zinc.json: "photos" covers both levels, "photos-add" saving only
  char why[512];
  if (!zn_host_permission || !zn_host_permission("photos", "photos", why, sizeof why)) return false;
  if (level == 1 && !zn_host_permission("photos-add", "photos-add", nullptr, 0)) return false;
  err = std::string("photos: ") + why;
  return true;
}
int fakeAccess = -1;
int fake_permission(int level, bool ask) {
  if (fakeAccess < 0) {
    const std::string a = env("ZINC_FAKE_PHOTOS_ACCESS");
    fakeAccess = a == "limited" ? 3 : a == "denied" ? 2 : a == "undetermined" ? 0 : 1;
  }
  if (fakeAccess == 0 && ask) fakeAccess = 1;   // the fake person says yes
  return level == 1 && fakeAccess == 3 ? 1 : fakeAccess;   // adding has no limited level
}
int permission(int level, bool ask) { return refused(level) ? 2 : fake() ? fake_permission(level, ask) : ph_backend_permission(level, ask, err); }
bool readable() {
  const int p = permission(0, false);
  if (p == 1 || p == 3) return true;
  if (err.empty()) err = "photos: access to the library is not granted (requestPermission first)";
  return false;
}

// ---- the fake library
bool isPicture(const std::string& n) {
  std::string e = n.substr(n.rfind('.') + 1);
  for (char& c : e) c = (char)tolower((unsigned char)c);
  return n.find('.') != std::string::npos && n[0] != '.' && (e == "png" || e == "jpg" || e == "jpeg");
}
void scan(const std::string& dir, const std::string& rel, std::vector<PhAsset>& out, std::vector<std::string>* subdirs) {
  DIR* d = opendir(dir.c_str());
  if (!d) return;
  while (dirent* e = readdir(d)) {
    const std::string n = e->d_name, path = dir + "/" + n;
    struct stat st;
    if (n[0] == '.' || stat(path.c_str(), &st) != 0) continue;
    if (S_ISDIR(st.st_mode)) { if (subdirs) subdirs->push_back(n); continue; }
    int w = 0, h = 0, c = 0;
    if (!isPicture(n) || !stbi_info(path.c_str(), &w, &h, &c)) continue;
    PhAsset a;
    a.id = rel + n; a.type = "image"; a.date = (double)st.st_mtime * 1000; a.w = w; a.h = h;
    out.push_back(a);
  }
  closedir(d);
}
std::vector<PhAsset> fakeAssets(const std::string& album, std::vector<std::string>* albums = nullptr) {
  std::vector<PhAsset> all;
  std::vector<std::string> subs;
  if (!folder().empty()) {
    scan(folder(), "", all, &subs);
    std::sort(subs.begin(), subs.end());
    for (const std::string& s : subs) scan(folder() + "/" + s, s + "/", all, nullptr);
  }
  if (albums) *albums = subs;
  std::vector<PhAsset> out;
  for (const PhAsset& a : all) {
    const size_t slash = a.id.find('/');
    const std::string base = a.id.substr(slash == std::string::npos ? 0 : slash + 1);
    if (album.empty() || album == "smart:recents" || (album == "smart:screenshots" && base.rfind("Screenshot", 0) == 0) ||
        (slash != std::string::npos && a.id.compare(0, slash, album) == 0 && album.size() == slash))
      out.push_back(a);
  }
  std::sort(out.begin(), out.end(), [](const PhAsset& a, const PhAsset& b) { return a.date != b.date ? a.date > b.date : a.id < b.id; });
  return out;
}
// the picture fitted in w x h, never enlarged (nearest pixel: the fake library is for tests)
void fakeLoad(const std::string& id, int w, int h, PhJob& job) {
  int sw = 0, sh = 0, n = 0;
  uint8_t* d = id.find("..") == std::string::npos && !folder().empty() ? stbi_load((folder() + "/" + id).c_str(), &sw, &sh, &n, 3) : nullptr;
  if (!d) { job.result = "photos: no asset '" + id + "'"; job.state = -1; return; }
  const double s = std::min(1.0, std::min((double)w / sw, (double)h / sh));
  job.w = std::max(1, (int)(sw * s + 0.5)); job.h = std::max(1, (int)(sh * s + 0.5));
  job.px.resize((size_t)job.w * job.h);
  for (int y = 0; y < job.h; y++)
    for (int x = 0; x < job.w; x++) {
      const uint8_t* p = d + ((size_t)std::min(sh - 1, (int)(y / s)) * sw + std::min(sw - 1, (int)(x / s))) * 3;
      job.px[(size_t)y * job.w + x] = (uint32_t)p[0] << 16 | (uint32_t)p[1] << 8 | p[2];
    }
  stbi_image_free(d);
  job.state = 1;
}
void fakeSave(const std::vector<uint8_t>& bytes, const std::string& album, PhJob& job) {
  if (folder().empty()) { job.result = "photos: the fake library has no folder (ZINC_FAKE_PHOTOS=<folder>)"; job.state = -1; return; }
  if (album.find('/') != std::string::npos || album.find("..") != std::string::npos) { job.result = "photos: no album named '" + album + "'"; job.state = -1; return; }
  const std::string dir = album.empty() ? folder() : folder() + "/" + album;
  mkdir(dir.c_str(), 0755);
  const char* ext = bytes[0] == 0x89 ? "png" : "jpg";
  for (int i = 1; i < 100000; i++) {
    char name[32];
    snprintf(name, sizeof name, "IMG_%04d.%s", i, ext);
    struct stat st;
    if (stat((dir + "/" + name).c_str(), &st) == 0) continue;
    FILE* f = fopen((dir + "/" + name).c_str(), "wb");
    const bool ok = f && fwrite(bytes.data(), 1, bytes.size(), f) == bytes.size();
    if (f) fclose(f);
    if (!ok) break;
    job.result = (album.empty() ? "" : album + "/") + name;
    job.state = 1;
    return;
  }
  job.result = "photos: cannot write into " + dir;
  job.state = -1;
}

// ---- jobs
int32_t add(std::shared_ptr<PhJob> job) {
  int32_t id = 0;
  while (id < (int32_t)jobs.size() && jobs[id]) id++;
  if (id == (int32_t)jobs.size()) jobs.emplace_back();
  jobs[id] = std::move(job);
  return id;
}
PhJob* at(int32_t j) { return j >= 0 && j < (int32_t)jobs.size() && jobs[j] ? jobs[j].get() : nullptr; }
int32_t failed(const std::string& why) { auto job = std::make_shared<PhJob>(); job->result = why; job->state = -1; return add(job); }
int32_t save(std::vector<uint8_t> bytes, const std::string& album) {
  err.clear();
  int w = 0, h = 0, c = 0;
  if (bytes.empty() || !stbi_info_from_memory(bytes.data(), (int)bytes.size(), &w, &h, &c)) return failed("photos: the bytes are not a PNG or JPEG picture");
  const int p = permission(album.empty() ? 1 : 0, false);   // an album needs read and write access; adding alone, add only
  if (p != 1 && p != 3) return failed(!err.empty() ? err : std::string("photos: access to the library is not granted (requestPermission") + (album.empty() ? "('addOnly'))" : ")"));
  auto job = std::make_shared<PhJob>();
  const int32_t id = add(job);
  if (fake()) fakeSave(bytes, album, *job);
  else ph_backend_save(std::move(bytes), album, job);
  return id;
}
std::vector<uint8_t> vec(const zrt::Array<uint8_t>& a) {
  if (!a.a || a.a->len <= 0) return {};
  const uint8_t* p = (const uint8_t*)a.a->data;
  return std::vector<uint8_t>(p, p + a.a->len);
}
std::string fmt(double v, const char* f) { char b[64]; snprintf(b, sizeof b, f, v); return b; }
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
}  // namespace

struct HostPhotos : NativePhotos {
  int32_t permission(int32_t level, bool ask) override { err.clear(); return ::permission(level == 1 ? 1 : 0, ask); }
  int32_t manageLimited() override {
    auto job = std::make_shared<PhJob>();
    if (fake()) { job->state = 1; return add(job); }
    return ph_backend_manage_limited(job) ? add(job) : -1;
  }
  zrt::String albums() override {
    err.clear();
    if (!readable()) return str("");
    std::vector<PhAlbum> list;
    if (fake()) {
      std::vector<std::string> subs;
      const size_t all = fakeAssets("", &subs).size(), shots = fakeAssets("smart:screenshots").size();
      list.push_back({"smart:recents", "Recents", "smart", (int)all});
      if (shots) list.push_back({"smart:screenshots", "Screenshots", "smart", (int)shots});
      for (const std::string& s : subs) list.push_back({s, s, "user", (int)fakeAssets(s).size()});
    } else if (!ph_backend_albums(list, err)) return str("");
    std::string out;
    for (const PhAlbum& a : list) out += a.id + FS + a.title + FS + a.kind + FS + std::to_string(a.count) + RS;
    return str(out);
  }
  zrt::String assets(zrt::String albumIn, int32_t offset, int32_t limit) override {
    err.clear();
    if (!readable()) return str("");
    offset = std::max(0, offset);
    if (limit <= 0) limit = 100;
    std::vector<PhAsset> list;
    if (fake()) {
      std::vector<PhAsset> all = fakeAssets(cstr(albumIn));
      for (int i = offset; i < (int)all.size() && i < offset + limit; i++) list.push_back(all[i]);
    } else if (!ph_backend_assets(cstr(albumIn), offset, limit, list, err)) return str("");
    std::string out;
    for (const PhAsset& a : list)
      out += a.id + FS + fmt(a.date, "%.0f") + FS + std::to_string(a.w) + FS + std::to_string(a.h) + FS + a.type + FS +
             (a.located ? fmt(a.lat, "%.6f") : "") + FS + (a.located ? fmt(a.lon, "%.6f") : "") + RS;
    return str(out);
  }
  zrt::String error() override { return str(err); }
  int32_t load(zrt::String idIn, int32_t w, int32_t h) override {
    err.clear();
    if (!readable()) return -1;
    if (w <= 0 || h <= 0) w = h = FULL;
    auto job = std::make_shared<PhJob>();
    const int32_t id = add(job);
    if (fake()) fakeLoad(cstr(idIn), w, h, *job);
    else ph_backend_load(cstr(idIn), std::min<int>(w, FULL), std::min<int>(h, FULL), job);
    return id;
  }
  int32_t save(zrt::Array<uint8_t> bytes, zrt::String album) override { return ::save(vec(bytes), cstr(album)); }
  int32_t savePixels(zrt::Array<uint8_t> rgba, int32_t w, int32_t h, zrt::String album) override {
    // ponytail: encoded on the program's thread (a few ms for a phone screen); a thread of its own as zinc:camera's encodePng if it shows
    const std::vector<uint8_t> px = vec(rgba);
    if (w <= 0 || h <= 0 || px.size() != (size_t)w * h * 4) return failed("photos: savePixels needs width * height * 4 bytes");
    std::vector<uint8_t> png;
    stbi_write_png_to_func([](void* ctx, void* d, int n) { auto* o = (std::vector<uint8_t>*)ctx; o->insert(o->end(), (uint8_t*)d, (uint8_t*)d + n); }, &png, w, h, 4, px.data(), w * 4);
    return ::save(std::move(png), cstr(album));
  }
  int32_t state(int32_t j) override { PhJob* job = at(j); return job ? job->state.load() : -2; }
  zrt::Array<double> size(int32_t j) override {
    PhJob* job = at(j);
    zrt::Array<double> r = zrt::Array<double>::with_cap(2);
    double v[2] = {0, 0};
    if (job && job->state == 1) { v[0] = job->w; v[1] = job->h; }
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 2;
    return r;
  }
  bool copy(int32_t j, int32_t image) override {
    PhJob* job = at(j);
    uint32_t* d = job && job->state == 1 && !job->px.empty() ? zrt::raster::dyn_pixels(image) : nullptr;
    if (!d) return false;
    for (size_t i = 0, n = job->px.size(); i < n; i++) d[i] = job->px[i] | 0xFF000000u;   // opaque, whichever way the image reads its top byte
    zrt::raster::dyn_update(image, nullptr, 0);
    return true;
  }
  zrt::String result(int32_t j) override { PhJob* job = at(j); return str(job && job->state != 0 ? job->result : ""); }
  void release(int32_t j) override { if (at(j)) jobs[j].reset(); }   // a running backend job keeps its own reference and ends alone
};

NativePhotos* zinc_create_Photos() {
  static HostPhotos inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
