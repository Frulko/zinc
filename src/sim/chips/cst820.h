// CST820 / CST816 capacitive touch controller model (ZN-128): the register block a driver polls (0x02 finger count, 0x03..0x06 X and Y in 12 bits), scripted by the test;
// the writes the driver makes (0xFE 0xFF: disable auto sleep) are recorded.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Cst820 {
  int fingers = 0, x = 0, y = 0;
  bool noSleep = false;
  std::vector<std::string> errors;

  zn_hw_model model() { return {&Cst820::onWrite, &Cst820::onRead, this}; }
  void touch(int px, int py) { fingers = 1; x = px; y = py; }
  void release() { fingers = 0; }
  static int onWrite(void* u, const uint8_t* d, int n) {
    Cst820* c = static_cast<Cst820*>(u);
    if (n == 2 && d[0] == 0xFE) { c->noSleep = d[1] == 0xFF; return 1; }
    c->errors.push_back("write to register 0x" + std::to_string(d[0]));
    return 0;
  }
  static int onRead(void* u, uint8_t reg, uint8_t* out, int n) {
    Cst820* c = static_cast<Cst820*>(u);
    uint8_t block[8] = {0, 0, (uint8_t)c->fingers, (uint8_t)(c->x >> 8 & 0x0F), (uint8_t)c->x, (uint8_t)(c->y >> 8 & 0x0F), (uint8_t)c->y, 0};
    if (reg + n > 8) { c->errors.push_back("read past the register block"); return 0; }
    for (int i = 0; i < n; i++) out[i] = block[reg + i];
    return 1;
  }
};

}  // namespace zn::sim
