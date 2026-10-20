// The IMU driver of the ESP32 (imu.esp32.cpp, through hw.h) against the QMI8658 model (ZN-127): the register sequence it writes, the scaling of the samples it reads.
#define ZP_IMU_QMI8658_SDA 11
#define ZP_IMU_QMI8658_SCL 12
#define ZP_IMU_QMI8658_ADDRESS 107
#define ZP_IMU_QMI8658_FREQ 400000
#define ZP_IMU_QMI8658_X "-y"
#define ZP_IMU_QMI8658_Y "+x"
#define ZP_IMU_QMI8658_Z "+z"
#include "../../../plugins/imu-qmi8658/native/imu.esp32.cpp"
#include "chip_common.h"
#include "sim/chips/qmi8658.h"
#include <cmath>

static bool near(float a, float b) { return std::fabs(a - b) < 0.01f; }

int main() {
  NativeImu* imu = zinc_create_Imu();
  CHECK(!imu->open());                                  // nothing at 0x6B: the driver says so
  zn::sim::Qmi8658 chip;
  zn_hw_model m = chip.model();
  zn_hw_sim_attach_i2c(107, &m);
  chip.accel[0] = 0.25f; chip.accel[1] = -0.5f; chip.accel[2] = 0.75f;
  chip.gyro[0] = 10.f; chip.gyro[1] = -20.f; chip.gyro[2] = 30.f; chip.temp = 31.5f;
  CHECK(imu->open() && chip.errors.empty());
  CHECK(chip.reg[0x02] & 0x40);                         // auto-increment on for the burst read
  CHECK(chip.reg[0x03] == 0x16 && chip.reg[0x04] == 0x56 && chip.reg[0x08] == 0x03);
  CHECK(imu->read() && chip.errors.empty());
  // board axes: x = -sensor y, y = +sensor x, z = +sensor z
  CHECK(near(imu->value(0), 0.5f) && near(imu->value(1), 0.25f) && near(imu->value(2), 0.75f));
  CHECK(near(imu->value(3), 20.f) && near(imu->value(4), 10.f) && near(imu->value(5), 30.f));
  CHECK(near(imu->value(6), 31.5f));
  // a wrong driver is caught: samples before the sensors are enabled
  zn::sim::Qmi8658 cold;
  uint8_t b[14];
  cold.read(0x33, b, 14);
  CHECK(!cold.errors.empty());
  printf("qmi8658 model ok\n");
}
