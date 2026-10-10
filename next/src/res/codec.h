#pragma once
// Image codecs (ZN-115): encoders on stb_image_write (compressed PNG, JPEG, BMP); the baker's decoding is stb_image (PNG, JPEG, BMP, GIF), see res.cpp;
// decodeRgbaAlloc is the decoder programs link (zinc:gfx imageFromBytes, ZN-432).
#include <cstdint>
#include <vector>

namespace zn::res {

// `px` holds w*h pixels of `comp` (3 = RGB, 4 = RGBA) 8-bit channels, rows top to bottom.
std::vector<uint8_t> encodePng(const uint8_t* px, int w, int h, int comp);
std::vector<uint8_t> encodeJpeg(const uint8_t* px, int w, int h, int comp, int quality = 90);
std::vector<uint8_t> encodeBmp(const uint8_t* px, int w, int h, int comp);
// Decodes a PNG or a JPEG file to w*h RGBA pixels (malloc: free() them); null for anything else and for more than 2^24 pixels.
uint8_t* decodeRgbaAlloc(const uint8_t* data, size_t size, int* w, int* h);

std::vector<uint8_t> encodeWebp(const uint8_t* px, int w, int h, int comp, bool lossless = true, float quality = 90);   // libwebp
// Decodes PNG, JPEG, BMP, GIF (first frame) or WebP to RGBA; false for anything else.
bool decodeRgba(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba);

}  // namespace zn::res
