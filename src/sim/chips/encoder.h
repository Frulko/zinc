// Rotary encoder KY-040 (ZN-297): CLK and DT in quadrature, SW the push button. set-control `rotate` (detents, signed) turns the shaft: one detent is four Gray-code states, clockwise
// 00 -> 10 -> 11 -> 01 -> 00 on (CLK, DT); `press` closes SW (low). `state` is what the pins read now; `step` advances one quarter detent.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct Encoder {
  int clk = 1, dt = 1, sw = 1;   // pins with their pull-ups: both high at rest, SW high (open)
  int phase = 0;                 // 0..3 in the Gray sequence
  int position = 0;              // detents turned since the start (what a correct driver counts)
  std::vector<std::pair<int, int>> trace;   // the (clk, dt) pairs the pins went through
  Encoder() { setPins(); }
  void setPins() { static const int c[4] = {1, 0, 0, 1}, d[4] = {1, 1, 0, 0}; clk = c[phase]; dt = d[phase]; }   // rest = (1,1); clockwise: CLK falls first
  void step(int dir) { phase = (phase + (dir > 0 ? 1 : 3)) & 3; setPins(); trace.push_back({clk, dt}); }
  bool control(const std::string& name, double v) {
    if (name == "rotate") { const int n = (int)v; for (int i = 0; i < (n < 0 ? -n : n) * 4; i++) step(n < 0 ? -1 : 1); position += n; return true; }
    if (name == "press") { sw = v != 0 ? 0 : 1; return true; }
    return false;
  }
  // The decoder a driver implements (the table of every encoder library): the detents counted from the pin pairs.
  static int decode(const std::vector<std::pair<int, int>>& pairs, int startClk = 1, int startDt = 1) {
    static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
    int prev = (startClk << 1) | startDt, count = 0;
    for (const auto& p : pairs) { const int cur = (p.first << 1) | p.second; count += table[(prev << 2) | cur]; prev = cur; }
    return count / 4;
  }
};

}  // namespace zn::sim
