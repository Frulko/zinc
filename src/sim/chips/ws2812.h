// WS2812 chain model fed by the Linux SPI encoding of the driver (ZN-127): three SPI bits per LED bit (100 = 0, 110 = 1), a reset gap of zeros at the end.
// Says when the stream is not a legal WS2812 stream, and lays the chain out on a matrix from the board's wiring.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Ws2812 {
  std::vector<uint8_t> bytes;        // the last decoded frame, in wire order (3 bytes per LED)
  std::vector<std::string> errors;
  int frames = 0;

  zn_hw_model model() { return {&Ws2812::onWrite, nullptr, this}; }
  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<Ws2812*>(u)->write(d, n); }
  int write(const uint8_t* d, int n) {
    const int gap = 96;
    if (n <= gap || (n - gap) % 9 != 0) { errors.push_back("SPI frame of " + std::to_string(n) + " bytes: not 9 per LED plus a " + std::to_string(gap) + " byte reset gap"); return 0; }
    for (int i = n - gap; i < n; i++) if (d[i]) { errors.push_back("the reset gap is not zero: the chain would latch late"); break; }
    int count = (n - gap) / 3;
    bytes.assign(count, 0);
    for (int i = 0; i < count; i++) {
      uint32_t v = d[i * 3] << 16 | d[i * 3 + 1] << 8 | d[i * 3 + 2];
      uint8_t b = 0;
      for (int k = 7; k >= 0; k--) {
        uint32_t tri = (v >> (k * 3)) & 7;
        if (tri != 4 && tri != 6) { errors.push_back("SPI pattern " + std::to_string(tri) + " is neither a 0 (100) nor a 1 (110)"); tri = 4; }
        b = b << 1 | (tri == 6);
      }
      bytes[i] = b;
    }
    frames++;
    return 1;
  }

  struct Wiring { int width = 8, height = 8; bool serpentine = false, vertical = false, flipX = false, flipY = false; const char* order = "GRB"; };
  /** The colour (0xRRGGBB) of the LED at matrix position (x, y), from the chain. */
  uint32_t at(const Wiring& w, int x, int y) const {
    if (w.flipX) x = w.width - 1 - x;
    if (w.flipY) y = w.height - 1 - y;
    int line = w.vertical ? x : y, p = w.vertical ? y : x, len = w.vertical ? w.height : w.width;
    if (w.serpentine && (line & 1)) p = len - 1 - p;
    size_t i = (size_t)(line * len + p) * 3;
    if (i + 2 >= bytes.size()) return 0;
    uint8_t c[3];
    for (int k = 0; k < 3; k++) { const char* o = w.order; int at = 0; while (o[at] && o[at] != "RGB"[k]) at++; c[k] = bytes[i + at]; }
    return c[0] << 16 | c[1] << 8 | c[2];
  }
  std::string ppm(const Wiring& w) const {
    std::string s = "P3\n" + std::to_string(w.width) + " " + std::to_string(w.height) + "\n255\n";
    for (int y = 0; y < w.height; y++) {
      for (int x = 0; x < w.width; x++) { uint32_t c = at(w, x, y); s += std::to_string(c >> 16) + " " + std::to_string((c >> 8) & 255) + " " + std::to_string(c & 255) + (x + 1 < w.width ? "  " : ""); }
      s += '\n';
    }
    return s;
  }
};

}  // namespace zn::sim
