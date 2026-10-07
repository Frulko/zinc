// IS31FL3730 LED matrix driver model, as wired on the Pimoroni Scroll pHAT (ZN-128): 11 column bytes at 0x01..0x0B that only show after a write to the update register 0x0C,
// configuration 0x00 (matrix mode), PWM 0x19. Strict: columns written in the wrong mode, or never latched, stay dark / are reported.
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Is31fl3730 {
  uint8_t reg[0x20] = {};
  uint8_t shown[11] = {};          // latched columns: what the LEDs light
  int updates = 0;
  std::vector<std::string> errors;

  zn_hw_model model() { return {&Is31fl3730::onWrite, nullptr, this}; }
  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<Is31fl3730*>(u)->write(d, n); }
  int write(const uint8_t* d, int n) {
    if (n < 2) { errors.push_back("write without data"); return 0; }
    for (int i = 1; i < n; i++) {
      int r = d[0] + i - 1;   // auto-increment
      if (r > 0x19) { errors.push_back("register 0x" + std::to_string(r) + " does not exist"); return 0; }
      reg[r] = d[i];
      if (r == 0x0C) { memcpy(shown, reg + 1, 11); updates++; }
    }
    return 1;
  }
  bool running() const { return (reg[0x00] & 0x03) == 0x03; }
  /** The panel: lit LEDs (a column byte's bit y is row y), only when the chip is running (configuration written) and at a non-zero PWM. */
  std::string pbm() const {
    std::string s = "P1\n11 5\n";
    for (int y = 0; y < 5; y++) { for (int x = 0; x < 11; x++) s += (running() && reg[0x19] && (shown[x] >> y & 1)) ? '1' : '0'; s += '\n'; }
    return s;
  }
};

}  // namespace zn::sim
