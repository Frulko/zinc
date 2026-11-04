#pragma once
#include <stdint.h>

namespace zn::app {
// One return per three-finger hold; lifting a finger, a fourth finger or backgrounding cancels it.
struct HomeHold {
  int fingers = 0;
  uint64_t since = 0;
  bool armed = false;
  void down(uint64_t now) {
    ++fingers;
    if (fingers == 3) { since = now; armed = true; }
    if (fingers > 3) armed = false;
  }
  void up() { if (fingers > 0) --fingers; if (fingers < 3) armed = false; }
  void reset() { fingers = 0; armed = false; }
  bool poll(uint64_t now) {
    if (!armed || now - since < 800) return false;
    armed = false;
    return true;
  }
};
// Three distinct acceleration peaks within one second; ignore a single bump, gravity and held acceleration.
struct Shake {
  int peaks = 0;
  uint64_t first = 0, last = 0, cooldown = 0;
  bool high = false;
  void reset() { peaks = 0; first = last = cooldown = 0; high = false; }
  bool sample(double gravity, uint64_t now) {
    if (now < cooldown) return false;
    if (gravity < 1.3) { high = false; return false; }
    if (gravity < 1.8 || high) return false;
    high = true;
    if (peaks == 0 || now - first > 1000) { peaks = 1; first = last = now; return false; }
    if (now - last < 100) return false;
    last = now;
    if (++peaks < 3) return false;
    peaks = 0; cooldown = now + 1500;
    return true;
  }
};
}
