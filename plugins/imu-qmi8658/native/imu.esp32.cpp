// zinc:imu on ESP32: QMI8658 (QST) 6-axis IMU with the i2c_master driver.
// Registers (QMI8658 datasheet, as used by lewisxhe/SensorLib SensorQMI8658_Reg.hpp):
//   0x00 WHO_AM_I = 0x05     0x02 CTRL1 (bit 6: address auto-increment)
//   0x03 CTRL2 accel: range bits 6:4 (1 = ±4 g), ODR bits 3:0 (6 = ~112 Hz)
//   0x04 CTRL3 gyro:  range bits 6:4 (5 = ±512 dps), ODR bits 3:0
//   0x08 CTRL7: bit 0 accel enable, bit 1 gyro enable      0x60 RESET: write 0xB0
//   0x33.. TEMP_L, TEMP_H (°C = H + L / 256), AX_L..AZ_H, GX_L..GZ_H: little-endian int16
// Options (ZP_IMU_QMI8658_*): sda, scl, address, freq, and x/y/z: which sensor axis (with sign) is the board's screen
// right / screen down / out of the screen, e.g. "-y". The board preset sets them; check them on the real board.
#include "zinc_native_imu.h"
#include <stdio.h>
#include "hw.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define OPT(k) ZP_IMU_QMI8658_##k
static const float ACCEL_LSB = 8192.f;  // per g at ±4 g
static const float GYRO_LSB = 64.f;     // per dps at ±512 dps

struct EspImu : NativeImu {
  zn_i2c* dev = nullptr;
  float v[7] = {0, 0, 1, 0, 0, 0, 25};
  int axis[3], sign[3];

  bool wr(uint8_t reg, uint8_t val) { uint8_t b[2] = {reg, val}; return zn_i2c_write(dev, b, 2); }
  bool rd(uint8_t reg, uint8_t* out, size_t n) { return zn_i2c_read_reg(dev, reg, out, (int)n); }
  static void map(const char* s, int& axis, int& sign) {  // "+x", "-y", "z"
    sign = *s == '-' ? -1 : 1;
    if (*s == '-' || *s == '+') s++;
    axis = *s == 'y' ? 1 : *s == 'z' ? 2 : 0;
  }

  bool open() override {
    map(OPT(X), axis[0], sign[0]); map(OPT(Y), axis[1], sign[1]); map(OPT(Z), axis[2], sign[2]);
    dev = zn_i2c_open("", OPT(ADDRESS), OPT(SDA), OPT(SCL), OPT(FREQ));
    if (!dev) { printf("imu: no QMI8658 at 0x%02x (SDA %d, SCL %d)\n", OPT(ADDRESS), OPT(SDA), OPT(SCL)); return false; }
    uint8_t id = 0;
    if (!rd(0x00, &id, 1) || id != 0x05) { printf("imu: WHO_AM_I 0x%02x, expected 0x05 (QMI8658)\n", id); dev = nullptr; return false; }
    wr(0x60, 0xB0);                        // soft reset
    vTaskDelay(pdMS_TO_TICKS(20));
    uint8_t c1 = 0;
    rd(0x02, &c1, 1);
    bool ok = wr(0x02, c1 | 0x40)          // auto-increment for burst reads
           && wr(0x03, 0x16)               // accel ±4 g, ~112 Hz
           && wr(0x04, 0x56)               // gyro ±512 dps, ~112 Hz
           && wr(0x08, 0x03);              // accel + gyro on
    if (!ok) { dev = nullptr; return false; }
    vTaskDelay(pdMS_TO_TICKS(30));         // first samples
    return true;
  }

  bool read() override {
    uint8_t b[14];
    if (!dev || !rd(0x33, b, sizeof b)) return false;
    auto s16 = [&](int i) { return (float)(int16_t)(b[i] | b[i + 1] << 8); };
    float a[3] = {s16(2) / ACCEL_LSB, s16(4) / ACCEL_LSB, s16(6) / ACCEL_LSB};
    float g[3] = {s16(8) / GYRO_LSB, s16(10) / GYRO_LSB, s16(12) / GYRO_LSB};
    for (int k = 0; k < 3; k++) { v[k] = sign[k] * a[axis[k]]; v[3 + k] = sign[k] * g[axis[k]]; }
    v[6] = (int8_t)b[1] + b[0] / 256.f;
    return true;
  }

  float value(int32_t i) override { return i >= 0 && i < 7 ? v[i] : 0; }
};

NativeImu* zinc_create_Imu() {
  static EspImu s;
  s.rc = zrt::IMMORTAL;
  return &s;
}
