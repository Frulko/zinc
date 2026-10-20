// What imu.esp32.cpp needs of the runtime, for the chip model test (ZN-127): the object base and the NativeImu interface.
#pragma once
#include <cstdint>
namespace zrt { struct Object { int rc = 0; }; constexpr int IMMORTAL = 1 << 30; }
struct NativeImu : zrt::Object {
  virtual bool open() = 0;
  virtual bool read() = 0;
  virtual float value(int32_t i) = 0;
};
NativeImu* zinc_create_Imu();
