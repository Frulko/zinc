#define ZRT_HOSTED_CPP
#include "zinc_native_leapmotion.h"
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
  std::vector<double> snapshot{0, 0, 0, 0};
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
  std::chrono::steady_clock::time_point received{};
  void vector(const LEAP_VECTOR& v) { snapshot.push_back(v.x); snapshot.push_back(v.y); snapshot.push_back(v.z); }
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
      if (!create || !connect || !read || !disconnect || !destroy) {
        message = "LeapC is missing required entry points"; dlclose(library); library = nullptr; return false;
      }
    }
    if (create(nullptr, &connection) != eLeapRS_Success || connect(connection) != eLeapRS_Success) {
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
        if (event.type == eLeapEventType_Connection) { snapshot = {1, 0, 0, 0}; message.clear(); }
        if (event.type == eLeapEventType_ConnectionLost) { snapshot = {0, 0, 0, 0}; }
        if (event.type == eLeapEventType_DeviceLost) { snapshot = {1, 0, 0, 0}; }
        if (event.type != eLeapEventType_Tracking || !event.tracking_event) continue;
        const auto& frame = *event.tracking_event;
        const auto count = frame.nHands > 2 ? 2u : frame.nHands;
        snapshot = {2, static_cast<double>(frame.tracking_frame_id), frame.framerate, static_cast<double>(count)};
        for (uint32_t i = 0; i < count; ++i) {
          const auto& h = frame.pHands[i];
          snapshot.push_back(h.id); snapshot.push_back(h.type == eLeapHandType_Right ? 1 : 0);
          snapshot.push_back(h.pinch_strength); snapshot.push_back(h.grab_strength);
          vector(h.palm.position); vector(h.arm.next_joint); vector(h.arm.prev_joint);
          for (int f = 0; f < 5; ++f) {
            vector(h.digits[f].bones[0].prev_joint);
            for (int b = 0; b < 4; ++b) vector(h.digits[f].bones[b].next_joint);
          }
        }
        received = std::chrono::steady_clock::now();
      }
      if (snapshot[0] == 2 && std::chrono::steady_clock::now() - received > std::chrono::milliseconds(250)) {
        snapshot = {1, 0, 0, 0};
      }
    }
#endif
    auto out = zrt::Array<double>::with_cap(static_cast<int32_t>(snapshot.size()));
    std::memcpy(out.a->data, snapshot.data(), snapshot.size() * sizeof(double));
    out.a->len = static_cast<int32_t>(snapshot.size());
    return out;
  }
  void close() override {
#ifdef ZINC_HAS_LEAP
    if (connection) { disconnect(connection); destroy(connection); connection = nullptr; }
    // Keep LeapC loaded across reconnects; the registered exit callback releases it.
#endif
    snapshot = {0, 0, 0, 0};
  }
};
NativeLeapMotion* zinc_create_LeapMotion() {
  static HostLeapMotion instance;
  instance.rc = zrt::IMMORTAL;
  return &instance;
}
