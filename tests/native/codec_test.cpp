// Image codecs (ZN-115): every format decodes the fixtures of tests/data/images to the stored raw pixels, and the encoders round trip.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "res/codec.h"

using namespace zn::res;
static int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { failures++; std::printf("FAIL line %d: ", __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static std::vector<uint8_t> readFile(const std::string& p) { std::ifstream f(p, std::ios::binary); return {std::istreambuf_iterator<char>(f), {}}; }
static int maxDiff(const std::vector<uint8_t>& a, const std::vector<uint8_t>& b) {
  int m = 0;
  for (size_t i = 0; i < a.size() && i < b.size(); i++) { int d = std::abs(int(a[i]) - int(b[i])); if (d > m) m = d; }
  return m;
}

int main(int argc, char** argv) {
  std::string dir = argc > 1 ? argv[1] : "tests/data/images";
  std::vector<uint8_t> raw = readFile(dir + "/fixture.rgba");
  CHECK(raw.size() == 32 * 24 * 4, "fixture.rgba is %zu bytes", raw.size());
  // lossless formats decode to exactly the stored pixels
  for (const char* ext : {"png", "bmp", "gif"}) {
    std::vector<uint8_t> f = readFile(dir + "/fixture." + ext), px; int w = 0, h = 0;
    CHECK(decodeRgba(f.data(), f.size(), w, h, px), "fixture.%s does not decode", ext);
    CHECK(w == 32 && h == 24 && px == raw, "fixture.%s decodes to other pixels (max diff %d)", ext, maxDiff(px, raw));
    px.clear();
    CHECK(decodeRgbaRuntime(f.data(), f.size(), w, h, px) && w == 32 && h == 24 && px == raw, "runtime fixture.%s decoder differs", ext);
    CHECK(imageSizeRuntime(f.data(), f.size(), w, h) && w == 32 && h == 24, "runtime fixture.%s header differs", ext);
  }
  // JPEG: the stored decode of stb_image, which stays close to the source
  { std::vector<uint8_t> f = readFile(dir + "/fixture.jpg"), px, want = readFile(dir + "/jpg.rgba"); int w = 0, h = 0;
    CHECK(decodeRgba(f.data(), f.size(), w, h, px), "fixture.jpg does not decode");
    CHECK(px == want, "fixture.jpg decodes to other pixels than jpg.rgba (max diff %d)", maxDiff(px, want));
    px.clear(); CHECK(decodeRgbaRuntime(f.data(), f.size(), w, h, px) && px == want, "runtime JPEG decoder differs");
    CHECK(maxDiff(px, raw) <= 40, "the JPEG strays %d from the source", maxDiff(px, raw)); }
  // encoders: PNG and BMP round trip exactly, JPEG within its loss; PNG is compressed
  { std::vector<uint8_t> rgb; for (size_t i = 0; i < raw.size(); i += 4) rgb.insert(rgb.end(), raw.begin() + i, raw.begin() + i + 3);
    auto png = encodePng(raw.data(), 32, 24, 4); std::vector<uint8_t> px; int w, h;
    CHECK(!png.empty() && decodeRgba(png.data(), png.size(), w, h, px) && px == raw, "PNG RGBA round trip");
    CHECK(png.size() < raw.size() / 4, "PNG is %zu bytes for %zu raw", png.size(), raw.size());
    auto png3 = encodePng(rgb.data(), 32, 24, 3);
    CHECK(!png3.empty() && decodeRgba(png3.data(), png3.size(), w, h, px) && px == raw, "PNG RGB round trip");
    auto bmp = encodeBmp(rgb.data(), 32, 24, 3);
    CHECK(!bmp.empty() && decodeRgba(bmp.data(), bmp.size(), w, h, px) && px == raw, "BMP round trip");
    auto jpg = encodeJpeg(rgb.data(), 32, 24, 3, 95);
    CHECK(!jpg.empty() && decodeRgba(jpg.data(), jpg.size(), w, h, px) && w == 32 && maxDiff(px, raw) <= 40, "JPEG round trip (max diff %d)", maxDiff(px, raw)); }
  CHECK(!decodeRgba(reinterpret_cast<const uint8_t*>("RIFF....WEBPVP8 "), 16, *new int, *new int, *new std::vector<uint8_t>), "WebP must not decode in the stb tier");
  // imageSize reads the size decodeRgba would give from the header alone: every fixture, a file cut inside its pixel data, and what is no image
  for (const char* ext : {"png", "bmp", "gif", "jpg"}) {
    std::vector<uint8_t> f = readFile(dir + "/fixture." + ext); int w = 0, h = 0;
    CHECK(imageSize(f.data(), f.size(), w, h) && w == 32 && h == 24, "imageSize of fixture.%s is %d x %d", ext, w, h);
  }
  { std::vector<uint8_t> f = readFile(dir + "/fixture.png"), px; int w = 0, h = 0;
    CHECK(f.size() > 100 && imageSize(f.data(), 100, w, h) && w == 32 && h == 24, "imageSize of a PNG cut inside its pixel data (100 of %zu bytes) is %d x %d", f.size(), w, h);
    CHECK(!decodeRgba(f.data(), 100, w, h, px), "a PNG cut inside its pixel data decodes");
    CHECK(!imageSize(reinterpret_cast<const uint8_t*>("not an image at all"), 19, w, h), "imageSize takes text for an image");
    CHECK(!imageSize(f.data(), 0, w, h), "imageSize takes no bytes for an image"); }
  // Header-only oversized images are refused before pixel allocation through every runtime decoder path.
  { auto png = readFile(dir + "/fixture.png"); std::vector<uint8_t> px; int w = 0, h = 0;
    const uint32_t W = 4097, H = 4096;
    for (int k = 0; k < 4; k++) { png[16 + k] = static_cast<uint8_t>(W >> (24 - k * 8)); png[20 + k] = static_cast<uint8_t>(H >> (24 - k * 8)); }
    CHECK(imageSizeRuntime(png.data(), png.size(), w, h) && w == 4097 && h == 4096, "oversized PNG header must remain recognizable");
    CHECK(!decodeRgbaRuntime(png.data(), png.size(), w, h, px) && px.empty(), "runtime vector decoder must reject excessive PNG pixels");
    auto webp = encodeWebp(raw.data(), 32, 24, 4, true);
    CHECK(webp.size() >= 25 && std::memcmp(webp.data() + 12, "VP8L", 4) == 0, "lossless WebP header");
    CHECK(decodeRgbaRuntime(webp.data(), webp.size(), w, h, px) && w == 32 && h == 24 && px.size() == raw.size(), "runtime WebP decoder"); px.clear();
    if (webp.size() >= 25) {
      const uint32_t dimensions = (W - 1) | ((H - 1) << 14);
      for (int k = 0; k < 4; k++) webp[21 + k] = static_cast<uint8_t>(dimensions >> (k * 8));
      CHECK(imageSizeRuntime(webp.data(), webp.size(), w, h) && w == 4097 && h == 4096, "oversized WebP header must remain recognizable");
      CHECK(!decodeRgbaRuntime(webp.data(), webp.size(), w, h, px) && px.empty(), "runtime decoder must reject excessive WebP pixels");
    }
    std::vector<uint8_t> fast(13); std::memcpy(fast.data(), "ZNI1", 4);
    for (int k = 0; k < 4; k++) { fast[4 + k] = static_cast<uint8_t>(W >> (k * 8)); fast[8 + k] = static_cast<uint8_t>(H >> (k * 8)); }
    CHECK(!decodeRgbaRuntime(fast.data(), fast.size(), w, h, px) && px.empty(), "runtime decoder must reject excessive fast-image pixels");
  }
  if (failures) return 1;
  std::printf("all checks passed\n");
  return 0;
}
