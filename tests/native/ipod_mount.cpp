#include "radios/fake_bus.h"
#include "../../plugins/ipod/native/ipod_linux_mount.h"
#include <fstream>
#include <iostream>
using namespace zinc::radio;
using namespace ipod::linux_mount;
static const std::string drive = "/org/freedesktop/UDisks2/drives/iPod_AA", block = "/org/freedesktop/UDisks2/block_devices/sdb2";
static Value iface(std::string name, Value props) { return Value::container('e', "sa{sv}", {Value::string(name), std::move(props)}); }
static Value object(std::string path, std::vector<Value> interfaces) { return Value::container('e', "oa{sa{sv}}", {Value::string(path, 'o'), Value::container('a', "{sa{sv}}", std::move(interfaces))}); }
static Value pathBytes(std::string path) { std::vector<uint8_t> b(path.begin(), path.end()); b.push_back(0); return bytes(b); }
static Value strings(std::vector<std::string> names = {}) { std::vector<Value> out; for (auto& name : names) out.push_back(Value::string(name)); return Value::container('a', "s", std::move(out)); }
static Value snapshot(std::string fs = "vfat", bool mounted = false) {
  return Value::container('a', "{oa{sa{sv}}}", {
    object(drive, {iface(driveInterface, dictionary({property("ConnectionBus", Value::string("usb")), property("Serial", Value::string("ABC123")), property("Id", Value::string("Apple_iPod_ABC123")), property("TimeDetected", Value::integer(500, 't'))}))}),
    object(block, {iface(blockInterface, dictionary({property("Drive", Value::string(drive, 'o')), property("IdUsage", Value::string("filesystem")), property("IdType", Value::string(fs)), property("Device", pathBytes("/dev/sdb2")), property("DeviceNumber", Value::integer(2066, 't')), property("ReadOnly", Value::integer(0, 'b')), property("Size", Value::integer(80000000000, 't')), property("IdUUID", Value::string("1234-ABCD")), property("Configuration", Value::container('a', "(sa{sv})", {})), property("HintSystem", Value::integer(0, 'b')), property("HintIgnore", Value::integer(0, 'b')), property("MDRaid", Value::string("/", 'o')), property("MDRaidMember", Value::string("/", 'o')), property("CryptoBackingDevice", Value::string("/", 'o'))})), iface(filesystemInterface, dictionary({property("MountPoints", Value::container('a', "ay", mounted ? std::vector<Value>{pathBytes("/media/Pod")} : std::vector<Value>{}))}))})});
}
static Value& prop(Value& tree, size_t obj, size_t interface, const char* name) {
  auto& properties = tree.children.at(obj).children.at(1).children.at(interface).children.at(1);
  for (auto& p : properties.children) if (p.children[0].text == name) return p.children[1].children[0];
  assert(false); return properties;
}
static Reply reply(Value tree) { Reply r; r.signature = "a{oa{sa{sv}}}"; r.values = {std::move(tree)}; return r; }
static bool identify(const Candidate& c, Identity& out) { if (!((c.device == "/dev/sdb2" && c.number == 2066) || (c.device == "/dev/sdc2" && c.number == 2082))) return false; out = {"/fake/devices/usb/iPod", "abc123", 0x1209}; return true; }
struct Harness {
  FakeBus fake;
  Request request;
  std::vector<std::pair<sd_bus_slot*, Handler>> installs;
  static inline Harness* current = nullptr;
  explicit Harness(Identify reader = identify) : request(std::move(reader), &fake.api) {
    current = this;
    fake.api.add_match_async = [](sd_bus*, sd_bus_slot** slot, const char* rule, Handler cb, Handler ack, void* data) {
      assert(ack); assert(std::string(rule).find("sender=") != std::string::npos);
      *slot = current->fake.slot(cb, data); current->installs.push_back({*slot, ack}); return 0;
    };
  }
  void ack(size_t i) { auto& entry = installs.at(i); sd_bus_message m; entry.second(&m, entry.first->data, nullptr); }
  sd_bus_message begin() {
    assert(request.start()); assert(!request.start()); ack(0);
    auto owner = fake.take("GetNameOwner"); assert(owner.values.size() == 1 && owner.values[0].text == service);
    fake.reply(owner.slotIndex, "s", {Value::string(":1.42")}); request.poll(); ack(1);
    return takeSnapshot();
  }
  sd_bus_message takeSnapshot() { auto r = fake.take("GetManagedObjects"); assert(r.destination == ":1.42" && r.path == root && r.values.empty()); return r; }
  sd_bus_message first(Value tree = snapshot()) {
    auto first = begin(); fake.reply(first.slotIndex, "a{oa{sa{sv}}}", {std::move(tree)}); request.poll(); return takeSnapshot();
  }
  sd_bus_message mount(Value tree = snapshot()) {
    auto second = first(tree); fake.reply(second.slotIndex, "a{oa{sa{sv}}}", {std::move(tree)}); request.poll();
    return fake.take("Mount");
  }
  void signal(std::string path, std::string interface, Value changes, std::vector<std::string> invalid = {}) {
    sd_bus_message m; m.path = std::move(path); m.interface = "org.freedesktop.DBus.Properties"; m.member = "PropertiesChanged"; m.signature = "sa{sv}as";
    m.values = {Value::string(std::move(interface)), std::move(changes), strings(std::move(invalid))}; fake.replies.push_back({installs[1].first, std::move(m)});
  }
  void topology(std::string path) {
    sd_bus_message m; m.path = root; m.interface = "org.freedesktop.DBus.ObjectManager"; m.member = "InterfacesRemoved"; m.signature = "oas"; m.values = {Value::string(std::move(path), 'o'), strings({blockInterface})};
    fake.replies.push_back({installs[1].first, std::move(m)});
  }
};
int main(int argc, char** argv) {
  assert(argc == 2);
  for (auto [product, expected] : std::vector<std::pair<uint16_t, bool>>{{0x1200,false},{0x1201,true},{0x128f,true},{0x1290,false},{0x1300,true},{0x130f,true},{0x1310,false}}) assert(ipod::usb::diskModeIpod(product) == expected);
  Candidate selected; std::string error;
  assert(select(reply(snapshot()), identify, selected, error) && selected.device == "/dev/sdb2");
  for (const std::string& name : {"HintSystem", "HintIgnore", "ReadOnly"}) {
    auto tree = snapshot(); prop(tree,1,0,name.c_str()) = Value::integer(2,'b'); assert(!select(reply(tree), identify, selected, error));
  }
  for (const std::string& name : {"MDRaid", "MDRaidMember", "CryptoBackingDevice"}) {
    auto tree = snapshot(); prop(tree,1,0,name.c_str()) = Value::string("/foreign",'o'); assert(!select(reply(tree), identify, selected, error));
  }
  for (const std::string& name : {"HintSystem", "HintIgnore"}) {
    auto tree = snapshot(); prop(tree,1,0,name.c_str()) = Value::integer(1,'b'); assert(!select(reply(tree), identify, selected, error));
  }
  for (const auto& fs : {"ext4", "crypto_LUKS", "swap", ""}) assert(!select(reply(snapshot(fs)), identify, selected, error));
  for (const auto& name : {"/dev/loop0", "/dev/dm0", "/dev/md0", "/dev/../sdb2", "/dev/sdb2;id"}) { auto tree = snapshot(); prop(tree,1,0,"Device") = pathBytes(name); assert(!select(reply(tree), identify, selected, error)); }
  for (const auto& bus : {"ata", "nvme", ""}) { auto tree = snapshot(); prop(tree,0,0,"ConnectionBus") = Value::string(bus); assert(!select(reply(tree), identify, selected, error)); }
  { auto tree=snapshot();prop(tree,0,0,"Serial")=Value::string("OTHER");assert(!select(reply(tree),identify,selected,error)); }
  { auto tree=snapshot();tree.children[1].children[1].children.pop_back();assert(!select(reply(tree),identify,selected,error)); }
  { auto tree=snapshot();tree.children.push_back(tree.children[1]);assert(!select(reply(tree),identify,selected,error)); }
  { auto tree=snapshot();auto copy=tree.children[1];copy.children[0].text=std::string(root)+"/block_devices/sdc2";tree.children.push_back(copy);prop(tree,2,0,"Device")=pathBytes("/dev/sdc2");prop(tree,2,0,"DeviceNumber")=Value::integer(2082,'t');assert(!select(reply(tree),identify,selected,error)&&error.find("more than one")!=std::string::npos); }
  { auto tree=snapshot();auto& p=tree.children[1].children[1].children[0].children[1];p.children.push_back(p.children[0]);assert(!select(reply(tree),identify,selected,error)); }
  { auto tree=snapshot();prop(tree,1,1,"MountPoints")=Value::container('a',"ay",{bytes({'/', 'b'})});assert(!select(reply(tree),identify,selected,error)); }
  {
    const std::filesystem::path sys=argv[1], usb=sys/"devices/platform/usb/2-1", device=usb/"block/sdb/sdb2";
    std::filesystem::create_directories(device);std::filesystem::create_directories(sys/"dev/block");
    std::filesystem::create_directory_symlink(device,sys/"dev/block/8:18");
    auto write=[](const std::filesystem::path& p,const char* value){std::ofstream(p)<<value;};
    write(device/"dev","8:18\n");write(usb/"idVendor","05ac\n");write(usb/"idProduct","1209\n");write(usb/"serial","ABC123\n");
    Identity identity;assert(usbIdentity(sys,"8:18","sdb2",identity)&&identity.serial=="abc123");
    write(usb/"idProduct","1290\n");assert(!usbIdentity(sys,"8:18","sdb2",identity));
    write(usb/"idProduct","1209\n");write(usb/"idVendor","1234\n");assert(!usbIdentity(sys,"8:18","sdb2",identity));
    write(usb/"idVendor","05ac\n");write(device/"dev","8:19\n");assert(!usbIdentity(sys,"8:18","sdb2",identity));
    write(device/"dev","8:18\n");write(usb/"serial","");assert(!usbIdentity(sys,"8:18","sdb2",identity));
    assert(!usbIdentity(sys,"../8:18","sdb2",identity));assert(!usbIdentity(sys,"8:18","sdc2",identity));
    std::filesystem::remove(sys/"dev/block/8:18");std::filesystem::create_directory_symlink(sys.parent_path(),sys/"dev/block/8:18");assert(!usbIdentity(sys,"8:18","sdb2",identity));
  }
  for (const auto& fs : {"vfat", "hfs", "hfsplus"}) {
    Harness h; auto mount=h.mount(snapshot(fs));assert(mount.path==block&&mount.destination==":1.42"&&mount.values.size()==1);
    auto& options=mount.values[0];assert(options.property("auth.no_user_interaction")->number==1);
    assert((options.property("options")!=nullptr)==(std::string(fs)!="vfat"));
    if(std::string(fs)!="vfat")assert(options.property("options")->text=="ro");
    h.signal(block,filesystemInterface,dictionary({property("MountPoints",Value::container('a',"ay",{pathBytes("/media/Pod")}))}));
    h.signal(block,blockInterface,dictionary({property("UserspaceMountOptions",strings({"uhelper=udisks2"}))}));h.topology(std::string(root)+"/jobs/1");
    h.fake.reply(mount.slotIndex,"s",{Value::string("/media/Pod")});h.request.poll();assert(h.request.state()==Request::State::done&&h.fake.requests.empty());
  }
  {
    auto tree=snapshot("hfsplus");prop(tree,1,0,"Configuration")=Value::container('a',"(sa{sv})",{Value::container('r',"sa{sv}",{Value::string("fstab"),dictionary()})});
    Harness h;auto first=h.begin();h.fake.reply(first.slotIndex,"a{oa{sa{sv}}}",{tree});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()&&h.request.error().find("persistent mount configuration")!=std::string::npos);
    prop(tree,1,1,"MountPoints")=Value::container('a',"ay",{pathBytes("/media/Pod")});
    assert(select(reply(tree),identify,selected,error)&&selected.mounted&&selected.configured);
  }
  { Harness h;auto second=h.first(snapshot("vfat",true));h.fake.reply(second.slotIndex,"a{oa{sa{sv}}}",{snapshot("vfat",true)});h.request.poll();assert(h.request.state()==Request::State::done&&h.fake.requests.empty()); }
  { Harness h;auto second=h.first();auto tree=snapshot();prop(tree,1,0,"DeviceNumber")=Value::integer(2067,'t');h.fake.reply(second.slotIndex,"a{oa{sa{sv}}}",{tree});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()); }
  { Harness h;auto second=h.first();auto tree=snapshot();prop(tree,1,0,"IdUUID")=Value::string("new");h.fake.reply(second.slotIndex,"a{oa{sa{sv}}}",{tree});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()); }
  { Harness h;auto first=h.begin();h.topology(block);h.fake.reply(first.slotIndex,"a{oa{sa{sv}}}",{snapshot()});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()); }
  { Harness h;auto mount=h.mount();h.signal(drive,driveInterface,dictionary({property("Serial",Value::string("changed"))}));h.fake.reply(mount.slotIndex,"s",{Value::string("/media/Pod")});h.request.poll();assert(h.request.state()==Request::State::failed); }
  { Harness h;auto first=h.begin();sd_bus_message m;m.member="NameOwnerChanged";h.fake.replies.push_back({h.installs[0].first,std::move(m)});h.fake.reply(first.slotIndex,"a{oa{sa{sv}}}",{snapshot()});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()); }
  { Harness h;auto mount=h.mount();h.fake.reply(mount.slotIndex,"",{},"org.freedesktop.UDisks2.Error.NotAuthorized");h.request.poll();assert(h.request.state()==Request::State::failed&&h.request.error().find("NotAuthorized")!=std::string::npos&&h.request.error().find("secret")==std::string::npos); }
  for (const auto& owner : {":...", ":1..2", ":1.", ":.2", ":1", "1.2", ":1.2'"}) {
    Harness h;assert(h.request.start());h.ack(0);auto request=h.fake.take("GetNameOwner");h.fake.reply(request.slotIndex,"s",{Value::string(owner)});h.request.poll();assert(h.request.state()==Request::State::failed&&h.fake.requests.empty()&&h.installs.size()==1);
  }
  for (int failure=0;failure<4;++failure) {
    Harness h;auto mount=h.mount();
    if(failure==0)h.topology(block);
    else if(failure==1){sd_bus_message m;m.member="NameOwnerChanged";h.fake.replies.push_back({h.installs[0].first,std::move(m)});}
    else if(failure==2)h.fake.transportError=-EPIPE;
    else h.fake.reply(mount.slotIndex,"b",{Value::integer(1,'b')});
    h.request.poll();assert(h.request.state()==Request::State::failed&&h.request.error().find("outcome unknown")!=std::string::npos);
  }
  { Harness h;assert(h.request.start());h.ack(0);auto owner=h.fake.take("GetNameOwner");h.fake.reply(owner.slotIndex,"",{},"org.freedesktop.DBus.Error.NameHasNoOwner");h.request.poll();assert(h.request.error()=="UDisks service unavailable"); }
  { Harness h;auto first=h.begin();h.fake.reply(first.slotIndex,"wrong",{snapshot()});h.request.poll();assert(h.request.state()==Request::State::failed); }
  { Harness h;auto first=h.begin();auto huge=snapshot();prop(huge,0,0,"Serial")=Value::string(std::string(1048577,'x'));h.fake.reply(first.slotIndex,"a{oa{sa{sv}}}",{huge});h.request.poll();assert(h.request.state()==Request::State::failed&&h.request.error().find("oversized")!=std::string::npos); }
  { Harness h;h.fake.transportError=-EPIPE;assert(h.request.start());h.request.poll();assert(h.request.state()==Request::State::failed); }
  { Harness h;assert(h.request.start(std::chrono::milliseconds(0)));h.request.poll();assert(h.request.state()==Request::State::failed&&h.request.error().find("timed out")!=std::string::npos); }
  {
    FakeBus f;size_t pending=0;
    {Request r(identify,&f.api);assert(r.start());pending=0;}
    assert(f.slots[pending]->cancelled);f.reply(pending,"s",{Value::string(":1.42")});assert(f.api.process(nullptr,nullptr)==1);
  }
  std::cout<<"PASS iPod UDisks selection, USB ancestry, finite transaction, stale replies and mount policy (fake OS/bus only)\n";
}
