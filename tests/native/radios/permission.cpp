#include "fake_bus.h"
#include "../../../plugins/wifi/native/wifi.host.cpp"
#include <cassert>
#include <filesystem>
#include <thread>
namespace zrt { bool idle_frame = false; bool poll_pollers(); }
static bool denied = true;
extern "C" int zn_host_permission(const char* feature, const char*, char*, int) { assert(std::string(feature) == "wifi"); return denied ? 1 : 0; }
int main(int argc, char** argv) {
  if (argc > 1) { assert(std::string(argv[1]) == "--terse"); for (;;) pause(); }
  zinc::radio::FakeBus f;
  HostWifi wifi(&f.api);
  wifi.start(); wifi.poll(); assert(!wifi.has() && !wifi.scan() && !wifi.busy());
  assert(wifi.manager.state() == zinc::radio::NetworkManager::State::idle);
  assert(f.requests.empty() && f.slots.empty());
  wifi.stop(); wifi.start();
  assert(f.requests.empty() && f.slots.empty());
  denied = false;
  HostWifi cleanup(&f.api, std::filesystem::absolute(argv[0]).string());
  cleanup.reaper.attach(); cleanup.fallback.start(); cleanup.stop();
  // The public timer is gone; the production native Poller still reaps the child.
  bool active = true;
  for (int i = 0; i < 1000 && active; i++) { active = zrt::poll_pollers(); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  assert(!active && !cleanup.fallback.reap());
}
