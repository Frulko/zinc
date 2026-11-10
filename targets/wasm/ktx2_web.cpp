// Optional browser texture decoder. Kept out of app.wasm: only a KTX2 image lookup fetches this reactor.
#include <algorithm>
#include <cstdlib>
#include <string>
#include "basisu_transcoder.h"
namespace {
std::string pixels, error;
unsigned width = 0, height = 0;
}
#define EXPORT(name) extern "C" __attribute__((export_name(#name)))
EXPORT(zn_alloc) void* zn_alloc(unsigned n) { return std::malloc(n); }
EXPORT(zn_free) void zn_free(void* p) { std::free(p); }
EXPORT(zn_ktx_reset) void zn_ktx_reset() { std::string().swap(pixels); error.clear(); width = height = 0; }
EXPORT(zn_ktx_decode) int zn_ktx_decode(const void* data, unsigned size) {
  zn_ktx_reset();
  basist::basisu_transcoder_init();
  basist::ktx2_transcoder t;
  if (size > (256u << 20) || !t.init(data, size) || !t.get_width() || !t.get_height() || t.get_width() > 4096 || t.get_height() > 4096 ||
      t.get_layers() > 1 || t.get_faces() != 1 || !t.start_transcoding()) { error = "invalid or unsupported KTX2 texture"; return 0; }
  const unsigned w = t.get_width(), h = t.get_height();
  pixels.resize(std::size_t(w) * h * 4);
  if (!t.transcode_image_level(0, 0, 0, pixels.data(), w * h, basist::transcoder_texture_format::cTFRGBA32)) {
    error = "KTX2 transcode failed"; std::string().swap(pixels); return 0;
  }
  // KTX2's DFD records whether the importer premultiplied; Canvas ImageData needs straight alpha.
  for (std::size_t i = 0; (t.get_dfd_flags() & 1) && i < pixels.size(); i += 4) {
    const unsigned a = static_cast<unsigned char>(pixels[i + 3]);
    if (a && a < 255) for (int c = 0; c < 3; ++c) pixels[i + c] = std::min(255u, (static_cast<unsigned char>(pixels[i + c]) * 255u + a / 2) / a);
  }
  width = w; height = h; return 1;
}
EXPORT(zn_ktx_pixels) const char* zn_ktx_pixels() { return pixels.data(); }
EXPORT(zn_ktx_width) unsigned zn_ktx_width() { return width; }
EXPORT(zn_ktx_height) unsigned zn_ktx_height() { return height; }
EXPORT(zn_ktx_error) const char* zn_ktx_error() { return error.c_str(); }
