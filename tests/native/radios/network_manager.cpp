#include "fake_bus.h"
#include "../../../plugins/wifi/native/network_manager.h"
#include <iostream>
using namespace zinc::radio;
int main() {
  assert(objectPath("/org/bluez/hci1/dev_AA") && !objectPath("/org//bluez") && !objectPath("/../x") && !objectPath("/x/"));
  FakeBus f;
  NetworkManager nm(&f.api);
  nm.start(); assert(!nm.has());
  auto get = f.take("GetDevices"); assert(get.destination == "org.freedesktop.NetworkManager" && get.values.empty());
  f.reply(2, "ao", {Value::container('a', "o", {})}); nm.poll();
  assert(nm.state() == NetworkManager::State::absent && !nm.has());
  nm.stop(); nm.start();
  f.take("GetDevices");
  f.reply(5, "ao", {Value::container('a', "o", {Value::string("/nm/wlan", 'o')})}); nm.poll();
  auto props = f.take("GetAll"); assert(props.path == "/nm/wlan" && props.values[0].text == "org.freedesktop.NetworkManager.Device");
  f.reply(6, "a{sv}", {dictionary({property("DeviceType", Value::integer(2))})}); nm.poll();
  assert(nm.has());
  f.take("GetAll"); f.take("GetAll");
  f.reply(7, "a{sv}", {dictionary({property("State", Value::integer(30))})});
  f.reply(8, "a{sv}", {dictionary({property("LastScan", Value::integer(50, 'x')), property("WirelessCapabilities", Value::integer(0x40))})}); nm.poll();
  // poll schedules its first status snapshot too.
  while (!f.requests.empty()) f.requests.pop_front();
  size_t scanSlot = f.slots.size(); assert(nm.scan());
  auto scan = f.take("RequestScan"); assert(scan.values.size() == 1 && scan.values[0].contents == "{sv}");
  f.reply(scanSlot, "", {}); nm.poll(); assert(nm.activity() == NetworkManager::Operation::scanning);
  sd_bus_message signal; signal.interface = "org.freedesktop.DBus.Properties"; signal.member = "PropertiesChanged"; signal.path = "/nm/wlan"; signal.signature = "sa{sv}as";
  signal.values = {Value::string("org.freedesktop.NetworkManager.Device.Wireless"), dictionary({property("LastScan", Value::integer(51, 'x'))}), Value::container('a', "s", {})};
  f.replies.push_back({f.slots[4].get(), signal}); nm.poll();
  auto aps = f.take("GetAllAccessPoints"); assert(aps.path == "/nm/wlan");
  size_t apSlot = aps.slotIndex;
  f.reply(apSlot, "ao", {Value::container('a', "o", {Value::string("/nm/ap/1", 'o')})}); nm.poll();
  auto apProperties = f.take("GetAll");
  while (apProperties.path != "/nm/ap/1") apProperties = f.take("GetAll");
  std::vector<uint8_t> ssid = {0, 255, ':', '\\', '\n', 0x1e, 0x1f};
  f.reply(apProperties.slotIndex, "a{sv}", {dictionary({property("Ssid", bytes(ssid)), property("Strength", Value::integer(75, 'y')), property("Flags", Value::integer(1)), property("RsnFlags", Value::integer(0x100))})}); nm.poll();
  assert(nm.activity() == NetworkManager::Operation::idle && nm.results().size() == 1 && nm.results()[0].ssid == ssid);
  assert(nm.connect(ssid, "secret-password"));
  auto activation = f.take("AddAndActivateConnection2"); assert(activation.values.size() == 4);
  assert(activation.values[0].contents == "{sa{sv}}" && activation.values[2].text == "/nm/ap/1");
  assert(activation.values[3].property("persist")->text == "volatile" && activation.values[3].property("bind-activation")->text == "dbus-client");
  f.reply(f.slots.size() - 1, "ooa{sv}", {Value::string("/nm/profile/1", 'o'), Value::string("/nm/active/1", 'o'), dictionary()}); nm.poll();
  assert(nm.status() == "connecting"); // method success is not connection success
  assert(!nm.connect(ssid, "secret-password")); // one activation at a time
  size_t statusSlot = f.slots.size() - 2;
  f.reply(statusSlot, "a{sv}", {dictionary({property("State", Value::integer(100)), property("ActiveConnection", Value::string("/nm/unrelated", 'o'))})}); nm.poll();
  assert(nm.status() == "connecting");
  f.replies.push_back({f.slots[4].get(), signal}); nm.poll();
  statusSlot = f.slots.size() - 2;
  f.reply(statusSlot, "a{sv}", {dictionary({property("State", Value::integer(100)), property("ActiveConnection", Value::string("/nm/active/1", 'o'))})}); nm.poll();
  assert(nm.status() == "connected");
  nm.disconnect(); auto deactivate = f.take("DeactivateConnection"); assert(deactivate.values[0].text == "/nm/active/1");
  f.reply(f.slots.size() - 1, "", {}, "org.freedesktop.NetworkManager.PermissionDenied"); nm.poll();
  assert(nm.error() == "org.freedesktop.NetworkManager.PermissionDenied"); assert(nm.error().find("secret-password") == std::string::npos);
  assert(nm.connect({'a', 'p'}, "secret-password", true));
  auto hotspot = f.take("AddAndActivateConnection2");
  assert(hotspot.values[2].text == "/");
  bool apMode = false, shared = false;
  for (auto& section : hotspot.values[0].children) {
    if (section.children[0].text == "802-11-wireless") apMode = section.children[1].property("mode")->text == "ap";
    if (section.children[0].text == "ipv4") shared = section.children[1].property("method")->text == "shared";
  }
  assert(apMode && shared);
  sd_bus_message removed; removed.interface = "org.freedesktop.NetworkManager"; removed.member = "DeviceRemoved"; removed.signature = "o"; removed.values = {Value::string("/nm/wlan", 'o')};
  f.replies.push_back({f.slots[4].get(), removed}); nm.poll(); assert(!nm.has());
  nm.disconnect(); // pending activation is cancelled by dropping this client's binding
  assert(!nm.has());
  nm.stop(); assert(!nm.has());
  // Cancelled replies from the old bus must not resurrect a device on restart.
  nm.start(); size_t stale = f.slots.size() - 1; nm.stop();
  f.reply(stale, "ao", {Value::container('a', "o", {Value::string("/stale", 'o')})}); nm.start(); nm.poll(); assert(!nm.has()); nm.stop();
  // Bounded pump and malformed/untrusted values run through the production codec.
  Bus bus(&f.api); assert(bus.start()); int calls = 0;
  assert(bus.call("org.bluez", "/", "org.freedesktop.DBus.ObjectManager", "GetManagedObjects", {}, [&](const Reply& r) { assert(!r.ok()); calls++; }));
  Value deep = Value::string("x"); for (int i = 0; i < 26; i++) deep = Value::variant(deep);
  f.reply(f.slots.size() - 1, "v", {deep}); bus.poll(); assert(calls == 1);
  auto* persistent = f.slot([](sd_bus_message*, void*, sd_bus_error*) { return 0; }, nullptr);
  for (int i = 0; i < 100; i++) f.replies.push_back({persistent, {}});
  size_t before = f.processed; bus.poll(); assert(f.processed - before == 32);
  f.transportError = -104; bus.poll(); assert(bus.state() == Bus::State::failed); bus.stop();
  std::cout << "radio NetworkManager protocol ok\n";
}
