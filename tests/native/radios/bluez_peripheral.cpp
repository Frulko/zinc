#include "fake_bus.h"
#include <sys/socket.h>
#ifndef __linux__
// macOS has no Unix seqpacket sockets. Exercise real packet/fd ownership with datagram
// sockets here; production Linux seqpacket remains an object-only compile proof.
static int hostSocketpair(int domain,int type,int protocol,int* fds){assert(type==SOCK_SEQPACKET);return ::socketpair(domain,SOCK_DGRAM,protocol,fds);}
#define socketpair hostSocketpair
#endif
#include "../../../plugins/ble/native/peripheral.h"
#ifndef __linux__
#undef socketpair
#endif
#include <iostream>
using namespace zinc::radio;
struct Server {
  FakeBus fake;
  std::map<std::string,sd_bus_slot*> exports;
  std::vector<std::pair<Handler,void*>> installed;
  std::map<sd_bus_message*,int> fds;
  std::vector<Value> response;
  std::string error;
  int sentFd=-1, sendError=0, closedBuses=0, next=1;
  static inline Server* current=nullptr;
  Peripheral peripheral;
  Server():peripheral(&fake.api,[this](){return next++;}) {
    current=this;
    fake.api.close_unref=[](sd_bus* b)->sd_bus*{current->closedBuses++;delete b;return nullptr;};
    fake.api.add_match_async=[](sd_bus*,sd_bus_slot** out,const char*,Handler cb,Handler ready,void* data){*out=current->fake.slot(cb,data);current->installed.push_back({ready,data});return 0;};
    fake.api.add_object=[](sd_bus*,sd_bus_slot** out,const char* path,Handler cb,void* data){*out=current->fake.slot(cb,data);current->exports[path]=*out;return 0;};
    fake.api.sender=[](sd_bus_message* m){return m->destination.c_str();};
    fake.api.is_call=[](sd_bus_message*,const char*,const char*){return 1;};
    fake.api.expect_reply=[](sd_bus_message* m){return m->errorMessage=="noreply"?0:1;};
    fake.api.can_send=[](sd_bus*,char t){assert(t=='h');return 1;};
    fake.api.new_return=[](sd_bus_message*,sd_bus_message** out){*out=new sd_bus_message;return 0;};
    fake.api.new_error=[](sd_bus_message*,sd_bus_message** out,const sd_bus_error* e){*out=new sd_bus_message;(*out)->error=e->name;return 0;};
    auto basic=fake.api.append_basic;
    append=basic;
    fake.api.append_basic=[](sd_bus_message* m,char t,const void* p){if(t=='h'){int fd=dup(*static_cast<const int*>(p));assert(fd>=0);current->fds.emplace(m,fd);return 1;}return append(m,t,p);};
    fake.api.message_unref=[](sd_bus_message* m)->sd_bus_message*{auto p=current->fds.find(m);if(p!=current->fds.end()){::close(p->second);current->fds.erase(p);}delete m;return nullptr;};
    fake.api.send=[](sd_bus*,sd_bus_message* m,uint64_t*){if(current->sendError)return -EIO;current->response=m->values;current->error=m->error;auto f=current->fds.find(m);if(f!=current->fds.end()){assert(current->sentFd<0);current->sentFd=dup(f->second);assert(current->sentFd>=0);}return 1;};
  }
  static inline int (*append)(sd_bus_message*,char,const void*)=nullptr;
  ~Server(){if(sentFd>=0)::close(sentFd);assert(fds.empty());}
  void bootstrap(bool duringSnapshot=false) {
    assert(peripheral.start("Zinc",1));
    sd_bus_message empty;
    assert(fake.requests.empty());
    for(auto i=installed.rbegin();i!=installed.rend();++i){i->first(&empty,i->second,nullptr);if(i+1!=installed.rend())assert(fake.requests.empty());}
    installed.clear();
    auto owner=fake.take("GetNameOwner");assert(owner.destination=="org.freedesktop.DBus");
    fake.reply(owner.slotIndex,"s",{Value::string(":1.42")});peripheral.poll();
    auto objects=fake.take("GetManagedObjects");assert(objects.destination==":1.42");
    if(duringSnapshot)fake.reply(0,"oa{sa{sv}}",{});
    fake.reply(objects.slotIndex,"a{oa{sa{sv}}}",{snapshot()});peripheral.poll();
    assert(exports.size()==5);
  }
  static Value iface(const char* name,Value ps){return Value::container('e',"sa{sv}",{Value::string(name),std::move(ps)});}
  static Value object(const char* path,std::vector<Value> ifs){return Value::container('e',"oa{sa{sv}}",{Value::string(path,'o'),Value::container('a',"{sa{sv}}",std::move(ifs))});}
  static Value snapshot() {
    return Value::container('a',"{oa{sa{sv}}}",{
      object("/org/bluez/hci7",{iface("org.bluez.Adapter1",dictionary({property("Powered",Value::integer(1,'b'))})),iface("org.bluez.GattManager1",dictionary()),iface("org.bluez.LEAdvertisingManager1",dictionary({property("SupportedInstances",Value::integer(3,'y'))}))}),
      object("/org/bluez/hci7/dev_A",{iface("org.bluez.Device1",dictionary({property("Adapter",Value::string("/org/bluez/hci7",'o'))}))}),
      object("/org/bluez/hci7/dev_B",{iface("org.bluez.Device1",dictionary({property("Adapter",Value::string("/org/bluez/hci7",'o'))}))})});
  }
  void ready() {
    bootstrap();assert(fake.requests.size()==1);
    auto app=fake.take("RegisterApplication");assert(app.path=="/org/bluez/hci7" && app.values.size()==2 && app.values[0].text==Peripheral::APP && app.values[1].contents=="{sv}" && app.values[1].children.empty());
    fake.reply(app.slotIndex,"",{});peripheral.poll();
    auto ad=fake.take("RegisterAdvertisement");assert(ad.values[0].text==Peripheral::AD && ad.values[1].children.empty());
    fake.reply(ad.slotIndex,"",{});peripheral.poll();assert(peripheral.state()==Peripheral::State::ready);
    assert(peripheral.events().find("ready")!=std::string::npos);
  }
  int invoke(const char* path,const char* iface,const char* member,const char* sig,std::vector<Value> args={},const char* sender=":1.42",bool noReply=false) {
    auto slot=exports.at(path);assert(!slot->cancelled);response.clear();error.clear();
    sd_bus_message m;m.path=path;m.interface=iface;m.member=member;m.signature=sig;m.values=std::move(args);m.destination=sender;if(noReply)m.errorMessage="noreply";
    return slot->callback(&m,slot->data,nullptr);
  }
  void changed(const char* iface,Value changes,Value invalidated=Value::container('a',"s",{})) {
    sd_bus_message m;m.path="/org/bluez/hci7/dev_A";m.interface="org.freedesktop.DBus.Properties";m.member="PropertiesChanged";m.signature="sa{sv}as";
    m.values={Value::string(iface),std::move(changes),std::move(invalidated)};fake.replies.push_back({fake.slots[1].get(),std::move(m)});peripheral.poll();
  }
  static Value options(const char* device){return dictionary({property("device",Value::string(device,'o')),property("mtu",Value::integer(23,'q'))});}
  int acquire(const char* device) {assert(invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{options(device)})>0);assert(error.empty() && sentFd>=0);int out=sentFd;sentFd=-1;return out;}
};
static int fdCount(){int n=0;for(int fd=0;fd<1024;fd++)if(fcntl(fd,F_GETFD)>=0)n++;return n;}
int main(){
  int baseline=fdCount();
  {
    Server s;s.ready();
    s.invoke(Peripheral::APP,"org.freedesktop.DBus.ObjectManager","GetManagedObjects","");assert(s.response.size()==1 && s.response[0].children.size()==3);
    auto tree=s.response[0];
    for(auto& obj:tree.children){auto path=obj.children[0].text;auto& i=obj.children[1].children[0];
      s.invoke(path.c_str(),"org.freedesktop.DBus.Properties","GetAll","s",{i.children[0]});assert(s.response.size()==1 && s.response[0].children.size()==i.children[1].children.size());
      for(auto& prop:i.children[1].children){s.invoke(path.c_str(),"org.freedesktop.DBus.Properties","Get","ss",{i.children[0],prop.children[0]});assert(s.response[0].type=='v');}
      s.invoke(path.c_str(),"org.freedesktop.DBus.Introspectable","Introspect","");assert(s.response[0].text.find(i.children[0].text)!=std::string::npos);
    }
    s.invoke(Peripheral::SERVICE,"org.freedesktop.DBus.Properties","Set","ssv",{Value::string("org.bluez.GattService1"),Value::string("UUID"),Value::variant(Value::string("bad"))});assert(s.error=="org.freedesktop.DBus.Error.PropertyReadOnly");
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci7/dev_A")},":9.9");assert(s.error=="org.bluez.Error.NotAuthorized");
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","s",{Value::string("bad")});assert(!s.error.empty());
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci0/dev_A")});assert(!s.error.empty());
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({1}),Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty());
    int a=s.acquire("/org/bluez/hci7/dev_A"),b=s.acquire("/org/bluez/hci7/dev_B");assert(s.peripheral.events().find("open")!=std::string::npos);
    assert(s.peripheral.write(1,{1,2}) && s.peripheral.write(2,{3,4}));s.peripheral.poll();
    uint8_t buf[32];assert(recv(a,buf,sizeof buf,MSG_DONTWAIT)==2 && buf[0]==1);assert(recv(b,buf,sizeof buf,MSG_DONTWAIT)==2 && buf[0]==3);
    assert(recv(a,buf,sizeof buf,MSG_DONTWAIT)<0 && recv(b,buf,sizeof buf,MSG_DONTWAIT)<0);
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({5,6}),Server::options("/org/bluez/hci7/dev_A")});assert(s.error.empty() && s.peripheral.read(1)==std::vector<uint8_t>({5,6}) && s.peripheral.read(2).empty());
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes(std::vector<uint8_t>(21,7)),Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty() && s.peripheral.read(1).empty());
    auto prepared=Server::options("/org/bluez/hci7/dev_A");prepared.children.push_back(property("prepare-authorize",Value::integer(1,'b')));
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({7}),prepared});assert(!s.error.empty() && s.peripheral.read(1).empty());
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","StartNotify","");assert(!s.error.empty());
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty());
    ::close(a);
#ifndef __linux__
    s.peripheral.close(1); // Darwin datagrams have no seqpacket HUP: this proves explicit close isolation only.
#endif
    s.peripheral.poll();assert(!s.peripheral.owns(1) && s.peripheral.owns(2));
    for(int i=0;i<128;i++)assert(s.peripheral.write(2,std::vector<uint8_t>(20,9)));assert(!s.peripheral.write(2,{9}));
    for(int i=0;i<256;i++)s.peripheral.poll();
    // A blocked peer never makes the finite application queue grow.
    int accepted=0;while(accepted<256 && s.peripheral.write(2,std::vector<uint8_t>(20,9)))accepted++;assert(accepted<=128);
    ::close(b);s.peripheral.stop();
    auto unad=s.fake.take("UnregisterAdvertisement");s.fake.reply(unad.slotIndex,"",{});s.peripheral.poll();
    auto unapp=s.fake.take("UnregisterApplication");s.fake.reply(unapp.slotIndex,"",{});s.peripheral.poll();assert(s.peripheral.state()==Peripheral::State::closed && s.closedBuses==1);
    for(auto& e:s.exports)assert(e.second->cancelled);
  }
  assert(fdCount()==baseline);
  {Server s;s.bootstrap();auto app=s.fake.take("RegisterApplication");s.peripheral.stop();s.peripheral.poll();assert(s.closedBuses==1);s.fake.reply(app.slotIndex,"",{});s.peripheral.poll();assert(s.fake.requests.empty());s.ready();s.peripheral.stop();s.peripheral.poll(std::chrono::steady_clock::now()+std::chrono::seconds(4));assert(s.closedBuses==2);}
  {Server s;s.bootstrap();auto app=s.fake.take("RegisterApplication");s.fake.reply(app.slotIndex,"",{},"org.bluez.Error.Failed");s.peripheral.poll();assert(s.peripheral.state()==Peripheral::State::failed && s.closedBuses==1 && s.peripheral.events().find("failed")!=std::string::npos);}
  {Server s;s.ready();int a=s.acquire("/org/bluez/hci7/dev_A");s.invoke(Peripheral::AD,"org.bluez.LEAdvertisement1","Release","",{},":1.42",true);s.peripheral.poll();assert(s.closedBuses==1 && s.fake.requests.empty());::close(a);}
  {Server s;s.ready();int a=s.acquire("/org/bluez/hci7/dev_A");
    s.fake.reply(2,"sss",{Value::string("org.bluez"),Value::string(":1.42"),Value::string("")});s.peripheral.poll();
    assert(s.closedBuses==1 && !s.peripheral.owns(1) && s.peripheral.events().find("failed")!=std::string::npos);::close(a);}
  {Server s;s.ready();s.sendError=1;s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci7/dev_A")});assert(!s.peripheral.owns(1) && s.sentFd<0);}
  {Server s;s.fake.api.add_object=nullptr;assert(!s.peripheral.start("Zinc",1));assert(s.fake.requests.empty());Bus central(&s.fake.api);assert(central.start());assert(central.call("org.bluez","/","org.freedesktop.DBus.ObjectManager","GetManagedObjects",{},[](const Reply&){}));}
  {Server s;s.ready();
    // A hot ObjectManager change fences mutation until the subscribed snapshot catches up.
    s.fake.reply(0,"oa{sa{sv}}",{Value::string("/org/bluez/hci7/dev_C",'o'),Value::container('a',"{sa{sv}}",{})});s.peripheral.poll();
    auto refresh=s.fake.take("GetManagedObjects");
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty());
    auto objects=Server::snapshot();objects.children.push_back(Server::object("/org/bluez/hci7/dev_C",{Server::iface("org.bluez.Device1",dictionary({property("Adapter",Value::string("/org/bluez/hci7",'o'))}))}));
    s.fake.reply(refresh.slotIndex,"a{oa{sa{sv}}}",{objects});s.peripheral.poll();int c=s.acquire("/org/bluez/hci7/dev_C");::close(c);s.peripheral.stop();s.peripheral.poll(std::chrono::steady_clock::now()+std::chrono::seconds(4));}
  {Server s;s.bootstrap(true);auto app=s.fake.take("RegisterApplication");s.fake.reply(app.slotIndex,"",{});s.peripheral.poll();auto ad=s.fake.take("RegisterAdvertisement");s.fake.reply(ad.slotIndex,"",{});s.peripheral.poll();auto refresh=s.fake.take("GetManagedObjects");s.fake.reply(refresh.slotIndex,"a{oa{sa{sv}}}",{Server::snapshot()});s.peripheral.poll();assert(s.peripheral.state()==Peripheral::State::ready);}
  {Server s;s.ready();
    for(int i=1;i<=512;i++) {int fd=s.acquire("/org/bluez/hci7/dev_A");::close(fd);s.peripheral.close(i);}
    s.invoke(Peripheral::TX,"org.bluez.GattCharacteristic1","AcquireNotify","a{sv}",{Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty() && s.sentFd<0);
    auto rows=s.peripheral.events();assert(std::count(rows.begin(),rows.end(),'\x1e')==512 && rows.size()<32768);
    int fd=s.acquire("/org/bluez/hci7/dev_A");::close(fd);s.peripheral.stop();s.peripheral.poll(std::chrono::steady_clock::now()+std::chrono::seconds(4));
  }
  {Server s;s.ready();int fd=s.acquire("/org/bluez/hci7/dev_A");
    s.changed("org.bluez.Device1",dictionary({property("RSSI",Value::integer(40,'n')),property("Name",Value::string("new name"))}));
    assert(s.fake.requests.empty());s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({1}),Server::options("/org/bluez/hci7/dev_A")});assert(s.error.empty());
    s.changed("org.bluez.Device1",dictionary(),Value::container('a',"s",{Value::string("Adapter")}));auto refresh=s.fake.take("GetManagedObjects");
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({2}),Server::options("/org/bluez/hci7/dev_A")});assert(!s.error.empty());
    s.fake.reply(refresh.slotIndex,"a{oa{sa{sv}}}",{Server::snapshot()});s.peripheral.poll();
    s.invoke(Peripheral::RX,"org.bluez.GattCharacteristic1","WriteValue","aya{sv}",{bytes({3}),Server::options("/org/bluez/hci7/dev_A")});assert(s.error.empty());::close(fd);
  }
  assert(fdCount()==baseline);std::cout<<"BlueZ targeted peripheral ok\n";
}
