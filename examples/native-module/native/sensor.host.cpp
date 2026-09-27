// Implementation for macos/linux (NAT-09). Other targets: native/sensor.<target>.cpp
#include "zinc_native_sensor.h"

struct HostSensor : NativeSensor {
  double t = 21.5;
  bool led = false;
  double temperature() override { t += 0.25; return t; }
  zrt::String serial() override { return zrt::String::from("HOST-0001", 9); }
  void setLed(bool on) override { led = on; }
};

NativeSensor* zinc_create_Sensor() {
  static HostSensor s;
  s.rc = zrt::IMMORTAL;
  return &s;
}
