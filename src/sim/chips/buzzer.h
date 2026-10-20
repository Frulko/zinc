// Passive buzzer (ZN-297): the pin toggles at the note's frequency (tone() / ledc). The model measures the period between rising edges: `frequency` is the last one, `playing` is false after
// the line has been quiet for 100 ms. An active buzzer is a level (`on`). A pin held high or low is reported as DC (no sound for a passive buzzer).
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct Buzzer {
  double frequency = 0;   // Hz of the last two rising edges
  int level = 0;
  std::vector<std::string> errors;
  std::uint64_t lastRise = 0, lastEdge = 0; bool haveRise = false; int cycles = 0;
  void edge(int newLevel, std::uint64_t t) {
    if (newLevel == level) return;
    level = newLevel; lastEdge = t;
    if (newLevel == 1) {
      if (haveRise && t > lastRise) { frequency = 1e9 / (double)(t - lastRise); ++cycles; }
      lastRise = t; haveRise = true;
    }
  }
  bool playing(std::uint64_t now) const { return haveRise && now - lastEdge < 100'000'000ull; }
  bool control(const std::string&, double) { return false; }
};

}  // namespace zn::sim
