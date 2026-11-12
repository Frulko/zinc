#ifndef ZRT_HOSTED_CPP
#define ZRT_HOSTED_CPP
#endif
#include "zinc_native_wifi.h"
#include "network_manager.h"
#include <mutex>
extern "C" int zn_host_permission(const char*, const char*, char*, int) __attribute__((weak));
struct HostWifi : NativeWifi {
  std::mutex mutex;
  zinc::radio::NetworkManager manager;
  explicit HostWifi(zinc::radio::Api* api = nullptr) : manager(api) {}
  enum class State { idle, observing, denied, closed } state = State::idle;
  bool transition(State next) {
    bool valid = next == State::closed || next == State::denied || (next == State::observing && state != State::observing);
    if (valid) state = next;
    return valid;
  }
  bool allowed() {
    char why[256] = {};
    if (zn_host_permission && zn_host_permission("wifi", "wifi", why, sizeof why)) {
      if (state == State::observing) manager.stop();
      transition(State::denied); return false;
    }
    return true;
  }
  static zrt::String str(const std::string& s) { return zrt::String::from(s.data(), static_cast<uint32_t>(s.size())); }
  void start() override { std::lock_guard<std::mutex> lock(mutex); if (allowed()) { manager.start(); transition(State::observing); } }
  void poll() override { std::lock_guard<std::mutex> lock(mutex); if (allowed() && state == State::observing) manager.poll(); }
  bool has() override { std::lock_guard<std::mutex> lock(mutex); return allowed() && manager.has(); }
  zrt::String info() override { std::lock_guard<std::mutex> lock(mutex); return str(!allowed() ? "unauthorized\t\t\t0" : manager.info()); }
  bool scan() override { std::lock_guard<std::mutex> lock(mutex); return allowed() && manager.scan(); }
  bool busy() override {
    std::lock_guard<std::mutex> lock(mutex);
    if (!allowed()) return false;
    using O = zinc::radio::NetworkManager::Operation;
    auto op = manager.activity(); return manager.state() == zinc::radio::NetworkManager::State::discovering || op == O::scanning || op == O::collecting || op == O::activating;
  }
  zrt::String networks() override {
    std::lock_guard<std::mutex> lock(mutex); std::string out;
    if (allowed()) for (auto& n : manager.results()) out += zinc::radio::hex(n.ssid) + "\t" + std::to_string(n.strength) + "\t" + ((n.flags & 1) || n.wpa || n.rsn ? "1" : "0") + "\n";
    return str(out);
  }
  bool connect(zrt::Array<uint8_t> ssid, zrt::String password, bool ap) override {
    std::lock_guard<std::mutex> lock(mutex);
    if (!allowed() || ssid.length() < 1 || ssid.length() > 32 || password.bytes() > 64) return false;
    std::vector<uint8_t> bytes(ssid.a->data, ssid.a->data + ssid.length());
    return manager.connect(bytes, std::string(password.ptr(), password.bytes()), ap);
  }
  void disconnect() override { std::lock_guard<std::mutex> lock(mutex); if (allowed()) manager.disconnect(); }
  void stop() override { std::lock_guard<std::mutex> lock(mutex); manager.stop(); transition(State::closed); }
  zrt::String error() override { std::lock_guard<std::mutex> lock(mutex); return str(!allowed() ? "wifi permission denied" : manager.error()); }
};
NativeWifi* zinc_create_Wifi() { static HostWifi instance; return &instance; }
