#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// AVFoundation may rotate or ignore the requested size: scale the centre, never copy a corner or stretch a QR code.
inline void cam_copy_bgra(uint32_t* out, int w, int h, const uint8_t* src, int sw, int sh, size_t stride) {
  if (w <= 0 || h <= 0 || sw <= 0 || sh <= 0) return;
  if (w == sw && h == sh) {
    for (int y = 0; y < h; ++y) memcpy(out + (size_t)y * w, src + (size_t)y * stride, (size_t)w * 4);
    return;
  }
  const double scale = (double)w / sw > (double)h / sh ? (double)w / sw : (double)h / sh;
  const double left = (sw - w / scale) / 2, top = (sh - h / scale) / 2;
  for (int y = 0; y < h; ++y) {
    const auto* row = reinterpret_cast<const uint32_t*>(src + (size_t)(int)(top + y / scale) * stride);
    for (int x = 0; x < w; ++x) out[(size_t)y * w + x] = row[(int)(left + x / scale)];
  }
}
