#pragma once
#include <atomic>
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <unordered_map>
#include <vector>
#include "../include/zinc_abi.h"

namespace zinc {
// Runtime-local ownership, globally unique generations. Guest values contain IDs,
// never native addresses. A generation is never allowed to wrap back to a live ID.
class Resources {
  struct Slot { void* value=nullptr; uint64_t type=0; void (*destroy)(void*)=nullptr; uint32_t generation=0,refs=0; };
  std::vector<Slot> slots;
  std::vector<uint32_t> free;
  std::unordered_map<void*,uint32_t> identities;
  bool closing=false;
  inline static std::atomic<uint32_t> generations{1};
  static uint32_t generation() {
    auto value=generations.load(std::memory_order_relaxed);
    do { if(value==UINT32_MAX)throw std::runtime_error("native resource generation limit exceeded"); }
    while(!generations.compare_exchange_weak(value,value+1,std::memory_order_relaxed));
    return value;
  }
  Slot& slot(ZincHandle handle) {
    const uint32_t index=(uint32_t)handle;
    if(!index || index>slots.size() || !slots[index-1].refs || slots[index-1].generation!=(handle>>32))
      throw std::runtime_error("invalid native resource handle");
    return slots[index-1];
  }
public:
  Resources()=default;Resources(const Resources&)=delete;Resources& operator=(const Resources&)=delete;
  ~Resources(){close();}
  // Ownership transfers only on success. Duplicate identities consume the incoming
  // owned reference while adding a reference to the existing handle.
  ZincHandle add(void* value,uint64_t type,void (*destroy)(void*)) {
    if(closing)throw std::runtime_error("native resources are closing");
    if(!value)return 0;
    if(!destroy)throw std::runtime_error("native resource destructor is missing");
    if(auto found=identities.find(value);found!=identities.end()) {
      auto& s=slots[found->second];
      if(s.type!=type || s.refs==UINT32_MAX)throw std::runtime_error("native resource identity mismatch");
      const auto handle=(uint64_t(s.generation)<<32)|(found->second+1);++s.refs;destroy(value);return handle;
    }
    const auto next=generation();
    if(free.empty()) {
      if(slots.size()>=65536)throw std::runtime_error("native resource limit exceeded");
      // Reserve free-list storage before transferring ownership; release never allocates.
      if(free.capacity()<=slots.size())free.reserve(std::max(size_t(4),free.capacity()*2));slots.emplace_back();
    }
    const uint32_t index=free.empty()?(uint32_t)slots.size()-1:free.back();
    try { identities.emplace(value,index); } catch(...) { if(free.empty())slots.pop_back();throw; }
    if(!free.empty())free.pop_back();
    slots[index]={value,type,destroy,next,1};return (uint64_t(next)<<32)|(index+1);
  }
  void check(ZincHandle handle) { if(handle)slot(handle); }
  template<class F> void visit(uint64_t type,F&& f) const {
    for(const auto& s:slots)if(s.refs && s.type==type)f(s.value);
  }
  void* get(ZincHandle handle,uint64_t type) {
    if(!handle)return nullptr;
    auto& s=slot(handle);if(s.type!=type)throw std::runtime_error("native resource type mismatch");return s.value;
  }
  void retain(ZincHandle handle) {
    if(!handle)return;auto& s=slot(handle);
    if(s.refs==UINT32_MAX)throw std::runtime_error("native resource reference limit exceeded");++s.refs;
  }
  void release(ZincHandle handle) {
    if(!handle)return;auto& s=slot(handle);if(--s.refs)return;
    auto* value=s.value;auto destroy=s.destroy;identities.erase(value);s.value=nullptr;
    if(!closing)free.push_back((uint32_t)handle-1);
    destroy(value);
  }
  void close() noexcept {
    if(closing)return;closing=true;
    for(size_t j=0;j<slots.size();j++)if(slots[j].refs) {
      auto* value=slots[j].value;auto destroy=slots[j].destroy;
      slots[j].refs=0;slots[j].value=nullptr;identities.erase(value);destroy(value);
    }
  }
};
}
