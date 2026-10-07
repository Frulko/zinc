#include "res/codec.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

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
