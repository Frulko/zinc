#pragma once
#include "radio_dbus.h"
#include <algorithm>
#include <chrono>
#include <charconv>
#include <climits>
#include <deque>
#include <map>
#include <set>

namespace zinc::radio {
class BlueZ {
public:
  static constexpr const char* UART = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  static constexpr const char* RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
  static constexpr const char* TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
  enum class State { idle, discovering, ready, stopping, failed, closed };
  enum class Scan { idle, filtering, starting, active, stopping };
private:
  using Interfaces = std::map<std::string, Value>;
  struct Device { std::string id; };
  struct Attribute {
    int id, service;
    std::string path, uuid;
    std::vector<std::string> flags;
    std::deque<std::vector<uint8_t>> earlyValues;
    size_t earlyBytes=0;
    enum class Notify { off, starting, on, stopping } notify = Notify::off;
    bool notifyTo(Notify next) {
      bool ok = (notify == Notify::off && next == Notify::starting) || (notify == Notify::starting && (next == Notify::on || next == Notify::off)) ||
        (notify == Notify::on && next == Notify::stopping) || (notify == Notify::stopping && (next == Notify::off || next == Notify::on));
      if (ok) notify = next;
      return ok;
    }
  };
  struct Operation {
    enum class State { queued, pending, cancelled } state = State::queued;
    int id, attribute, kind;
    std::vector<uint8_t> data;
    enum class Audience { caller, cleanup } audience = Audience::caller;
    bool transition(State next) {
      bool ok = (state == State::queued && next == State::pending) || (state != State::cancelled && next == State::cancelled);
      if (ok) state = next;
      return ok;
    }
  };
  struct Link {
    enum class State { connecting, resolving, subscribing, open, closing, closed } phase = State::connecting;
    enum class Ownership { pending, acknowledged } ownership = Ownership::pending;
    bool acknowledge() { if (ownership != Ownership::pending) return false; ownership = Ownership::acknowledged; return true; }
    enum class Mode { uart, gatt } mode = Mode::uart;
    int h;
    std::map<int, Attribute> attributes;
    std::deque<Operation> operations;
    std::string device, id, name, service, rx, tx;
    std::deque<std::vector<uint8_t>> outgoing;
    std::vector<uint8_t> incoming;
    size_t queued = 0;
    enum class Write { idle, pending } write = Write::idle;
    bool writeTo(Write next) { if (write == next) return false; write = next; return true; }
    std::chrono::steady_clock::time_point deadline;
    bool transition(State next) {
      bool ok = next == State::closed || (next == State::closing && phase != State::closed && phase != State::closing) || (phase == State::connecting && next == State::resolving) ||
        (phase == State::resolving && (next == State::subscribing || next == State::open)) || (phase == State::subscribing && next == State::open);
      if (ok) phase = next;
      return ok;
    }
  };
  Bus bus;
  State phase = State::idle;
  Scan scanning = Scan::idle;
  uint64_t epoch = 0, scanEpoch = 0, requestedScan = 0, currentScan = 0, nextDevice = 1;
  enum class ScanRequest { stopped, scanning } scanRequest = ScanRequest::stopped;
  int nextHandle = 1, nextAttribute = 1, nextOperation = 1;
  enum class EventState { healthy, overflow } gattEventState = EventState::healthy;
  std::string gattOut;
  void eventStateTo(EventState next) { gattEventState = next; }
  void gattEmit(const std::string& row) {
    if (gattOut.size() + row.size() <= 65536 && gattEventState == EventState::healthy) gattOut += row;
    else { error("BLE GATT event limit exceeded"); eventStateTo(EventState::overflow); }
  }
  void discardGatt(int h) {
    std::string keep, prefix = std::to_string(h) + '\t'; size_t at = 0;
    while (at < gattOut.size()) { auto end = gattOut.find('\n',at); if (end == std::string::npos) break;
      auto row = gattOut.substr(at,end-at+1); if (row.rfind(prefix,0)!=0) keep += row; at = end+1; }
    gattOut = std::move(keep);
  }
  size_t disconnects = 0, pendingGatt = 0;
  std::string adapter, reason, eventsOut, observations;
  std::map<std::string, Interfaces> objects;
  std::map<std::string, Device> identities;
  std::map<int, Link> links;
  std::vector<Reply> bootstrapSignals;
  size_t bootstrapBytes = 0;
  std::vector<std::string> filter, requestedFilter;
  bool transition(State next) {
    bool ok = next == State::closed || next == State::failed || next == State::stopping ||
      ((phase == State::idle || phase == State::closed || phase == State::failed) && next == State::discovering) ||
      (phase == State::discovering && next == State::ready);
    if (ok) phase = next;
    return ok;
  }
  void requestScan(ScanRequest next) { scanRequest = next; }
  bool scanTo(Scan next) {
    bool ok = next == Scan::idle || (scanning == Scan::idle && next == Scan::filtering) ||
      (scanning == Scan::filtering && next == Scan::starting) || (scanning == Scan::starting && next == Scan::active) ||
      (scanning == Scan::active && next == Scan::stopping);
    if (ok) scanning = next;
    return ok;
  }
  static bool rooted(const std::string& path) { return (path == "/org/bluez" || path.rfind("/org/bluez/",0)==0) && objectPath(path); }
  static std::string clean(std::string s) {
    for (char& c : s) if (c == '\x1e' || c == '\x1f') c = ' ';
    if (s.size() > 1024) { size_t n = 1024; while ((static_cast<unsigned char>(s[n]) & 0xc0) == 0x80) --n; s.resize(n); }
    return s;
  }
  static std::string encoded(const std::string& s) { return hex(std::vector<uint8_t>(s.begin(), s.end())); }
  static std::string text(const Value* v) { return v && (v->type == 's' || v->type == 'o') ? v->text : ""; }
  static bool flag(const Value* v) { return v && v->type == 'b' && v->number == 1; }
  static std::vector<std::string> strings(const Value* v) {
    std::vector<std::string> r; if (v && v->type == 'a' && v->contents == "s") for (auto& s : v->children) { if (s.type != 's') return {}; r.push_back(s.text); } return r;
  }
  const Value* prop(const std::string& path, const char* iface, const char* key) const {
    auto o = objects.find(path); if (o == objects.end()) return nullptr;
    auto i = o->second.find(iface); return i == o->second.end() ? nullptr : i->second.property(key);
  }
  bool call(const std::string& path, const char* iface, const char* member, std::vector<Value> args, Bus::Callback cb) {
    uint64_t generation = epoch;
    return bus.call("org.bluez", path, iface, member, std::move(args), [this, generation, cb = std::move(cb)](const Reply& r) { if (generation == epoch) cb(r); });
  }
  void error(const std::string& s) { reason = s; }
  void push(const std::string& s) {
    if (eventsOut.size() + s.size() > 65536 && s.rfind("device\x1f",0)!=0) clearScanEvents();
    if (eventsOut.size() + s.size() <= 65536) eventsOut += s; else error("BLE event queue limit exceeded");
  }
  void clearScanEvents() {
    std::string keep; size_t at = 0;
    while (at < eventsOut.size()) { auto end = eventsOut.find('\x1e',at); if (end == std::string::npos) break;
      auto row = eventsOut.substr(at,end-at+1); if (row.rfind("device\x1f",0)!=0) keep += row; at = end+1; }
    eventsOut = std::move(keep);
  }
  void record(const char* kind, const Link& l) { push(std::string(kind) + '\x1f' + std::to_string(l.h) + '\x1f' + l.id + '\x1f' + clean(l.name) + '\x1e'); }
  static size_t footprint(const Value& v) {
    size_t n = sizeof(Value) + v.text.size() + v.contents.size();
    for (auto& c : v.children) n += footprint(c);
    return n;
  }
  bool cacheBounded() const {
    size_t bytes = 0; for (auto& o : objects) for (auto& i : o.second) { bytes += footprint(i.second); if (bytes > 4194304) return false; } return true;
  }
  static bool knownInterface(const std::string& name) {
    return name == "org.bluez.Adapter1" || name == "org.bluez.Device1" || name == "org.bluez.GattService1" || name == "org.bluez.GattCharacteristic1" || name == "org.bluez.GattManager1" || name == "org.bluez.LEAdvertisingManager1";
  }
  bool interfaces(const Value& value, Interfaces& out) {
    if (value.type != 'a' || value.contents != "{sa{sv}}" || value.children.size() > 32) return false;
    for (auto& e : value.children) {
      if (e.type != 'e' || e.children.size() != 2 || e.children[0].type != 's' || e.children[1].type != 'a' || e.children[1].contents != "{sv}") return false;
      if (!knownInterface(e.children[0].text)) continue;
      if (e.children[1].children.size() > 64 || footprint(e.children[1]) > 262144) return false;
      out[e.children[0].text] = e.children[1];
    }
    return true;
  }
  enum class Cleanup { drain, expired };
  void finish(int h, bool event, bool disconnect = true, Cleanup cleanup = Cleanup::drain) {
    auto p = links.find(h); if (p == links.end()) return;
    if (disconnect && p->second.ownership == Link::Ownership::pending) {
      if (p->second.phase != Link::State::closing) {
        if (event) { if (p->second.mode == Link::Mode::gatt) { discardGatt(h); gattEmit(std::to_string(h)+"\tclose\t"+encoded(reason)+"\n"); } else record("close", p->second); }
        p->second.transition(Link::State::closing); p->second.incoming.clear(); p->second.outgoing.clear(); p->second.operations.clear(); p->second.attributes.clear(); p->second.queued = 0;
      }
      return; // Wait for our own Connect reply; never disconnect a raced foreign connection on an error.
    }
    if (disconnect && cleanup == Cleanup::drain && p->second.mode == Link::Mode::gatt && p->second.ownership == Link::Ownership::acknowledged) {
      auto& l=p->second;
      if (l.phase!=Link::State::closing) {
        discardGatt(h); if(event)gattEmit(std::to_string(h)+"\tclose\t"+encoded(reason)+"\n");
        l.transition(Link::State::closing); l.deadline=std::chrono::steady_clock::now()+std::chrono::seconds(30);
      }
      for(auto i=l.operations.begin();i!=l.operations.end();) {
        if(i->state!=Operation::State::queued) { i->transition(Operation::State::cancelled); ++i; continue; }
        auto a=l.attributes.find(i->attribute);
        if(a!=l.attributes.end() && i->kind>=3) a->second.notifyTo(i->kind==3?Attribute::Notify::off:Attribute::Notify::on);
        i=l.operations.erase(i);
      }
      for(auto& a:l.attributes) { a.second.earlyValues.clear(); a.second.earlyBytes=0; }
      if(!l.operations.empty()) return;
      for(auto& a:l.attributes) if(a.second.notify==Attribute::Notify::on) {
        a.second.notifyTo(Attribute::Notify::stopping);
        Operation cleanup{Operation::State::queued,0,a.first,4,{}};cleanup.audience=Operation::Audience::cleanup;l.operations.push_front(std::move(cleanup));return;
      }
    }
    Link l = std::move(p->second); bool wasClosing = l.phase == Link::State::closing; l.transition(Link::State::closed); links.erase(p);
    if (l.mode == Link::Mode::gatt) { if (!wasClosing) discardGatt(h); if (event && !wasClosing) gattEmit(std::to_string(h)+"\tclose\t"+encoded(reason)+"\n"); }
    else if (event) record("close", l);
    if (disconnect && l.ownership == Link::Ownership::acknowledged && objects.count(l.device)) {
      ++disconnects;
      if (!call(l.device,"org.bluez.Device1","Disconnect",{},[this](const Reply& r) { if (disconnects) --disconnects; if (!r.ok()) error(r.error); })) { --disconnects; error("BLE disconnect request failed"); }
    }
  }
  void finishStop() {
    ++epoch; ++scanEpoch; bus.stop(); objects.clear(); identities.clear(); adapter.clear(); bootstrapSignals.clear(); bootstrapBytes = 0; scanTo(Scan::idle); transition(State::closed);
    if (scanRequest == ScanRequest::scanning) start();
  }
  void fail(const std::string& why) {
    error(why); ++epoch; ++scanEpoch; disconnects = 0; pendingGatt = 0; scanTo(Scan::idle);
    std::vector<int> hs; for (auto& l : links) hs.push_back(l.first); for (int h : hs) finish(h, true, false);
    objects.clear(); identities.clear(); adapter.clear(); observations.clear(); bootstrapSignals.clear(); bootstrapBytes = 0; bus.stop(); transition(State::failed);
  }
  void chooseAdapter() {
    if (!adapter.empty() && objects.count(adapter) && objects.at(adapter).count("org.bluez.Adapter1")) return;
    adapter.clear();
    for (auto& o : objects) if (o.second.count("org.bluez.Adapter1")) { adapter = o.first; break; }
  }
  static bool uuidValid(const std::string& uuid) {
    if (uuid.size() != 36) return false;
    for (size_t i=0;i<uuid.size();++i) if ((i==8 || i==13 || i==18 || i==23) ? uuid[i]!='-' : !((uuid[i]>='0' && uuid[i]<='9') || (uuid[i]>='a' && uuid[i]<='f'))) return false;
    return true;
  }
  bool matches(const std::string& path) const {
    if (filter.empty()) return true;
    auto uuids = strings(prop(path, "org.bluez.Device1", "UUIDs"));
    for (auto& s : filter) if (std::find(uuids.begin(), uuids.end(), s) != uuids.end()) return true;
    return false;
  }
  void sighted(const std::string& path) {
    if (scanning != Scan::active || scanRequest != ScanRequest::scanning || currentScan != requestedScan || !matches(path) || text(prop(path, "org.bluez.Device1", "Adapter")) != adapter) return;
    auto identity = identities.find(path); if (identity == identities.end()) return;
    std::string name = text(prop(path, "org.bluez.Device1", "Name"));
    const auto* rv = prop(path, "org.bluez.Device1", "RSSI"); int rssi = rv && rv->type == 'n' ? static_cast<int16_t>(rv->number) : 127;
    const auto& id = identity->second.id;
    if (filter.size() == 1 && filter[0] == UART) push("device\x1f-1\x1f" + id + '\x1f' + clean(name) + '\x1f' + std::to_string(rssi) + '\x1e');
    std::string row = id + '\t' + encoded(name) + '\t' + std::to_string(rssi) + '\t';
    auto uuids = strings(prop(path, "org.bluez.Device1", "UUIDs"));
    for (auto& u : uuids) row += encoded(u) + ',';
    row += '\t';
    const auto* manufacturer = prop(path, "org.bluez.Device1", "ManufacturerData");
    if (manufacturer && manufacturer->type == 'a' && manufacturer->contents == "{qv}") for (auto& e : manufacturer->children)
      if (e.type == 'e' && e.children.size() == 2 && e.children[0].type == 'q' && e.children[1].type == 'v' && e.children[1].children.size() == 1)
        row += std::to_string(e.children[0].number) + '=' + hex(byteArray(&e.children[1].children[0])) + ',';
    row += '\t';
    const auto* service = prop(path, "org.bluez.Device1", "ServiceData");
    if (service && service->type == 'a' && service->contents == "{sv}") for (auto& e : service->children)
      if (e.type == 'e' && e.children.size() == 2 && e.children[0].type == 's' && e.children[1].type == 'v' && e.children[1].children.size() == 1)
        row += encoded(e.children[0].text) + '=' + hex(byteArray(&e.children[1].children[0])) + ',';
    row += '\t';
    const auto* raw = prop(path, "org.bluez.Device1", "AdvertisingData");
    if (raw && raw->type == 'a' && raw->contents == "{yv}") for (auto& e : raw->children)
      if (e.type == 'e' && e.children.size() == 2 && e.children[0].type == 'y' && e.children[1].type == 'v' && e.children[1].children.size() == 1)
        row += std::to_string(e.children[0].number) + '=' + hex(byteArray(&e.children[1].children[0])) + ',';
    row += '\n';
    if (row.size() <= 8192 && observations.size() + row.size() <= 65536) observations += row; else error("BLE advertisement queue limit exceeded");
  }
  void updateIdentities() {
    for (auto it = identities.begin(); it != identities.end();) {
      auto o = objects.find(it->first); if (o == objects.end() || !o->second.count("org.bluez.Device1")) it = identities.erase(it); else ++it;
    }
    for (auto& o : objects) if (o.second.count("org.bluez.Device1") && !identities.count(o.first) && identities.size() < 256)
      identities.emplace(o.first, Device{"bluez:" + std::to_string(nextDevice++)});
    chooseAdapter();
  }
  void resolved(int h) {
    auto it = links.find(h); if (it == links.end() || it->second.phase != Link::State::resolving) return;
    Link& l = it->second;
    if (!flag(prop(l.device, "org.bluez.Device1", "Connected")) || !flag(prop(l.device, "org.bluez.Device1", "ServicesResolved"))) return;
    if (l.mode == Link::Mode::gatt) {
      for (auto& o : objects) if (text(prop(o.first,"org.bluez.GattService1","Device")) == l.device) {
        auto uuid = text(prop(o.first,"org.bluez.GattService1","UUID")); if (!uuidValid(uuid) || nextAttribute == INT_MAX) { error("invalid GATT service"); finish(h,true); return; }
        int id = nextAttribute++; l.attributes.emplace(id,Attribute{id,0,o.first,uuid,{},{},0});
      }
      std::vector<Attribute> chars; size_t treeBytes=l.attributes.size()*80;
      for (auto& o : objects) for (auto& service : l.attributes) if (text(prop(o.first,"org.bluez.GattCharacteristic1","Service")) == service.second.path) {
        auto uuid = text(prop(o.first,"org.bluez.GattCharacteristic1","UUID")); auto flags = strings(prop(o.first,"org.bluez.GattCharacteristic1","Flags"));
        if (flags.size()>32 || std::any_of(flags.begin(),flags.end(),[](const std::string& f){ return f.size()>64; })) { error("GATT flags exceed limit"); finish(h,true); return; }
        treeBytes+=80; for(auto& f:flags) treeBytes+=f.size()*2+1;
        if (treeBytes>65536) { error("GATT tree exceeds 64 KiB"); finish(h,true); return; }
        if (!uuidValid(uuid) || flags.empty() || nextAttribute == INT_MAX || l.attributes.size()+chars.size() >= 256) { error("invalid GATT characteristic"); finish(h,true); return; }
        chars.push_back(Attribute{nextAttribute++,service.first,o.first,uuid,std::move(flags),{},0});
      }
      for (auto& c : chars) l.attributes.emplace(c.id,std::move(c));
      l.transition(Link::State::open); gattEmit(std::to_string(h)+"\topen\n"); return;
    }
    std::string service;
    for (auto& o : objects) if (text(prop(o.first, "org.bluez.GattService1", "Device")) == l.device && text(prop(o.first, "org.bluez.GattService1", "UUID")) == UART) { service = o.first; break; }
    if (service.empty()) return;
    for (auto& o : objects) if (text(prop(o.first, "org.bluez.GattCharacteristic1", "Service")) == service) {
      auto uuid = text(prop(o.first, "org.bluez.GattCharacteristic1", "UUID")); auto flags = strings(prop(o.first, "org.bluez.GattCharacteristic1", "Flags"));
      if (uuid == RX && (std::find(flags.begin(), flags.end(), "write") != flags.end() || std::find(flags.begin(), flags.end(), "write-without-response") != flags.end())) l.rx = o.first;
      if (uuid == TX && std::find(flags.begin(), flags.end(), "notify") != flags.end()) l.tx = o.first;
    }
    if (l.rx.empty() || l.tx.empty()) return;
    l.service = service;
    l.transition(Link::State::subscribing);
    if (!call(l.tx, "org.bluez.GattCharacteristic1", "StartNotify", {}, [this,h](const Reply& r) {
      auto p = links.find(h); if (p == links.end() || p->second.phase != Link::State::subscribing) return;
      if (!r.ok()) { error(r.error); finish(h, true); return; }
      p->second.transition(Link::State::open); record("open", p->second);
    })) { error("BLE notify request failed"); finish(h, true); }
  }
  void changed(const Reply& r) {
    if (!r.ok()) { fail(r.error); return; }
    if (r.member == "NameOwnerChanged") { if (r.signature == "sss" && r.values.size() == 3 && r.values[0].text == "org.bluez" && r.values[1].text != r.values[2].text) fail("BlueZ owner changed"); return; }
    if (r.member == "InterfacesAdded") {
      if (r.signature != "oa{sa{sv}}" || r.values.size() != 2 || !rooted(r.values[0].text)) return;
      Interfaces added; if (!interfaces(r.values[1], added)) { fail("invalid BlueZ interfaces"); return; }
      if (!objects.count(r.values[0].text) && objects.size() >= 256) { error("BLE object limit exceeded"); return; }
      for (auto& i : added) objects[r.values[0].text][i.first] = std::move(i.second);
      if (!cacheBounded()) { fail("BLE object cache limit exceeded"); return; }
      updateIdentities(); sighted(r.values[0].text);
    } else if (r.member == "InterfacesRemoved") {
      if (r.signature != "oas" || r.values.size() != 2) return;
      auto o = objects.find(r.values[0].text); if (o == objects.end()) return;
      for (auto& s : strings(&r.values[1])) o->second.erase(s);
      if (o->second.empty()) objects.erase(o);
      updateIdentities();
    } else if (r.member == "PropertiesChanged") {
      if (r.signature != "sa{sv}as" || r.values.size() != 3) return;
      auto o = objects.find(r.path); if (o == objects.end()) return;
      auto i = o->second.find(r.values[0].text); if (i == o->second.end()) return;
      const auto& changes = r.values[1]; if (changes.type != 'a' || changes.contents != "{sv}") { fail("invalid BlueZ properties"); return; }
      auto& entries = i->second.children;
      for (auto& e : changes.children) {
        if (e.type != 'e' || e.children.size() != 2 || e.children[0].type != 's') { fail("invalid BlueZ property"); return; }
        entries.erase(std::remove_if(entries.begin(), entries.end(), [&](const Value& x) { return x.children.size() == 2 && x.children[0].text == e.children[0].text; }), entries.end()); entries.push_back(e);
      }
      for (auto& key : strings(&r.values[2])) entries.erase(std::remove_if(entries.begin(), entries.end(), [&](const Value& x) { return x.children.size() == 2 && x.children[0].text == key; }), entries.end());
      if (entries.size() > 64 || footprint(i->second) > 262144) { fail("BLE property cache limit exceeded"); return; }
      if (!cacheBounded()) { fail("BLE object cache limit exceeded"); return; }
      sighted(r.path);
      if (r.values[0].text == "org.bluez.GattCharacteristic1") {
        const auto* v = changes.property("Value");
        if (v) for (auto& l : links) if (l.second.mode == Link::Mode::gatt && l.second.phase == Link::State::open) for (auto& a : l.second.attributes)
          if (a.second.service && a.second.path == r.path && a.second.notify != Attribute::Notify::off) {
            auto b = byteArray(v); if (v->type!='a' || v->contents!="y" || b.size()!=v->children.size() || b.size() > 512) { error("GATT notification exceeds 512 bytes"); eventStateTo(EventState::overflow); }
            else if (a.second.notify == Attribute::Notify::starting) {
              if(a.second.earlyValues.size()>=64 || a.second.earlyBytes+b.size()>16384) { error("GATT early notification limit exceeded"); eventStateTo(EventState::overflow); }
              else { a.second.earlyBytes+=b.size(); a.second.earlyValues.push_back(std::move(b)); }
            } else gattEmit(std::to_string(l.first)+"\tvalue\t"+std::to_string(a.first)+"\t"+hex(b)+"\n");
          }
        if (v) for (auto& l : links) if (l.second.tx == r.path && l.second.phase == Link::State::open) {
          auto b = byteArray(v); if (l.second.incoming.size() + b.size() <= 65536) l.second.incoming.insert(l.second.incoming.end(), b.begin(), b.end()); else { error("BLE receive limit exceeded"); finish(l.first, true); break; }
        }
      }
    }
    if (!adapter.empty() && !flag(prop(adapter,"org.bluez.Adapter1","Powered"))) {
      ++scanEpoch; requestScan(ScanRequest::stopped); scanTo(Scan::idle); observations.clear(); clearScanEvents();
      std::vector<int> closed; for (auto& l : links) closed.push_back(l.first); for (int h : closed) finish(h,true,false);
    }
    std::vector<int> hs; for (auto& l : links) hs.push_back(l.first);
    for (int h : hs) {
      auto p = links.find(h); if (p == links.end()) continue;
      auto invalidated = r.values.size() == 3 ? strings(&r.values[2]) : std::vector<std::string>{};
      bool disconnected = r.member == "PropertiesChanged" && r.path == p->second.device && r.values[0].text == "org.bluez.Device1" &&
        ((r.values[1].property("Connected") && !flag(r.values[1].property("Connected"))) ||
         std::find(invalidated.begin(),invalidated.end(),"Connected") != invalidated.end());
      auto& l = p->second;
      bool invalidGatt = false;
      if (l.mode == Link::Mode::gatt && l.phase == Link::State::open) {
        invalidGatt = !flag(prop(l.device,"org.bluez.Device1","ServicesResolved"));
        size_t expectedServices=0, expectedChars=0, actualServices=0, actualChars=0;
        for (auto& a : l.attributes) if (a.second.service) ++expectedChars; else ++expectedServices;
        std::set<std::string> servicePaths;
        for (auto& o : objects) if (text(prop(o.first,"org.bluez.GattService1","Device"))==l.device) { ++actualServices; servicePaths.insert(o.first); }
        for (auto& o : objects) if (servicePaths.count(text(prop(o.first,"org.bluez.GattCharacteristic1","Service")))) ++actualChars;
        invalidGatt = invalidGatt || actualServices!=expectedServices || actualChars!=expectedChars;
        for (auto& a : l.attributes) {
          auto& node = a.second; const char* iface = node.service ? "org.bluez.GattCharacteristic1" : "org.bluez.GattService1";
          invalidGatt = invalidGatt || text(prop(node.path,iface,"UUID")) != node.uuid;
          if (node.service) invalidGatt = invalidGatt || !l.attributes.count(node.service) || text(prop(node.path,iface,"Service")) != l.attributes.at(node.service).path || strings(prop(node.path,iface,"Flags")) != node.flags;
          else invalidGatt = invalidGatt || text(prop(node.path,iface,"Device")) != l.device;
        }
      }
      if (!l.service.empty()) {
        auto rxFlags = strings(prop(l.rx,"org.bluez.GattCharacteristic1","Flags"));
        auto txFlags = strings(prop(l.tx,"org.bluez.GattCharacteristic1","Flags"));
        invalidGatt = !flag(prop(l.device,"org.bluez.Device1","ServicesResolved")) || text(prop(l.service,"org.bluez.GattService1","Device")) != l.device || text(prop(l.service,"org.bluez.GattService1","UUID")) != UART ||
          text(prop(l.rx,"org.bluez.GattCharacteristic1","UUID")) != RX || text(prop(l.tx,"org.bluez.GattCharacteristic1","UUID")) != TX ||
          text(prop(l.rx,"org.bluez.GattCharacteristic1","Service")) != l.service || text(prop(l.tx,"org.bluez.GattCharacteristic1","Service")) != l.service ||
          (std::find(rxFlags.begin(),rxFlags.end(),"write") == rxFlags.end() && std::find(rxFlags.begin(),rxFlags.end(),"write-without-response") == rxFlags.end()) ||
          std::find(txFlags.begin(),txFlags.end(),"notify") == txFlags.end();
      }
      if (invalidGatt) { error("BLE characteristic identity changed"); finish(h,true,!disconnected && flag(prop(l.device,"org.bluez.Device1","Connected"))); continue; }
      if (!identities.count(p->second.device) || (disconnected && p->second.ownership == Link::Ownership::acknowledged) ||
          (!p->second.tx.empty() && (!objects.count(p->second.tx) || !objects.at(p->second.tx).count("org.bluez.GattCharacteristic1"))) ||
          (!p->second.rx.empty() && (!objects.count(p->second.rx) || !objects.at(p->second.rx).count("org.bluez.GattCharacteristic1")))) finish(h, true, false);
      else resolved(h);
    }
    if (adapter.empty() && scanning != Scan::idle) { ++scanEpoch; scanTo(Scan::idle); error("BLE adapter removed"); }
  }
  void signal(const Reply& r) {
    if (phase == State::stopping && r.member != "NameOwnerChanged") return;
    if (phase == State::discovering && r.member != "NameOwnerChanged") {
      size_t n = 0; for (auto& v : r.values) n += footprint(v);
      if (bootstrapSignals.size() >= 64 || bootstrapBytes + n > 1048576) { fail("BLE bootstrap event limit exceeded"); return; }
      bootstrapBytes += n; bootstrapSignals.push_back(r); return;
    }
    changed(r);
  }
  void beginScan() {
    if (scanning != Scan::idle || phase != State::ready || scanRequest != ScanRequest::scanning) return;
    scanTo(Scan::filtering); currentScan = requestedScan; filter = requestedFilter; ++scanEpoch;
    if (adapter.empty() || !flag(prop(adapter,"org.bluez.Adapter1","Powered"))) { error(adapter.empty() ? "unsupported" : "off"); scanTo(Scan::idle); return; }
    uint64_t g = scanEpoch; std::vector<Value> uuids; for (auto& s : filter) uuids.push_back(Value::string(s));
    auto settings = dictionary({property("Transport",Value::string("le")),property("DuplicateData",Value::integer(1,'b')),property("UUIDs",Value::container('a',"s",std::move(uuids)))});
    if (!call(adapter,"org.bluez.Adapter1","SetDiscoveryFilter",{std::move(settings)},[this,g](const Reply& r) {
      if (g != scanEpoch || scanning != Scan::filtering) return;
      if (!r.ok()) { error(r.error); scanTo(Scan::idle); return; }
      if (scanRequest != ScanRequest::scanning || currentScan != requestedScan) { scanTo(Scan::idle); beginScan(); return; }
      scanTo(Scan::starting);
      if (!call(adapter,"org.bluez.Adapter1","StartDiscovery",{},[this,g](const Reply& reply) {
        if (g != scanEpoch || scanning != Scan::starting) return;
        if (!reply.ok()) { error(reply.error); scanTo(Scan::idle); return; }
        scanTo(Scan::active);
        if (scanRequest != ScanRequest::scanning || currentScan != requestedScan) endScan();
        else for (auto& d : identities) sighted(d.first);
      })) { error("BLE scan request failed"); scanTo(Scan::idle); }
    })) { error("BLE filter request failed"); scanTo(Scan::idle); }
  }
  void endScan() {
    if (scanning != Scan::active) return;
    scanTo(Scan::stopping); uint64_t g = scanEpoch;
    if (!call(adapter,"org.bluez.Adapter1","StopDiscovery",{},[this,g](const Reply& r) {
      if (g != scanEpoch || scanning != Scan::stopping) return;
      if (!r.ok()) { error(r.error); requestScan(ScanRequest::stopped); }
      scanTo(Scan::idle); beginScan();
    })) { error("BLE stop scan failed"); requestScan(ScanRequest::stopped); scanTo(Scan::idle); }
  }
  void pumpGatt(int h) {
    auto p = links.find(h); if (p == links.end()) return; auto& l = p->second;
    if (l.mode != Link::Mode::gatt || (l.phase != Link::State::open && l.phase != Link::State::closing) || l.operations.empty() || l.operations.front().state != Operation::State::queued) return;
    auto& op = l.operations.front(); auto a = l.attributes.find(op.attribute);
    if (a == l.attributes.end()) { error("stale GATT characteristic"); finish(h,true); return; }
    op.transition(Operation::State::pending); int request = op.id, kind = op.kind;
    std::vector<Value> args; const char* method;
    if (kind == 0) { method="ReadValue"; args={dictionary()}; }
    else if (kind == 1 || kind == 2) { method="WriteValue"; args={bytes(op.data),dictionary({property("type",Value::string(kind == 1 ? "request" : "command"))})}; }
    else method=kind == 3 ? "StartNotify" : "StopNotify";
    ++pendingGatt;
    if (!call(a->second.path,"org.bluez.GattCharacteristic1",method,std::move(args),[this,h,request,kind](const Reply& r) {
      if(pendingGatt)--pendingGatt;
      auto p=links.find(h); if (p==links.end() || (p->second.phase!=Link::State::open && p->second.phase!=Link::State::closing) || p->second.operations.empty() || p->second.operations.front().id!=request) return;
      auto& l=p->second; auto op=std::move(l.operations.front()); l.operations.pop_front(); auto a=l.attributes.find(op.attribute); if (a==l.attributes.end()) return;
      std::string why=r.error; std::vector<uint8_t> data;
      if (why.empty() && kind==0) {
        if (r.signature!="ay" || r.values.size()!=1 || r.values[0].type!='a' || r.values[0].contents!="y" || r.values[0].children.size()>512) why="invalid GATT read reply";
        else { data=byteArray(&r.values[0]); if(data.size()!=r.values[0].children.size()) why="invalid GATT read bytes"; }
      }
      if (kind>=3) {
        a->second.notifyTo(kind==3 ? (why.empty()?Attribute::Notify::on:Attribute::Notify::off) : (why.empty() || op.audience==Operation::Audience::cleanup ? Attribute::Notify::off:Attribute::Notify::on));
        if (kind==3 && why.empty() && op.state==Operation::State::cancelled && l.phase==Link::State::open) {
          a->second.notifyTo(Attribute::Notify::stopping);
          Operation cleanup{Operation::State::queued,0,op.attribute,4,{}};
          cleanup.audience=Operation::Audience::cleanup;
          l.operations.push_front(std::move(cleanup));
        }
      }
      if(!why.empty())data.clear();
      if (l.phase==Link::State::open && op.state!=Operation::State::cancelled && op.audience==Operation::Audience::caller) gattEmit(std::to_string(h)+"\tresult\t"+std::to_string(request)+"\t"+encoded(why)+"\t"+hex(data)+"\n");
      if(kind==3) {
        if(l.phase==Link::State::open && why.empty() && op.state!=Operation::State::cancelled) for(auto& value:a->second.earlyValues)
          gattEmit(std::to_string(h)+"\tvalue\t"+std::to_string(op.attribute)+"\t"+hex(value)+"\n");
        a->second.earlyValues.clear(); a->second.earlyBytes=0;
      }
      if (!why.empty()) error(why);
      if(l.phase==Link::State::closing || (!why.empty() && op.audience==Operation::Audience::cleanup)) finish(h,true);
    })) {
      --pendingGatt; error("GATT request enqueue failed");
      auto op=std::move(l.operations.front());l.operations.pop_front();
      if(kind>=3)a->second.notifyTo(kind==3 || op.audience==Operation::Audience::cleanup?Attribute::Notify::off:Attribute::Notify::on);
      finish(h,true);
    }
  }
  void pump(int h) {
    auto p = links.find(h); if (p == links.end()) return; Link& l = p->second;
    if (l.mode != Link::Mode::uart || l.phase != Link::State::open || l.write != Link::Write::idle || l.outgoing.empty()) return;
    auto flags = strings(prop(l.rx,"org.bluez.GattCharacteristic1","Flags"));
    std::string type = std::find(flags.begin(),flags.end(),"write-without-response") != flags.end() ? "command" : "request";
    auto b = std::move(l.outgoing.front()); l.outgoing.pop_front(); l.queued -= b.size(); l.writeTo(Link::Write::pending);
    if (!call(l.rx,"org.bluez.GattCharacteristic1","WriteValue",{bytes(b),dictionary({property("type",Value::string(type))})},[this,h](const Reply& r) {
      auto p = links.find(h); if (p == links.end()) return;
      if (!r.ok()) { error(r.error); finish(h,true); return; }
      p->second.writeTo(Link::Write::idle);
    })) { error("BLE write request failed"); finish(h,true); }
  }
public:
  explicit BlueZ(Api* injected = nullptr) : bus(injected) {}
  State status() const { return phase; }
  const std::string& error() const { return reason; }
  void start() {
    if (phase == State::ready || phase == State::discovering || phase == State::stopping) return;
    ++epoch; objects.clear(); identities.clear(); adapter.clear(); bootstrapSignals.clear(); bootstrapBytes = 0; reason.clear(); transition(State::discovering);
    if (!bus.start()) { fail(bus.error()); return; }
    for (const char* rule : {"type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager'", "type='signal',sender='org.bluez',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'", "type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.bluez'"})
      if (!bus.match(rule,[this](const Reply& r) { signal(r); })) { fail("BLE signal subscription failed"); return; }
    if (!call("/","org.freedesktop.DBus.ObjectManager","GetManagedObjects",{},[this](const Reply& r) {
      if (!r.ok()) { fail(r.error); return; }
      if (r.signature != "a{oa{sa{sv}}}" || r.values.size() != 1 || r.values[0].children.size() > 256) { fail("invalid BlueZ object map"); return; }
      std::map<std::string,Interfaces> snapshot; size_t cacheBytes = 0;
      for (auto& e : r.values[0].children) {
        if (e.type != 'e' || e.children.size() != 2 || e.children[0].type != 'o' || !rooted(e.children[0].text)) { fail("invalid BlueZ object path"); return; }
        Interfaces parsed;
        if (!interfaces(e.children[1],parsed)) { fail("invalid BlueZ object interfaces"); return; }
        for (auto& i : parsed) cacheBytes += footprint(i.second);
        if (cacheBytes > 4194304) { fail("BLE object cache limit exceeded"); return; }
        snapshot.emplace(e.children[0].text,std::move(parsed));
      }
      objects = std::move(snapshot); updateIdentities(); transition(State::ready);
      auto queued = std::move(bootstrapSignals); bootstrapSignals.clear(); bootstrapBytes = 0; for (auto& s : queued) { changed(s); if (phase != State::ready) return; }
      beginScan();
    })) fail("BLE enumeration failed");
  }
  void poll(std::chrono::steady_clock::time_point now = std::chrono::steady_clock::now()) {
    bus.poll(); if ((phase == State::ready || phase == State::discovering || phase == State::stopping) && bus.state() == Bus::State::failed) { fail(bus.error()); return; }
    std::vector<int> hs; for (auto& l : links) hs.push_back(l.first);
    for (int h : hs) {
      auto p = links.find(h); if (p == links.end()) continue; auto& l=p->second;
      bool pendingNotify=!l.operations.empty() && l.operations.front().kind==3 && l.operations.front().state!=Operation::State::queued;
      if(l.mode==Link::Mode::gatt && l.phase==Link::State::closing && l.ownership==Link::Ownership::acknowledged && now>=l.deadline && !pendingNotify) {
        error("GATT cleanup deadline exceeded; disconnect is best effort"); finish(h,true,true,Cleanup::expired);
      } else if (l.phase != Link::State::open && l.phase != Link::State::closing && now >= l.deadline) { error("BLE connection timed out"); finish(h,true); }
      else { resolved(h); pump(h); pumpGatt(h); }
    }
    if (gattEventState == EventState::overflow) {
      std::set<int> closed; size_t at=0;
      while(at<gattOut.size()) {
        auto end=gattOut.find('\n',at);if(end==std::string::npos)break;auto tab=gattOut.find('\t',at);
        if(tab<end && gattOut.compare(tab,6,"\tclose")==0) { int h=0;auto parsed=std::from_chars(gattOut.data()+at,gattOut.data()+tab,h);if(parsed.ec==std::errc{})closed.insert(h); }
        at=end+1;
      }
      for (auto& l : links) if (l.second.mode == Link::Mode::gatt) closed.insert(l.first);
      gattOut.clear(); eventStateTo(EventState::healthy);
      for (int h : closed) { finish(h,false); gattEmit(std::to_string(h)+"\tclose\t6f766572666c6f77\n"); }
    }
    if (phase == State::stopping && links.empty() && disconnects == 0 && pendingGatt == 0) finishStop();
  }
  bool cleanupPending() const {
    if (phase == State::discovering || phase == State::stopping || disconnects > 0 || pendingGatt > 0) return true;
    for (auto& l : links) if (l.second.phase == Link::State::closing) return true;
    return false;
  }
  bool has() const { return phase == State::ready && !adapter.empty(); }
  std::string state() const { if (phase == State::failed) return reason.find("AccessDenied") != std::string::npos ? "unauthorized" : "unsupported"; if (phase != State::ready) return "resetting"; return adapter.empty() ? "unsupported" : flag(prop(adapter,"org.bluez.Adapter1","Powered")) ? "" : "off"; }
  bool power(bool on) {
    start(); if (!has()) { error("BLE adapter is not ready"); return false; }
    return call(adapter,"org.freedesktop.DBus.Properties","Set",{Value::string("org.bluez.Adapter1"),Value::string("Powered"),Value::variant(Value::integer(on,'b'))},[this](const Reply& r) { if (!r.ok()) error(r.error); });
  }
  bool scan(std::vector<std::string> uuids = {UART}) {
    if (uuids.size() > 32) return false;
    for (auto& uuid : uuids) {
      if (uuid.size() != 36) { error("BLE requires canonical lowercase UUIDs"); return false; }
      for (size_t i = 0; i < uuid.size(); i++) if ((i == 8 || i == 13 || i == 18 || i == 23) ? uuid[i] != '-' : !((uuid[i] >= '0' && uuid[i] <= '9') || (uuid[i] >= 'a' && uuid[i] <= 'f'))) { error("invalid BLE UUID"); return false; }
    }
    start(); if (phase == State::failed) return false;
    requestedFilter = std::move(uuids); observations.clear(); clearScanEvents(); ++requestedScan; requestScan(ScanRequest::scanning);
    if (scanning == Scan::active) endScan(); else beginScan();
    return true;
  }
  void stopScan() {
    requestScan(ScanRequest::stopped); ++requestedScan; observations.clear(); clearScanEvents();
    if (scanning == Scan::active) endScan();
  }
  std::string advertisements() { std::string r; r.swap(observations); return r; }
  int connect(const std::string& id, bool generic = false) {
    if (eventsOut.size() >= 32768) clearScanEvents();
    if (nextHandle == INT_MAX || links.size() >= 16 || eventsOut.size() >= 32768 || (generic && (gattOut.size() >= 32768 || std::count(gattOut.begin(),gattOut.end(),'\n') >= 512))) { error("BLE connection or event limit exceeded"); return -1; }
    const int h = nextHandle++;
    std::string path; for (auto& d : identities) if (d.second.id == id) path = d.first;
    for (auto& l : links) if (l.second.device == path) { error("BLE device already connected"); if (generic) gattEmit(std::to_string(h)+"\tclose\t"+encoded(reason)+"\n"); else push("close\x1f" + std::to_string(h) + '\x1e'); return h; }
    if (phase != State::ready || path.empty() || text(prop(path,"org.bluez.Device1","Adapter")) != adapter || flag(prop(path,"org.bluez.Device1","Connected"))) { error("unknown BLE device"); if (generic) gattEmit(std::to_string(h)+"\tclose\t"+encoded(reason)+"\n"); else push("close\x1f" + std::to_string(h) + '\x1e'); return h; }
    Link l; l.mode = generic ? Link::Mode::gatt : Link::Mode::uart; l.h = h; l.device = path; l.id = id; l.name = text(prop(path,"org.bluez.Device1","Name")); l.deadline = std::chrono::steady_clock::now()+std::chrono::seconds(10); links.emplace(h,std::move(l));
    if (!call(path,"org.bluez.Device1","Connect",{},[this,h](const Reply& r) {
      auto p = links.find(h); if (p == links.end()) return;
      bool closing = p->second.phase == Link::State::closing;
      if (!r.ok()) { error(r.error); finish(h,!closing,false); return; }
      p->second.acknowledge();
      if (closing) { finish(h,false); return; }
      p->second.transition(Link::State::resolving); resolved(h);
    })) { error("BLE connect request failed"); finish(h,true,false); }
    return h;
  }
  std::string gattTree(int h) const {
    auto p=links.find(h); if (p==links.end() || p->second.mode!=Link::Mode::gatt || p->second.phase!=Link::State::open) return {};
    std::string out;
    for (auto& a : p->second.attributes) {
      auto& n=a.second; out+=(n.service?"c\t":"s\t")+std::to_string(n.id)+"\t"+std::to_string(n.service)+"\t"+n.uuid+"\t";
      for (auto& f : n.flags) out+=encoded(f)+',';
      out+='\n';
    }
    return out;
  }
  // shortcut: commands use 20 bytes until negotiated MTU is exposed; requests delegate long procedures to BlueZ.
  int gattRequest(int h, int characteristic, int kind, const std::vector<uint8_t>& data = {}) {
    auto p=links.find(h); if (p==links.end() || p->second.mode!=Link::Mode::gatt || p->second.phase!=Link::State::open || kind<0 || kind>4 || nextOperation==INT_MAX || p->second.operations.size()>=32) return -1;
    auto& l=p->second; auto a=l.attributes.find(characteristic); if (a==l.attributes.end() || !a->second.service || data.size()>(kind==1 ? 512u : kind==2 ? 20u : 0u)) return -1;
    auto has=[&](const char* f) { return std::find(a->second.flags.begin(),a->second.flags.end(),f)!=a->second.flags.end(); };
    if ((kind==0 && !has("read")) || (kind==1 && !has("write")) || (kind==2 && !has("write-without-response")) || (kind>=3 && !has("notify") && !has("indicate"))) return -1;
    if (kind==3 && !a->second.notifyTo(Attribute::Notify::starting)) return -1;
    if (kind==4 && !a->second.notifyTo(Attribute::Notify::stopping)) return -1;
    int id=nextOperation++; l.operations.push_back(Operation{Operation::State::queued,id,characteristic,kind,data}); return id;
  }
  void gattCancel(int h,int request) {
    auto p=links.find(h); if (p==links.end()) return; auto& queue=p->second.operations;
    for (auto i=queue.begin();i!=queue.end();++i) if (i->id==request) {
      if (i->state==Operation::State::queued) {
        auto a=p->second.attributes.find(i->attribute);
        if (a!=p->second.attributes.end() && i->kind>=3) a->second.notifyTo(i->kind==3?Attribute::Notify::off:Attribute::Notify::on);
        queue.erase(i);
      } else i->transition(Operation::State::cancelled);
      return;
    }
  }
  std::string gattEvents() { poll(); std::string out; out.swap(gattOut); return out; }
  bool write(int h, const std::vector<uint8_t>& bytes) {
    auto p = links.find(h); if (p == links.end() || p->second.mode != Link::Mode::uart || p->second.phase != Link::State::open || bytes.size() > 20 || p->second.queued + bytes.size() > 1048576) return false;
    if (bytes.empty()) return true;
    p->second.outgoing.push_back(bytes); p->second.queued += bytes.size(); return true;
  }
  std::vector<uint8_t> read(int h) { auto p = links.find(h); if (p == links.end()) return {}; std::vector<uint8_t> r; r.swap(p->second.incoming); return r; }
  void close(int h) { finish(h,false); }
  std::string events() { poll(); std::string r; r.swap(eventsOut); return r; }
  void stop() {
    if (phase == State::closed || phase == State::stopping) return;
    requestScan(ScanRequest::stopped); ++requestedScan; observations.clear(); eventsOut.clear(); gattOut.clear();
    std::vector<int> hs; for (auto& l : links) hs.push_back(l.first); for (int h : hs) finish(h,false);
    if (links.empty() && disconnects == 0 && pendingGatt == 0) finishStop(); else transition(State::stopping);
  }
};
}
