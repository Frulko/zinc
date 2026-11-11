// Probe the vendored decoders before the browser can allocate a decoded bitmap.
#include <cstdint>
#include "zn/image_limits.h"
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_ONLY_BMP
#define STBI_ONLY_GIF
#define STBI_NO_STDIO
#include "stb_image.h"
#include "webp/decode.h"
extern "C" __attribute__((export_name("zn_image_size_ok"))) int zn_image_size_ok(const std::uint8_t* bytes, int size) {
  if (size <= 0) return 0;
  int w = 0, h = 0, components = 0;
  const bool webp = size >= 12 && !__builtin_memcmp(bytes, "RIFF", 4) && !__builtin_memcmp(bytes + 8, "WEBP", 4);
  const bool ok = webp ? WebPGetInfo(bytes, size, &w, &h) : stbi_info_from_memory(bytes, size, &w, &h, &components);
  return ok && w > 0 && h > 0 && w <= zn::kRuntimeImageMaxSide && h <= zn::kRuntimeImageMaxSide && std::uint64_t(w) * h <= zn::kDecodedImageMaxPixels;
}
