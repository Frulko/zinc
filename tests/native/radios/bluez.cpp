#include "fake_bus.h"
#include "../../../plugins/ble/native/bluez.h"
#include <iostream>
using namespace zinc::radio;
static Value iface(std::string name, Value props) { return Value::container('e',"sa{sv}",{Value::string(name),std::move(props)}); }
static Value obj(std::string path, std::vector<Value> interfaces) { return Value::container('e',"oa{sa{sv}}",{Value::string(path,'o'),Value::container('a',"{sa{sv}}",std::move(interfaces))}); }
static Value list(std::vector<std::string> strings) { std::vector<Value> vs; for(auto& s:strings) vs.push_back(Value::string(s)); return Value::container('a',"s",std::move(vs)); }
int main() {
  FakeBus f; BlueZ b(&f.api);
  const std::string adapter="/org/bluez/hci7", device=adapter+"/dev_AB", service=device+"/service9", rx=service+"/char8", tx=service+"/char3";
  auto signal = [&](std::string path,std::string interface,Value props,std::vector<std::string> invalid={}) {
    sd_bus_message m; m.path=path; m.interface="org.freedesktop.DBus.Properties"; m.member="PropertiesChanged"; m.signature="sa{sv}as";
    m.values={Value::string(interface),std::move(props),list(std::move(invalid))}; f.replies.push_back({f.slots[1].get(),std::move(m)});
  };
  auto enumeration = [&] {
    auto request=f.take("GetManagedObjects"); assert(request.path=="/" && request.destination=="org.bluez" && request.values.empty());
    return request;
  };
  auto snapshot = [&] {return Value::container('a',"{oa{sa{sv}}}",{
    obj("/org/bluez",{iface("org.bluez.AgentManager1",dictionary())}),
    obj(adapter,{iface("org.bluez.Adapter1",dictionary({property("Powered",Value::integer(1,'b'))}))}),
    obj(device,{iface("org.bluez.Device1",dictionary({property("Adapter",Value::string(adapter,'o')),property("Name",Value::string("peer\x1f\x1e")),property("RSSI",Value::integer(static_cast<uint16_t>(-73),'n')),property("Connected",Value::integer(0,'b')),property("ServicesResolved",Value::integer(0,'b')),property("UUIDs",list({BlueZ::UART})),property("ManufacturerData",Value::container('a',"{qv}",{Value::container('e',"qv",{Value::integer(65535,'q'),Value::variant(bytes({0,255,31,30}))})})),property("ServiceData",dictionary({property(BlueZ::UART,bytes({255,0,10}))})),property("AdvertisingData",Value::container('a',"{yv}",{Value::container('e',"yv",{Value::integer(48,'y'),Value::variant(bytes({30,255}))})}))}))}),
    obj(service,{iface("org.bluez.GattService1",dictionary({property("Device",Value::string(device,'o')),property("UUID",Value::string(BlueZ::UART))}))}),
    obj(rx,{iface("org.bluez.GattCharacteristic1",dictionary({property("Service",Value::string(service,'o')),property("UUID",Value::string(BlueZ::RX)),property("Flags",list({"write"}))}))}),
    obj(tx,{iface("org.bluez.GattCharacteristic1",dictionary({property("Service",Value::string(service,'o')),property("UUID",Value::string(BlueZ::TX)),property("Flags",list({"notify"}))}))})});};
  assert(b.scan()); auto initial=enumeration(); assert(!b.has());
  signal(device,"org.bluez.Device1",dictionary({property("RSSI",Value::integer(static_cast<uint16_t>(-42),'n'))}));
  f.reply(initial.slotIndex,"a{oa{sa{sv}}}",{snapshot()}); b.poll(); assert(b.has() && b.state().empty());
  auto filter=f.take("SetDiscoveryFilter"); assert(filter.path==adapter && filter.values[0].property("Transport")->text=="le");
  assert(filter.values[0].property("UUIDs")->children[0].text==BlueZ::UART);
  f.reply(filter.slotIndex,"",{}); b.poll(); auto start=f.take("StartDiscovery");
  // Stop/replacement while StartDiscovery is pending must release precisely our acknowledged session.
  b.stopScan(); assert(b.scan()); f.reply(start.slotIndex,"",{}); b.poll(); auto stop=f.take("StopDiscovery"); assert(b.advertisements().empty());
  f.reply(stop.slotIndex,"",{}); b.poll(); filter=f.take("SetDiscoveryFilter"); f.reply(filter.slotIndex,"",{}); b.poll(); start=f.take("StartDiscovery"); f.reply(start.slotIndex,"",{}); b.poll();
  auto rows=b.advertisements(); assert(rows.find("bluez:1\t706565721f1e\t-42\t")!=std::string::npos && rows.find("65535=00ff1f1e")!=std::string::npos && rows.find("ff000a")!=std::string::npos && rows.find("48=1eff")!=std::string::npos);
  auto events=b.events(); assert(events.find("device\x1f-1\x1f" "bluez:1\x1fpeer  \x1f-42\x1e")!=std::string::npos);
  signal(device,"org.bluez.Device1",dictionary(),{"RSSI","ManufacturerData","ServiceData"}); b.poll(); rows=b.advertisements(); assert(rows.find("\t127\t")!=std::string::npos && rows.find("65535=")==std::string::npos && rows.find("ff000a")==std::string::npos);
  b.stopScan(); stop=f.take("StopDiscovery"); f.reply(stop.slotIndex,"",{}); b.poll(); b.events();
  int h=b.connect("bluez:1"); auto connect=f.take("Connect"); assert(connect.path==device);
  f.reply(connect.slotIndex,"",{}); b.poll(); assert(b.events().empty()); // accepted is not connected or GATT-ready
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b'))})); b.poll(); assert(b.events().empty());
  signal(device,"org.bluez.Device1",dictionary({property("ServicesResolved",Value::integer(1,'b'))})); b.poll(); auto notify=f.take("StartNotify"); assert(notify.path==tx); assert(b.events().empty());
  f.reply(notify.slotIndex,"",{}); b.poll(); assert(b.events().find("open\x1f"+std::to_string(h))!=std::string::npos);
  signal(tx,"org.bluez.GattCharacteristic1",dictionary({property("Value",bytes({0,255,10}))})); b.poll(); assert(b.read(h)==std::vector<uint8_t>({0,255,10}));
  for (int i=0;i<1000;i++) assert(b.write(h,{})); b.poll(); assert(f.requests.empty());
  assert(b.write(h,{1,2}) && b.write(h,{3})); b.poll(); auto write=f.take("WriteValue"); assert(write.path==rx && byteArray(&write.values[0])==std::vector<uint8_t>({1,2}) && write.values[1].property("type")->text=="request");
  b.poll(); assert(f.requests.empty()); // one outstanding write, never a blind retry
  f.reply(write.slotIndex,"",{},"org.bluez.Error.NotAuthorized"); b.poll(); assert(b.events().find("close\x1f"+std::to_string(h))!=std::string::npos); assert(b.error()=="org.bluez.Error.NotAuthorized" && b.error().find("secret")==std::string::npos); auto disconnected=f.take("Disconnect"); f.reply(disconnected.slotIndex,"",{}); b.poll();
  assert(!b.write(h,{1}));
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(0,'b'))})); b.poll();
  int failed=b.connect("bluez:1"); connect=f.take("Connect"); f.reply(connect.slotIndex,"",{},"org.bluez.Error.InProgress"); b.poll(); assert(b.events().find("close\x1f"+std::to_string(failed))!=std::string::npos && f.requests.empty());
  int cancelled=b.connect("bluez:1"); connect=f.take("Connect"); b.close(cancelled); assert(f.requests.empty() && b.cleanupPending());
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(0,'b'))})); b.poll(); assert(f.requests.empty() && b.cleanupPending());
  f.reply(connect.slotIndex,"",{}); b.poll(); disconnected=f.take("Disconnect"); f.reply(disconnected.slotIndex,"",{}); b.poll(); assert(!b.cleanupPending() && b.events().empty());
  int invalidated=b.connect("bluez:1"); connect=f.take("Connect"); f.reply(connect.slotIndex,"",{}); b.poll();
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b'))})); b.poll(); notify=f.take("StartNotify");
  signal(tx,"org.bluez.GattCharacteristic1",dictionary(),{"Flags"}); b.poll();
  assert(b.events().find("close\x1f"+std::to_string(invalidated))!=std::string::npos);
  disconnected=f.take("Disconnect"); f.reply(disconnected.slotIndex,"",{}); f.reply(notify.slotIndex,"",{}); b.poll(); assert(b.events().empty());
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(0,'b'))}));
  signal(tx,"org.bluez.GattCharacteristic1",dictionary({property("Flags",list({"notify"}))})); b.poll();
  int unresolved=b.connect("bluez:1"); connect=f.take("Connect"); f.reply(connect.slotIndex,"",{}); b.poll();
  signal(device,"org.bluez.Device1",dictionary({property("Connected",Value::integer(1,'b'))})); b.poll(); notify=f.take("StartNotify"); f.reply(notify.slotIndex,"",{}); b.poll(); b.events();
  signal(device,"org.bluez.Device1",dictionary(),{"ServicesResolved"}); b.poll(); assert(b.events().find("close\x1f"+std::to_string(unresolved))!=std::string::npos);
  disconnected=f.take("Disconnect"); f.reply(disconnected.slotIndex,"",{}); b.poll();
  assert(b.power(false)); auto power=f.take("Set"); assert(power.path==adapter && power.values[0].text=="org.bluez.Adapter1" && power.values[1].text=="Powered" && power.values[2].children[0].number==0);
  b.stop(); assert(!b.has());
  // Old replies after restart are cancelled, and opaque identities are never recycled.
  f.reply(power.slotIndex,"",{}); b.start(); auto fresh=enumeration(); f.reply(fresh.slotIndex,"a{oa{sa{sv}}}",{snapshot()}); b.poll(); assert(b.has());
  auto stale=b.connect("bluez:1"); assert(b.events().find("close\x1f"+std::to_string(stale))!=std::string::npos && f.requests.empty());
  b.stop(); b.start(); fresh=enumeration(); f.reply(fresh.slotIndex,"a{oa{sa{sv}}}",{Value::container('a',"{oa{sa{sv}}}",{})}); b.poll(); assert(!b.has() && b.state()=="unsupported");
  int rejected=0; for (int i=0;i<4000;i++) { if (b.connect("unknown")<0) { rejected=i; break; } } assert(rejected>0 && b.events().size()<=65536);
  b.stop(); b.start(); auto oversized=enumeration(); std::vector<Value> many;
  for (int i=0;i<60;i++) many.push_back(obj(adapter+"/large_"+std::to_string(i),{iface("org.bluez.Device1",dictionary({property("Name",Value::string(std::string(20000,'n')))}))}));
  f.reply(oversized.slotIndex,"a{oa{sa{sv}}}",{Value::container('a',"{oa{sa{sv}}}",std::move(many))}); b.poll();
  assert(b.status()==BlueZ::State::failed && !b.has() && b.error().find("oversized")!=std::string::npos);
  b.stop(); std::cout<<"radio BlueZ discovery and UART protocol ok\n";
}
