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
// Decodes PNG, JPEG, BMP, GIF (first frame), WebP or fast-image bytes (malloc: free() them); null above the runtime pixel cap.
uint8_t* decodeRgbaAlloc(const uint8_t* data, size_t size, int* w, int* h);
// Runtime vector/header helpers; programs link these without the CLI resource/font baker.
bool decodeRgbaRuntime(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba);
bool imageSizeRuntime(const uint8_t* data, size_t size, int& w, int& h);

// The fast-load container zinc pack makes of a large PNG ("ZNI1": size and zstd planes of the RGBA pixels, decoded at memory speed):
// lossless and deterministic; decodeRgbaAlloc and decodeRgba read it as they read a PNG.
bool isFastImage(const uint8_t* data, size_t size);
std::vector<uint8_t> encodeFastImage(const uint8_t* rgba, int w, int h, int level = 19);
uint8_t* decodeFastImage(const uint8_t* data, size_t size, int* w, int* h);   // malloc'd RGBA, null when not a container

std::vector<uint8_t> encodeWebp(const uint8_t* px, int w, int h, int comp, bool lossless = true, float quality = 90);   // libwebp
// Decodes PNG, JPEG, BMP, GIF (first frame) or WebP to RGBA; false for anything else.
bool decodeRgba(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba);
// The size decodeRgba would give, read from the file's header with nothing decoded, so a caller can refuse an image before its pixels are
// allocated (bytes from a network are not to be trusted with that); false for anything decodeRgba does not read.
bool imageSize(const uint8_t* data, size_t size, int& w, int& h);

}  // namespace zn::res
