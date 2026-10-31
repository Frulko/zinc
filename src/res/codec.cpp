#include "res/codec.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
// the decoder a program links (zn_res, the baker's, is the CLI's): static, so it meets no other copy of stb_image; the two formats a program gets at run time
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#include "stb_image.h"
#include "webp/decode.h"

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
uint8_t* decodeRgbaAlloc(const uint8_t* data, size_t size, int* w, int* h) {
  int comp = 0;
  if (size >= 12 && !__builtin_memcmp(data, "RIFF", 4) && !__builtin_memcmp(data + 8, "WEBP", 4)) {   // WebP: libwebp (what the media proxy of a CDN sends)
    if (size > 0x7fffffff || !WebPGetInfo(data, size, w, h) || static_cast<uint64_t>(*w) * static_cast<uint64_t>(*h) > (1u << 24)) return nullptr;
    return WebPDecodeRGBA(data, size, w, h);   // libwebp's allocator is malloc: the caller frees it
  }
  // a few hundred bytes can declare a 16384 x 16384 image: the header is read first, and at most 2^24 pixels (4096 x 4096) are decoded
  if (size > 0x7fffffff || !stbi_info_from_memory(data, static_cast<int>(size), w, h, &comp) || static_cast<uint64_t>(*w) * static_cast<uint64_t>(*h) > (1u << 24)) return nullptr;
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
