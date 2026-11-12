#pragma once
#include "../../radio/native/sd_bus.h"
#include <chrono>

namespace zinc::radio {
class NetworkManager {
  static constexpr const char* destination = "org.freedesktop.NetworkManager";
  static constexpr const char* root = "/org/freedesktop/NetworkManager";
  static constexpr const char* manager = "org.freedesktop.NetworkManager";
  static constexpr const char* deviceInterface = "org.freedesktop.NetworkManager.Device";
  static constexpr const char* wireless = "org.freedesktop.NetworkManager.Device.Wireless";
  static constexpr const char* apInterface = "org.freedesktop.NetworkManager.AccessPoint";
public:
  enum class State { idle, discovering, absent, ready, failed, closed };
  enum class Operation { idle, scanning, collecting, activating, connected, accessPoint, failed };
  struct Network { std::string path; std::vector<uint8_t> ssid; uint32_t strength = 0, flags = 0, wpa = 0, rsn = 0; };
private:
  Bus bus;
  State phase = State::idle;
  Operation operation = Operation::idle;
  uint64_t generation = 1, scanGeneration = 1, statusGeneration = 1;
  std::string device, active, owned, observedConnection, ip, reason;
  std::vector<uint8_t> ssid;
  uint32_t deviceState = 0, capabilities = 0, strength = 0;
  int64_t lastScan = -1;
  std::vector<Network> networks;
  size_t outstanding = 0;
  bool restart = false;
  std::chrono::steady_clock::time_point deadline, nextStatus;
  bool transition(State next) {
    bool valid = next == State::closed || next == State::failed || (next == State::discovering && phase != State::discovering) || (phase == State::discovering && (next == State::ready || next == State::absent));
    if (valid) phase = next;
    return valid;
  }
  bool transition(Operation next) {
    bool valid = next == Operation::idle || next == Operation::failed || (next == Operation::scanning && operation != Operation::activating) || (operation == Operation::scanning && next == Operation::collecting) || next == Operation::activating || (operation == Operation::activating && (next == Operation::connected || next == Operation::accessPoint));
    if (valid) operation = next;
    return valid;
  }
  void fail(const std::string& error) { reason = error; transition(Operation::failed); }
  static uint32_t integer(const Value* v, char type = 'u') { return v && v->type == type ? static_cast<uint32_t>(v->number) : 0; }
  static std::string text(const Value* v, char type = 's') { return v && v->type == type ? v->text : ""; }
  using Callback = Bus::Callback;
  bool call(const std::string& path, const char* interface, const char* method, std::vector<Value> args, Callback cb) {
    uint64_t g = generation;
    bool sent = bus.call(destination, path, interface, method, std::move(args), [this, g, cb = std::move(cb)](const Reply& r) { if (g == generation) cb(r); });
    if (!sent) { fail("could not queue NetworkManager request"); if (phase == State::discovering) transition(State::failed); }
    return sent;
  }
  void all(const std::string& path, const char* interface, std::function<void(const Value&)> cb) {
    call(path, "org.freedesktop.DBus.Properties", "GetAll", {Value::string(interface)}, [this, cb = std::move(cb)](const Reply& r) {
      if (!r.ok()) { fail(r.error); if (phase == State::discovering) transition(State::failed); return; }
      if (r.signature != "a{sv}" || r.values.size() != 1 || r.values[0].type != 'a' || r.values[0].contents != "{sv}") { fail("invalid NetworkManager properties"); if (phase == State::discovering) transition(State::failed); return; }
      cb(r.values[0]);
    });
  }
  void wirelessProperties(const Value& p) {
    active = text(p.property("ActiveAccessPoint"), 'o');
    capabilities = integer(p.property("WirelessCapabilities"));
    const Value* scan = p.property("LastScan");
    if (scan && scan->type == 'x') {
      int64_t stamp = static_cast<int64_t>(scan->number);
      if (operation == Operation::scanning && stamp > lastScan) collect();
      lastScan = stamp;
    }
    if (!active.empty() && active != "/") all(active, apInterface, [this, path = active](const Value& ap) { if (active != path) return; ssid = byteArray(ap.property("Ssid")); strength = integer(ap.property("Strength"), 'y'); });
    else { ssid.clear(); strength = 0; }
  }
  void refresh() {
    if (phase != State::ready) return;
    uint64_t version = ++statusGeneration;
    all(device, deviceInterface, [this, version](const Value& p) {
      if (version != statusGeneration) return;
      deviceState = integer(p.property("State"));
      const Value* why = p.property("StateReason");
      if (deviceState == 120) fail("NetworkManager activation failed (reason " + std::to_string(why && why->type == 'r' && why->children.size() == 2 ? why->children[1].number : 0) + ")");
      observedConnection = text(p.property("ActiveConnection"), 'o');
      if (deviceState == 100 && !owned.empty() && observedConnection == owned && operation == Operation::activating) { transition(apRequested ? Operation::accessPoint : Operation::connected); reason.clear(); }
      std::string config = text(p.property("Ip4Config"), 'o');
      if (!config.empty() && config != "/") all(config, "org.freedesktop.NetworkManager.IP4Config", [this, version](const Value& c) {
        if (version != statusGeneration) return;
        ip.clear(); const auto* data = c.property("AddressData");
        if (data && data->type == 'a' && data->contents == "a{sv}" && !data->children.empty()) ip = text(data->children[0].property("address"));
      }); else ip.clear();
    });
    all(device, wireless, [this, version](const Value& p) { if (version == statusGeneration) wirelessProperties(p); });
  }
  void collect() {
    if (!transition(Operation::collecting)) return;
    uint64_t sg = scanGeneration;
    networks.clear();
    call(device, wireless, "GetAllAccessPoints", {}, [this, sg](const Reply& r) {
      if (sg != scanGeneration || operation != Operation::collecting) return;
      if (!r.ok() || r.signature != "ao" || r.values.size() != 1) { fail(r.ok() ? "invalid access point list" : r.error); return; }
      const auto& list = r.values[0];
      if (list.type != 'a' || list.contents != "o" || list.children.size() > 128) { fail("too many or invalid access points"); return; }
      outstanding = list.children.size();
      if (!outstanding) { transition(Operation::idle); return; }
      for (auto& item : list.children) {
        if (item.type != 'o' || !objectPath(item.text)) { fail("invalid access point path"); return; }
        std::string path = item.text;
        // Each reply (including an error) retires one outstanding lookup.
        call(path, "org.freedesktop.DBus.Properties", "GetAll", {Value::string(apInterface)}, [this, sg, path](const Reply& a) {
          if (sg != scanGeneration || operation != Operation::collecting) return;
          if (!a.ok() || a.signature != "a{sv}" || a.values.size() != 1) { fail(a.ok() ? "invalid access point" : a.error); return; }
          const auto& p = a.values[0]; Network n; n.path = path; n.ssid = byteArray(p.property("Ssid"));
          if (n.ssid.size() > 32 || !p.property("Ssid") || p.property("Ssid")->type != 'a' || p.property("Ssid")->contents != "y") { fail("invalid SSID"); return; }
          n.strength = integer(p.property("Strength"), 'y'); if (n.strength > 100) { fail("invalid access point strength"); return; } n.flags = integer(p.property("Flags")); n.wpa = integer(p.property("WpaFlags")); n.rsn = integer(p.property("RsnFlags"));
          networks.push_back(std::move(n)); if (--outstanding == 0) transition(Operation::idle);
        });
      }
    });
  }
  bool apRequested = false;
public:
  explicit NetworkManager(Api* injected = nullptr) : bus(injected) {}
  State state() const { return phase; }
  Operation activity() const { return operation; }
  const std::string& error() const { return reason; }
  const std::vector<Network>& results() const { return networks; }
  bool has() const { return phase == State::ready; }
  std::string status() const {
    if (phase == State::discovering || phase == State::idle) return "discovering";
    if (phase == State::absent) return "unsupported";
    if (phase == State::failed || operation == Operation::failed) return "failed";
    if (operation == Operation::activating) return "connecting";
    if (deviceState == 100) return apRequested && !owned.empty() && observedConnection == owned ? "setup" : "connected";
    return "off";
  }
  std::string info() const { return status() + "\t" + hex(ssid) + "\t" + ip + "\t" + std::to_string(strength); }
  void start() {
    if (phase == State::ready || phase == State::discovering) return;
    bus.stop(); ++generation; ++scanGeneration; device.clear(); active.clear(); owned.clear(); observedConnection.clear(); networks.clear(); ssid.clear(); ip.clear(); reason.clear(); deviceState = 0; apRequested = false; transition(Operation::idle);
    transition(State::discovering);
    if (!bus.start()) { reason = bus.error(); transition(State::failed); return; }
    uint64_t g = generation;
    if (!bus.match("type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.freedesktop.NetworkManager'", [this, g](const Reply& r) {
      if (g == generation && !r.ok()) { reason = r.error; transition(State::failed); return; }
      if (g == generation && r.signature == "sss" && r.values.size() == 3 && r.values[1].text != r.values[2].text) restart = true;
    }) || !bus.match("type='signal',sender='org.freedesktop.NetworkManager'", [this, g](const Reply& r) {
      if (g == generation && !r.ok()) { reason = r.error; transition(State::failed); return; }
      if (g != generation) return;
      if (r.interface == manager && r.signature == "o" && r.values.size() == 1 && r.values[0].type == 'o') {
        if ((r.member == "DeviceRemoved" && r.values[0].text == device) || (r.member == "DeviceAdded" && phase == State::absent)) restart = true;
        return;
      }
      if (r.interface != "org.freedesktop.DBus.Properties" || r.member != "PropertiesChanged" || r.path != device || r.signature != "sa{sv}as" || r.values.size() != 3) return;
      if (r.values[0].text == wireless) {
        const auto* scan = r.values[1].property("LastScan");
        if (scan && scan->type == 'x' && static_cast<int64_t>(scan->number) > lastScan && operation == Operation::scanning) collect();
      }
      nextStatus = {};
    })) { reason = "cannot subscribe to NetworkManager"; transition(State::failed); return; }
    deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    call(root, manager, "GetDevices", {}, [this](const Reply& r) {
      if (!r.ok() || r.signature != "ao" || r.values.size() != 1 || r.values[0].type != 'a' || r.values[0].contents != "o" || r.values[0].children.size() > 32) { reason = r.ok() ? "invalid NetworkManager devices" : r.error; transition(State::failed); return; }
      auto& devices = r.values[0].children; outstanding = devices.size();
      if (!outstanding) { transition(State::absent); return; }
      for (auto& p : devices) {
        if (p.type != 'o') { reason = "invalid device path"; transition(State::failed); return; }
        std::string path = p.text;
        all(path, deviceInterface, [this, path](const Value& properties) {
          if (phase != State::discovering) return;
          if (!properties.property("DeviceType") || properties.property("DeviceType")->type != 'u') { reason = "invalid NetworkManager device type"; transition(State::failed); return; }
          if (integer(properties.property("DeviceType")) == 2) {
            device = path; transition(State::ready); nextStatus = {};
          } else if (--outstanding == 0) transition(State::absent);
        });
      }
    });
  }
  void poll() {
    bus.poll();
    auto now = std::chrono::steady_clock::now();
    if (restart) { restart = false; stop(); start(); return; }
    if (bus.state() == Bus::State::failed && phase != State::closed) { reason = bus.error(); transition(State::failed); transition(Operation::failed); }
    if (phase == State::discovering && now > deadline) { reason = "NetworkManager discovery timed out"; transition(State::failed); }
    if ((operation == Operation::scanning || operation == Operation::collecting || operation == Operation::activating) && now > deadline) {
      if (operation == Operation::activating) { bus.stop(); ++generation; owned.clear(); transition(State::failed); }
      ++scanGeneration; fail("NetworkManager operation timed out");
    }
    if (phase == State::ready && now >= nextStatus) { nextStatus = now + std::chrono::seconds(1); refresh(); }
  }
  bool scan() {
    if (phase != State::ready || operation == Operation::activating) { reason = "Wi-Fi device is not ready or an activation is pending"; return false; }
    ++scanGeneration; reason.clear(); transition(Operation::scanning); networks.clear(); deadline = std::chrono::steady_clock::now() + std::chrono::seconds(20);
    return call(device, wireless, "RequestScan", {dictionary()}, [this, sg = scanGeneration](const Reply& r) { if (sg == scanGeneration && !r.ok()) fail(r.error); });
  }
  bool connect(const std::vector<uint8_t>& network, const std::string& password, bool ap = false) {
    if (operation == Operation::activating) { reason = "an activation is already pending"; return false; }
    if (phase != State::ready || network.empty() || network.size() > 32 || password.find('\0') != std::string::npos) { fail("expected a ready Wi-Fi device and SSID of 1..32 bytes"); return false; }
    const Network* chosen = nullptr;
    if (!ap) for (auto& n : networks) if (n.ssid == network && (!chosen || n.strength > chosen->strength)) chosen = &n;
    if (!ap && !chosen) { fail("scan and select a network before connecting"); return false; }
    if (ap && !(capabilities & 0x40)) { fail("adapter does not support access-point mode"); return false; }
    bool secure = ap ? !password.empty() : (chosen->flags & 1) || chosen->wpa || chosen->rsn;
    if (!ap && secure && !((chosen->wpa | chosen->rsn) & 0x100)) { fail("network does not support WPA-PSK; enterprise and WEP are unsupported"); return false; }
    if (secure && !((password.size() >= 8 && password.size() <= 63) || (password.size() == 64 && password.find_first_not_of("0123456789abcdefABCDEF") == std::string::npos))) { fail("WPA-PSK needs 8..63 characters or 64 hex digits"); return false; }
    if (!secure && !password.empty()) { fail("open network does not take a password"); return false; }
    auto section = [](std::string key, std::vector<Value> values) { return Value::container('e', "sa{sv}", {Value::string(std::move(key)), dictionary(std::move(values))}); };
    std::vector<Value> settings = {
      section("connection", {property("id", Value::string("Zinc temporary Wi-Fi")), property("type", Value::string("802-11-wireless")), property("autoconnect", Value::integer(0, 'b'))}),
      section("802-11-wireless", {property("ssid", bytes(network)), property("mode", Value::string(ap ? "ap" : "infrastructure"))}),
      section("ipv4", {property("method", Value::string(ap ? "shared" : "auto"))}),
      section("ipv6", {property("method", Value::string("disabled"))})
    };
    if (secure) settings.push_back(section("802-11-wireless-security", {property("key-mgmt", Value::string("wpa-psk")), property("psk", Value::string(password))}));
    ++scanGeneration; owned.clear(); transition(Operation::activating); reason.clear(); apRequested = ap; deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
    return call(root, manager, "AddAndActivateConnection2", {Value::container('a', "{sa{sv}}", std::move(settings)), Value::string(device, 'o'), Value::string(chosen ? chosen->path : "/", 'o'), dictionary({property("persist", Value::string("volatile")), property("bind-activation", Value::string("dbus-client"))})}, [this, sg = scanGeneration](const Reply& r) {
      if (sg != scanGeneration || operation != Operation::activating) return;
      if (!r.ok()) { fail(r.error); return; }
      if (r.signature != "ooa{sv}" || r.values.size() != 3 || r.values[1].type != 'o') { fail("invalid activation response"); return; }
      owned = r.values[1].text; nextStatus = {};
      // A successful method reply only starts activation. Device.State=100 is the completion.
    });
  }
  void disconnect() {
    if (operation == Operation::activating) { stop(); start(); return; }
    if (owned.empty() || phase != State::ready) return;
    ++scanGeneration; std::string path = owned; owned.clear(); apRequested = false;
    call(root, manager, "DeactivateConnection", {Value::string(path, 'o')}, [this](const Reply& r) { if (!r.ok()) fail(r.error); else transition(Operation::idle); });
  }
  void stop() { ++generation; ++scanGeneration; bus.stop(); transition(State::closed); transition(Operation::idle); device.clear(); owned.clear(); ssid.clear(); ip.clear(); networks.clear(); deviceState = 0; }
};
}
