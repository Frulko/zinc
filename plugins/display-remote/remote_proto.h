// Wire protocol shared by plugins/display-remote (server, the app) and plugins/remote-view (client, zinc:remote).
// docs/plugins/remote.md. TCP, little-endian; every message is [u8 type][u32 payload length][payload].
//
// server -> client
//   HELLO  w u16, h u16, name bytes             first message; the client (re)allocates its image
//   RECT   x u16, y u16, w u16, h u16, rle...   damaged rectangle, pixels in row-major order (rle below)
//   FRAME  seq u32                               end of a frame: the client shows it and answers ACK seq
//   PONG   t f64                                 echo of PING (round trip through the frame stream)
// client -> server
//   ACK seq u32 | POINTER x f32, y f32, down u8, button u8 | WHEEL dy f32 | BUTTONS mask u32 (HalButton bits)
//   PING t f64
// rle: PackBits over 24-bit pixels. Control byte c < 128: c+1 literal pixels follow (3 bytes each, B G R);
// c >= 128: one pixel follows, repeated c-126 times (2..129).
// Discovery: UDP multicast 239.255.90.1:7701, one datagram per second, "ZINC1\tname\ttarget\tport\tpid\tw\th".
#pragma once
#include <stdint.h>
#include <string.h>

namespace zremote {
enum : uint8_t { HELLO = 1, RECT = 2, FRAME = 3, PONG = 4, ACK = 16, POINTER = 17, WHEEL = 18, BUTTONS = 19, PING = 20 };
static const char* const GROUP = "239.255.90.1";
static const int BEACON_PORT = 7701;

/** Worst-case encoded size of n pixels. */
inline uint32_t rle_bound(uint32_t n) { return n * 3 + n / 128 + 1; }

/** Encodes n pixels (0x00RRGGBB) into out (rle_bound(n) bytes); returns the byte count. */
inline uint32_t rle_encode(const uint32_t* p, uint32_t n, uint8_t* out) {
  uint8_t* o = out;
  auto put = [&](uint32_t c) { o[0] = (uint8_t)c; o[1] = (uint8_t)(c >> 8); o[2] = (uint8_t)(c >> 16); o += 3; };
  uint32_t i = 0;
  while (i < n) {
    uint32_t r = 1;
    while (i + r < n && r < 129 && p[i + r] == p[i]) r++;
    if (r >= 2) { *o++ = (uint8_t)(r + 126); put(p[i]); i += r; continue; }
    uint32_t j = i + 1;
    while (j < n && j - i < 128 && !(j + 1 < n && p[j] == p[j + 1])) j++;
    *o++ = (uint8_t)(j - i - 1);
    for (; i < j; i++) put(p[i]);
  }
  return (uint32_t)(o - out);
}

/** Decodes into a w x h rectangle at dst (row stride in pixels); false on malformed input. */
inline bool rle_decode(const uint8_t* s, uint32_t len, uint32_t* dst, int32_t stride, int32_t w, int32_t h) {
  const uint8_t* end = s + len;
  int32_t x = 0, y = 0;
  auto get = [&]() { uint32_t c = s[0] | s[1] << 8 | (uint32_t)s[2] << 16; s += 3; return c; };
  auto emit = [&](uint32_t c) { if (y >= h) return false; dst[(size_t)y * stride + x] = c; if (++x == w) { x = 0; y++; } return true; };
  while (s < end) {
    uint8_t c = *s++;
    if (c < 128) {
      if (end - s < (c + 1) * 3) return false;
      for (int k = 0; k <= c; k++) if (!emit(get())) return false;
    } else {
      if (end - s < 3) return false;
      uint32_t px = get();
      for (int k = 0; k < c - 126; k++) if (!emit(px)) return false;
    }
  }
  return y == h;
}

inline void put16(uint8_t* p, uint16_t v) { memcpy(p, &v, 2); }
inline void put32(uint8_t* p, uint32_t v) { memcpy(p, &v, 4); }
inline uint16_t get16(const uint8_t* p) { uint16_t v; memcpy(&v, p, 2); return v; }
inline uint32_t get32(const uint8_t* p) { uint32_t v; memcpy(&v, p, 4); return v; }
}  // namespace zremote
