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
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define OPT(k) ZP_IMU_QMI8658_##k
static const float ACCEL_LSB = 8192.f;  // per g at ±4 g
static const float GYRO_LSB = 64.f;     // per dps at ±512 dps

struct EspImu : NativeImu {
  i2c_master_dev_handle_t dev = nullptr;
  float v[7] = {0, 0, 1, 0, 0, 0, 25};
  int axis[3], sign[3];

  bool wr(uint8_t reg, uint8_t val) { uint8_t b[2] = {reg, val}; return i2c_master_transmit(dev, b, 2, 50) == ESP_OK; }
  bool rd(uint8_t reg, uint8_t* out, size_t n) { return i2c_master_transmit_receive(dev, &reg, 1, out, n, 50) == ESP_OK; }
  static void map(const char* s, int& axis, int& sign) {  // "+x", "-y", "z"
    sign = *s == '-' ? -1 : 1;
    if (*s == '-' || *s == '+') s++;
    axis = *s == 'y' ? 1 : *s == 'z' ? 2 : 0;
  }

  bool open() override {
    map(OPT(X), axis[0], sign[0]); map(OPT(Y), axis[1], sign[1]); map(OPT(Z), axis[2], sign[2]);
    i2c_master_bus_config_t bc = {};
    bc.i2c_port = -1; bc.sda_io_num = (gpio_num_t)OPT(SDA); bc.scl_io_num = (gpio_num_t)OPT(SCL);
    bc.clk_source = I2C_CLK_SRC_DEFAULT; bc.glitch_ignore_cnt = 7; bc.flags.enable_internal_pullup = 1;
    i2c_master_bus_handle_t bus;
    if (i2c_new_master_bus(&bc, &bus) != ESP_OK) return false;
    if (i2c_master_probe(bus, OPT(ADDRESS), 50) != ESP_OK) { printf("imu: no QMI8658 at 0x%02x (SDA %d, SCL %d)\n", OPT(ADDRESS), OPT(SDA), OPT(SCL)); return false; }
    i2c_device_config_t dc = {};
    dc.dev_addr_length = I2C_ADDR_BIT_LEN_7; dc.device_address = OPT(ADDRESS); dc.scl_speed_hz = OPT(FREQ);
    if (i2c_master_bus_add_device(bus, &dc, &dev) != ESP_OK) return false;
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
