#pragma once
// Image codecs (ZN-115): encoders on stb_image_write (compressed PNG, JPEG, BMP); decoding is stb_image (PNG, JPEG, BMP, GIF), see res.cpp.
#include <cstdint>
#include <vector>

namespace zn::res {

// `px` holds w*h pixels of `comp` (3 = RGB, 4 = RGBA) 8-bit channels, rows top to bottom.
std::vector<uint8_t> encodePng(const uint8_t* px, int w, int h, int comp);
std::vector<uint8_t> encodeJpeg(const uint8_t* px, int w, int h, int comp, int quality = 90);
std::vector<uint8_t> encodeBmp(const uint8_t* px, int w, int h, int comp);

// Decodes PNG, JPEG, BMP or GIF (first frame) to RGBA; false for anything else (WebP is a plugin).
bool decodeRgba(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba);

}  // namespace zn::res
