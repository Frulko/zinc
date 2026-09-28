// zinc:device on macos/linux: the emulator has no backlight to drive (index.ts keeps the level) and no chip heap.
#include "zinc_native_device.h"

struct HostDevice : NativeDevice {
  bool setBacklight(int32_t) override { return false; }
  bool hasTouch() override { return true; }
  int32_t heapFree() override { return -1; }
  int32_t heapMinFree() override { return -1; }
  int32_t zincHeapUsed() override { return (int32_t)zrt::heap_used(); }
  int32_t zincHeapSize() override { return (int32_t)zrt::heap_budget(); }
  int32_t frameUs() override { return (int32_t)zrt::stats.frame_us; }
  int32_t drawCmds() override { return (int32_t)zrt::stats.draw_cmds; }
  int32_t cpuMhz() override { return 0; }
#ifdef __APPLE__
  zrt::String chip() override { return zrt::String::from("macOS emulator", 14); }
#else
  zrt::String chip() override { return zrt::String::from("Linux emulator", 14); }
#endif
};

NativeDevice* zinc_create_Device() {
  static HostDevice s;
  s.rc = zrt::IMMORTAL;
  return &s;
}
