#include "res/codec.h"
#include "zn/image_limits.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
// the decoder a program links (zn_res, the baker's, is the CLI's): static, so it meets no other copy of stb_image; the formats a program gets at run time
// (GIF, ZN-674: its first frame through stbi_load_from_memory, never the animation API of CVE-2023-45666/45667; 7.0 KB more code in a built program)
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_ONLY_GIF
#define STBI_NO_STDIO
#include "stb_image.h"
#include "webp/decode.h"
#include "zstd.h"
#include <cstdlib>
#include <cstring>

namespace zn::res {
namespace {
void sink(void* ctx, void* data, int n) { auto* v = static_cast<std::vector<uint8_t>*>(ctx); v->insert(v->end(), static_cast<uint8_t*>(data), static_cast<uint8_t*>(data) + n); }
}  // namespace

std::vector<uint8_t> encodePng(const uint8_t* px, int w, int h, int comp) {
  std::vector<uint8_t> out;
  stbi_write_png_compression_level = 9;
  if (!stbi_write_png_to_func(sink, &out, w, h, comp, px, w * comp)) out.clear();
  return out;
}
uint8_t* encodePngAlloc(const uint8_t* px, int w, int h, int comp, size_t* n, void* (*alloc)(size_t)) {
  std::vector<uint8_t> png = encodePng(px, w, h, comp);
  uint8_t* out = png.empty() ? nullptr : static_cast<uint8_t*>(alloc(png.size()));
  if (out) { __builtin_memcpy(out, png.data(), png.size()); *n = png.size(); }
  return out;
}
// "ZNI1" w h (u32 little endian), then one zstd frame of the four planes R, G, B, A (planar: runs of one channel compress far better than interleaved bytes)
bool isFastImage(const uint8_t* d, size_t n) { return n > 12 && !__builtin_memcmp(d, "ZNI1", 4); }
std::vector<uint8_t> encodeFastImage(const uint8_t* rgba, int w, int h, int level) {
  const size_t px = static_cast<size_t>(w) * h;
  std::vector<uint8_t> planes(px * 4), out(12 + ZSTD_compressBound(px * 4));
  for (size_t i = 0; i < px; i++) for (int c = 0; c < 4; c++) planes[c * px + i] = rgba[i * 4 + c];
  __builtin_memcpy(out.data(), "ZNI1", 4);
  for (int k = 0; k < 4; k++) { out[4 + k] = static_cast<uint8_t>(w >> (8 * k)); out[8 + k] = static_cast<uint8_t>(h >> (8 * k)); }
  const size_t n = ZSTD_compress(out.data() + 12, out.size() - 12, planes.data(), planes.size(), level);
  if (ZSTD_isError(n)) return {};
  out.resize(12 + n);
  return out;
}
uint8_t* decodeFastImage(const uint8_t* d, size_t n, int* w, int* h) {
  if (!isFastImage(d, n)) return nullptr;
  uint32_t W = 0, H = 0;
  for (int k = 0; k < 4; k++) { W |= static_cast<uint32_t>(d[4 + k]) << (8 * k); H |= static_cast<uint32_t>(d[8 + k]) << (8 * k); }
  if (!W || !H || static_cast<uint64_t>(W) * H > (1u << 24)) return nullptr;
  const size_t px = static_cast<size_t>(W) * H;
  uint8_t* planes = static_cast<uint8_t*>(malloc(px * 4));
  uint8_t* out = static_cast<uint8_t*>(malloc(px * 4));
  if (!planes || !out || ZSTD_decompress(planes, px * 4, d + 12, n - 12) != px * 4) { free(planes); free(out); return nullptr; }
  const uint8_t *r = planes, *g = planes + px, *b = planes + 2 * px, *a = planes + 3 * px;
  for (size_t i = 0; i < px; i++) { out[i * 4] = r[i]; out[i * 4 + 1] = g[i]; out[i * 4 + 2] = b[i]; out[i * 4 + 3] = a[i]; }
  free(planes);
  *w = static_cast<int>(W); *h = static_cast<int>(H);
  return out;
}
uint8_t* decodeRgbaAlloc(const uint8_t* data, size_t size, int* w, int* h) {
  int comp = 0;
  if (isFastImage(data, size)) return decodeFastImage(data, size, w, h);
  if (size >= 12 && !__builtin_memcmp(data, "RIFF", 4) && !__builtin_memcmp(data + 8, "WEBP", 4)) {   // WebP: libwebp (what the media proxy of a CDN sends)
    if (size > 0x7fffffff || !WebPGetInfo(data, size, w, h) || static_cast<uint64_t>(*w) * static_cast<uint64_t>(*h) > zn::kDecodedImageMaxPixels) return nullptr;
    return WebPDecodeRGBA(data, size, w, h);   // libwebp's allocator is malloc: the caller frees it
  }
  // a few hundred bytes can declare a 16384 x 16384 image: the header is read first, and at most 2^24 pixels (4096 x 4096) are decoded
  if (size > 0x7fffffff || !stbi_info_from_memory(data, static_cast<int>(size), w, h, &comp) || static_cast<uint64_t>(*w) * static_cast<uint64_t>(*h) > zn::kDecodedImageMaxPixels) return nullptr;
  return stbi_load_from_memory(data, static_cast<int>(size), w, h, &comp, 4);   // stb's allocator is malloc
}
std::vector<uint8_t> encodeJpeg(const uint8_t* px, int w, int h, int comp, int quality) {
  std::vector<uint8_t> out;
  if (!stbi_write_jpg_to_func(sink, &out, w, h, comp, px, quality)) out.clear();
  return out;
}
std::vector<uint8_t> encodeBmp(const uint8_t* px, int w, int h, int comp) {
  std::vector<uint8_t> out;
  if (!stbi_write_bmp_to_func(sink, &out, w, h, comp, px)) out.clear();
  return out;
}
}  // namespace zn::res

// for plugins (zinc:imageio) that read files themselves: found with dlsym, as libwebp's functions are
extern "C" uint8_t* zn_decode_fast_image(const uint8_t* d, size_t n, int* w, int* h) { return zn::res::decodeFastImage(d, n, w, h); }
