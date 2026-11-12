#include "fake_bus.h"
#include "../../../plugins/ble/native/ble.linux.cpp"
#include <cassert>
#include <iostream>
using namespace zinc::radio;
namespace zrt { bool idle_frame=false; bool poll_pollers(); }
static bool denied=true;
extern "C" int zn_host_permission(const char* feature,const char*,char*,int) { assert(std::string(feature)=="bluetooth"); return denied?1:0; }
int main() {
  unsetenv("ZINC_NATIVE"); unsetenv("ZINC_BLE_SIM"); unsetenv("ZINC_DETERMINISTIC");
  zinc::radio::FakeBus f; LinuxBle b(&f.api);
  assert(std::string(b.state().ptr(),b.state().bytes())=="unauthorized");
  assert(!b.has() && !b.powered(true) && !b.discover(zrt::String::from("",0)));
  b.scan(); assert(b.connect(zrt::String::from("fake",4))==-1);
  assert(b.events().bytes()==0 && f.slots.empty() && f.requests.empty());
  denied=false; assert(!b.has()); assert(f.take("GetManagedObjects").destination=="org.bluez"); b.stop();
  assert(!b.has()); auto enumeration=f.take("GetManagedObjects");
  const std::string adapter="/org/bluez/hci9", device=adapter+"/dev_AA";
  auto adapterIf=Value::container('e',"sa{sv}",{Value::string("org.bluez.Adapter1"),dictionary({property("Powered",Value::integer(1,'b'))})});
  auto deviceIf=Value::container('e',"sa{sv}",{Value::string("org.bluez.Device1"),dictionary({property("Adapter",Value::string(adapter,'o')),property("Connected",Value::integer(0,'b'))})});
  auto map=Value::container('a',"{oa{sa{sv}}}",{
    Value::container('e',"oa{sa{sv}}",{Value::string(adapter,'o'),Value::container('a',"{sa{sv}}",{adapterIf})}),
    Value::container('e',"oa{sa{sv}}",{Value::string(device,'o'),Value::container('a',"{sa{sv}}",{deviceIf})})});
  f.reply(enumeration.slotIndex,"a{oa{sa{sv}}}",{map}); zrt::poll_pollers();
  int pending=b.connect(zrt::String::from("bluez:1",7)); auto connection=f.take("Connect"); b.close(pending); assert(f.requests.empty());
  f.reply(connection.slotIndex,"",{}); assert(zrt::poll_pollers()); auto disconnect=f.take("Disconnect");
  f.reply(disconnect.slotIndex,"",{}); assert(!zrt::poll_pollers()); b.stop();
  setenv("ZINC_BLE_SIM","1",1); LinuxBle sim(&f.api);
  assert(sim.has()); sim.scan(); assert(sim.events().bytes()>0);
  int h=sim.connect(zrt::String::from("zinc-sim",8)); zrt::Array<uint8_t> empty; assert(!sim.write(h,empty)); empty=zrt::Array<uint8_t>::with_cap(0); assert(sim.write(h,empty)); auto chunk=zrt::Array<uint8_t>::with_cap(2); chunk.a->len=2; static_cast<uint8_t*>(chunk.a->data)[0]=255; static_cast<uint8_t*>(chunk.a->data)[1]=0;
  assert(sim.write(h,chunk)); auto out=sim.read(h); assert(out.length()==2 && static_cast<uint8_t*>(out.a->data)[0]==255);
  sim.close(h); assert(!sim.write(h,chunk)); sim.stop();
  unsetenv("ZINC_BLE_SIM"); std::cout<<"BLE permission before backend and native simulator ok\n";
}
