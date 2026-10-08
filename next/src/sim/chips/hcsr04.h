// HC-SR04 ultrasonic ranger (ZN-297): a TRIG pulse of at least 10 us starts a measurement; 500 us later (after the 8 bursts) ECHO goes high for the time the sound takes there and back,
// 2 * distance / 343 m/s (58 us per cm). `trigger` takes the TRIG pulse width and its end time and returns the ECHO pulse; a pulse shorter than 10 us, or a new trigger before the last echo
// ended, is reported. Out of range (< 2 cm or > 4 m) the echo is the 38 ms timeout pulse. set-control "distance" in cm.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct HcSr04 {
  double distanceCm = 100;
  std::vector<std::string> errors;
  struct Echo { std::uint64_t riseNs, fallNs; bool valid; };
  std::uint64_t busyUntil = 0;
  bool control(const std::string& name, double v) { if (name == "distance") { distanceCm = v; return true; } return false; }
  Echo trigger(std::uint64_t widthNs, std::uint64_t endNs) {
    if (widthNs < 10'000) { errors.push_back("TRIG pulse of " + std::to_string(widthNs / 1000) + " us is shorter than 10 us"); return {0, 0, false}; }
    if (endNs < busyUntil) { errors.push_back("a new trigger before the last echo ended"); return {0, 0, false}; }
    const std::uint64_t rise = endNs + 500'000;
    const bool out = distanceCm < 2 || distanceCm > 400;
    const std::uint64_t width = out ? 38'000'000ull : (std::uint64_t)(distanceCm * 2.0 / 34300.0 * 1e9);   // cm / (cm per s)
    busyUntil = rise + width + 10'000'000ull;   // the datasheet's 60 ms cycle is the driver's business; 10 ms of quiet after the echo here
    return {rise, rise + width, !out};
  }
};

}  // namespace zn::sim
