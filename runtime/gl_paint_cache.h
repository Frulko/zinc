#pragma once
#include "zrt_raster.h"
#include <cmath>
#include <cstring>

namespace zn_gl {
// Resource-dependent images/shaders stay uncached; text additionally depends on the font generation.
struct PaintBatch {
  zrt::raster::Cmd cmds[48]; float pts[1024]; char text[4096];
  uint32_t count = 0, floats = 0, chars = 0, fonts = 0; int w = 0, h = 0; float x = 0, y = 0; uint64_t hash = 0;
};
inline float paintCoord(float v) { return std::round(v * 1024.f) / 1024.f; }
inline bool paintBatch(const zrt::raster::Frame& f, uint32_t first, PaintBatch& out) {
  using namespace zrt::raster;
  out.count = out.floats = out.chars = out.fonts = 0;
  const Cmd& root = f.cmds[first];
  if (root.kind != RECT || root.grad > 2 || root.alpha != 255 || root.w * root.h < 4096) return false;
  uint32_t end = f.count, at_clip = first + 1;
  if (at_clip < end && f.cmds[at_clip].kind == BORDER) ++at_clip;
  const bool subtree = at_clip < end && f.cmds[at_clip].kind == CLIP;
  if (subtree) {
    const Cmd& bounds = f.cmds[at_clip];
    if (!(bounds.x >= root.x && bounds.y >= root.y && bounds.x + bounds.w <= root.x + root.w && bounds.y + bounds.h <= root.y + root.h)) return false;
    // Choose leaf clips, so a moving child is not baked into an unrelated cached parent.
    bool closed = false;
    for (uint32_t i = at_clip + 1; i < end && i - first < 48; ++i) {
      if (f.cmds[i].kind == CLIP) return false;
      if (f.cmds[i].kind == UNCLIP) { end = i + 1; closed = true; break; }
    }
    if (!closed) return false;
  } else if (!root.grad) return false;
  float x0 = root.x, y0 = root.y, x1 = root.x + root.w, y1 = root.y + root.h;
  for (uint32_t i = first; i < end && out.count < 48; ++i) {
    Cmd c = f.cmds[i];
    if (!subtree && c.kind != RECT && c.kind != POLY) break;
    if (!subtree && c.kind == RECT && i != first && c.grad) break;
    if (c.kind != RECT && c.kind != BORDER && c.kind != TEXT && c.kind != POLY && c.kind != CLIP && c.kind != UNCLIP && c.kind != STROKE && c.kind != XFORM) return false;
    if ((c.kind == RECT && c.grad > 2) || (c.kind == POLY && c.grad)) return false;
    if (!(std::fabs(c.x) < 1e7f && std::fabs(c.y) < 1e7f && c.w >= 0 && c.h >= 0 && c.w < 4096 && c.h < 4096)) return false;
    if ((!subtree || i < at_clip) && c.kind != CLIP && c.kind != UNCLIP) {
      x0 = std::fmin(x0, c.x - 1); y0 = std::fmin(y0, c.y - 1); x1 = std::fmax(x1, c.x + c.w + 1); y1 = std::fmax(y1, c.y + c.h + 1);
    }
    if (c.kind == POLY || c.kind == STROKE) {
      if (!f.pts || c.n > 256) return false;
      uint32_t at = c.off; c.off = out.floats;
      if (c.kind == STROKE) {
        if (out.floats + c.n * 2 > 1024) return false;
        for (uint32_t p = 0; p < c.n * 2; ++p) { const float v = f.pts[at++]; if (!(std::fabs(v) < 1e7f)) return false; out.pts[out.floats++] = v; }
      } else for (uint32_t k = 0; k < c.n; ++k) {
        const float n = f.pts[at++];
        if (!(n >= 0 && n <= 256 && n == std::floor(n)) || out.floats + 1 + (uint32_t)n * 2 > 1024) return false;
        out.pts[out.floats++] = n;
        for (uint32_t p = 0; p < (uint32_t)n * 2; ++p) { const float v = f.pts[at++]; if (!(std::fabs(v) < 1e7f)) return false; out.pts[out.floats++] = v; }
      }
    } else if (c.kind == XFORM) {
      if (!f.pts || out.floats + kXformLen > 1024) return false;
      const float* p = f.pts + c.off;
      if (p[0] != TEXT && p[0] != RECT && p[0] != BORDER) return false;
      c.off = out.floats; std::memcpy(out.pts + out.floats, p, kXformLen * sizeof(float)); out.floats += kXformLen;
    }
    uint32_t text_off = c.off, text_n = c.n;
    if (c.kind == XFORM && out.pts[c.off] == TEXT) { std::memcpy(&text_off, out.pts + c.off + 13, 4); std::memcpy(&text_n, out.pts + c.off + 14, 4); }
    if (c.kind == TEXT || (c.kind == XFORM && out.pts[c.off] == TEXT)) {
      if (!f.text || text_n >= 4096 || out.chars + text_n + 1 > 4096) return false;
      const uint32_t offset = out.chars;
      std::memcpy(out.text + offset, f.text + text_off, text_n); out.text[offset + text_n] = 0; out.chars += text_n + 1; out.fonts = font_gen;
      if (c.kind == TEXT) c.off = offset; else std::memcpy(out.pts + c.off + 13, &offset, 4);
    }
    out.cmds[out.count++] = c;
  }
  if (out.count < 3 || (subtree && out.count != end - first)) return false;
  out.x = x0 - 1; out.y = y0 - 1;
  out.w = (int)std::ceil(paintCoord(x1 - x0)) + 2; out.h = (int)std::ceil(paintCoord(y1 - y0)) + 2;
  if (out.w < 1 || out.h < 1 || out.w > 2048 || out.h > 2048 || (uint64_t)out.w * out.h * 4 > 8 * 1024 * 1024) return false;
  for (uint32_t i = 0; i < out.count; ++i) {
    Cmd& c = out.cmds[i]; if (c.kind == UNCLIP) continue; c.x = paintCoord(c.x - out.x); c.y = paintCoord(c.y - out.y); c.w = paintCoord(c.w); c.h = paintCoord(c.h);
    if (c.kind == POLY || c.kind == STROKE) {
      uint32_t at = c.off;
      const uint32_t contours = c.kind == STROKE ? 1 : c.n;
      for (uint32_t k = 0; k < contours; ++k) { const uint32_t n = c.kind == STROKE ? c.n : (uint32_t)out.pts[at++]; for (uint32_t p = 0; p < n; ++p) { out.pts[at] = paintCoord(out.pts[at] - out.x); ++at; out.pts[at] = paintCoord(out.pts[at] - out.y); ++at; } }
    } else if (c.kind == XFORM) {
      out.pts[c.off + 5] = paintCoord(out.pts[c.off + 5] - out.x); out.pts[c.off + 6] = paintCoord(out.pts[c.off + 6] - out.y);
    }
  }
  uint64_t hash = 1469598103934665603ull;
  auto add = [&](const void* data, size_t n) { const auto* p = (const unsigned char*)data; while (n--) { hash ^= *p++; hash *= 1099511628211ull; } };
  add(&out.w, sizeof(out.w)); add(&out.h, sizeof(out.h)); add(&out.fonts, sizeof(out.fonts)); add(out.cmds, out.count * sizeof(Cmd)); add(out.pts, out.floats * sizeof(float)); add(out.text, out.chars);
  out.hash = hash;
  return true;
}
inline bool samePaint(const PaintBatch& a, const PaintBatch& b) {
  return a.hash == b.hash && a.count == b.count && a.floats == b.floats && a.chars == b.chars && a.fonts == b.fonts && a.w == b.w && a.h == b.h &&
    !std::memcmp(a.cmds, b.cmds, a.count * sizeof(zrt::raster::Cmd)) && !std::memcmp(a.pts, b.pts, a.floats * sizeof(float)) && !std::memcmp(a.text, b.text, a.chars);
}
}
