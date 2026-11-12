#ifndef ZRT_HOSTED_CPP
#define ZRT_HOSTED_CPP
#endif
#include "zinc_native_ble.h"
#include "bluez.h"
#include <mutex>
#include <cstdlib>
extern "C" int zn_host_permission(const char*, const char*, char*, int) __attribute__((weak));
struct LinuxBle : NativeBle {
  std::mutex mutex;
  zinc::radio::BlueZ backend;
  static bool simulation() {
    auto on=[](const char* k) { const char* v=getenv(k); return v && *v && strcmp(v,"0")!=0; };
    const char* n=getenv("ZINC_NATIVE"); return on("ZINC_BLE_SIM") || on("ZINC_DETERMINISTIC") || (n && strcmp(n,"sim")==0);
  }
  const bool simulated=simulation();
  enum class SimScan { idle, uart, raw, empty } simScan=SimScan::idle;
  std::map<int,std::vector<uint8_t>> simLinks;
  int nextSimHandle=1;
  std::string simEvents;
  void simScanTo(SimScan next) { simScan=next; }
  int simOpen(const std::string& id,const std::string& name) {
    if (nextSimHandle==INT_MAX) return -1;
    int h=nextSimHandle++; simLinks.emplace(h,std::vector<uint8_t>{});
    simEvents+="open\x1f"+std::to_string(h)+'\x1f'+id+'\x1f'+name+'\x1e'; return h;
  }
  struct Reaper : zrt::Poller {
    LinuxBle* owner;
    enum class State { idle, registered } state = State::idle;
    explicit Reaper(LinuxBle* p) : owner(p) {}
    void attach() { if (state == State::idle) { zrt::add_poller(this); state = State::registered; } }
    bool poll() override { std::lock_guard<std::mutex> lock(owner->mutex); owner->backend.poll(); return owner->backend.cleanupPending(); }
    void shutdown() override { owner->stop(); }
  } reaper;
  explicit LinuxBle(zinc::radio::Api* api = nullptr) : backend(api), reaper(this) {}
  void watch() { if (!simulated) reaper.attach(); }
  static zrt::String str(const std::string& s) { return zrt::String::from(s.data(),static_cast<uint32_t>(s.size())); }
  bool allowed() {
    char why[256] = {};
    if (zn_host_permission && zn_host_permission("bluetooth","bluetooth",why,sizeof why)) { backend.stop(); simLinks.clear(); simEvents.clear(); simScanTo(SimScan::idle); return false; }
    return true;
  }
  zrt::String state() override { std::lock_guard<std::mutex> lock(mutex); if (!allowed()) return str("unauthorized"); if (simulated) { const char* s=getenv("ZINC_BLE_SIM_STATE"); return str(s?s:""); } watch(); backend.start(); backend.poll(); return str(backend.state()); }
  bool has() override { std::lock_guard<std::mutex> lock(mutex); if (!allowed()) return false; if (simulated) return true; watch(); backend.start(); backend.poll(); return backend.has(); }
  bool powered(bool on) override { std::lock_guard<std::mutex> lock(mutex); if (!allowed() || simulated) return false; watch(); return backend.power(on); }
  bool discover(zrt::String input) override {
    std::lock_guard<std::mutex> lock(mutex); if (!allowed() || input.bytes() > 1183) return false;
    std::string s(input.ptr(),input.bytes()); std::vector<std::string> uuids;
    if (!s.empty()) { size_t start=0; for (;;) { auto end=s.find(',',start); uuids.push_back(s.substr(start,end==std::string::npos?end:end-start)); if(end==std::string::npos) break; start=end+1; } }
    if (simulated) { simScanTo(uuids.empty() || std::find(uuids.begin(),uuids.end(),zinc::radio::BlueZ::UART)!=uuids.end()?SimScan::raw:SimScan::empty); return true; }
    watch(); return backend.scan(std::move(uuids));
  }
  zrt::String advertisements() override { std::lock_guard<std::mutex> lock(mutex); if (!allowed()) return str(""); if (simulated) return str(simScan==SimScan::raw?"zinc-sim\t5a696e632073696d\t-42\t36653430303030312d623561332d663339332d653061392d653530653234646363613965,\t\t\t\n":""); backend.poll(); return str(backend.advertisements()); }
  zrt::String error() override { std::lock_guard<std::mutex> lock(mutex); return str(!allowed()?"bluetooth permission denied":simulated?"":backend.error()); }
  void scan() override { std::lock_guard<std::mutex> lock(mutex); if (allowed()) { if (simulated) simScanTo(SimScan::uart); else { watch(); backend.scan(); } } }
  void stopScan() override { std::lock_guard<std::mutex> lock(mutex); if (simulated) simScanTo(SimScan::idle); else backend.stopScan(); }
  int32_t connect(zrt::String id) override { std::lock_guard<std::mutex> lock(mutex); if (!allowed()) return -1;
    std::string name(id.ptr(),id.bytes());
    if (simulated) {
      if (name=="zinc-sim") return simOpen(name,"Zinc sim");
      if (nextSimHandle==INT_MAX) return -1;
      int h=nextSimHandle++; simEvents+="close\x1f"+std::to_string(h)+'\x1e'; return h;
    }
    watch(); return backend.connect(name); }
  bool advertise(zrt::String) override {
    std::lock_guard<std::mutex> lock(mutex);
    if (allowed() && simulated) return simOpen("zinc-sim-central","Zinc sim central")>=0;
    return false; // shortcut: BlueZ GATT peripheral export is missing, complete it before closing ZN-558.
  }
  int32_t maxWrite(int32_t) override { return 20; }
  bool write(int32_t h,zrt::Array<uint8_t> bytes) override {
    std::lock_guard<std::mutex> lock(mutex); if (!allowed() || !bytes.a || bytes.length()>20) return false;
    std::vector<uint8_t> chunk;
    if (bytes.length()) { const auto* p=static_cast<const uint8_t*>(bytes.a->data); chunk.assign(p,p+bytes.length()); }
    if (simulated) { auto l=simLinks.find(h); if (l==simLinks.end() || l->second.size()+chunk.size()>65536) return false; l->second.insert(l->second.end(),chunk.begin(),chunk.end()); return true; }
    return backend.write(h,chunk);
  }
  zrt::Array<uint8_t> read(int32_t h) override {
    std::lock_guard<std::mutex> lock(mutex); std::vector<uint8_t> bytes;
    if (allowed()) { if (simulated) { auto l=simLinks.find(h); if (l!=simLinks.end()) bytes.swap(l->second); } else bytes=backend.read(h); }
    auto out=zrt::Array<uint8_t>::with_cap(static_cast<int32_t>(bytes.size())); if (!bytes.empty()) memcpy(out.a->data,bytes.data(),bytes.size()); out.a->len=bytes.size(); return out;
  }
  void close(int32_t h) override { std::lock_guard<std::mutex> lock(mutex); if (simulated) simLinks.erase(h); else backend.close(h); }
  void stop() override { std::lock_guard<std::mutex> lock(mutex); backend.stop(); simLinks.clear(); simEvents.clear(); simScanTo(SimScan::idle); }
  zrt::String events() override { std::lock_guard<std::mutex> lock(mutex); if (!allowed()) return str("");
    if (simulated) { std::string out; out.swap(simEvents); if (simScan==SimScan::uart) out+="device\x1f-1\x1fzinc-sim\x1fZinc sim\x1f-42\x1e"; return str(out); }
    return str(backend.events()); }
};
NativeBle* zinc_create_Ble() { static LinuxBle instance; instance.rc=zrt::IMMORTAL; return &instance; }
