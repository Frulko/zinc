#include "fake_bus.h"
#include "../../../plugins/ble/native/bluez.h"
#include "../../../plugins/ble/native/gatt_sim.h"
#include <iostream>
using namespace zinc::radio;
static Value iface(std::string name,Value value) { return Value::container('e',"sa{sv}",{Value::string(name),std::move(value)}); }
static Value obj(std::string path,std::vector<Value> interfaces) { return Value::container('e',"oa{sa{sv}}",{Value::string(path,'o'),Value::container('a',"{sa{sv}}",std::move(interfaces))}); }
static Value list(std::vector<std::string> text) { std::vector<Value> values;for(auto& s:text)values.push_back(Value::string(s));return Value::container('a',"s",std::move(values)); }
int main() {
  FakeBus f;BlueZ b(&f.api);const std::string adapter="/org/bluez/hci8",device=adapter+"/dev_FA",service=device+"/service2",characteristic=service+"/char7";
  const std::string suuid="0000180f-0000-1000-8000-00805f9b34fb",cuuid="00002a19-0000-1000-8000-00805f9b34fb";
  auto signal=[&](const std::string& path,const std::string& interface,Value value,std::vector<std::string> invalid=std::vector<std::string>{}) {
    sd_bus_message m;m.path=path;m.interface="org.freedesktop.DBus.Properties";m.member="PropertiesChanged";m.signature="sa{sv}as";m.values={Value::string(interface),std::move(value),list(std::move(invalid))};f.replies.push_back({f.slots[1].get(),std::move(m)});
  };
  b.start();auto snapshot=f.take("GetManagedObjects");
  auto initial=Value::container('a',"{oa{sa{sv}}}",{
    obj(adapter,{iface("org.bluez.Adapter1",dictionary({property("Powered",Value::integer(1,'b'))}))}),
    obj(device,{iface("org.bluez.Device1",dictionary({property("Adapter",Value::string(adapter,'o')),property("Connected",Value::integer(0,'b')),property("ServicesResolved",Value::integer(0,'b'))}))}),
    obj(service,{iface("org.bluez.GattService1",dictionary({property("Device",Value::string(device,'o')),property("UUID",Value::string(suuid))}))}),
    obj(characteristic,{iface("org.bluez.GattCharacteristic1",dictionary({property("Service",Value::string(service,'o')),property("UUID",Value::string(cuuid)),property("Flags",list({"read","write","write-without-response","notify"}))}))})});f.reply(snapshot.slotIndex,"a{oa{sa{sv}}}",{initial});b.poll();
  int h=b.connect("bluez:1",true);auto connected=f.take("Connect");f.reply(connected.slotIndex,"",{});b.poll();assert(b.gattEvents().empty());
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b')),property("ServicesResolved",Value::integer(1,'b'))}));b.poll();
  assert(b.gattEvents()==std::to_string(h)+"\topen\n" && f.requests.empty()); // No UART service or implicit StartNotify needed.
  assert(b.gattTree(h).find("s\t1\t0\t"+suuid)!=std::string::npos && b.gattTree(h).find("c\t2\t1\t"+cuuid)!=std::string::npos);
  assert(b.gattRequest(h,1,0)<0 && b.gattRequest(h,999,0)<0 && b.gattRequest(h,2,2,std::vector<uint8_t>(21))<0);
  int read=b.gattRequest(h,2,0);b.poll();auto r=f.take("ReadValue");assert(r.path==characteristic && r.values[0].contents=="{sv}" && r.values[0].children.empty());
  int write=b.gattRequest(h,2,1,std::vector<uint8_t>(512,255));assert(write>read);b.poll();assert(f.requests.empty()); // Serialized, even across operation kinds.
  b.gattCancel(h,read);f.reply(r.slotIndex,"ay",{bytes({255,0})});b.poll();assert(b.gattEvents().empty());auto w=f.take("WriteValue");assert(w.values[1].property("type")->text=="request" && byteArray(&w.values[0]).size()==512);
  b.gattCancel(h,write);f.reply(w.slotIndex,"",{});b.poll();assert(b.gattEvents().empty() && f.requests.empty()); // Suppress callback, never retry/undo peer write.
  int notify=b.gattRequest(h,2,3);b.poll();auto n=f.take("StartNotify");
  signal(characteristic,"org.bluez.GattCharacteristic1",dictionary({property("Value",bytes({0,255,10}))}));b.poll();assert(b.gattEvents().empty());
  f.reply(n.slotIndex,"",{});b.poll();auto events=b.gattEvents();assert(events==std::to_string(h)+"\tresult\t"+std::to_string(notify)+"\t\t\n"+std::to_string(h)+"\tvalue\t2\t00ff0a\n");
  int stop=b.gattRequest(h,2,4);b.poll();auto sn=f.take("StopNotify");f.reply(sn.slotIndex,"",{});b.poll();assert(b.gattEvents().find("result\t"+std::to_string(stop))!=std::string::npos);
  notify=b.gattRequest(h,2,3);b.poll();n=f.take("StartNotify");b.gattCancel(h,notify);
  signal(characteristic,"org.bluez.GattCharacteristic1",dictionary({property("Value",bytes({9}))}));f.reply(n.slotIndex,"",{});b.poll();assert(b.gattEvents().empty());sn=f.take("StopNotify");f.reply(sn.slotIndex,"",{});b.poll();assert(b.gattEvents().empty());
  notify=b.gattRequest(h,2,3);b.poll();n=f.take("StartNotify");f.reply(n.slotIndex,"",{});b.poll();b.gattEvents();
  stop=b.gattRequest(h,2,4);b.gattCancel(h,stop);b.poll();assert(f.requests.empty()); // Queued cancellation restores the active subscription.
  stop=b.gattRequest(h,2,4);b.poll();sn=f.take("StopNotify");b.gattCancel(h,stop);f.reply(sn.slotIndex,"",{});b.poll();assert(b.gattEvents().empty()); // Issued cancellation cannot roll back StopNotify.
  notify=b.gattRequest(h,2,3);b.poll();n=f.take("StartNotify");f.reply(n.slotIndex,"",{});b.poll();b.gattEvents(); // Can subscribe again; no phantom active state.
  read=b.gattRequest(h,2,0);b.poll();r=f.take("ReadValue");f.reply(r.slotIndex,"",{},"org.bluez.Error.NotAuthorized");b.poll();assert(b.gattEvents().find("6f72672e626c75657a2e4572726f722e4e6f74417574686f72697a6564")!=std::string::npos && f.requests.empty());
  read=b.gattRequest(h,2,0);b.poll();r=f.take("ReadValue");f.reply(r.slotIndex,"ay",{Value::container('a',"y",{Value::integer(99,'q')})});b.poll();events=b.gattEvents();assert(events.find("invalid") == std::string::npos && events.ends_with("\t\n") && events.find("696e76616c6964")!=std::string::npos); // Malformed bytes report error with no partial value.
  read=b.gattRequest(h,2,0);b.gattCancel(h,read);b.poll();assert(f.requests.empty());
  for(int i=0;i<32;++i)assert(b.gattRequest(h,2,0)>0);assert(b.gattRequest(h,2,0)<0);
  signal(characteristic,"org.bluez.GattCharacteristic1",dictionary(),{"UUID"});b.poll();assert(b.gattTree(h).empty() && b.gattRequest(h,2,0)<0);assert(b.gattEvents().find("\tclose\t")!=std::string::npos);
  sn=f.take("StopNotify");assert(sn.path==characteristic); // Try releasing our acknowledged subscription before Disconnect.
  b.poll(std::chrono::steady_clock::now()+std::chrono::seconds(31));assert(b.error().find("cleanup deadline")!=std::string::npos);
  auto d=f.take("Disconnect");f.reply(sn.slotIndex,"",{});f.reply(d.slotIndex,"",{});b.poll();assert(!b.cleanupPending()); // Global budget, no real waiting or accumulating per-characteristic timeouts.
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(0,'b'))}));
  signal(characteristic,"org.bluez.GattCharacteristic1",dictionary({property("UUID",Value::string(cuuid))}));b.poll();
  int fresh=b.connect("bluez:1",true);connected=f.take("Connect");f.reply(connected.slotIndex,"",{});signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b'))}));b.poll();b.gattEvents();
  assert(b.gattRequest(fresh,2,0)<0 && b.gattTree(fresh).find("c\t4\t3\t")!=std::string::npos); // Old identity never targets replacement.
  notify=b.gattRequest(fresh,4,3);b.poll();n=f.take("StartNotify");signal(characteristic,"org.bluez.GattCharacteristic1",dictionary({property("Value",bytes({8}))}));f.reply(n.slotIndex,"",{},"org.bluez.Error.NotAuthorized");b.poll();events=b.gattEvents();assert(events.find("value")==std::string::npos && events.find("result")!=std::string::npos);
  read=b.gattRequest(fresh,4,0);b.poll();r=f.take("ReadValue");b.close(fresh);f.reply(r.slotIndex,"ay",{bytes({9})});b.poll();assert(b.gattEvents().empty());
  d=f.take("Disconnect");f.reply(d.slotIndex,"",{});b.poll();
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(0,'b'))}));b.poll();
  int closing=b.connect("bluez:1",true);connected=f.take("Connect");f.reply(connected.slotIndex,"",{});signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b'))}));b.poll();b.gattEvents();
  notify=b.gattRequest(closing,6,3);b.poll();n=f.take("StartNotify");b.close(closing);assert(f.requests.empty() && b.cleanupPending());
  signal(characteristic,"org.bluez.GattCharacteristic1",dictionary({property("Value",bytes({7}))}));f.reply(n.slotIndex,"",{});b.poll();assert(b.gattEvents().empty());
  sn=f.take("StopNotify");f.reply(sn.slotIndex,"",{},"org.bluez.Error.Failed");b.poll();assert(b.error()=="org.bluez.Error.Failed");d=f.take("Disconnect");f.reply(d.slotIndex,"",{});b.poll();assert(!b.cleanupPending());b.stop();
  // Overflow must preserve terminal events for both retained links and failed connect handles with no Link entry.
  size_t propertySlot=f.slots.size()+1;b.start();snapshot=f.take("GetManagedObjects");f.reply(snapshot.slotIndex,"a{oa{sa{sv}}}",{initial});b.poll();
  int crowded=b.connect("bluez:2",true);connected=f.take("Connect");f.reply(connected.slotIndex,"",{});
  sd_bus_message ready;ready.path=device;ready.interface="org.freedesktop.DBus.Properties";ready.member="PropertiesChanged";ready.signature="sa{sv}as";
  ready.values={Value::string("org.bluez.Device1"),dictionary({property("Connected",Value::integer(1,'b')),property("ServicesResolved",Value::integer(1,'b'))}),list({})};f.replies.push_back({f.slots[propertySlot].get(),std::move(ready)});b.poll();b.gattEvents();
  notify=b.gattRequest(crowded,8,3);b.poll();n=f.take("StartNotify");f.reply(n.slotIndex,"",{});b.poll();b.gattEvents();
  int unknown=b.connect("missing",true);assert(unknown>0);
  int responses=0;for(;responses<80;++responses) {
    if(b.gattRequest(crowded,8,0)<0)break;
    b.poll();r=f.take("ReadValue");f.reply(r.slotIndex,"ay",{bytes(std::vector<uint8_t>(512,255))});b.poll();
  }
  assert(responses<80);events=b.gattEvents();assert(events.size()<=65536 && events.find(std::to_string(crowded)+"\tclose\t")!=std::string::npos && events.find(std::to_string(unknown)+"\tclose\t")!=std::string::npos);
  sn=f.take("StopNotify");f.reply(sn.slotIndex,"",{});b.poll();d=f.take("Disconnect");f.reply(d.slotIndex,"",{});b.poll();b.stop();
  // Repeated remote closes may have an empty error: bound record count, not only byte size.
  propertySlot=f.slots.size()+1;b.start();snapshot=f.take("GetManagedObjects");f.reply(snapshot.slotIndex,"a{oa{sa{sv}}}",{initial});b.poll();
  auto remoteState=[&](bool on) {
    sd_bus_message m;m.path=device;m.interface="org.freedesktop.DBus.Properties";m.member="PropertiesChanged";m.signature="sa{sv}as";
    m.values={Value::string("org.bluez.Device1"),dictionary({property("Connected",Value::integer(on,'b')),property("ServicesResolved",Value::integer(1,'b'))}),list({})};f.replies.push_back({f.slots[propertySlot].get(),std::move(m)});
  };
  for(int i=0;i<512;++i) {
    int handle=b.connect("bluez:3",true);assert(handle>0);connected=f.take("Connect");f.reply(connected.slotIndex,"",{});remoteState(true);b.poll();remoteState(false);b.poll();
  }
  assert(b.connect("bluez:3",true)<0);events=b.gattEvents();assert(std::count(events.begin(),events.end(),'\n')==512 && events.find("\tclose\t\n")!=std::string::npos);b.stop();
  zinc::ble::GattSim sim;int sh=sim.open("zinc-sim");assert(sh>=1073741824);assert(sim.tree(sh).find(cuuid)!=std::string::npos);sim.events();
  int sr=sim.request(sh,2,0,{});sim.cancel(sh,sr);assert(sim.events().empty());assert(sim.request(sh,2,1,std::vector<uint8_t>(512))>0);assert(sim.events().find("result")!=std::string::npos);sim.close(sh);assert(sim.request(sh,2,0,{})<0);
  std::cout<<"generic BlueZ GATT protocol ok\n";
}
