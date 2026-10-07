// QMI8658 IMU register model (ZN-127): WHO_AM_I 0x05, reset, CTRL1 address auto-increment, CTRL2/3 ranges, CTRL7 enables, the sample block at 0x33.. in little endian.
// A driver that reads samples before enabling the sensors, or bursts without auto-increment, is reported; the values come from the test (or, later, the keyboard).
#pragma once
#include <cmath>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Qmi8658 {
  uint8_t reg[0x60] = {};
  float accel[3] = {0, 0, 1}, gyro[3] = {0, 0, 0}, temp = 25;   // g, deg/s, deg C
  std::vector<std::string> errors;
  int samples = 0;

  Qmi8658() { reset(); }
  void reset() { std::memset(reg, 0, sizeof reg); reg[0x00] = 0x05; reg[0x02] = 0x40; }
  zn_hw_model model() { return {&Qmi8658::onWrite, &Qmi8658::onRead, this}; }
  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<Qmi8658*>(u)->write(d, n); }
  static int onRead(void* u, uint8_t r, uint8_t* o, int n) { return static_cast<Qmi8658*>(u)->read(r, o, n); }
  static int lsbOfAccel(uint8_t ctrl2) { static const int g[4] = {16384, 8192, 4096, 2048}; return g[(ctrl2 >> 4) & 3]; }
  static int dpsOfGyro(uint8_t ctrl3) { return 16 << ((ctrl3 >> 4) & 7); }   // full scale: 16, 32, ... 2048 dps

  int write(const uint8_t* d, int n) {
    if (n < 2) { errors.push_back("write without data"); return 0; }
    for (int i = 1; i < n; i++) {
      int r = d[0] + (autoInc() ? i - 1 : 0);
      if (r == 0x60) { if (d[i] == 0xB0) reset(); else errors.push_back("RESET register written with 0x" + std::to_string(d[i])); continue; }
      if (r == 0x00 || r >= 0x33) { errors.push_back("write to read-only register " + std::to_string(r)); continue; }
      reg[r] = d[i];
    }
    return 1;
  }
  bool autoInc() const { return reg[0x02] & 0x40; }
  int read(uint8_t r, uint8_t* out, int n) {
    if (n > 1 && !autoInc()) errors.push_back("burst read without CTRL1 address auto-increment");
    for (int i = 0; i < n; i++) out[i] = readOne(r + (autoInc() ? i : 0));
    if (r == 0x33) samples++;
    return 1;
  }
  uint8_t readOne(int r) {
    if (r < 0x33 || r > 0x40) return reg[r];
    if ((reg[0x08] & 3) == 0) { errors.push_back("sample registers read while accel and gyro are disabled (CTRL7)"); return 0; }
    if (r == 0x33) return (uint8_t)(int)std::floor((temp - std::floor(temp)) * 256);   // TEMP_L (fraction)
    if (r == 0x34) return (uint8_t)(int8_t)(int)std::floor(temp);                      // TEMP_H
    int k = (r - 0x35) / 2, hi = (r - 0x35) & 1;
    int16_t v = k < 3 ? (int16_t)std::lround(accel[k] * lsbOfAccel(reg[0x03])) : (int16_t)std::lround(gyro[k - 3] * 32768.0f / dpsOfGyro(reg[0x04]));
    return hi ? (uint8_t)((uint16_t)v >> 8) : (uint8_t)(v & 255);
  }
};

}  // namespace zn::sim
