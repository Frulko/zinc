#pragma once
#include "radio_dbus.h"
#include "ipod_usb_identity.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <map>
#include <set>
#include <thread>

namespace ipod::linux_mount {
using zinc::radio::Bus;
using zinc::radio::Reply;
using zinc::radio::Value;
inline constexpr const char* service = "org.freedesktop.UDisks2";
inline constexpr const char* root = "/org/freedesktop/UDisks2";
inline constexpr const char* blockInterface = "org.freedesktop.UDisks2.Block";
inline constexpr const char* driveInterface = "org.freedesktop.UDisks2.Drive";
inline constexpr const char* filesystemInterface = "org.freedesktop.UDisks2.Filesystem";
inline bool diskName(const std::string& s) { return !s.empty() && s.size() <= 64 && s.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789") == std::string::npos; }
inline std::string lower(std::string s) { for (char& c : s) if (c >= 'A' && c <= 'Z') c += 'a' - 'A'; return s; }
inline bool uniqueOwner(const std::string& s) {
  if (s.size() < 4 || s.size() > 255 || s[0] != ':') return false;
  bool digits = false; unsigned parts = 0;
  for (size_t i = 1; i < s.size(); ++i) {
    if (s[i] >= '0' && s[i] <= '9') digits = true;
    else if (s[i] == '.' && digits) { ++parts; digits = false; }
    else return false;
  }
  return digits && parts > 0;
}
struct Identity {
  std::string path, serial;
  uint16_t product = 0;
  bool operator==(const Identity& other) const { return path == other.path && serial == other.serial && product == other.product; }
};
inline bool field(const std::filesystem::path& path, std::string& out) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return false;
  char bytes[257]; const size_t n = std::fread(bytes, 1, sizeof bytes, file);
  const bool ok = !std::ferror(file) && n <= 256 && !std::memchr(bytes, 0, n);
  std::fclose(file);
  if (!ok) return false;
  out.assign(bytes, n);
  while (!out.empty() && (out.back() == '\n' || out.back() == '\r')) out.pop_back();
  return true;
}
inline bool hexWord(const std::string& s, uint16_t& out) {
  if (s.size() != 4) return false;
  out = 0;
  for (char c : lower(s)) {
    const int n = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
    if (n < 0) return false;
    out = static_cast<uint16_t>(out * 16 + n);
  }
  return true;
}
// Follow the block device's canonical ancestry, not a volume label or a guessed sdb2 partition.
inline bool usbIdentity(const std::filesystem::path& sys, const std::string& number, const std::string& name, Identity& out) {
  if (!diskName(name) || number.empty() || number.find_first_not_of("0123456789:") != std::string::npos || std::count(number.begin(), number.end(), ':') != 1) return false;
  std::error_code ec;
  const auto devices = std::filesystem::canonical(sys / "devices", ec);
  if (ec) return false;
  auto path = std::filesystem::canonical(sys / "dev/block" / number, ec);
  if (ec || path.filename() != name || path.string().compare(0, devices.string().size() + 1, devices.string() + "/") != 0) return false;
  std::string value;
  if (!field(path / "dev", value) || value != number) return false;
  for (unsigned depth = 0; depth < 32 && path != devices && path != path.root_path(); ++depth, path = path.parent_path()) {
    if (!field(path / "idVendor", value)) continue;
    uint16_t vendor = 0, product = 0;
    if (!hexWord(value, vendor) || vendor != 0x05ac || !field(path / "idProduct", value) || !hexWord(value, product) || !usb::diskModeIpod(product)) return false;
    if (!field(path / "serial", value) || value.empty() || value.size() > 128 || value.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_") != std::string::npos) return false;
    out = {path.string(), lower(value), product}; return true;
  }
  return false;
}
struct Candidate {
  std::string path, drive, device, serial, id, uuid, filesystem;
  uint64_t number = 0, detected = 0, size = 0;
  bool mounted = false, readOnly = false, configured = false;
  Identity usb;
  bool sameDevice(const Candidate& b) const { return path == b.path && drive == b.drive && device == b.device && serial == b.serial && id == b.id && uuid == b.uuid && filesystem == b.filesystem && number == b.number && detected == b.detected && size == b.size && readOnly == b.readOnly && configured == b.configured && usb == b.usb; }
};
using Identify = std::function<bool(const Candidate&, Identity&)>;
inline const Value* property(const Value& p, const char* key, char type) {
  const Value* v = p.property(key); return v && v->type == type ? v : nullptr;
}
inline bool validProperties(const Value& p) {
  if (p.type != 'a' || p.contents != "{sv}" || p.children.size() > 128) return false;
  std::set<std::string> keys;
  for (const auto& e : p.children) if (e.type != 'e' || e.contents != "sv" || e.children.size() != 2 || e.children[0].type != 's' || e.children[0].text.size() > 128 || !keys.insert(e.children[0].text).second || e.children[1].type != 'v' || e.children[1].children.size() != 1) return false;
  return true;
}
inline bool bytePath(const Value& v, std::string& path) {
  if (v.type != 'a' || v.contents != "y" || v.children.size() < 2 || v.children.size() > 1024) return false;
  path.clear();
  for (size_t i = 0; i < v.children.size(); ++i) {
    const auto& b = v.children[i];
    if (b.type != 'y' || b.number > 255 || (b.number == 0) != (i + 1 == v.children.size())) return false;
    if (b.number) path += static_cast<char>(b.number);
  }
  return !path.empty() && path[0] == '/';
}
inline bool select(const Reply& reply, const Identify& identify, Candidate& selected, std::string& error) {
  auto invalid = [&]() { error = "invalid or oversized UDisks device snapshot"; return false; };
  if (!reply.ok() || reply.signature != "a{oa{sa{sv}}}" || reply.values.size() != 1) return invalid();
  const auto& objects = reply.values[0];
  if (objects.type != 'a' || objects.contents != "{oa{sa{sv}}}" || objects.children.size() > 512) return invalid();
  using Interfaces = std::map<std::string, const Value*>;
  std::map<std::string, Interfaces> all;
  for (const auto& object : objects.children) {
    if (object.type != 'e' || object.contents != "oa{sa{sv}}" || object.children.size() != 2 || object.children[0].type != 'o') return invalid();
    const auto& path = object.children[0].text; const auto& interfaces = object.children[1];
    if (!zinc::radio::objectPath(path) || path.compare(0, std::strlen(root) + 1, std::string(root) + "/") != 0 || all.count(path) || interfaces.type != 'a' || interfaces.contents != "{sa{sv}}" || interfaces.children.size() > 32) return invalid();
    auto& row = all[path];
    for (const auto& entry : interfaces.children) {
      if (entry.type != 'e' || entry.contents != "sa{sv}" || entry.children.size() != 2 || entry.children[0].type != 's' || entry.children[0].text.size() > 128 || !validProperties(entry.children[1]) || !row.emplace(entry.children[0].text, &entry.children[1]).second) return invalid();
    }
  }
  std::vector<Candidate> candidates;
  for (const auto& object : all) {
    const auto bi = object.second.find(blockInterface), fi = object.second.find(filesystemInterface);
    if (bi == object.second.end() || fi == object.second.end()) continue;
    const Value& b = *bi->second;
    const auto drive = property(b, "Drive", 'o'), usage = property(b, "IdUsage", 's'), type = property(b, "IdType", 's');
    const auto number = property(b, "DeviceNumber", 't'), device = property(b, "Device", 'a'), ro = property(b, "ReadOnly", 'b'), size = property(b, "Size", 't'), uuid = property(b, "IdUUID", 's');
    const auto system = property(b, "HintSystem", 'b'), ignore = property(b, "HintIgnore", 'b');
    const auto raid = property(b, "MDRaid", 'o'), member = property(b, "MDRaidMember", 'o'), crypto = property(b, "CryptoBackingDevice", 'o');
    if (!drive || !usage || !type || !number || !device || !ro || !system || !ignore || !raid || !member || !crypto || !size || !uuid || ro->number > 1 || system->number > 1 || ignore->number > 1) return invalid();
    if (system->number || ignore->number || drive->text == "/" || raid->text != "/" || member->text != "/" || crypto->text != "/" || usage->text != "filesystem" || (type->text != "vfat" && type->text != "hfs" && type->text != "hfsplus")) continue;
    if (drive->text.rfind(std::string(root) + "/drives/", 0) != 0) return invalid();
    auto d = all.find(drive->text);
    if (d == all.end() || !d->second.count(driveInterface)) return invalid();
    const auto& dp = *d->second.at(driveInterface);
    const auto bus = property(dp, "ConnectionBus", 's'), serial = property(dp, "Serial", 's'), id = property(dp, "Id", 's'), detected = property(dp, "TimeDetected", 't');
    if (!bus || !serial || !id || !detected) return invalid();
    if (bus->text != "usb") continue;
    Candidate c; c.path = object.first; c.drive = drive->text; c.number = number->number; c.filesystem = type->text; c.serial = lower(serial->text); c.id = id->text; c.uuid = uuid->text; c.size = size->number; c.detected = detected->number; c.readOnly = ro->number != 0;
    if (!bytePath(*device, c.device) || c.device.compare(0, 5, "/dev/") != 0 || !diskName(c.device.substr(5))) return invalid();
    const auto name = c.device.substr(5);
    if (c.path != std::string(root) + "/block_devices/" + name) return invalid();
    if (name.compare(0, 4, "loop") == 0 || name.compare(0, 2, "dm") == 0 || name.compare(0, 2, "md") == 0) continue;
    if (c.serial.empty() || c.serial.size() > 128 || c.id.empty() || c.id.size() > 256 || c.uuid.size() > 256 || !identify(c, c.usb) || c.usb.serial != c.serial || !usb::diskModeIpod(c.usb.product)) continue;
    const auto points = property(*fi->second, "MountPoints", 'a');
    if (!points || points->contents != "ay" || points->children.size() > 16) return invalid();
    for (const auto& point : points->children) { std::string path; if (!bytePath(point, path)) return invalid(); c.mounted = true; }
    const auto config = property(b, "Configuration", 'a');
    if (!config || config->contents != "(sa{sv})" || config->children.size() > 64) return invalid();
    for (const auto& entry : config->children) {
      if (entry.type != 'r' || entry.contents != "sa{sv}" || entry.children.size() != 2 || entry.children[0].type != 's' || !validProperties(entry.children[1])) return invalid();
      c.configured = true;
    }
    // UDisks ignores supplied mount options for fstab entries, including our HFS read-only request.
    if (c.configured && !c.mounted) { error = "iPod filesystem has persistent mount configuration; mount it explicitly"; return false; }
    candidates.push_back(std::move(c));
  }
  if (candidates.size() != 1) { error = candidates.empty() ? "no identifiable iPod filesystem to mount; connect a disk-mode iPod" : "more than one iPod filesystem found; name the partition explicitly"; return false; }
  selected = std::move(candidates[0]); return true;
}

class Request {
public:
  enum class State { idle, subscribing, owner, watching, snapshot, revalidating, mounting, done, failed };
private:
  Bus bus;
  Identify identify;
  State phase = State::idle;
  std::string owner, failure;
  Candidate chosen;
  using Clock = std::chrono::steady_clock;
  Clock::time_point deadline;
  bool active() const { return phase != State::idle && phase != State::done && phase != State::failed; }
  bool transition(State next) {
    const bool valid = (phase == State::idle && next == State::subscribing) || (phase == State::subscribing && next == State::owner) || (phase == State::owner && next == State::watching) || (phase == State::watching && next == State::snapshot) || (phase == State::snapshot && next == State::revalidating) || (phase == State::revalidating && (next == State::mounting || next == State::done)) || (phase == State::mounting && next == State::done) || (active() && next == State::failed);
    if (valid) phase = next;
    return valid;
  }
  void fail(std::string message) {
    if (phase == State::mounting) message += "; mount outcome unknown, check the file manager before retrying";
    if (transition(State::failed)) failure = std::move(message);
  }
  void timedOut() { fail(phase == State::mounting ? "UDisks mount timed out" : "UDisks discovery timed out"); }
  uint64_t remaining() const {
    const auto n = std::chrono::duration_cast<std::chrono::microseconds>(deadline - Clock::now()).count();
    return n > 0 ? static_cast<uint64_t>(n) : 0;
  }
  void call(const char* destination, const std::string& path, const char* interface, const char* method, std::vector<Value> args, State expected, Bus::Callback callback) {
    if (!active()) return;
    if (!remaining()) { timedOut(); return; }
    if (!bus.call(destination, path, interface, method, std::move(args), [this, expected, callback](const Reply& reply) {
      if (phase != expected) return;
      if (!remaining()) { timedOut(); return; }
      if (!reply.ok()) {
        const bool missing = reply.error == "org.freedesktop.DBus.Error.NameHasNoOwner" || reply.error == "org.freedesktop.DBus.Error.ServiceUnknown";
        fail(missing ? "UDisks service unavailable" : std::string("UDisks ") + reply.error); return;
      }
      callback(reply);
    }, remaining())) fail("cannot queue UDisks request");
  }
  void changed(const Reply& reply) {
    if (!active()) return;
    if (!reply.ok()) { fail("cannot monitor UDisks objects"); return; }
    if (reply.member == "InterfacesAdded" || reply.member == "InterfacesRemoved") {
      if (reply.values.empty() || reply.values[0].type != 'o') { fail("invalid UDisks topology signal"); return; }
      const std::string& path = reply.values[0].text;
      if (path.rfind(std::string(root) + "/block_devices/", 0) == 0 || path.rfind(std::string(root) + "/drives/", 0) == 0) fail("UDisks device topology changed; retry discovery");
      return;
    }
    if (reply.member != "PropertiesChanged" || (reply.path != chosen.path && reply.path != chosen.drive && phase != State::snapshot)) return;
    // Mount itself changes MountPoints. Other selected-device changes invalidate the snapshot.
    if (phase == State::mounting && reply.signature == "sa{sv}as" && reply.values.size() == 3 && reply.values[0].type == 's' && validProperties(reply.values[1]) && reply.values[2].type == 'a' && reply.values[2].contents == "s") {
      const char* allowed = reply.values[0].text == filesystemInterface ? "MountPoints" : reply.values[0].text == blockInterface ? "UserspaceMountOptions" : "";
      bool onlyMounts = true;
      for (const auto& p : reply.values[1].children) onlyMounts = onlyMounts && p.children[0].text == allowed;
      for (const auto& p : reply.values[2].children) onlyMounts = onlyMounts && p.type == 's' && p.text == allowed;
      if (onlyMounts) return;
    }
    fail("UDisks device properties changed; retry discovery");
  }
  void snapshot(bool again) {
    const State expected = again ? State::revalidating : State::snapshot;
    call(owner.c_str(), root, "org.freedesktop.DBus.ObjectManager", "GetManagedObjects", {}, expected, [this, again](const Reply& reply) {
      Candidate candidate; std::string error;
      const bool found = select(reply, [this](const Candidate& c, Identity& usb) { return remaining() && identify(c, usb); }, candidate, error);
      if (!remaining()) { timedOut(); return; }
      if (!found) { fail(error); return; }
      if (!again) { chosen = std::move(candidate); transition(State::revalidating); snapshot(true); return; }
      if (!chosen.sameDevice(candidate)) { fail("iPod identity changed before mounting"); return; }
      if (candidate.mounted) { transition(State::done); return; }
      Identity current;
      if (!identify(candidate, current) || !(current == candidate.usb)) { fail("iPod USB identity changed before mounting"); return; }
      std::vector<Value> options = {zinc::radio::property("auth.no_user_interaction", Value::integer(1, 'b'))};
      if (candidate.readOnly || candidate.filesystem == "hfs" || candidate.filesystem == "hfsplus") options.push_back(zinc::radio::property("options", Value::string("ro")));
      transition(State::mounting);
      call(owner.c_str(), chosen.path, filesystemInterface, "Mount", {zinc::radio::dictionary(std::move(options))}, State::mounting, [this](const Reply& result) {
        if (result.signature != "s" || result.values.size() != 1 || result.values[0].type != 's' || result.values[0].text.empty() || result.values[0].text.size() > 1024 || result.values[0].text[0] != '/') { fail("invalid UDisks mount reply"); return; }
        transition(State::done);
      });
    });
  }
public:
  Request(Identify reader, zinc::radio::Api* api = nullptr) : bus(api), identify(std::move(reader)) {}
  State state() const { return phase; }
  const std::string& error() const { return failure; }
  bool start(std::chrono::milliseconds timeout = std::chrono::seconds(10)) {
    if (!transition(State::subscribing)) return false;
    deadline = Clock::now() + timeout;
    if (!bus.start()) { fail(bus.error()); return false; }
    if (!bus.match("type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.freedesktop.UDisks2'", [this](const Reply&) { fail("UDisks owner changed; retry discovery"); }, [this](const Reply& reply) {
      if (phase != State::subscribing) return;
      if (!reply.ok()) { fail("cannot monitor UDisks service owner"); return; }
      transition(State::owner);
      call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetNameOwner", {Value::string(service)}, State::owner, [this](const Reply& result) {
        if (result.signature != "s" || result.values.size() != 1 || result.values[0].type != 's') { fail("invalid UDisks owner reply"); return; }
        owner = result.values[0].text;
        if (!uniqueOwner(owner)) { fail("invalid UDisks unique owner"); return; }
        transition(State::watching);
        if (!bus.match("type='signal',sender='" + owner + "',path_namespace='/org/freedesktop/UDisks2'", [this](const Reply& r) { changed(r); }, [this](const Reply& r) {
          if (phase != State::watching) return;
          if (!r.ok()) { fail("cannot monitor UDisks devices"); return; }
          transition(State::snapshot); snapshot(false);
        })) fail("cannot monitor UDisks devices");
      });
    })) { fail("cannot monitor UDisks service owner"); return false; }
    return true;
  }
  void poll() {
    if (!active()) return;
    if (!remaining()) { timedOut(); return; }
    bus.poll();
    if (bus.state() == Bus::State::failed) fail(bus.error());
  }
  bool run(std::string& error) {
    if (!start()) { error = failure; return false; }
    while (active()) { poll(); if (active()) std::this_thread::sleep_for(std::chrono::milliseconds(2)); }
    if (phase == State::done) return true;
    error = failure; return false;
  }
};
}
