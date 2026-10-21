// zinc:ble on macOS: CoreBluetooth's central (CBCentralManager) on a serial dispatch queue of its own. Its callbacks queue event records and
// received bytes under a mutex; the program's thread takes them when index.ts looks (events(), read()) and hands work to the queue. Nothing
// here waits on the radio. Manual retain/release: plugins are not built with ARC. The Mac is the central only: advertise() says no.
//
// Permission. macOS asks the person once, for the *responsible* process: under `zinc run` the terminal app, for an exported app the app.
// When that process has no NSBluetoothAlwaysUsageDescription in its Info.plist, macOS does not ask: it kills the program (SIGABRT, macOS
// 15). The manager is the object that makes macOS ask, so it is only created when access is granted already, or when asking is safe: the
// responsible app declares the usage text (iTerm2, Ghostty, an app made by zinc export with "permissions": ["bluetooth"]), or ZINC_BLE_ASK=1
// (the person takes the risk). ZINC_BLE_ASK=0 never asks. Otherwise state() is 'unauthorized' and the radio is not touched.
//
// The simulated radio of ble.sim.ts is here too, for the engines that always load native code (--engine quickjs, built programs): with
// ZINC_BLE_SIM=1, ZINC_NATIVE=sim or a deterministic run, one peripheral "Zinc sim" that sends back what it is written and one central
// "Zinc sim central" for advertise(). It runs on the program's thread and never touches CoreBluetooth.
#define ZRT_HOSTED_CPP
#import <CoreBluetooth/CoreBluetooth.h>
#import <Foundation/Foundation.h>
#include <dlfcn.h>
#include <libproc.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <atomic>
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <vector>
#include "zinc_native_ble.h"
extern "C" int zn_host_permission(const char* feature, const char* detail, char* why, int n) __attribute__((weak));   // zinc.json "permissions" (src/host/permissions.cpp)

namespace {
const char FS = '\x1f', RS = '\x1e';
const size_t MAX_QUEUED = 1 << 20;   // bytes waiting to go out on one link
const int CONNECT_TIMEOUT_S = 10;    // CoreBluetooth keeps trying to connect forever

struct Link {
  int h = -1;
  std::string id, name;
  int maxw = 20;                            // mu
  bool open = false;                        // mu
  std::deque<std::vector<uint8_t>> out;     // mu: chunks to write
  size_t queued = 0;                        // mu
  std::vector<uint8_t> in;                  // mu: bytes received
  CBPeripheral* p = nil;                    // the rest: the queue only (p retained)
  CBCharacteristic* rx = nil;
  CBCharacteristic* tx = nil;
  bool noResponse = false, writing = false;
};

std::mutex mu;
std::map<int, Link*> links;   // mu
std::string pendingEvents;    // mu
int nextHandle = 0;           // mu
std::atomic<long> radio{-1};  // CBManagerState, -1 before the first report
dispatch_queue_t q = nullptr;
dispatch_semaphore_t firstState = nullptr;
CBCentralManager* cm = nil;
NSMutableDictionary* seen = nil;   // NSUUID -> CBPeripheral of the scan (the queue only): connect() needs the object
bool wantScan = false;             // the queue only
bool simScanning = false;          // the simulated radio: the program's thread
CBUUID *uart = nil, *rxId = nil, *txId = nil;

std::string clean(NSString* s) {   // a field of a record: no separators in it
  std::string r = s ? s.UTF8String : "";
  for (char& c : r) if (c == FS || c == RS) c = ' ';
  return r;
}
std::string rec(const char* kind, int h, const std::string& id = "", const std::string& name = "") {
  return std::string(kind) + FS + std::to_string(h) + (id.empty() ? std::string() : std::string(1, FS) + id + FS + name) + RS;
}
void push(const std::string& r) { std::lock_guard<std::mutex> g(mu); pendingEvents += r; }
Link* linkOf(int h) { auto it = links.find(h); return it == links.end() ? nullptr : it->second; }   // under mu
Link* linkOf(CBPeripheral* p) {   // the queue: CB fields
  std::lock_guard<std::mutex> g(mu);
  for (auto& kv : links) if (kv.second->p == p) return kv.second;
  return nullptr;
}
// The queue: the link is over. Its connection is cancelled; `event`: the program is told (not when it closed the link itself).
void finish(Link* l, bool event) {
  if (l->p) {
    if (cm.state == CBManagerStatePoweredOn) [cm cancelPeripheralConnection:l->p];
    [l->p release];
    l->p = nil;
  }
  { std::lock_guard<std::mutex> g(mu); links.erase(l->h); }
  if (event) push(rec("close", l->h));
  delete l;
}
void startScan() { [cm scanForPeripheralsWithServices:@[uart] options:@{CBCentralManagerScanOptionAllowDuplicatesKey: @YES}]; }   // duplicates: a name that comes in a later scan response
// The queue: writes the chunks the link can take now. Without response the system says when it can take more; with response, one at a time.
void pump(Link* l) {
  @autoreleasepool {
    for (;;) {
      std::vector<uint8_t> c;
      {
        std::lock_guard<std::mutex> g(mu);
        if (l->out.empty() || !l->rx || (l->noResponse ? !l->p.canSendWriteWithoutResponse : l->writing)) return;
        c = std::move(l->out.front());
        l->out.pop_front();
        l->queued -= c.size();
      }
      [l->p writeValue:[NSData dataWithBytes:c.data() length:c.size()] forCharacteristic:l->rx
                  type:l->noResponse ? CBCharacteristicWriteWithoutResponse : CBCharacteristicWriteWithResponse];
      if (!l->noResponse) { l->writing = true; return; }
    }
  }
}
// The process macOS asks for permission on behalf of (a terminal app under zinc run), and whether its Info.plist has the usage text.
bool responsibleDeclaresBluetooth() {
  auto resp = (pid_t (*)(pid_t))dlsym(RTLD_DEFAULT, "responsibility_get_pid_responsible_for_pid");   // libSystem's, not in its headers
  char path[PROC_PIDPATHINFO_MAXSIZE];
  if (proc_pidpath(resp ? resp(getpid()) : getpid(), path, sizeof path) <= 0) return false;
  NSString* exe = [NSString stringWithUTF8String:path];
  NSRange at = [exe rangeOfString:@".app/Contents/MacOS/" options:NSBackwardsSearch];
  if (at.location == NSNotFound) return false;   // a bare binary is responsible for itself and has no Info.plist
  NSBundle* app = [NSBundle bundleWithPath:[exe substringToIndex:at.location + 4]];
  return [app objectForInfoDictionaryKey:@"NSBluetoothAlwaysUsageDescription"] != nil;
}
bool notDetermined() {
  if (@available(macOS 10.15, *)) return [CBManager authorization] == CBManagerAuthorizationNotDetermined;
  return false;
}
bool simulated() {
  auto on = [](const char* k) { const char* v = getenv(k); return v && *v && strcmp(v, "0") != 0; };
  const char* n = getenv("ZINC_NATIVE");
  return on("ZINC_BLE_SIM") || (n && !strcmp(n, "sim")) || on("ZINC_DETERMINISTIC");
}
int simLink(const char* id, const char* name) {   // under mu: a simulated link, open at once
  Link* l = new Link();
  l->h = nextHandle++; l->id = id; l->name = name; l->open = true;
  links[l->h] = l;
  pendingEvents += rec("open", l->h, id, name);
  return l->h;
}
}  // namespace

@interface ZnBle : NSObject <CBCentralManagerDelegate, CBPeripheralDelegate>
@end
@implementation ZnBle
- (void)centralManagerDidUpdateState:(CBCentralManager*)c {
  radio = (long)c.state;
  if (c.state == CBManagerStatePoweredOn) { if (wantScan) startScan(); }
  else {   // off, reset or refused: the system dropped every connection without a disconnect callback
    std::vector<Link*> all;
    { std::lock_guard<std::mutex> g(mu); for (auto& kv : links) all.push_back(kv.second); }
    for (Link* l : all) finish(l, true);
  }
  if (firstState) dispatch_semaphore_signal(firstState);
}
- (void)centralManager:(CBCentralManager*)c didDiscoverPeripheral:(CBPeripheral*)p advertisementData:(NSDictionary*)adv RSSI:(NSNumber*)rssi {
  NSString* name = adv[CBAdvertisementDataLocalNameKey] ?: p.name;
  seen[p.identifier] = p;
  push(std::string("device") + FS + "-1" + FS + clean(p.identifier.UUIDString) + FS + clean(name) + FS + std::to_string(rssi.intValue) + RS);
}
- (void)centralManager:(CBCentralManager*)c didConnectPeripheral:(CBPeripheral*)p { [p discoverServices:@[uart]]; }
- (void)centralManager:(CBCentralManager*)c didFailToConnectPeripheral:(CBPeripheral*)p error:(NSError*)e { if (Link* l = linkOf(p)) finish(l, true); }
- (void)centralManager:(CBCentralManager*)c didDisconnectPeripheral:(CBPeripheral*)p error:(NSError*)e { if (Link* l = linkOf(p)) finish(l, true); }
- (void)peripheral:(CBPeripheral*)p didDiscoverServices:(NSError*)e {
  Link* l = linkOf(p);
  if (!l) return;
  for (CBService* s in p.services) if ([s.UUID isEqual:uart]) { [p discoverCharacteristics:@[rxId, txId] forService:s]; return; }
  finish(l, true);   // no UART service: not a Zinc device
}
- (void)peripheral:(CBPeripheral*)p didDiscoverCharacteristicsForService:(CBService*)s error:(NSError*)e {
  Link* l = linkOf(p);
  if (!l) return;
  for (CBCharacteristic* ch in s.characteristics) {
    if ([ch.UUID isEqual:rxId]) l->rx = ch;
    else if ([ch.UUID isEqual:txId]) l->tx = ch;
  }
  if (!l->rx || !l->tx) { finish(l, true); return; }
  l->noResponse = (l->rx.properties & CBCharacteristicPropertyWriteWithoutResponse) != 0;
  [p setNotifyValue:YES forCharacteristic:l->tx];
}
- (void)peripheral:(CBPeripheral*)p didUpdateNotificationStateForCharacteristic:(CBCharacteristic*)ch error:(NSError*)e {
  Link* l = linkOf(p);
  if (!l || ch != l->tx) return;
  if (e || !ch.isNotifying) { finish(l, true); return; }
  const long n = (long)[p maximumWriteValueLengthForType:l->noResponse ? CBCharacteristicWriteWithoutResponse : CBCharacteristicWriteWithResponse];
  {
    std::lock_guard<std::mutex> g(mu);
    l->maxw = n < 20 ? 20 : n > 512 ? 512 : (int)n;
    l->open = true;
  }
  push(rec("open", l->h, l->id, l->name));
}
- (void)peripheral:(CBPeripheral*)p didUpdateValueForCharacteristic:(CBCharacteristic*)ch error:(NSError*)e {
  Link* l = linkOf(p);
  if (!l || ch != l->tx || e || !ch.value) return;
  const uint8_t* b = (const uint8_t*)ch.value.bytes;
  std::lock_guard<std::mutex> g(mu);
  l->in.insert(l->in.end(), b, b + ch.value.length);
}
- (void)peripheral:(CBPeripheral*)p didWriteValueForCharacteristic:(CBCharacteristic*)ch error:(NSError*)e {
  if (Link* l = linkOf(p)) { l->writing = false; pump(l); }
}
- (void)peripheralIsReadyToSendWriteWithoutResponse:(CBPeripheral*)p { if (Link* l = linkOf(p)) pump(l); }
@end

namespace {
// The manager, made once access allows it (see the top); false while it must not be made.
bool start() {
  if (cm) return true;
  if (@available(macOS 10.15, *)) {
    const CBManagerAuthorization a = [CBManager authorization];
    if (a == CBManagerAuthorizationDenied || a == CBManagerAuthorizationRestricted) return false;
    if (a == CBManagerAuthorizationNotDetermined) {
      const char* ask = getenv("ZINC_BLE_ASK");
      if (ask && !strcmp(ask, "0")) return false;
      if (!(ask && !strcmp(ask, "1")) && !responsibleDeclaresBluetooth()) return false;
    }
  }
  uart = [[CBUUID UUIDWithString:@"6E400001-B5A3-F393-E0A9-E50E24DCCA9E"] retain];
  rxId = [[CBUUID UUIDWithString:@"6E400002-B5A3-F393-E0A9-E50E24DCCA9E"] retain];
  txId = [[CBUUID UUIDWithString:@"6E400003-B5A3-F393-E0A9-E50E24DCCA9E"] retain];
  seen = [[NSMutableDictionary alloc] init];
  q = dispatch_queue_create("zinc.ble", DISPATCH_QUEUE_SERIAL);
  const bool granted = !notDetermined();
  firstState = dispatch_semaphore_create(0);
  cm = [[CBCentralManager alloc] initWithDelegate:[[ZnBle alloc] init] queue:q options:@{CBCentralManagerOptionShowPowerAlertKey: @NO}];
  if (granted) dispatch_semaphore_wait(firstState, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC));   // the radio's state comes in a few ms
  return true;
}
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
}  // namespace

struct MacBle : NativeBle {
  const bool sim = simulated();
  zrt::String state() override {
    if (sim) { const char* s = getenv("ZINC_BLE_SIM_STATE"); return str(s ? s : ""); }
    char why[512];
    if (zn_host_permission && zn_host_permission("bluetooth", "bluetooth", why, sizeof why)) return str("unauthorized");
    @autoreleasepool {
      if (!start() || notDetermined()) return str("unauthorized");   // not determined: the system's question is up
    }
    switch (radio.load()) {
      case CBManagerStatePoweredOn: return str("");
      case CBManagerStatePoweredOff: return str("off");
      case CBManagerStateUnauthorized: return str("unauthorized");
      case CBManagerStateUnsupported: return str("unsupported");
      default: return str("resetting");   // unknown or resetting: not ready yet
    }
  }
  void scan() override {
    if (sim) { simScanning = true; return; }
    if (!cm) return;
    dispatch_async(q, ^{ wantScan = true; [seen removeAllObjects]; if (cm.state == CBManagerStatePoweredOn) startScan(); });
  }
  void stopScan() override {
    if (sim) { simScanning = false; return; }
    if (!cm) return;
    dispatch_async(q, ^{ wantScan = false; if (cm.state == CBManagerStatePoweredOn) [cm stopScan]; });
  }
  int32_t connect(zrt::String idIn) override {
    const std::string ident(idIn.ptr(), idIn.bytes());   // not `id`: that is Objective-C's type below
    std::lock_guard<std::mutex> g(mu);
    if (sim && ident == "zinc-sim") return simLink("zinc-sim", "Zinc sim");
    const int h = nextHandle++;
    if (sim || !cm) { pendingEvents += rec("close", h); return h; }
    Link* l = new Link();
    l->h = h; l->id = ident;
    links[h] = l;
    dispatch_async(q, ^{
      @autoreleasepool {
        Link* k = nullptr;
        { std::lock_guard<std::mutex> g2(mu); k = linkOf(h); }
        if (!k) return;
        NSUUID* u = [[[NSUUID alloc] initWithUUIDString:[NSString stringWithUTF8String:k->id.c_str()]] autorelease];
        CBPeripheral* p = u && cm.state == CBManagerStatePoweredOn ? (seen[u] ?: [cm retrievePeripheralsWithIdentifiers:@[u]].firstObject) : nil;
        bool taken = false;
        { std::lock_guard<std::mutex> g2(mu); for (auto& kv : links) if (kv.second->p && kv.second->p == p) taken = true; }
        if (!p || taken) { finish(k, true); return; }   // no radio, an unknown id, or a device already linked
        k->p = [p retain];
        k->name = clean(p.name);
        p.delegate = (id<CBPeripheralDelegate>)cm.delegate;
        [cm connectPeripheral:p options:nil];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)CONNECT_TIMEOUT_S * NSEC_PER_SEC), q, ^{
          Link* t = nullptr;
          { std::lock_guard<std::mutex> g3(mu); t = linkOf(h); if (t && t->open) t = nullptr; }
          if (t) finish(t, true);
        });
      }
    });
    return h;
  }
  bool advertise(zrt::String) override {   // ponytail: the Mac is a central; CBPeripheralManager when a Mac has to be the peripheral
    if (!sim) return false;
    std::lock_guard<std::mutex> g(mu);
    simLink("zinc-sim-central", "Zinc sim central");
    return true;
  }
  int32_t maxWrite(int32_t h) override { std::lock_guard<std::mutex> g(mu); Link* l = linkOf(h); return l ? l->maxw : 20; }
  bool write(int32_t h, zrt::Array<uint8_t> chunk) override {
    {
      std::lock_guard<std::mutex> g(mu);
      Link* l = linkOf(h);
      const size_t n = (size_t)chunk.length();
      const uint8_t* b = (const uint8_t*)chunk.a->data;
      if (!l || !l->open || (int)n > l->maxw || l->queued + n > MAX_QUEUED) return false;
      if (sim) { l->in.insert(l->in.end(), b, b + n); return true; }   // the echo
      l->out.emplace_back(b, b + n);
      l->queued += n;
    }
    dispatch_async(q, ^{ Link* l = nullptr; { std::lock_guard<std::mutex> g(mu); l = linkOf(h); } if (l) pump(l); });
    return true;
  }
  zrt::Array<uint8_t> read(int32_t h) override {
    std::vector<uint8_t> b;
    { std::lock_guard<std::mutex> g(mu); if (Link* l = linkOf(h)) b.swap(l->in); }
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)b.size());
    if (!b.empty()) memcpy(r.a->data, b.data(), b.size());
    r.a->len = (int32_t)b.size();
    return r;
  }
  void close(int32_t h) override {
    if (sim) { std::lock_guard<std::mutex> g(mu); if (Link* l = linkOf(h)) { links.erase(h); delete l; } return; }
    if (!cm) return;
    dispatch_async(q, ^{ Link* l = nullptr; { std::lock_guard<std::mutex> g(mu); l = linkOf(h); } if (l) finish(l, false); });
  }
  void stop() override {
    if (sim) { std::lock_guard<std::mutex> g(mu); for (auto& kv : links) delete kv.second; links.clear(); pendingEvents.clear(); simScanning = false; return; }
    if (!cm) return;
    dispatch_async(q, ^{
      wantScan = false;
      if (cm.state == CBManagerStatePoweredOn) [cm stopScan];
      std::vector<Link*> all;
      { std::lock_guard<std::mutex> g(mu); for (auto& kv : links) all.push_back(kv.second); }
      for (Link* l : all) finish(l, false);
    });
  }
  zrt::String events() override {
    std::string e;
    {
      std::lock_guard<std::mutex> g(mu);
      e.swap(pendingEvents);
      if (sim && simScanning) e += std::string("device") + FS + "-1" + FS + "zinc-sim" + FS + "Zinc sim" + FS + "-42" + RS;   // it advertises at every look
    }
    return str(e);
  }
};

NativeBle* zinc_create_Ble() {
  static MacBle inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
