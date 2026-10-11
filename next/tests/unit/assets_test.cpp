// The asset build (ZN-434): rules and groups to packs, the image layouts (premultiplied RGBA8, RGB565, RGBA4444), the cache (a second build
// imports nothing, a changed file is imported alone, no cache imports everything), stale packs, and an unknown importer's error.
// Run from next/ (it reads tests/data/images); prints "all checks passed" or one line per failure.
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <unistd.h>

#include "assets/assets.h"
#include "zpk/zpk.h"

namespace fs = std::filesystem;
using namespace zn::assets;

namespace {

int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { ++failures; std::printf("FAIL line %d: ", __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

std::string slurp(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
void put(const fs::path& p, const std::string& s) { fs::create_directories(p.parent_path()); std::ofstream(p, std::ios::binary) << s; }
std::string svg(const char* fill) {   // 4 x 1 units, half transparent: drawn 8 x 2 at the default scale 2
  return std::string("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"1\" viewBox=\"0 0 4 1\"><rect x=\"0\" y=\"0\" width=\"4\" height=\"1\" fill=\"") + fill +
         "\" opacity=\"0.5\"/></svg>";
}
unsigned u16(const std::string& s, std::size_t o) { return static_cast<unsigned char>(s[o]) | static_cast<unsigned char>(s[o + 1]) << 8; }
unsigned u32(const std::string& s, std::size_t o) { return u16(s, o) | u16(s, o + 2) << 16; }

/** Entry `name` of pack `file`, decoded; empty when absent. */
std::string entry(const fs::path& file, const std::string& name) {
  const std::string bytes = slurp(file);
  zn::zpk::Reader r;
  std::string err, out;
  if (!r.open(bytes.data(), bytes.size(), err)) { CHECK(false, "%s: %s", file.c_str(), err.c_str()); return ""; }
  const long i = r.find(name);
  if (i < 0 || !r.read(static_cast<std::size_t>(i), out, err)) return "";
  return out;
}

void checkImage(const std::string& im, Format f, unsigned w, unsigned h, unsigned scale, const char* what) {
  CHECK(im.size() >= kImageHeader && im.compare(0, 4, "ZIM1") == 0, "%s: no ZIM1 header", what);
  if (im.size() < kImageHeader) return;
  CHECK(static_cast<Format>(im[4]) == f && static_cast<unsigned>(im[5]) == scale && u16(im, 6) == 1 && u32(im, 8) == w && u32(im, 12) == h,
        "%s: header format %d scale %d flags %u size %ux%u", what, im[4], im[5], u16(im, 6), u32(im, 8), u32(im, 12));
  CHECK(im.size() == kImageHeader + static_cast<std::size_t>(w) * h * (f == Format::Rgba8 ? 4 : 2), "%s: %zu bytes", what, im.size());
}

void project(const fs::path& tmp) {
  const fs::path src = tmp / "assets", out = tmp / "out", cache = tmp / "cache";
  put(src / "a.svg", svg("#ff8000"));
  put(src / "c.svg", svg("#ff8000"));
  put(src / "ui" / "icon.svg", svg("#ff8000"));
  fs::copy_file("tests/data/images/fixture.png", src / "b.png");
  put(src / "data" / "level.bin", std::string("\0\1\2level", 8));
  put(src / ".DS_Store", "hidden");
  put(src / ".git" / "HEAD", "hidden");
  Options o;
  o.sourceDir = src.string(); o.outDir = out.string(); o.cacheDir = cache.string(); o.tool = "test"; o.target = "test";
  o.rules = {{"ui/**", "", {{"format", "rgb565"}}}, {"*.svg", "", {{"format", "rgba8"}}}, {"c.svg", "", {{"format", "rgba4444"}}}};
  o.groups = {{"ui", {"ui/**"}, {}}, {"boot", {"*.{png,svg}"}, {"c.svg"}}};   // c.svg: excluded from boot, so in default
  Report r;
  std::string err;
  CHECK(build(o, r, err), "build: %s", err.c_str());
  CHECK(r.items.size() == 5 && r.imported == 5, "first build: %zu assets, %zu imported", r.items.size(), r.imported);
  CHECK(r.packs.size() == 3, "%zu packs", r.packs.size());
  for (const char* p : {"boot.zpk", "default.zpk", "ui.zpk", "report.json"}) CHECK(fs::exists(out / p), "%s missing", p);

  // premultiplied: the rasterizer's straight (255, 128, 0) at alpha 128
  const std::string a = entry(out / "boot.zpk", "a.svg");
  checkImage(a, Format::Rgba8, 8, 2, 2, "a.svg");
  if (a.size() >= kImageHeader + 4) CHECK(!std::memcmp(a.data() + kImageHeader, "\x80\x40\x00\x80", 4), "a.svg: pixel %d %d %d %d", a[16] & 255, a[17] & 255, a[18] & 255, a[19] & 255);
  const std::string c = entry(out / "default.zpk", "c.svg");   // the later rule wins
  checkImage(c, Format::Rgba4444, 8, 2, 2, "c.svg");
  if (c.size() >= kImageHeader + 2) CHECK(u16(c, kImageHeader) == 0x8408, "c.svg: 4444 pixel %04x", u16(c, kImageHeader));
  const std::string i = entry(out / "ui.zpk", "ui/icon.svg");
  checkImage(i, Format::Rgb565, 8, 2, 2, "ui/icon.svg");
  if (i.size() >= kImageHeader + 2) CHECK(u16(i, kImageHeader) == ((16u << 11) | (16u << 5)), "icon: 565 pixel %04x", u16(i, kImageHeader));
  const std::string b = entry(out / "boot.zpk", "b.png");   // opaque: the decoded pixels as they are
  checkImage(b, Format::Rgba8, 32, 24, 1, "b.png");
  CHECK(b.size() == kImageHeader + 3072 && b.compare(kImageHeader, std::string::npos, slurp("tests/data/images/fixture.rgba")) == 0, "b.png: pixels differ");
  CHECK(entry(out / "default.zpk", "data/level.bin") == std::string("\0\1\2level", 8), "level.bin not copied");
  CHECK(entry(out / "default.zpk", ".DS_Store").empty(), "a hidden file was packed");

  // unchanged: nothing imported, no pack rewritten; one changed file: imported alone
  const auto stamp = fs::last_write_time(out / "boot.zpk");
  const std::string boot = slurp(out / "boot.zpk");
  CHECK(build(o, r, err) && r.imported == 0, "second build imported %zu", r.imported);
  for (const Item& it : r.items) CHECK(it.cached, "%s not from the cache", it.name.c_str());
  CHECK(fs::last_write_time(out / "boot.zpk") == stamp && slurp(out / "boot.zpk") == boot, "an unchanged pack was rewritten");
  put(src / "a.svg", svg("#0080ff"));
  CHECK(build(o, r, err) && r.imported == 1, "after one change: %zu imported", r.imported);
  for (const Item& it : r.items) CHECK(it.cached == (it.name != "a.svg"), "%s: cached %d", it.name.c_str(), it.cached);
  CHECK(slurp(out / "boot.zpk") != boot, "boot.zpk did not change");

  // release: zstd entries, the same content
  o.profile = "release";
  CHECK(build(o, r, err) && r.imported == 0, "release imported %zu", r.imported);
  CHECK(entry(out / "default.zpk", "data/level.bin") == std::string("\0\1\2level", 8), "release pack does not read back");

  // an emptied cache: everything imported again, the same packs
  const std::string release = slurp(out / "boot.zpk");
  o.profile = "dev";
  CHECK(build(o, r, err) && r.imported == 0, "dev again imported %zu", r.imported);
  fs::remove_all(cache);
  o.profile = "release";
  CHECK(build(o, r, err) && r.imported == 5 && slurp(out / "boot.zpk") == release, "after the cache was emptied: %s, %zu imported", err.c_str(), r.imported);

  // a group that is gone takes its pack with it; without a cache everything is imported
  o.groups = {{"boot", {"*.png", "a.svg"}, {}}};
  o.cacheDir.clear();
  CHECK(build(o, r, err) && r.imported == 5, "no cache: %zu imported", r.imported);
  CHECK(!fs::exists(out / "ui.zpk"), "ui.zpk is stale");
  const std::string report = slurp(out / "report.json");
  CHECK(report.find("\"name\": \"ui/icon.svg\", \"importer\": \"image\", \"group\": \"default\", \"sourceBytes\": ") != std::string::npos, "report: %s", report.c_str());

  // errors name the asset
  put(src / "x.xyz", "?");
  o.rules.push_back({"*.xyz", "nope", {}});
  CHECK(!build(o, r, err) && err.find("x.xyz: no importer \"nope\"") != std::string::npos, "unknown importer: %s", err.c_str());
  o.rules.pop_back();
  put(src / "bad.png", "not a png");
  CHECK(!build(o, r, err) && err.rfind("bad.png: ", 0) == 0, "bad image: %s", err.c_str());
}

void keys() {
  CHECK(Key().add("ab").add("c").hex() != Key().add("a").add("bc").hex(), "part boundaries do not count");
  CHECK(Key().add("x").hex() == Key().add("x").hex() && Key().add("x").hex().size() == 32, "keys are not stable");
}

}  // namespace

int main() {
  const fs::path tmp = fs::temp_directory_path() / ("assets_test." + std::to_string(::getpid()));
  fs::remove_all(tmp);
  keys();
  project(tmp);
  fs::remove_all(tmp);
  if (failures) { std::printf("%d failure(s)\n", failures); return 1; }
  std::printf("all checks passed\n");
  return 0;
}
