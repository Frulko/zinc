// zinc:imu on macos/linux: no QMI8658 on the machine; index.ts emulates the sensor from the keyboard and mouse.
#include "zinc_native_imu.h"

struct HostImu : NativeImu {
  bool open() override { return false; }
  bool read() override { return false; }
  float value(int32_t) override { return 0; }
};

NativeImu* zinc_create_Imu() {
  static HostImu s;
  s.rc = zrt::IMMORTAL;
  return &s;
}
