#include "zinc_native_beep.h"

struct HostBeep : NativeBeep {
  int32_t ping() override { return 7; }
  zrt::String greet(zrt::String name, bool loud) override {
    (void)name;
    return loud ? zrt::String::from("HELLO FROM THE DESKTOP", 22) : zrt::String::from("hello from the desktop", 22);
  }
  void watch(zrt::Fn<void(int32_t, zrt::String)> cb) override {
    cb(1, zrt::String::from("desktop", 7));
    cb(2, zrt::String::from("desktop", 7));
  }
};

NativeBeep* zinc_create_Beep() {
  static HostBeep b;
  b.rc = zrt::IMMORTAL;
  return &b;
}
