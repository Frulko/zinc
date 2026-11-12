#pragma once
#include "radio_dbus.h"
#include <algorithm>
#include <chrono>
#include <climits>
#include <deque>
#include <map>
#include <set>
#include <sys/socket.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>

namespace zinc::radio {
// A private bus makes cancellation release BlueZ's connection-bound registrations.
class Peripheral {
public:
  enum class State { idle, discovering, application, advertisement, ready, stopping, closed, failed };
  static constexpr const char* APP="/org/zinc/uart", *SERVICE="/org/zinc/uart/service", *RX="/org/zinc/uart/service/rx", *TX="/org/zinc/uart/service/tx", *AD="/org/zinc/advertisement";
private:
  static constexpr const char* UART_UUID="6e400001-b5a3-f393-e0a9-e50e24dcca9e", *RX_UUID="6e400002-b5a3-f393-e0a9-e50e24dcca9e", *TX_UUID="6e400003-b5a3-f393-e0a9-e50e24dcca9e";
  Bus bus;
  State phase=State::idle;
  uint64_t generation=0;
  int cycle=0;
  unsigned subscriptions=0;
  std::string owner, adapter, name, reason, eventOut;
  size_t eventRecords=0;
  enum class Refresh { idle, pending, dirty } refresh=Refresh::idle;
  bool refreshTo(Refresh next) {
    bool ok=(next==Refresh::pending && refresh==Refresh::idle) || (next==Refresh::dirty && refresh!=Refresh::dirty) || (next==Refresh::idle && refresh!=Refresh::idle);
    if(ok)refresh=next;return ok;
  }
  std::vector<sd_bus_slot*> exports;
  std::set<std::string> devices;
  std::function<int()> allocate;
  std::function<void(const std::string&)> report;
  void emit(const std::string& row){eventOut+=row;++eventRecords;}
  std::chrono::steady_clock::time_point deadline;
  struct Peer {
    enum class State { open, closed } phase=State::open;
    int fd, h; uint16_t mtu; std::string device;
    size_t queued=0;
    std::deque<std::vector<uint8_t>> outgoing;
    std::vector<uint8_t> incoming;
    bool transition(State next) { if(phase!=State::open || next!=State::closed)return false;phase=next;return true; }
  };
  std::map<int,Peer> peers;
  bool transition(State next) {
    bool ok=(phase==State::idle || phase==State::closed || phase==State::failed)? next==State::discovering :
      (next==State::failed || next==State::stopping || (phase==State::discovering && next==State::application) ||
       (phase==State::application && next==State::advertisement) || (phase==State::advertisement && next==State::ready) || (phase==State::stopping && next==State::closed));
    if(ok)phase=next;return ok;
  }
  void closePeer(int h, bool event=true) {
    auto p=peers.find(h);if(p==peers.end())return;
    if(p->second.transition(Peer::State::closed))::close(p->second.fd);
    peers.erase(p);if(event)emit("close\x1f"+std::to_string(h)+'\x1e');
  }
  void cleanup() {
    while(!peers.empty())closePeer(peers.begin()->first);
    auto& a=bus.rawApi();for(auto* slot:exports)a.slot_unref(slot);exports.clear();
    bus.stop();owner.clear();adapter.clear();devices.clear();
  }
  void fail(const std::string& why) {
    if(phase==State::failed || phase==State::closed || phase==State::idle)return;
    reason=why;if(report)report(why);transition(State::failed);
    // Hex keeps the sanitized reason out of the event delimiters.
    emit("advertisement\x1f"+std::to_string(cycle)+"\x1f" "failed\x1f"+hex(std::vector<uint8_t>(why.begin(),why.end()))+'\x1e');
  }
  bool call(const std::string& path,const char* iface,const char* member,std::vector<Value> args,Bus::Callback cb) {
    auto g=generation;
    return bus.call(owner.c_str(),path,iface,member,std::move(args),[this,g,cb=std::move(cb)](const Reply& r){if(g==generation && phase!=State::failed && phase!=State::closed)cb(r);},3000000);
  }
  static Value strings(std::initializer_list<const char*> ss) {std::vector<Value> v;for(auto s:ss)v.push_back(Value::string(s));return Value::container('a',"s",std::move(v));}
  const char* interfaceFor(const std::string& path) const {
    return path==SERVICE?"org.bluez.GattService1":path==RX || path==TX?"org.bluez.GattCharacteristic1":path==AD?"org.bluez.LEAdvertisement1":"";
  }
  Value properties(const std::string& path) const {
    if(path==SERVICE)return dictionary({property("UUID",Value::string(UART_UUID)),property("Primary",Value::integer(1,'b'))});
    if(path==RX || path==TX) {
      std::vector<Value> ps={property("UUID",Value::string(path==RX?RX_UUID:TX_UUID)),property("Service",Value::string(SERVICE,'o')),property("Flags",path==RX?strings({"write","write-without-response"}):strings({"notify"}))};
      if(path==TX)ps.push_back(property("NotifyAcquired",Value::integer(!peers.empty(),'b')));
      return dictionary(std::move(ps));
    }
    if(path==AD)return dictionary({property("Type",Value::string("peripheral")),property("ServiceUUIDs",strings({UART_UUID})),property("LocalName",Value::string(name))});
    return dictionary();
  }
  Value managed() const {
    std::vector<Value> objects;
    for(auto path:{SERVICE,RX,TX})objects.push_back(Value::container('e',"oa{sa{sv}}",{Value::string(path,'o'),Value::container('a',"{sa{sv}}",{Value::container('e',"sa{sv}",{Value::string(interfaceFor(path)),properties(path)})})}));
    return Value::container('a',"{oa{sa{sv}}}",std::move(objects));
  }
  std::string xml(const std::string& path) const {
    std::string s="<node><interface name='org.freedesktop.DBus.Introspectable'><method name='Introspect'><arg direction='out' type='s'/></method></interface>";
    if(path==APP)return s+"<interface name='org.freedesktop.DBus.ObjectManager'><method name='GetManagedObjects'><arg direction='out' type='a{oa{sa{sv}}}'/></method></interface><node name='service'/></node>";
    s+="<interface name='org.freedesktop.DBus.Properties'><method name='Get'><arg direction='in' type='s'/><arg direction='in' type='s'/><arg direction='out' type='v'/></method><method name='GetAll'><arg direction='in' type='s'/><arg direction='out' type='a{sv}'/></method><method name='Set'><arg direction='in' type='s'/><arg direction='in' type='s'/><arg direction='in' type='v'/></method></interface><interface name='"+std::string(interfaceFor(path))+"'>";
    if(path==AD)s+="<method name='Release'><annotation name='org.freedesktop.DBus.Method.NoReply' value='true'/></method><property name='Type' type='s' access='read'/><property name='ServiceUUIDs' type='as' access='read'/><property name='LocalName' type='s' access='read'/>";
    else if(path==SERVICE)s+="<property name='UUID' type='s' access='read'/><property name='Primary' type='b' access='read'/>";
    else {
      s+="<property name='UUID' type='s' access='read'/><property name='Service' type='o' access='read'/><property name='Flags' type='as' access='read'/>";
      if(path==RX)s+="<method name='WriteValue'><arg direction='in' type='ay'/><arg direction='in' type='a{sv}'/></method>";
      else s+="<property name='NotifyAcquired' type='b' access='read'><annotation name='org.freedesktop.DBus.Property.EmitsChangedSignal' value='false'/></property><method name='AcquireNotify'><arg direction='in' type='a{sv}'/><arg direction='out' type='h'/><arg direction='out' type='q'/></method><method name='StartNotify'/><method name='StopNotify'/>";
    }
    return s+"</interface>"+(path==SERVICE?"<node name='rx'/><node name='tx'/>":"")+"</node>";
  }
  int reply(sd_bus_message* m,std::vector<Value> values={},const char* error=nullptr,int fd=-1,uint16_t mtu=0) {
    auto& a=bus.rawApi();
    if(a.expect_reply(m)==0)return 1;
    sd_bus_message* out=nullptr;sd_bus_error e{error,"UART request rejected",0};
    int n=error?a.new_error(m,&out,&e):a.new_return(m,&out);
    struct Guard { Api& a;sd_bus_message* m;~Guard(){if(m)a.message_unref(m);} } guard{a,out};
    if(n<0 || !out)return -EIO;
    for(auto& v:values)if(!appendValue(a,out,v))return -EIO;
    if(fd>=0 && (a.append_basic(out,'h',&fd)<0 || a.append_basic(out,'q',&mtu)<0))return -EIO;
    return a.send(bus.rawBus(),out,nullptr)<0?-EIO:1;
  }
  bool options(const Value& v,std::string& device,uint16_t& mtu,bool write) {
    if(v.type!='a' || v.contents!="{sv}" || v.children.size()>8)return false;
    std::set<std::string> seen;
    for(auto& p:v.children) {
      if(p.type!='e' || p.children.size()!=2 || p.children[0].type!='s' || !seen.insert(p.children[0].text).second || p.children[1].type!='v' || p.children[1].children.size()!=1)return false;
      auto key=p.children[0].text;auto& x=p.children[1].children[0];
      if(key=="device") {if(x.type!='o')return false;device=x.text;}
      else if(key=="mtu") {if(x.type!='q' || x.number<23 || x.number>517)return false;mtu=x.number;}
      else if(key=="offset") {if(!write || x.type!='q' || x.number!=0)return false;}
      else if(key=="prepare-authorize") {if(!write || x.type!='b' || x.number!=0)return false;}
      else if(key=="type") {if(!write || x.type!='s' || (x.text!="request" && x.text!="command"))return false;}
      else if(key=="link") {if(x.type!='s' || x.text!="LE")return false;}
      else return false;
    }
    return !device.empty() && mtu>=23 && devices.count(device);
  }
  static int dispatch(sd_bus_message* m,void* data,sd_bus_error*) {return static_cast<Peripheral*>(data)->handle(m);}
  int handle(sd_bus_message* m) {
    auto& a=bus.rawApi();auto sender=a.sender(m);
    if(!a.is_call(m,nullptr,nullptr))return 0;
    if(owner.empty() || !sender || owner!=sender)return reply(m,{},"org.bluez.Error.NotAuthorized");
    auto r=readReply(a,m);if(!r.ok())return reply(m,{},"org.bluez.Error.InvalidArguments");
    auto deny=[&](){return reply(m,{},"org.bluez.Error.NotSupported");};
    if(r.interface=="org.freedesktop.DBus.Introspectable" && r.member=="Introspect" && r.signature.empty())return reply(m,{Value::string(xml(r.path))});
    if(r.path==APP && r.interface=="org.freedesktop.DBus.ObjectManager" && r.member=="GetManagedObjects" && r.signature.empty())return reply(m,{managed()});
    if(r.interface=="org.freedesktop.DBus.Properties") {
      auto p=properties(r.path);auto iface=interfaceFor(r.path);
      if(r.values.empty() || r.values[0].type!='s' || r.values[0].text!=iface)return reply(m,{},"org.freedesktop.DBus.Error.UnknownInterface");
      if(r.member=="GetAll" && r.signature=="s" && r.values.size()==1)return reply(m,{std::move(p)});
      if((r.member=="Get" && r.signature=="ss" && r.values.size()==2) || (r.member=="Set" && r.signature=="ssv" && r.values.size()==3)) {
        if(r.values[1].type!='s')return deny();auto v=p.property(r.values[1].text);
        if(!v)return reply(m,{},"org.freedesktop.DBus.Error.UnknownProperty");
        return r.member=="Set"?reply(m,{},"org.freedesktop.DBus.Error.PropertyReadOnly"):reply(m,{Value::variant(*v)});
      }
      return deny();
    }
    if(r.path==AD && r.interface=="org.bluez.LEAdvertisement1" && r.member=="Release" && r.signature.empty()) {int n=reply(m);fail("BlueZ released advertisement");return n;}
    if(phase!=State::ready)return reply(m,{},"org.bluez.Error.NotReady");
    if(r.interface!="org.bluez.GattCharacteristic1")return deny();
    if(r.path==TX && r.member=="AcquireNotify" && r.signature=="a{sv}" && r.values.size()==1) {
      std::string device;uint16_t mtu=0;
      if(refresh!=Refresh::idle || !options(r.values[0],device,mtu,false))return reply(m,{},"org.bluez.Error.InvalidArguments");
      for(auto& p:peers)if(p.second.device==device)return reply(m,{},"org.bluez.Error.NotPermitted");
      if(eventOut.size()>=32768 || eventRecords>=512 || peers.size()>=16 || a.can_send(bus.rawBus(),'h')<=0)return deny();
      int fds[2];if(socketpair(AF_UNIX,SOCK_SEQPACKET,0,fds)<0)return reply(m,{},"org.bluez.Error.Failed");
      struct Fds {int* f;~Fds(){for(int i=0;i<2;i++)if(f[i]>=0)::close(f[i]);}} guard{fds};
      for(int fd:fds) {
        if(fcntl(fd,F_SETFD,FD_CLOEXEC)<0 || fcntl(fd,F_SETFL,O_NONBLOCK)<0)return reply(m,{},"org.bluez.Error.Failed");
#ifdef SO_NOSIGPIPE
        int on=1;if(setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&on,sizeof on)<0)return reply(m,{},"org.bluez.Error.Failed");
#endif
      }
      int h=allocate();if(h<0)return deny();
      if(a.expect_reply(m)<=0)return deny();
      int n=reply(m,{},nullptr,fds[1],mtu);if(n<0)return n;
      peers.emplace(h,Peer{Peer::State::open,fds[0],h,mtu,device,0,{},{}});fds[0]=-1;
      emit("open\x1f"+std::to_string(h)+'\x1f'+"incoming-"+std::to_string(h)+"\x1f\x1e");return n;
    }
    if(r.path==RX && r.member=="WriteValue" && r.signature=="aya{sv}" && r.values.size()==2) {
      std::string device;uint16_t mtu=0;
      if(refresh!=Refresh::idle || !options(r.values[1],device,mtu,true) || r.values[0].type!='a' || r.values[0].contents!="y")return reply(m,{},"org.bluez.Error.InvalidArguments");
      for(auto& p:peers)if(p.second.device==device) {
        auto& peer=p.second;auto data=byteArray(&r.values[0]);
        if(mtu!=peer.mtu || data.size()!=r.values[0].children.size() || data.size()>512 || data.size()>mtu-3u || peer.incoming.size()+data.size()>65536)return reply(m,{},"org.bluez.Error.InvalidValueLength");
        int n=reply(m);if(n>0)peer.incoming.insert(peer.incoming.end(),data.begin(),data.end());return n;
      }
      return reply(m,{},"org.bluez.Error.NotPermitted");
    }
    return deny(); // StartNotify has no peer identity; never fall back to broadcast.
  }
  void snapshot(const Reply& r) {
    if(r.signature!="a{oa{sa{sv}}}" || r.values.size()!=1 || r.values[0].children.size()>256) {fail("invalid BlueZ peripheral snapshot");return;}
    std::set<std::string> candidates;devices.clear();
    for(auto& e:r.values[0].children) {
      if(e.type!='e' || e.children.size()!=2 || e.children[0].type!='o' || e.children[1].type!='a' || e.children[1].contents!="{sa{sv}}") {fail("invalid BlueZ peripheral object");return;}
      std::map<std::string,Value> ifaces;
      for(auto& i:e.children[1].children)if(i.type=='e' && i.children.size()==2 && i.children[0].type=='s')ifaces.emplace(i.children[0].text,i.children[1]);
      auto p=ifaces.find("org.bluez.Adapter1");
      if(p!=ifaces.end() && ifaces.count("org.bluez.GattManager1") && ifaces.count("org.bluez.LEAdvertisingManager1")) {
        auto on=p->second.property("Powered");auto count=ifaces.at("org.bluez.LEAdvertisingManager1").property("SupportedInstances");
        if(on && on->type=='b' && on->number==1 && count && count->type=='y' && count->number>0)candidates.insert(e.children[0].text);
      }
    }
    if(adapter.empty()) {if(candidates.empty()){fail("BlueZ powered GATT/LE adapter unavailable");return;}adapter=*candidates.begin();}
    if(!candidates.count(adapter)){fail("BlueZ peripheral adapter unavailable");return;}
    for(auto& e:r.values[0].children)for(auto& i:e.children[1].children)if(i.type=='e' && i.children.size()==2 && i.children[0].text=="org.bluez.Device1") {
      auto p=i.children[1].property("Adapter");if(p && p->type=='o' && p->text==adapter && e.children[0].text.rfind(adapter+"/",0)==0)devices.insert(e.children[0].text);
    }
  }
  void refreshDevices() {
    if(refresh!=Refresh::idle){refreshTo(Refresh::dirty);return;}
    refreshTo(Refresh::pending);
    if(!call("/","org.freedesktop.DBus.ObjectManager","GetManagedObjects",{},[this](const Reply& r){
      auto previous=refresh;refreshTo(Refresh::idle);
      if(!r.ok()){fail(r.error);return;}snapshot(r);
      std::vector<int> expired;for(auto& p:peers)if(!devices.count(p.second.device))expired.push_back(p.first);
      for(int h:expired)closePeer(h);
      if(previous==Refresh::dirty && phase==State::ready)refreshDevices();
    }))fail("peripheral device refresh failed");
  }
  bool topologyChanged(const Reply& r) {
    if(r.interface!="org.freedesktop.DBus.Properties")return true;
    if(r.signature!="sa{sv}as" || r.values.size()!=3 || r.values[0].type!='s' || r.values[1].type!='a' || r.values[1].contents!="{sv}" || r.values[2].type!='a' || r.values[2].contents!="s") {fail("invalid peripheral property signal");return false;}
    const auto& iface=r.values[0].text;
    const char* key=iface=="org.bluez.Device1"?"Adapter":iface=="org.bluez.Adapter1"?"Powered":iface=="org.bluez.LEAdvertisingManager1"?"SupportedInstances":nullptr;
    if(!key)return false;
    bool changed=false;
    for(auto& p:r.values[1].children) {
      if(p.type!='e' || p.children.size()!=2 || p.children[0].type!='s' || p.children[1].type!='v' || p.children[1].children.size()!=1) {fail("invalid peripheral property change");return false;}
      if(p.children[0].text==key)changed=true;
    }
    for(auto& p:r.values[2].children) {if(p.type!='s'){fail("invalid peripheral property invalidation");return false;}if(p.text==key)changed=true;}
    return changed;
  }
  void subscriptionReady(uint64_t g) {
    if(g!=generation || phase!=State::discovering || subscriptions==0)return;
    if(--subscriptions!=0)return;
    if(!bus.call("org.freedesktop.DBus","/org/freedesktop/DBus","org.freedesktop.DBus","GetNameOwner",{Value::string("org.bluez")},[this,g](const Reply& r){
      if(g!=generation || phase!=State::discovering)return;
      if(!r.ok() || r.signature!="s" || r.values.size()!=1 || r.values[0].type!='s' || r.values[0].text.empty() || r.values[0].text[0]!=':'){fail("BlueZ owner unavailable");return;}
      owner=r.values[0].text;enumerate();
    },3000000))fail("BlueZ owner request failed");
  }
  void enumerate() {
    if(!call("/","org.freedesktop.DBus.ObjectManager","GetManagedObjects",{},[this](const Reply& r){
      if(!r.ok()){fail(r.error);return;}snapshot(r);if(phase!=State::discovering)return;
      auto& a=bus.rawApi();for(auto path:{APP,SERVICE,RX,TX,AD}) {sd_bus_slot* slot=nullptr;if(a.add_object(bus.rawBus(),&slot,path,dispatch,this)<0 || !slot){if(slot)a.slot_unref(slot);fail("UART export failed");return;}exports.push_back(slot);}
      transition(State::application);
      if(!call(adapter,"org.bluez.GattManager1","RegisterApplication",{Value::string(APP,'o'),dictionary()},[this](const Reply& ack){
        if(!ack.ok()){fail(ack.error);return;}transition(State::advertisement);
        if(!call(adapter,"org.bluez.LEAdvertisingManager1","RegisterAdvertisement",{Value::string(AD,'o'),dictionary()},[this](const Reply& ack){if(!ack.ok())fail(ack.error);else {transition(State::ready);if(refresh==Refresh::dirty){refreshTo(Refresh::idle);refreshDevices();}emit("advertisement\x1f"+std::to_string(cycle)+"\x1fready\x1e");}}))fail("advertisement enqueue failed");
      }))fail("GATT registration enqueue failed");
    }))fail("peripheral enumeration enqueue failed");
  }
public:
  Peripheral(Api* api,std::function<int()> ids,std::function<void(const std::string&)> errors={}):bus(api),allocate(std::move(ids)),report(std::move(errors)){}
  ~Peripheral(){cleanup();}
  State state() const{return phase;}
  const std::string& error() const{return reason;}
  bool active()const{return phase!=State::idle && phase!=State::closed && phase!=State::failed;}
  bool start(const std::string& localName,int token) {
    if(token<=0 || active() || localName.empty() || localName.size()>128 || localName.find('\0')!=std::string::npos)return false;
    cleanup();eventOut.clear();eventRecords=0;refreshTo(Refresh::idle);++generation;reason.clear();name=localName;cycle=token;subscriptions=3;transition(State::discovering);deadline=std::chrono::steady_clock::now()+std::chrono::seconds(10);
    if(!bus.start()){fail(bus.error());cleanup();return false;}
    auto& a=bus.rawApi();if(!a.add_object || !a.new_return || !a.new_error || !a.send || !a.sender || !a.is_call || !a.expect_reply || !a.can_send){fail("sd-bus export ABI unavailable");cleanup();return false;}
    auto g=generation;
    for(auto rule:{"type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager'", "type='signal',sender='org.bluez',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'"})
      if(!bus.match(rule,[this,g](const Reply& r){if(g!=generation)return;if(!r.ok())fail(r.error);else {
        if(!topologyChanged(r))return;
        if(phase==State::ready)refreshDevices();else if(phase!=State::stopping)refreshTo(Refresh::dirty);
      }},[this,g](const Reply&){subscriptionReady(g);})) {fail("peripheral signal subscription failed");return false;}
    if(!bus.match("type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='org.bluez'",[this,g](const Reply& r){
      if(g!=generation)return;
      if(!r.ok() || r.signature!="sss" || r.values.size()!=3 || r.values[0].text!="org.bluez" || (owner.empty() || r.values[1].text==owner))fail("BlueZ owner changed");
    },[this,g](const Reply&){subscriptionReady(g);})) {fail("BlueZ owner subscription failed");return false;}
    return true;
  }
  void stop() {
    if(phase==State::stopping)return;
    if(!active()){cleanup();return;}
    auto previous=phase;transition(State::stopping);++generation;
    while(!peers.empty())closePeer(peers.begin()->first);
    deadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);
    auto application=[this](){if(!call(adapter,"org.bluez.GattManager1","UnregisterApplication",{Value::string(APP,'o')},[this](const Reply&){transition(State::closed);}))transition(State::closed);};
    if(previous==State::ready) {if(!call(adapter,"org.bluez.LEAdvertisingManager1","UnregisterAdvertisement",{Value::string(AD,'o')},[application](const Reply&){application();}))transition(State::closed);}
    else if(previous==State::advertisement)application();
    else transition(State::closed); // Closing our bus also cancels a late successful registration.
  }
  void poll(std::chrono::steady_clock::time_point now=std::chrono::steady_clock::now()) {
    bus.poll();
    if(active() && bus.state()==Bus::State::failed)fail(bus.error());
    if(active() && phase!=State::ready && now>=deadline){if(phase==State::stopping)transition(State::closed);else fail("peripheral registration timed out");}
    if(phase==State::closed || phase==State::failed){cleanup();return;}
    if(phase!=State::ready)return;
    std::vector<int> closed;
    for(auto& p:peers) {
      auto& peer=p.second;pollfd fd{peer.fd,POLLIN,0};int n=::poll(&fd,1,0);
      if((n<0 && errno!=EINTR) || (fd.revents&(POLLHUP|POLLERR|POLLNVAL|POLLIN))) {closed.push_back(p.first);continue;}
      for(int work=0;work<8 && !peer.outgoing.empty();work++) {
        auto& data=peer.outgoing.front();int flags=MSG_DONTWAIT;
#ifdef MSG_NOSIGNAL
        flags|=MSG_NOSIGNAL;
#endif
        auto sent=::send(peer.fd,data.data(),data.size(),flags);
        if(sent<0 && (errno==EAGAIN || errno==EWOULDBLOCK || errno==EINTR))break;
        if(sent!=static_cast<ssize_t>(data.size())){closed.push_back(p.first);break;}
        peer.queued-=data.size();peer.outgoing.pop_front();
      }
    }
    for(int h:closed)closePeer(h);
  }
  std::string events(){std::string out;out.swap(eventOut);eventRecords=0;return out;}
  bool owns(int h)const{return peers.count(h);}
  bool write(int h,const std::vector<uint8_t>& data) {
    auto p=peers.find(h);if(p==peers.end() || phase!=State::ready || data.size()>20 || p->second.queued+data.size()>16384 || p->second.outgoing.size()>=128)return false;
    if(!data.empty()){p->second.outgoing.push_back(data);p->second.queued+=data.size();}return true;
  }
  std::vector<uint8_t> read(int h){auto p=peers.find(h);if(p==peers.end())return {};std::vector<uint8_t> out;out.swap(p->second.incoming);return out;}
  void close(int h){closePeer(h,false);}
};
}
