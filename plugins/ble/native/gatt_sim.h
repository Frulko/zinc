#pragma once
#include <algorithm>
#include <climits>
#include <deque>
#include <map>
#include <string>
#include <vector>

namespace zinc::ble {
// Shared native simulator; no OS radio or bus is opened.
class GattSim {
  enum class Notify { off, starting, on, stopping };
  struct Link { int service, characteristic; std::vector<uint8_t> value{100}; Notify notify=Notify::off; };
  struct Request { int h,id,kind; std::vector<uint8_t> value; };
  std::map<int,Link> links;
  std::deque<Request> pending;
  std::string output;
  int nextHandle=1073741824, nextAttribute=1, nextRequest=1;
  static std::string hex(const std::vector<uint8_t>& value) { static const char* d="0123456789abcdef"; std::string s; for(auto b:value) { s+=d[b>>4]; s+=d[b&15]; } return s; }
  static bool notifyTo(Link& l,Notify next) {
    bool ok=(l.notify==Notify::off && next==Notify::starting) || (l.notify==Notify::starting && (next==Notify::on || next==Notify::off)) ||
      (l.notify==Notify::on && next==Notify::stopping) || (l.notify==Notify::stopping && (next==Notify::off || next==Notify::on));
    if(ok)l.notify=next;return ok;
  }
public:
  int open(const std::string& id) {
    if (id!="zinc-sim" || nextHandle==INT_MAX || nextAttribute>INT_MAX-2 || links.size()>=16 || output.size()>32768) return -1;
    int h=nextHandle++; links.emplace(h,Link{nextAttribute++,nextAttribute++,{100},Notify::off}); output+=std::to_string(h)+"\topen\n"; return h;
  }
  std::string tree(int h) const {
    auto p=links.find(h); if(p==links.end()) return {};
    return "s\t"+std::to_string(p->second.service)+"\t0\t0000180f-0000-1000-8000-00805f9b34fb\t\n"+
      "c\t"+std::to_string(p->second.characteristic)+"\t"+std::to_string(p->second.service)+"\t00002a19-0000-1000-8000-00805f9b34fb\t72656164,7772697465,77726974652d776974686f75742d726573706f6e7365,6e6f74696679,\n";
  }
  int request(int h,int c,int kind,const std::vector<uint8_t>& bytes) {
    auto p=links.find(h); if(p==links.end() || p->second.characteristic!=c || kind<0 || kind>4 || bytes.size()>(kind==1?512u:kind==2?20u:0u) || nextRequest==INT_MAX || pending.size()>=32) return -1;
    if(kind==3) { if(p->second.notify!=Notify::off) return -1; notifyTo(p->second,Notify::starting); }
    if(kind==4) { if(p->second.notify!=Notify::on) return -1; notifyTo(p->second,Notify::stopping); }
    int id=nextRequest++; pending.push_back({h,id,kind,bytes}); return id;
  }
  void cancel(int h,int id) {
    for(auto p=pending.begin();p!=pending.end();++p) if(p->h==h && p->id==id) {
      auto l=links.find(h); if(l!=links.end() && p->kind>=3) notifyTo(l->second,p->kind==3?Notify::off:Notify::on);
      pending.erase(p); return;
    }
  }
  void close(int h) {
    links.erase(h); pending.erase(std::remove_if(pending.begin(),pending.end(),[h](const Request& r){ return r.h==h; }),pending.end());
    std::string keep,prefix=std::to_string(h)+"\t";size_t at=0;
    while(at<output.size()) { auto end=output.find('\n',at);if(end==std::string::npos)break;auto row=output.substr(at,end-at+1);if(row.rfind(prefix,0)!=0)keep+=row;at=end+1; }
    output=std::move(keep);
  }
  void stop() { links.clear(); pending.clear(); output.clear(); }
  std::string events() {
    auto work=std::move(pending);pending.clear();
    for(auto& r:work) {
      auto p=links.find(r.h);if(p==links.end())continue;auto& l=p->second;std::vector<uint8_t> result;
      if(r.kind==0)result=l.value;
      else if(r.kind==1 || r.kind==2) {
        l.value=r.value;
        if(l.notify==Notify::on) output+=std::to_string(r.h)+"\tvalue\t"+std::to_string(l.characteristic)+"\t"+hex(l.value)+"\n";
      } else notifyTo(l,r.kind==3?Notify::on:Notify::off);
      output+=std::to_string(r.h)+"\tresult\t"+std::to_string(r.id)+"\t\t"+hex(result)+"\n";
    }
    std::string result;result.swap(output);return result;
  }
};
}
