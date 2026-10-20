// MPU-6050 IMU register model (ZN-297): WHO_AM_I 0x75 = 0x68, PWR_MGMT_1 0x6B (it powers up asleep), GYRO_CONFIG 0x1B / ACCEL_CONFIG 0x1C ranges, the 14-byte sample block at 0x3B in big endian
// (accel xyz, temperature, gyro xyz). Reading samples while asleep, writing a read-only register or touching a register the chip does not have is reported; the values come from set-control.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "hw.h"

namespace zn::sim {

struct Mpu6050 {
  uint8_t reg[0x80] = {};
  float accel[3] = {0, 0, 1}, gyro[3] = {0, 0, 0}, temp = 25;   // g, deg/s, deg C
  std::vector<std::string> errors;

  Mpu6050() { reset(); }
  void reset() { std::memset(reg, 0, sizeof reg); reg[0x6B] = 0x40; reg[0x75] = 0x68; }   // asleep after reset
  zn_hw_model model() { return {&Mpu6050::onWrite, &Mpu6050::onRead, this}; }
  static int onWrite(void* u, const uint8_t* d, int n) { return static_cast<Mpu6050*>(u)->write(d, n); }
  static int onRead(void* u, uint8_t r, uint8_t* o, int n) { return static_cast<Mpu6050*>(u)->read(r, o, n); }
  // set-control: ax ay az (g), gx gy gz (deg/s), temp (deg C)
  bool control(const std::string& name, double v) {
    static const char* n[] = {"ax", "ay", "az"}; static const char* g[] = {"gx", "gy", "gz"};
    for (int i = 0; i < 3; i++) { if (name == n[i]) { accel[i] = (float)v; return true; } if (name == g[i]) { gyro[i] = (float)v; return true; } }
    if (name == "temp") { temp = (float)v; return true; }
    return false;
  }
  static bool known(int r) { return (r >= 0x0D && r <= 0x10) || r == 0x19 || r == 0x1A || r == 0x1B || r == 0x1C || (r >= 0x38 && r <= 0x48) || r == 0x68 || r == 0x6A || r == 0x6B || r == 0x6C || r == 0x75; }
  int write(const uint8_t* d, int n) {
    if (n < 2) { errors.push_back("write without data"); return 0; }
    for (int i = 1; i < n; i++) {
      int r = d[0] + i - 1;   // the register pointer auto-increments
      if (!known(r)) { errors.push_back("write to register 0x" + hex(r) + ": the MPU-6050 has none"); return 0; }
      if (r == 0x75 || (r >= 0x3B && r <= 0x48)) { errors.push_back("write to read-only register 0x" + hex(r)); continue; }
      if (r == 0x6B && (d[i] & 0x80)) { reset(); continue; }   // DEVICE_RESET
      reg[r] = d[i];
    }
    return 1;
  }
  int read(uint8_t r, uint8_t* out, int n) {
    for (int i = 0; i < n; i++) {
      int a = r + i;
      if (!known(a)) { errors.push_back("read of register 0x" + hex(a) + ": the MPU-6050 has none"); return 0; }
      out[i] = readOne(a);
    }
    return 1;
  }
  static std::string hex(int v) { const char* h = "0123456789abcdef"; return std::string(1, h[(v >> 4) & 15]) + h[v & 15]; }
  static int lsbOfAccel(uint8_t cfg) { static const int l[4] = {16384, 8192, 4096, 2048}; return l[(cfg >> 3) & 3]; }
  static float lsbOfGyro(uint8_t cfg) { static const float l[4] = {131.f, 65.5f, 32.8f, 16.4f}; return l[(cfg >> 3) & 3]; }
  uint8_t readOne(int r) {
    if (r < 0x3B || r > 0x48) return reg[r];
    if (reg[0x6B] & 0x40) { errors.push_back("sample registers read while the chip sleeps (PWR_MGMT_1 SLEEP)"); return 0; }
    int k = (r - 0x3B) / 2, hi = !((r - 0x3B) & 1);
    int16_t v;
    if (k < 3) v = (int16_t)std::lround(accel[k] * lsbOfAccel(reg[0x1C]));
    else if (k == 3) v = (int16_t)std::lround((temp - 36.53f) * 340.f);   // datasheet: T = raw / 340 + 36.53
    else v = (int16_t)std::lround(gyro[k - 4] * lsbOfGyro(reg[0x1B]));
    return hi ? (uint8_t)((uint16_t)v >> 8) : (uint8_t)(v & 255);
  }
};

}  // namespace zn::sim
