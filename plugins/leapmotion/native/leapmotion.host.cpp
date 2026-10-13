#define ZRT_HOSTED_CPP
#include "zinc_native_leapmotion.h"
#include <array>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#if __has_include(<LeapC.h>)
#include <LeapC.h>
#define ZINC_HAS_LEAP 1
#elif defined(__APPLE__) && __has_include("/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/include/LeapC.h")
#include "/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/include/LeapC.h"
#define ZINC_HAS_LEAP 1
#endif
#ifdef ZINC_HAS_LEAP
#include <dlfcn.h>
#endif

struct HostLeapMotion : NativeLeapMotion {
  std::string message;
  std::vector<double> snapshot{0, 0, 0, 0, 0};
  int service = 0;
  uint64_t revision = 0;
#ifdef ZINC_HAS_LEAP
  void* library = nullptr;
  LEAP_CONNECTION connection = nullptr;
  bool cleanupRegistered = false;
  inline static HostLeapMotion* cleanupInstance = nullptr;
  decltype(&LeapCreateConnection) create = nullptr;
  decltype(&LeapOpenConnection) connect = nullptr;
  decltype(&LeapPollConnection) read = nullptr;
  decltype(&LeapCloseConnection) disconnect = nullptr;
  decltype(&LeapDestroyConnection) destroy = nullptr;
  decltype(&LeapOpenDevice) openDevice = nullptr;
  decltype(&LeapCloseDevice) closeDevice = nullptr;
  decltype(&LeapSubscribeEvents) subscribe = nullptr;
  decltype(&LeapUnsubscribeEvents) unsubscribe = nullptr;
  decltype(&LeapGetDeviceInfo) getInfo = nullptr;
  struct Device {
    uint32_t id = 0;
    LEAP_DEVICE handle = nullptr;
    std::string serial;
    int state = 1;
    int64_t frame = 0;
    float fps = 0;
    uint32_t count = 0;
    std::vector<double> hands;
    std::chrono::steady_clock::time_point received{};
  };
  std::array<Device, 2> devices;
  Device* find(uint32_t id) { for (auto& d : devices) if (d.handle && d.id == id) return &d; return nullptr; }
  void release(Device& d) {
    if (d.handle) { if (connection) unsubscribe(connection, d.handle); closeDevice(d.handle); }
    d = Device{}; ++revision;
  }
  void attach(LEAP_DEVICE_REF ref) {
    if (find(ref.id)) return;
    for (auto& d : devices) if (!d.handle) {
      if (openDevice(ref, &d.handle) != eLeapRS_Success) { d.handle = nullptr; message = "Cannot open Leap device"; return; }
      d.id = ref.id;
      if (subscribe(connection, d.handle) != eLeapRS_Success) { release(d); message = "Cannot subscribe to Leap device"; return; }
      if (getInfo) {
        char serial[256]{};
        LEAP_DEVICE_INFO info{}; info.size = sizeof(info); info.serial = serial; info.serial_length = sizeof(serial);
        if (getInfo(d.handle, &info) == eLeapRS_Success) d.serial.assign(serial, strnlen(serial, sizeof(serial)));
      }
      ++revision; return;
    }
  }
  void vector(Device& d, const LEAP_VECTOR& v) { d.hands.push_back(v.x); d.hands.push_back(v.y); d.hands.push_back(v.z); }
#endif
  ~HostLeapMotion() { close(); }
  bool open() override {
#ifdef ZINC_HAS_LEAP
    if (connection) return true;
    if (!library) {
      const char* path = std::getenv("ZINC_LEAP_LIBRARY");
      if (!path || !*path) path = "/Applications/Ultraleap Hand Tracking.app/Contents/LeapSDK/lib/libLeapC.dylib";
      library = dlopen(path, RTLD_NOW | RTLD_LOCAL);
      if (!library) { message = std::string("LeapC: ") + dlerror(); return false; }
      create = reinterpret_cast<decltype(create)>(dlsym(library, "LeapCreateConnection"));
      connect = reinterpret_cast<decltype(connect)>(dlsym(library, "LeapOpenConnection"));
      read = reinterpret_cast<decltype(read)>(dlsym(library, "LeapPollConnection"));
      disconnect = reinterpret_cast<decltype(disconnect)>(dlsym(library, "LeapCloseConnection"));
      destroy = reinterpret_cast<decltype(destroy)>(dlsym(library, "LeapDestroyConnection"));
      openDevice = reinterpret_cast<decltype(openDevice)>(dlsym(library, "LeapOpenDevice"));
      closeDevice = reinterpret_cast<decltype(closeDevice)>(dlsym(library, "LeapCloseDevice"));
      subscribe = reinterpret_cast<decltype(subscribe)>(dlsym(library, "LeapSubscribeEvents"));
      unsubscribe = reinterpret_cast<decltype(unsubscribe)>(dlsym(library, "LeapUnsubscribeEvents"));
      getInfo = reinterpret_cast<decltype(getInfo)>(dlsym(library, "LeapGetDeviceInfo"));
      if (!create || !connect || !read || !disconnect || !destroy || !openDevice || !closeDevice || !subscribe || !unsubscribe) {
        message = "LeapC is missing required entry points"; dlclose(library); library = nullptr; return false;
      }
    }
    LEAP_CONNECTION_CONFIG config{};
    config.size = sizeof(config); config.flags = eLeapConnectionConfig_MultiDeviceAware;
    if (create(&config, &connection) != eLeapRS_Success || connect(connection) != eLeapRS_Success) {
      message = "Cannot open LeapC connection; start Ultraleap Hand Tracking"; close(); return false;
    }
    if (!cleanupRegistered) {
      // LeapC initializes its logger lazily. Close before its process-exit destructors run.
      cleanupInstance = this;
      std::atexit([] {
        auto* self = cleanupInstance;
        self->close();
        if (self->library) { dlclose(self->library); self->library = nullptr; }
      });
      cleanupRegistered = true;
    }
    message.clear();
    return true;
#else
    message = "Install Ultraleap Hand Tracking in /Applications (LeapC SDK required), then rebuild this plugin";
    return false;
#endif
  }
  zrt::String error() override { return zrt::String::from(message.data(), static_cast<uint32_t>(message.size())); }
  zrt::Array<double> poll() override {
#ifdef ZINC_HAS_LEAP
    if (connection) {
      // Leap owns each event until the next poll: copy the joints immediately, and never wait in the graphics loop.
      for (int n = 0; n < 64; ++n) {
        LEAP_CONNECTION_MESSAGE event{};
        const auto result = read(connection, 0, &event);
        if (result == eLeapRS_Timeout) break;
        if (result != eLeapRS_Success) { message = "LeapC polling failed; reconnecting"; close(); break; }
        if (event.type == eLeapEventType_Connection) { service = 1; message.clear(); ++revision; }
        if (event.type == eLeapEventType_ConnectionLost) { for (auto& d : devices) release(d); service = 0; }
        if (event.type == eLeapEventType_Device && event.device_event) attach(event.device_event->device);
        if (event.type == eLeapEventType_DeviceLost && event.device_event) {
          auto* d = find(event.device_event->device.id); if (d) release(*d);
        }
        if (event.type != eLeapEventType_Tracking || !event.tracking_event) continue;
        auto* device = find(event.device_id);
        if (!device) continue;
        auto& d = *device;
        const auto& frame = *event.tracking_event;
        const auto count = frame.nHands > 2 ? 2u : frame.nHands;
        d.state = 2; d.frame = frame.tracking_frame_id; d.fps = frame.framerate; d.count = count; d.hands.clear();
        for (uint32_t i = 0; i < count; ++i) {
          const auto& h = frame.pHands[i];
          d.hands.push_back(h.id); d.hands.push_back(h.type == eLeapHandType_Right ? 1 : 0);
          d.hands.push_back(h.pinch_strength); d.hands.push_back(h.grab_strength);
          vector(d, h.palm.position); vector(d, h.arm.next_joint); vector(d, h.arm.prev_joint);
          for (int f = 0; f < 5; ++f) {
            vector(d, h.digits[f].bones[0].prev_joint);
            for (int b = 0; b < 4; ++b) vector(d, h.digits[f].bones[b].next_joint);
          }
          for (int f = 0; f < 5; ++f) d.hands.push_back(h.digits[f].is_extended ? 1 : 0);
        }
        d.received = std::chrono::steady_clock::now(); ++revision;
      }
      for (auto& d : devices) if (d.handle && d.state == 2 && std::chrono::steady_clock::now() - d.received > std::chrono::milliseconds(250)) {
        d.state = 1; d.count = 0; d.hands.clear(); d.fps = 0; ++revision;
      }
    }
#endif
    snapshot = {static_cast<double>(service), static_cast<double>(revision), 0, 0, 0};
#ifdef ZINC_HAS_LEAP
    int deviceCount = 0;
    for (const auto& d : devices) if (d.handle) {
      ++deviceCount;
      if (d.state == 2) snapshot[0] = 2;
      snapshot[2] += d.fps; snapshot[3] += d.count;
      snapshot.insert(snapshot.end(), {static_cast<double>(d.id), static_cast<double>(d.state), static_cast<double>(d.frame), d.fps, static_cast<double>(d.count)});
      snapshot.insert(snapshot.end(), d.hands.begin(), d.hands.end());
    }
    snapshot[4] = deviceCount;
    if (deviceCount) snapshot[2] /= deviceCount;
#endif
    auto out = zrt::Array<double>::with_cap(static_cast<int32_t>(snapshot.size()));
    std::memcpy(out.a->data, snapshot.data(), snapshot.size() * sizeof(double));
    out.a->len = static_cast<int32_t>(snapshot.size());
    return out;
  }
  zrt::String deviceSerial(int32_t id) override {
#ifdef ZINC_HAS_LEAP
    auto* d = find(static_cast<uint32_t>(id));
    if (d) return zrt::String::from(d->serial.data(), static_cast<uint32_t>(d->serial.size()));
#else
    (void)id;
#endif
    return zrt::String::from("", 0);
  }
  void close() override {
#ifdef ZINC_HAS_LEAP
    for (auto& d : devices) release(d);
    if (connection) { disconnect(connection); destroy(connection); connection = nullptr; }
    // Keep LeapC loaded across reconnects; the registered exit callback releases it.
#endif
    service = 0; revision = 0; snapshot = {0, 0, 0, 0, 0};
  }
};
NativeLeapMotion* zinc_create_LeapMotion() {
  static HostLeapMotion instance;
  instance.rc = zrt::IMMORTAL;
  return &instance;
}
