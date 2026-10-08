// Hobby servo (ZN-297): the signal is a pulse every 20 ms, 500 us to 2500 us wide for 0 to 180 degrees (the widths of an SG90; Servo.h writes 544 to 2400 us). `pulse` takes the width and the time
// of the rising edge; the angle follows the last valid pulse. A period far from 20 ms, or a width outside 400 to 2600 us, is reported.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct Servo {
  double angle = 90;      // degrees, what the horn shows
  double minUs = 500, maxUs = 2500;
  std::vector<std::string> errors;
  std::uint64_t lastRise = 0; bool have = false; int pulses = 0;
  void pulse(std::uint64_t widthNs, std::uint64_t riseNs) {
    const double us = (double)widthNs / 1000.0;
    if (have) { const double period = (double)(riseNs - lastRise) / 1e6; if (period < 15 || period > 25) errors.push_back("pulse period " + std::to_string((int)period) + " ms: a servo wants 20 ms"); }
    have = true; lastRise = riseNs; ++pulses;
    if (us < 400 || us > 2600) { errors.push_back("pulse of " + std::to_string((int)us) + " us is outside 400 to 2600 us"); return; }
    double a = (us - minUs) / (maxUs - minUs) * 180.0;
    angle = a < 0 ? 0 : a > 180 ? 180 : a;
  }
  bool control(const std::string& name, double v) { (void)name; (void)v; return false; }   // a servo has no input but its pin
};

}  // namespace zn::sim
