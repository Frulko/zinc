// 7-segment digit (ZN-297): segments a b c d e f g (and the decimal point dp) as a bitmask, bit 0 = a ... bit 6 = g, bit 7 = dp; common cathode lights a segment with a high pin, common anode with a
// low one (`commonAnode`). `digit` reads the shown character ('0'-'9', 'A'-'F', '-', ' '), -1... a pattern that is no character is reported.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct SevenSegment {
  bool commonAnode = false;
  std::uint8_t lit = 0;   // the segments that glow
  std::vector<std::string> errors;
  // The levels of the eight pins in the order a b c d e f g dp (bit 0 = a).
  void pins(std::uint8_t levels) { lit = commonAnode ? (std::uint8_t)~levels : levels; }
  char digit() {
    static const std::uint8_t font[16] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71};   // 0-9 A b C d E F
    const std::uint8_t s = lit & 0x7F;
    if (s == 0) return ' ';
    if (s == 0x40) return '-';
    for (int i = 0; i < 16; i++) if (font[i] == s) return "0123456789AbCdEF"[i];
    errors.push_back("segments 0x" + std::to_string(s) + " are no character");
    return '?';
  }
  bool dot() const { return (lit & 0x80) != 0; }
  bool control(const std::string&, double) { return false; }
};

}  // namespace zn::sim
