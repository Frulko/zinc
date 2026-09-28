// E-ink refresh policy shared by the Paper Pro backend and the desktop emulator (plugins/display-rmpp).
// The runtime hands a damage rectangle; we render it, shrink it to the pixels that really changed, quantize them for
// the panel and pick a waveform:
//   FAST     small change (pen segment, button feedback): monochrome, lowest latency; greys/colours are dithered to
//            black/white and the rectangle is queued for an upgrade;
//   QUALITY  large change, or the idle upgrade of queued fast areas: greys + colour, no flash;
//   FULL     page-sized change, or every `full_every` partial updates once the pen is idle: flashing, clears ghosting.
#pragma once
#include "hal.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

namespace eink {

enum Mode : int32_t { NONE, FAST, QUALITY, FULL };
struct Rect { int32_t x0, y0, x1, y1; };
inline bool empty(const Rect& r) { return r.x0 >= r.x1 || r.y0 >= r.y1; }
inline void unite(Rect& a, const Rect& b) {
  if (empty(b)) return;
  if (empty(a)) { a = b; return; }
  if (b.x0 < a.x0) a.x0 = b.x0; if (b.y0 < a.y0) a.y0 = b.y0;
  if (b.x1 > a.x1) a.x1 = b.x1; if (b.y1 > a.y1) a.y1 = b.y1;
}
inline int64_t area(const Rect& r) { return empty(r) ? 0 : (int64_t)(r.x1 - r.x0) * (r.y1 - r.y0); }

struct Update { Rect r; Mode mode; };

#ifndef ZP_DISPLAY_RMPP_FULL_EVERY
#define ZP_DISPLAY_RMPP_FULL_EVERY 60
#endif
#ifndef ZP_DISPLAY_RMPP_UPGRADE_MS
#define ZP_DISPLAY_RMPP_UPGRADE_MS 350
#endif
#ifndef ZP_DISPLAY_RMPP_DITHER
#define ZP_DISPLAY_RMPP_DITHER 1
#endif

struct Panel {
  int32_t w = 0, h = 0;
  uint32_t* cur = nullptr;      // frame as rendered (0x00RRGGBB)
  uint32_t* scratch = nullptr;  // damage rows of the incoming frame
  uint32_t* out = nullptr;      // quantized pixels, what the panel shows
  Rect pending = {0, 0, 0, 0};  // fast-updated areas waiting for a QUALITY pass
  uint64_t last_us = 0;         // last update issued
  int32_t partials = 0;         // partial updates since the last FULL
  bool first = true;
};

inline bool init(Panel& p, int32_t w, int32_t h) {
  p.w = w; p.h = h;
  size_t n = (size_t)w * h;
  p.cur = (uint32_t*)calloc(n, 4); p.scratch = (uint32_t*)calloc(n, 4); p.out = (uint32_t*)calloc(n, 4);
  return p.cur && p.scratch && p.out;
}

// 4x4 ordered dither: position-only thresholds, so a partial update never changes pixels outside its rectangle
// (error diffusion would ripple into neighbours and force wider refreshes).
static const uint8_t BAYER[16] = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};
inline int32_t luma(uint32_t c) { return (int32_t)((((c >> 16) & 255) * 77 + ((c >> 8) & 255) * 150 + (c & 255) * 29) >> 8); }
inline bool is_bw(uint32_t c) { c &= 0xFFFFFF; return c == 0 || c == 0xFFFFFF; }
/** FAST: black/white only (the monochrome waveform cannot show greys). */
inline uint32_t mono(uint32_t c, int32_t x, int32_t y) { return luma(c) > BAYER[(y & 3) * 4 + (x & 3)] * 16 + 8 ? 0xFFFFFF : 0; }
/** QUALITY: 16 greys, colours on a 3-level-per-channel cube, both ordered-dithered.
 *  ponytail: generic palette; calibrate against the real Gallery 3 panel (see docs/targets/remarkable-paper-pro.md). */
inline uint32_t quality(uint32_t c, int32_t x, int32_t y) {
  if (!ZP_DISPLAY_RMPP_DITHER) return c & 0xFFFFFF;
  int32_t r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  int32_t hi = r > g ? (r > b ? r : b) : (g > b ? g : b), lo = r < g ? (r < b ? r : b) : (g < b ? g : b);
  int32_t t = BAYER[(y & 3) * 4 + (x & 3)];  // 0..15
  if (hi - lo < 24) {
    int32_t v = (luma(c) * 15 + t * 16) / 255; if (v > 15) v = 15;
    uint32_t q = (uint32_t)(v * 17);
    return (q << 16) | (q << 8) | q;
  }
  auto ch = [&](int32_t v) -> uint32_t { int32_t k = (v * 2 + t * 16) / 255; return k >= 2 ? 255u : k == 1 ? 128u : 0u; };
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/** Changed pixels between the incoming rows [y0, y1) (scratch) and the current frame; copies them into cur. */
inline Rect changed(Panel& p, int32_t y0, int32_t y1) {
  Rect r = {p.w, p.h, 0, 0};
  for (int32_t y = y0; y < y1; y++) {
    const uint32_t *a = p.cur + (size_t)y * p.w, *b = p.scratch + (size_t)y * p.w;
    if (!memcmp(a, b, (size_t)p.w * 4)) continue;
    int32_t x0 = 0, x1 = p.w;
    while (a[x0] == b[x0]) x0++;
    while (a[x1 - 1] == b[x1 - 1]) x1--;
    if (x0 < r.x0) r.x0 = x0; if (x1 > r.x1) r.x1 = x1;
    if (y < r.y0) r.y0 = y; r.y1 = y + 1;
    memcpy(p.cur + (size_t)y * p.w, b, (size_t)p.w * 4);
  }
  return r;
}

/** Quantizes `r` of cur into out for `mode`; returns true when some pixel was not pure black/white (needs an upgrade). */
inline bool quantize(Panel& p, Rect r, Mode mode) {
  bool grey = false;
  for (int32_t y = r.y0; y < r.y1; y++) {
    const uint32_t* s = p.cur + (size_t)y * p.w;
    uint32_t* d = p.out + (size_t)y * p.w;
    for (int32_t x = r.x0; x < r.x1; x++) {
      if (mode == FAST) { if (!is_bw(s[x])) grey = true; d[x] = mono(s[x], x, y); }
      else d[x] = quality(s[x], x, y);
    }
  }
  return grey;
}

/** One frame: returns the panel update to issue (mode NONE when nothing needs refreshing). */
inline Update present(Panel& p, const HalFrame* f, uint64_t now_us) {
  const int64_t screen = (int64_t)p.w * p.h;
  Rect c = {0, 0, 0, 0};
  if (f->y1 > f->y0 && f->x1 > f->x0) {
    f->render(p.scratch + (size_t)f->y0 * p.w, f->y0, f->y1);
    c = changed(p, f->y0, f->y1);
  }
  const bool idle = now_us - p.last_us >= (uint64_t)ZP_DISPLAY_RMPP_UPGRADE_MS * 1000;
  Update u = {c, NONE};
  if (p.first || area(c) * 10 >= screen * 6) u = {Rect{0, 0, p.w, p.h}, FULL};  // page-sized change
  else if (!empty(c)) u.mode = area(c) * 8 <= screen ? FAST : QUALITY;
  else if (idle && p.partials >= ZP_DISPLAY_RMPP_FULL_EVERY) u = {Rect{0, 0, p.w, p.h}, FULL};
  else if (idle && !empty(p.pending)) { u = {p.pending, QUALITY}; p.pending = Rect{0, 0, 0, 0}; }
  if (u.mode == NONE) return u;
  if (quantize(p, u.r, u.mode)) unite(p.pending, u.r);
  if (u.mode == FULL) { p.partials = 0; p.pending = Rect{0, 0, 0, 0}; p.first = false; } else p.partials++;
  p.last_us = now_us;
  return u;
}

}  // namespace eink
