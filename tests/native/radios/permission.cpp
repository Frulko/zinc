#include "fake_bus.h"
#include "../../../plugins/wifi/native/wifi.host.cpp"
#include <cassert>
namespace zrt { bool idle_frame = false; }
extern "C" int zn_host_permission(const char* feature, const char*, char*, int) { assert(std::string(feature) == "wifi"); return 1; }
int main() {
  zinc::radio::FakeBus f;
  HostWifi wifi(&f.api);
  wifi.start(); wifi.poll(); assert(!wifi.has() && !wifi.scan() && !wifi.busy());
  assert(wifi.manager.state() == zinc::radio::NetworkManager::State::idle);
  assert(f.requests.empty() && f.slots.empty());
  wifi.stop(); wifi.start();
  assert(f.requests.empty() && f.slots.empty());
}
