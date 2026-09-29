// Typed Tier 0 runner. Bytecode is data; application code is never compiled to C++.
#include "abi.h"
#include "execution_limits.h"
#include "../zrt.h"
#include "host_loop.h"
#include <cmath>
#include <cstdio>
#include <fstream>
#include <limits>
#include <iterator>
#include <chrono>
#include <algorithm>
#include <memory>
#include <unordered_set>
#include <deque>
#include <map>
#include <thread>
#include <atomic>
#ifdef ZINC_GENERATED_ABI
#include ZINC_GENERATED_ABI
#else
static void registerGeneratedModules(zinc::Modules&) {}
#endif

namespace {
enum Op { K, MOV, LOAD, STORE, ADD, SUB, MUL, DIV, MOD, LT, LE, GT, GE, EQ, NE, AND, OR, XOR, SHL, SHR, USHR, NEG, NOT, BITNOT, CONV, JMP, BR, CALL, RET, PRINT, SPACE, NEWLINE, SQRT, ABS, FLOOR, CEIL, TRUNC, NATIVE, ALLOC, INIT, FIELDGET, FIELDSET, INDEXGET, INDEXSET, LENGTH, PUSH, POP, CONCAT, TRUTHY, CLOSURE, CALLF, FNREF, METHOD, THROW, EXCEPTION, PROMISE, AWAIT, PENDING, SETTLE, MICROTASK, TIMER, CANCELTIMER, YIELD, GENSTEP, GENVALUE, STRING, MATH, SPLICE, JOIN, COLLECTION, GENCONTROL, METHODREF, DYNAMIC, INSTANCEOF, NOPS };
enum { VM_REF = 7 };
struct Heap;
union Reg { double f; int32_t i; uint32_t u; Heap* h; Reg(): f(0) {} };
struct CollectionKey { Reg value;uint32_t type=0; };
uint32_t hash(const CollectionKey& key);
bool same(const CollectionKey& a,const CollectionKey& b);
struct Collection {
  uint32_t keyType,valueType;
  zrt::Map<CollectionKey,Reg> entries;
  Collection(uint32_t key,uint32_t value):keyType(key),valueType(value),entries(zrt::Map<CollectionKey,Reg>::make()){}
  static size_t storage(size_t capacity,size_t indexCapacity){return capacity*(sizeof(CollectionKey)+sizeof(Reg)+1)+indexCapacity*sizeof(int32_t);}
  size_t bytes() const {return sizeof(Collection)+sizeof(*entries.m)+storage(entries.m->cap,entries.m->icap);}
};
struct Layout { bool array; std::vector<uint32_t> keys, types; std::vector<std::pair<uint32_t,uint32_t>> methods; };
struct Heap {
  Heap* next = nullptr;
  bool marked = false;
  uint32_t function = UINT32_MAX;
  uint32_t layout = UINT32_MAX; // Strings have no field layout.
  uint32_t promiseState=0, payloadType=0, pc=0, awaitDst=0, catchPc=UINT32_MAX;
  Heap *sent=nullptr, *parent=nullptr, *completion=nullptr, *awaited=nullptr, *waiting=nullptr, *last=nullptr, *nextTask=nullptr;
  bool handled=false, resolving=false, generator=false, closing=false, dynamic=false, iteratorResult=false, running=false, done=false;
  Reg yielded;
  ZincHandle nativeHandle=0;
  const ZincHost* nativeHost=nullptr;
  ~Heap(){if(nativeHandle)nativeHost->resource_release(nativeHost->context,nativeHandle,nullptr);}
  zrt::String text;
  std::vector<Reg> slots;
  std::unique_ptr<Collection> collection;
  size_t bytes() const { return sizeof(Heap) + (text.s ? sizeof(zrt::StrObj) + text.bytes() + 1 : 0) + slots.capacity() * sizeof(Reg) + (collection?collection->bytes():0); }
};
const zrt::String& string(Reg r) { static const zrt::String empty; return r.h ? r.h->text : empty; }
uint32_t hash(const CollectionKey& key) {
  if(key.type==ZINC_STRING)return zrt::hash(string(key.value));
  if(key.type==VM_REF)return zrt::hash_u64(key.value.h && key.value.h->nativeHandle?key.value.h->nativeHandle:(uint64_t)(uintptr_t)key.value.h);
  if(key.type==ZINC_I32)return zrt::hash(key.value.i);
  if(key.type==ZINC_BOOL || key.type==ZINC_U32)return zrt::hash(key.value.u);
  return zrt::hash(key.value.f);
}
bool same(const CollectionKey& a,const CollectionKey& b) {
  if(a.type!=b.type)return false;
  if(a.type==ZINC_STRING)return string(a.value)==string(b.value);
  if(a.type==VM_REF)return a.value.h==b.value.h || (a.value.h && b.value.h && a.value.h->nativeHandle && a.value.h->nativeHandle==b.value.h->nativeHandle);
  if(a.type==ZINC_I32)return a.value.i==b.value.i;
  if(a.type==ZINC_BOOL || a.type==ZINC_U32)return a.value.u==b.value.u;
  return zrt::same(a.value.f,b.value.f);
}
struct VM; struct Ins;
struct GuestCallback { VM* vm;Heap* function;std::string text,error;bool guestError=false; };
using Handler = void (*)(VM*, const Ins*, Reg*);
using JitFn = int (*)(VM*, Reg*, uint32_t);
struct Ins { Handler h{}; uint32_t a{}, b{}, c{}; uint8_t op{}, t{}; uint32_t catchPc=UINT32_MAX; };
struct Fn { std::vector<uint32_t> types, params, refs, captures; uint32_t ret, bodyRet, closureLayout, frameLayout, yieldType=0; bool async=false, gen=false; std::vector<Ins> code; };
struct Frame { const Ins* ip; Reg* fp; uint32_t dst; uint32_t fn; };
struct VM {
  struct Export {std::string name;uint32_t kind,index;bool writable;};
  std::vector<Export> exports;
  std::vector<Fn> fns;
  std::vector<Reg> constants, globals, functionValues;
  std::vector<uint32_t> kt, gt;
  std::vector<Layout> layouts;
  Heap* heap = nullptr;
  size_t heapBytes = 0, peakHeapBytes = 0, heapLimit = 64u << 20, nextCollection = 1u << 20;
  uint64_t collections = 0;
  uint32_t resultType = ZINC_VOID;
  explicit VM(size_t budget=SIZE_MAX, size_t stackRegisters=1u<<20) : stack(stackRegisters) {
    if (budget!=SIZE_MAX) {
      heapLimit=budget;nextCollection=std::min(nextCollection,heapLimit/2);
    } else if (const char* setting = std::getenv("ZINC_VM_HEAP_BYTES")) {
      char* end; const double n = std::strtod(setting, &end);
      if (end == setting || *end || !std::isfinite(n) || n < 4096 || n > (1u << 30) || trunc(n) != n)
        throw std::runtime_error("ZINC_VM_HEAP_BYTES must be an integer between 4096 and 1073741824");
      heapLimit = (size_t)n; nextCollection = std::min(nextCollection, heapLimit / 2);
    }
  }
  ~VM() { while (heap) { auto* next = heap->next; delete heap; heap = next; } }
  VM(const VM&) = delete; VM& operator=(const VM&) = delete;
  void collect(Reg* fp) {
    std::vector<Heap*> pending;
    const auto mark = [&](Reg r) { if (r.h && !r.h->marked) { r.h->marked = true; pending.push_back(r.h); } };
    for (size_t j=0;j<constants.size();j++) if (j<kt.size() && kt[j]>=ZINC_STRING) mark(constants[j]);
    for (size_t j=0;j<globals.size();j++) if (j<gt.size() && gt[j]>=ZINC_STRING) mark(globals[j]);
    const auto frame = [&](uint32_t id, Reg* p) { for (auto j:fns[id].refs) mark(p[j]); };
    if (fp) { frame(fn,fp); for (uint32_t j=0;j<depth;j++) frame(frames[j].fn,frames[j].fp); }
    if (resultType>=ZINC_STRING) mark(result);
    for(auto r:callbackRoots)mark(r);
    for (auto r:functionValues) mark(r);
    mark(exception);
    const auto pointer=[&](Heap* h){Reg r;r.h=h;mark(r);};
    modules.resources.visit(zinc::callbackKind,[&](void* p){pointer(((GuestCallback*)((zinc::Callback*)p)->context)->function);});
    pointer(currentTask);for(auto* task:jobs)pointer(task);
    for(auto& timer:timers)pointer(timer.second.callback);
    rejections.erase(std::remove_if(rejections.begin(),rejections.end(),[](auto* promise){return promise->handled;}),rejections.end());
    for(auto* promise:rejections)pointer(promise);
    while (!pending.empty()) {
      auto* h=pending.back(); pending.pop_back();
      pointer(h->sent);pointer(h->parent);pointer(h->completion);pointer(h->awaited);pointer(h->waiting);pointer(h->last);pointer(h->nextTask);
      if(h->generator && h->payloadType>=ZINC_STRING)mark(h->yielded);
      if(h->dynamic) {if(h->payloadType>=ZINC_STRING && h->payloadType<=VM_REF)mark(h->slots[0]);continue;}
      if(h->promiseState) { if(h->payloadType>=ZINC_STRING)mark(h->slots[0]);continue; }
      if(h->collection) {
        const auto& collection=*h->collection;const auto& entries=collection.entries;
        for(int32_t j=0;j<entries.slots();j++)if(entries.live_at(j)) {
          if(collection.keyType>=ZINC_STRING)mark(entries.key_at(j).value);
          if(collection.valueType>=ZINC_STRING)mark(entries.val_at(j));
        }
        continue;
      }
      if (h->layout==UINT32_MAX) continue;
      const auto& layout=layouts[h->layout];
      for (size_t j=0;j<h->slots.size();j++) if (layout.types[layout.array?0:j]>=ZINC_STRING) mark(h->slots[j]);
    }
    for (Heap** link=&heap;*link;) {
      auto* h=*link;
      if (!h->marked) { *link=h->next;heapBytes-=h->bytes();delete h; }
      else { h->marked=false;link=&h->next; }
    }
    ++collections; nextCollection=std::min(heapLimit,std::max(std::min(size_t(1u<<20),heapLimit/2),heapBytes*2));
  }
  void reserveHeap(size_t bytes, Reg* fp) {
    if (bytes>heapLimit || heapBytes>heapLimit-bytes || heapBytes+bytes>nextCollection) collect(fp);
    if (bytes>heapLimit || heapBytes>heapLimit-bytes) throw std::runtime_error("VM heap memory limit exceeded");
  }
  Heap* allocate(uint32_t layout, size_t count, Reg* fp, const char* text=nullptr, size_t length=0) {
    if (count>heapLimit/sizeof(Reg) || length>heapLimit) throw std::runtime_error("VM heap memory limit exceeded");
    reserveHeap(sizeof(Heap)+count*sizeof(Reg)+(text?length+sizeof(zrt::StrObj)+1:0),fp);
    auto h=std::make_unique<Heap>();h->layout=layout;
    if (text) h->text=zrt::String::from(text,(uint32_t)length);
    h->slots.resize(count);
    if (h->bytes()>heapLimit-heapBytes) throw std::runtime_error("VM heap memory limit exceeded");
    heapBytes+=h->bytes();peakHeapBytes=std::max(peakHeapBytes,heapBytes);h->next=heap;heap=h.release();return heap;
  }
  Heap* keepString(const char* p,size_t n,Reg* fp=nullptr) { return allocate(UINT32_MAX,0,fp,p?p:"",n); }
  void push(Heap* h,Reg r,Reg* fp) {
    if (h->slots.size()==h->slots.capacity()) {
      size_t capacity=std::max(size_t(4),h->slots.capacity()*2);
      if (capacity>heapLimit/sizeof(Reg)) throw std::runtime_error("VM heap memory limit exceeded");
      reserveHeap((capacity-h->slots.capacity())*sizeof(Reg),fp);
      const auto before=h->bytes();h->slots.reserve(capacity);heapBytes+=h->bytes()-before;peakHeapBytes=std::max(peakHeapBytes,heapBytes);
    }
    h->slots.push_back(r);
  }
  Heap& object(Reg r,bool array) {
    if (!r.h || r.h->function!=UINT32_MAX || r.h->promiseState || r.h->layout>=layouts.size() || layouts[r.h->layout].array!=array) throw std::runtime_error("invalid or null VM object");
    return *r.h;
  }
  Reg& field(Reg r,uint32_t key,uint32_t type) {
    auto& h=object(r,false);const auto& l=layouts[h.layout];
    const auto pos=std::find(l.keys.begin(),l.keys.end(),key);
    if (pos==l.keys.end() || l.types[pos-l.keys.begin()]!=type) throw std::runtime_error("VM field type mismatch");
    return h.slots[pos-l.keys.begin()];
  }
  zinc::Modules modules;
  std::vector<const ZincExport*> imports;
  Reg* nativeFp=nullptr;
  const Ins* nativeIp=nullptr;
  std::vector<Reg> callbackRoots;
  std::vector<Reg> stack;
  std::vector<Frame> frames = std::vector<Frame>(16384);
  uint32_t depth = 0, fn = 0, boundary=0;
  bool suspended=false;
  Heap* currentTask=nullptr;
  std::deque<Heap*> jobs;
  std::vector<Heap*> rejections;
  struct Timer { uint32_t id; Heap* callback; double interval; };
  std::multimap<std::chrono::steady_clock::time_point,Timer> timers;
  uint32_t nextTimer=0;
  bool nativeEvents=false;
  Heap* box(Reg value,uint32_t type,Reg* fp) {
    if(type==VM_REF && value.h && value.h->dynamic)return value.h;
    auto* result=allocate(UINT32_MAX,1,fp);result->dynamic=true;result->payloadType=type;result->slots[0]=value;return result;
  }
  void finishPromise(Heap* promise, Reg result, uint32_t type, bool rejected) {
    promise->resolving=false;promise->promiseState=rejected?3:2;promise->payloadType=type;promise->slots[0]=result;
    if(rejected)rejections.push_back(promise);
    for(auto* task=promise->waiting;task;) { auto* next=task->nextTask;task->nextTask=nullptr;jobs.push_back(task);task=next; }
    promise->waiting=promise->last=nullptr;
  }
  void settle(Heap* promise, Reg result, uint32_t type, bool rejected, Reg* fp=nullptr) {
    if(promise->promiseState>=2 || promise->resolving)return;
    if(!rejected && type==VM_REF && result.h && result.h->promiseState) {
      promise->resolving=true;promise->payloadType=VM_REF;promise->slots[0]=result;
      if(result.h==promise) {
        promise->slots[0].h=allocate(0,2,fp);
        const char text[]="promise cannot resolve itself";
        promise->slots[0].h->slots[0].h=keepString(text,sizeof(text)-1,fp);
        promise->slots[0].h->slots[1].h=keepString("TypeError",9,fp);
        finishPromise(promise,promise->slots[0],VM_REF,true);
      } else {
        auto* job=allocate(UINT32_MAX,0,fp);job->completion=promise;job->awaited=result.h;jobs.push_back(job);
      }
    } else finishPromise(promise,result,type,rejected);
  }
  void suspend(const Ins* ip, Reg* fp) {
    auto* promise=fp[ip->b].h;
    if(!currentTask || depth!=boundary || !promise || !promise->promiseState)throw std::runtime_error("invalid VM await");
    auto* task=currentTask;task->pc=(uint32_t)(ip-fns[fn].code.data())+1;task->awaitDst=ip->a;task->catchPc=ip->catchPc;
    std::copy(fp,fp+task->slots.size(),task->slots.begin());task->awaited=promise;promise->handled=true;
    if(promise->promiseState==1) {
      if(promise->last)promise->last->nextTask=task;else promise->waiting=task;
      promise->last=task;
    } else jobs.push_back(task);
    suspended=true;
  }
  uint64_t ticks = 0;
  uint32_t jitBudget = 4096;
  uint32_t randomState = zrt::math::defaultSeed;
  std::vector<JitFn> jit;
  Reg result, exception;
  char jitError[256]{};
  std::chrono::steady_clock::time_point deadline;
  std::atomic<bool> interrupted{false};
  void poll() {
    if ((++ticks & 4095) == 0) {
      if(interrupted.load(std::memory_order_relaxed))throw std::runtime_error("execution interrupted");
      if(std::chrono::steady_clock::now() > deadline)throw std::runtime_error("execution timed out");
    }
  }
};
struct Reader {
  std::vector<uint8_t> bytes; size_t at = 0;
  void need(size_t n) { if (n > bytes.size() - at) throw std::runtime_error("truncated bytecode"); }
  uint32_t u() { need(4); uint32_t v = 0; for (int j=0;j<4;j++) v |= uint32_t(bytes[at++]) << (8*j); return v; }
  uint32_t count() { const auto n = u(); if (n > (1u<<20)) throw std::runtime_error("bytecode count exceeds limit"); return n; }
  double number() { need(8); uint64_t n = 0; for (int j=0;j<8;j++) n |= uint64_t(bytes[at++]) << (8*j); double d; memcpy(&d, &n, 8); return d; }
  std::string str() { auto n = count(); need(n); std::string s((const char*)bytes.data()+at,n); at += n; return s; }
};
uint32_t uint32(double d) { if (!std::isfinite(d) || !d) return 0; double r = fmod(trunc(d), 4294967296.); return (uint32_t)(r < 0 ? r + 4294967296. : r); }
template<int T> auto typedNumber(Reg r) {
  if constexpr(T==ZINC_I32) return r.i;
  else if constexpr(T==ZINC_BOOL || T==ZINC_U32) return r.u;
  else return r.f;
}
double number(Reg r, uint32_t t) { return t == ZINC_I32 ? r.i : t == ZINC_BOOL || t == ZINC_U32 ? r.u : r.f; }
Reg value(double x, uint32_t t) { Reg r; if (t == ZINC_I32 || t == ZINC_U32) r.u = uint32(x); else if (t == ZINC_BOOL) r.u = x != 0 && !std::isnan(x); else r.f = t == ZINC_F32 ? (double)(float)x : x; return r; }

Heap& dynamic(Reg value) {
  if(!value.h || !value.h->dynamic)throw std::runtime_error("invalid VM dynamic value");return *value.h;
}
zrt::Dyn primitiveDyn(const Heap& value) {
  if(value.payloadType==ZINC_VOID)return zrt::Dyn();
  if(value.payloadType==8 || (value.payloadType==VM_REF && !value.slots[0].h))return zrt::Dyn(nullptr);
  if(value.payloadType==ZINC_STRING)return zrt::Dyn(string(value.slots[0]));
  if(value.payloadType==ZINC_BOOL)return zrt::Dyn(value.slots[0].u!=0);
  if(value.payloadType<ZINC_STRING)return zrt::Dyn(number(value.slots[0],value.payloadType));
  throw std::runtime_error("VM dynamic object coercion is not implemented");
}

void inspectValue(VM& vm, Reg r, uint32_t type, zrt::StrBuilder& out, zrt::Insp& in) {
  if(type==ZINC_VOID)out.cstr("undefined");
  else if(type==ZINC_STRING)zrt::insp(out,in,string(r));
  else if(type==ZINC_BOOL)zrt::insp(out,in,r.u!=0);
  else if(type!=VM_REF)zrt::insp(out,in,number(r,type));
  else if(!r.h)zrt::insp_null(out,in);
  else if(r.h->dynamic) {if(r.h->payloadType==8)zrt::insp_null(out,in);else inspectValue(vm,r.h->slots[0],r.h->payloadType,out,in);}
  else if(r.h->iteratorResult) {
    zrt::InspParts parts;zrt::StrBuilder v,d;v.cstr("value: ");inspectValue(vm,r.h->slots[1],VM_REF,v,in);parts.add(v);d.cstr("done: ");zrt::insp(d,in,r.h->slots[0].u!=0);parts.add(d);zrt::insp_join(out,"","{","}",parts,in.depth*2);
  }
  else if(r.h->nativeHandle)out.cstr("[NativeResource]");
  else if(r.h->promiseState)out.cstr("Promise {}");
  else if(r.h->function!=UINT32_MAX)out.cstr("[Function (anonymous)]");
  else {
    const auto& h=vm.object(r,true);
    if(in.depth>2){out.cstr("[Array]");return;}
    zrt::InspParts parts;const auto count=std::min(size_t(100),h.slots.size());
    const auto element=vm.layouts[h.layout].types[0];++in.depth;
    for(size_t j=0;j<count;j++){zrt::StrBuilder item;inspectValue(vm,h.slots[j],element,item,in);parts.add(item);}
    --in.depth;
    if(h.slots.size()>count){zrt::StrBuilder item;item.cstr("... ");zrt::str_num(item,h.slots.size()-count);item.cstr(h.slots.size()-count==1?" more item":" more items");parts.add(item);}
    zrt::insp_join(out,"","[","]",parts,in.depth*2,element>=ZINC_I32&&element<=ZINC_F64,true);
  }
}

uint32_t closureTarget(VM* vm,const Ins* ip,Reg* fp) {
  auto* h=fp[ip->b].h;
  if(!h || h->function>=vm->fns.size())throw std::runtime_error("invalid VM closure");
  const auto& f=vm->fns[h->function];const auto& caller=vm->fns[vm->fn];
  if(f.ret!=ip->t || f.params.size()>caller.types.size()-ip->c || h->slots.size()!=f.captures.size())throw std::runtime_error("VM closure signature mismatch");
  for(size_t j=0;j<f.params.size();j++)if(f.types[f.params[j]]!=caller.types[ip->c+j])throw std::runtime_error("VM closure argument type mismatch");
  return h->function;
}
uint32_t methodTarget(VM* vm,const Ins* ip,Reg* fp) {
  auto& h=vm->object(fp[ip->b],false);const auto& l=vm->layouts[h.layout];
  const auto method=std::find_if(l.methods.begin(),l.methods.end(),[&](auto m){return m.first==ip->c;});
  if(method==l.methods.end())throw std::runtime_error("VM method not found");
  const auto& f=vm->fns[method->second];const auto& caller=vm->fns[vm->fn];
  if(f.ret!=ip->t || f.params.size()>caller.types.size()-ip->b)throw std::runtime_error("VM method signature mismatch");
  for(size_t j=0;j<f.params.size();j++)if(f.types[f.params[j]]!=caller.types[ip->b+j])throw std::runtime_error("VM method argument type mismatch");
  return method->second;
}
struct GuestThrow : std::runtime_error { GuestThrow():std::runtime_error("uncaught guest exception"){} };
[[noreturn]] void generatorTypeError(VM& vm,const char* message,Reg* fp) {
  vm.exception.h=vm.allocate(0,2,fp);
  vm.exception.h->slots[0].h=vm.keepString(message,strlen(message),fp);
  vm.exception.h->slots[1].h=vm.keepString("TypeError",9,fp);
  throw GuestThrow();
}
bool routeException(VM* vm,const Ins*& ip,Reg*& fp) {
  for (;;) {
    if(ip->catchPc!=UINT32_MAX) { ip=vm->fns[vm->fn].code.data()+ip->catchPc;return true; }
    if(vm->depth==vm->boundary)return false;
    const auto frame=vm->frames[--vm->depth];vm->fn=frame.fn;fp=frame.fp;ip=frame.ip-1;
  }
}
void startAsync(VM*,const Ins*,Reg*,uint32_t,uint32_t,Heap*);
Heap* callbackTask(VM&,Reg,Reg*);
ZincHandle callbackHandle(VM&,Reg);
void drainMicrotasks(VM&);
void setTimer(VM&,const Ins*,Reg*);
void generatorCall(VM&,const Ins*,Reg*,uint32_t,uint32_t,Heap*);
bool generatorStep(VM&,const Ins*,Reg*);
// One implementation of operations; dispatch is musttail on Clang and a bounded loop elsewhere.
template<int O, int T> void step(VM* vm, const Ins*& ip, Reg*& fp) {
  const auto a=ip->a, b=ip->b, c=ip->c;
  if constexpr (O == K) fp[a] = vm->constants[b];
  else if constexpr (O == MOV) fp[a] = fp[b];
  else if constexpr (O == LOAD) fp[a] = vm->globals[b];
  else if constexpr (O == STORE) vm->globals[b] = fp[a];
  else if constexpr (O >= ADD && O <= USHR) {
    if constexpr (T == ZINC_STRING) {
      if constexpr (O == EQ || O == NE) fp[a].u = (string(fp[b]) == string(fp[c])) != (O == NE);
    } else if constexpr (T == VM_REF) { fp[a].u=(fp[b].h==fp[c].h || (fp[b].h && fp[c].h && fp[b].h->nativeHandle && fp[b].h->nativeHandle==fp[c].h->nativeHandle))!=(O==NE); } else {
      const auto x=typedNumber<T>(fp[b]), y=typedNumber<T>(fp[c]);
      if constexpr (O >= LT && O <= NE) {
        if constexpr (O==LT) fp[a].u=x<y; if constexpr (O==LE) fp[a].u=x<=y;
        if constexpr (O==GT) fp[a].u=x>y; if constexpr (O==GE) fp[a].u=x>=y;
        if constexpr (O==EQ) fp[a].u=x==y; if constexpr (O==NE) fp[a].u=x!=y;
      } else if constexpr (O >= AND) {
        uint32_t l=uint32(x), r=uint32(y), z=0;
        if constexpr(O==AND) z=l&r; if constexpr(O==OR) z=l|r; if constexpr(O==XOR) z=l^r;
        if constexpr(O==SHL) z=l<<(r&31); if constexpr(O==SHR) z=(uint32_t)((int32_t)l>>(r&31)); if constexpr(O==USHR) z=l>>(r&31);
        fp[a]=value(T == ZINC_U32 || O == USHR ? (double)z : (double)(int32_t)z,T);
      } else if constexpr (T == ZINC_I32 || T == ZINC_U32) {
        if constexpr(O==ADD) fp[a].u=fp[b].u+fp[c].u;
        if constexpr(O==SUB) fp[a].u=fp[b].u-fp[c].u;
        if constexpr(O==MUL) fp[a].u=fp[b].u*fp[c].u;
        if constexpr(O==DIV || O==MOD) {
          if (!y) throw std::runtime_error("integer division by zero");
          fp[a]=value(O==DIV ? trunc((double)x/(double)y) : fmod((double)x,(double)y),T);
        }
      } else {
        if constexpr(O==ADD) fp[a]=value(x+y,T); if constexpr(O==SUB) fp[a]=value(x-y,T);
        if constexpr(O==MUL) fp[a]=value(x*y,T); if constexpr(O==DIV) fp[a]=value(x/y,T); if constexpr(O==MOD) fp[a]=value(fmod(x,y),T);
      }
    }
  } else if constexpr(O==NEG) fp[a]=value(-number(fp[b],T),T);
  else if constexpr(O==NOT) fp[a].u=!fp[b].u;
  else if constexpr(O==BITNOT) fp[a]=value((int32_t)~uint32(number(fp[b],T)),T);
  else if constexpr(O==CONV) fp[a]=value(number(fp[b],c),T);

  else if constexpr(O==CALL || O==CALLF || O==METHOD) {
    const uint32_t target=O==CALLF?closureTarget(vm,ip,fp):O==METHOD?methodTarget(vm,ip,fp):b;
    const auto args=O==METHOD?b:c;
    vm->poll(); const auto& fn=vm->fns[target];
    if(fn.gen) { generatorCall(*vm,ip,fp,target,args,O==CALLF?fp[b].h:nullptr);++ip;return; }
    if(fn.async) { startAsync(vm,ip,fp,target,args,O==CALLF?fp[b].h:nullptr);++ip;return; }
    if (vm->depth == vm->frames.size()-1) throw std::runtime_error("VM call stack overflow");
    Reg* next=fp+vm->fns[vm->fn].types.size();
    if (fn.types.size() > (size_t)(vm->stack.data()+vm->stack.size()-next)) throw std::runtime_error("VM register stack overflow");
    vm->frames[vm->depth++]={ip+1,fp,a,vm->fn}; vm->fn=target;
    for (auto j:fn.refs) next[j].h=nullptr;
    for (size_t j=fn.params.size();j>0;--j) next[fn.params[j-1]]=fp[args+j-1];
    if constexpr(O==CALLF)for(size_t j=0;j<fn.captures.size();j++)next[fn.captures[j]]=fp[b].h->slots[j];
    fp=next; ip=fn.code.data(); return;
  } else if constexpr(O==RET) {
    if (vm->depth==vm->boundary) { vm->result=T==ZINC_VOID?Reg():fp[a];vm->resultType=T;ip=nullptr; return; }
    auto f=vm->frames[--vm->depth]; if constexpr(T!=ZINC_VOID) f.fp[f.dst]=fp[a]; fp=f.fp; ip=f.ip; vm->fn=f.fn; return;
  } else if constexpr(O==PRINT) {
    if constexpr(T==ZINC_STRING) fwrite(string(fp[a]).ptr(),1,string(fp[a]).bytes(),stdout);
    else if constexpr(T==VM_REF) { zrt::StrBuilder out;zrt::Insp in{};if(fp[a].h && fp[a].h->dynamic && fp[a].h->payloadType==ZINC_STRING)zrt::to_s(out,string(fp[a].h->slots[0]));else inspectValue(*vm,fp[a],T,out,in);fwrite(out.buf,1,out.len,stdout); }
    else if constexpr(T==ZINC_BOOL) fputs(fp[a].u ? "true":"false",stdout);
    else { zrt::StrBuilder sb; zrt::str_num(sb,number(fp[a],T)); fwrite(sb.buf,1,sb.len,stdout); }
  } else if constexpr(O==SPACE) putchar(' ');
  else if constexpr(O==NEWLINE) {putchar('\n');fflush(stdout);}
  else if constexpr(O==NATIVE) {
    const auto& f=*vm->imports[b];
    ZincValue small[8]{};std::vector<ZincValue> storage;
    if(f.parameter_count>8)storage.resize(f.parameter_count);
    auto* args=f.parameter_count>8?storage.data():small;
    zinc::HandleScope callbacks{vm->modules.host};
    std::vector<std::vector<double>> numberArgs;numberArgs.reserve(f.parameter_count);
    std::vector<std::vector<uint8_t>> byteArgs;byteArgs.reserve(f.parameter_count);
    struct NativeFrame {VM& vm;Reg* fp;const Ins* ip;~NativeFrame(){vm.nativeFp=fp;vm.nativeIp=ip;}} frame{*vm,vm->nativeFp,vm->nativeIp};
    vm->nativeFp=fp;vm->nativeIp=ip;
    for(uint32_t j=0;j<f.parameter_count;j++) {
      auto& v=args[j];v.type=f.parameters[j];const auto r=fp[c+j];
      if(v.type==ZINC_NUMBERS) {
        const auto& source=vm->object(r,true);const auto& layout=vm->layouts[source.layout];
        if(layout.types.size()!=1 || layout.types[0]!=ZINC_F64)throw std::runtime_error("native numeric argument must be number[]");
        numberArgs.emplace_back();auto& numbers=numberArgs.back();numbers.reserve(source.slots.size());
        for(const auto item:source.slots)numbers.push_back(item.f);
        v.as.numbers=numbers.data();v.length=(uint32_t)numbers.size();
      } else if(v.type==ZINC_BYTES) {
        const auto& source=vm->object(r,true);const auto& layout=vm->layouts[source.layout];
        if(layout.types.size()!=1 || layout.types[0]!=ZINC_U32)throw std::runtime_error("native byte argument must be u8[]");
        byteArgs.emplace_back();auto& bytes=byteArgs.back();bytes.reserve(source.slots.size());
        for(const auto item:source.slots){if(item.u>255)throw std::runtime_error("native byte argument outside u8 range");bytes.push_back((uint8_t)item.u);}
        v.as.bytes=bytes.data();v.length=(uint32_t)bytes.size();
      } else if(v.type==ZINC_CALLBACK) {v.as.handle=callbackHandle(*vm,r);callbacks.add(v.as.handle);} else if(v.type==ZINC_RESOURCE) {
        if(r.h && !r.h->nativeHandle)throw std::runtime_error("native argument is not a resource");
        v.as.handle=r.h?r.h->nativeHandle:0;vm->modules.resources.check(v.as.handle);
      } else if(v.type==ZINC_STRING) { v.as.string=string(r).ptr();v.length=(uint32_t)string(r).bytes(); }
      else if(v.type==ZINC_I32) v.as.integer=r.i;
      else if(v.type==ZINC_BOOL || v.type==ZINC_U32) v.as.unsigned_integer=r.u;
      else v.as.number=r.f;
    }
    ZincValue result;
    try {result=zinc::Modules::call(f,args,f.parameter_count);}
    catch(const zinc::NativeFailure& error) {
      vm->exception.h=vm->allocate(0,2,fp);
      vm->exception.h->slots[0].h=vm->keepString(error.what(),strlen(error.what()),fp);
      vm->exception.h->slots[1].h=vm->keepString("Error",5,fp);
      throw GuestThrow();
    }
    if constexpr(T==VM_REF) {
      if(f.result==ZINC_RECORD) {
        zinc::RecordSnapshot record(result);
        auto& target=vm->object(fp[a],false);const auto& shape=vm->layouts[target.layout];
        if(target.slots.size()!=record.fields.size() || shape.types.size()!=record.fields.size())throw std::runtime_error("native record layout mismatch");
        for(size_t j=0;j<record.fields.size();j++) {
          const auto field=record.fields[j];if(shape.types[j]!=field.type)throw std::runtime_error("native record field layout mismatch");
          if(field.type==ZINC_STRING)target.slots[j].h=vm->keepString(field.as.string,field.length,fp);
          else if(field.type==ZINC_I32)target.slots[j].i=field.as.integer;
          else if(field.type==ZINC_BOOL || field.type==ZINC_U32)target.slots[j].u=field.as.unsigned_integer;
          else target.slots[j]=value(field.as.number,field.type);
        }
        ++ip;return;
      }
      if(f.result==ZINC_BYTES) {
        if(result.length>vm->heapLimit/sizeof(Reg))throw std::runtime_error("VM heap memory limit exceeded");
        // Copy borrowed bytes before allocating guest memory (which may finalize native resources).
        std::vector<uint8_t> bytes;if(result.length)bytes.assign(result.as.bytes,result.as.bytes+result.length);
        uint32_t layout=0;while(layout<vm->layouts.size() && !(vm->layouts[layout].array && vm->layouts[layout].types==std::vector<uint32_t>{ZINC_U32}))++layout;
        if(layout==vm->layouts.size())vm->layouts.push_back({true,{0},{ZINC_U32},{}});
        auto* h=vm->allocate(layout,bytes.size(),fp);for(size_t j=0;j<bytes.size();j++)h->slots[j].u=bytes[j];fp[a].h=h;
        ++ip;return;
      }
      try {
        vm->modules.resources.check(result.as.handle);
        if(!result.as.handle)fp[a].h=nullptr;
        else { auto* h=vm->allocate(UINT32_MAX,0,fp);h->nativeHandle=result.as.handle;h->nativeHost=&vm->modules.host;fp[a].h=h; }
      } catch(...) { vm->modules.host.resource_release(vm->modules.host.context,result.as.handle,nullptr);throw; }
    } else if constexpr(T==ZINC_STRING) {
      fp[a].h=vm->keepString(result.as.string,result.length,fp);
    } else if constexpr(T==ZINC_I32) fp[a].i=result.as.integer;
    else if constexpr(T==ZINC_BOOL || T==ZINC_U32) fp[a].u=result.as.unsigned_integer;
    else if constexpr(T!=ZINC_VOID) fp[a]=value(result.as.number,T);
  } else if constexpr(O==YIELD) {
    auto* task=vm->currentTask;
    if(!task || !task->generator || vm->depth!=vm->boundary)throw std::runtime_error("invalid VM yield");
    task->pc=(uint32_t)(ip-vm->fns[vm->fn].code.data())+1;task->yielded=fp[a];task->payloadType=T;
    std::copy(fp,fp+task->slots.size(),task->slots.begin());vm->suspended=true;ip=nullptr;return;
  } else if constexpr(O==DYNAMIC) {
    const auto action=c&255,type=c>>8;
    if(action==0)fp[a].h=vm->box(type && type!=8?fp[b]:Reg(),type,fp);
    else if(action==1) {
      const auto& source=dynamic(fp[b]);
      if constexpr(T>=ZINC_I32 && T<=ZINC_F64) {
        if(source.payloadType<ZINC_I32 || source.payloadType>ZINC_F64)throw std::runtime_error("VM dynamic value is not a number");
        fp[a]=value(number(source.slots[0],source.payloadType),T);
      } else {if(source.payloadType!=T)throw std::runtime_error("VM dynamic value type mismatch");fp[a]=source.slots[0];}
    } else if(action==2) {
      const auto& source=dynamic(fp[b]);const char* name=source.payloadType==0?"undefined":source.payloadType==ZINC_BOOL?"boolean":source.payloadType<ZINC_STRING?"number":source.payloadType==ZINC_STRING?"string":"object";
      fp[a].h=vm->keepString(name,strlen(name),fp);
    } else if(action==8) {
      const auto& source=dynamic(fp[b]);fp[a].u=source.payloadType==0 || source.payloadType==8 || (source.payloadType==VM_REF && !source.slots[0].h);
    } else if(action==3) {
      const auto& source=dynamic(fp[b]);
      fp[a].u=source.payloadType==VM_REF?source.slots[0].h!=nullptr:source.payloadType==8?false:zrt::truthy(primitiveDyn(source));
    } else {
      const auto& left=dynamic(fp[b]);const auto& right=dynamic(fp[b+1]);
      bool equal;
      if(left.payloadType==VM_REF || right.payloadType==VM_REF) {
        if(left.payloadType==VM_REF && right.payloadType==VM_REF)equal=left.slots[0].h==right.slots[0].h;
        else if((left.payloadType==VM_REF && left.slots[0].h) || (right.payloadType==VM_REF && right.slots[0].h))equal=false;
        else equal=action>=6?zrt::dyn_leq(primitiveDyn(left),primitiveDyn(right)):zrt::dyn_seq(primitiveDyn(left),primitiveDyn(right));
      } else equal=action>=6?zrt::dyn_leq(primitiveDyn(left),primitiveDyn(right)):zrt::dyn_seq(primitiveDyn(left),primitiveDyn(right));
      fp[a].u=(action==5 || action==7)?!equal:equal;
    }
  } else if constexpr(O==GENCONTROL) {
    if(c==0 || c==2 || c==7) {
      if(!vm->currentTask || !vm->currentTask->generator)throw std::runtime_error("generator control outside a generator");
      if(c==0){fp[a].u=vm->currentTask->closing;vm->currentTask->closing=false;}
      else if(c==7) {fp[a].h=vm->currentTask->sent?vm->currentTask->sent:vm->box(Reg(),ZINC_VOID,fp);}
      else {fp[a].h=vm->currentTask->awaited;vm->currentTask->awaited=nullptr;}
    } else if(c==8 || c==9) {
      auto* task=fp[b].h;if(!task || !task->generator)throw std::runtime_error("invalid VM generator");
      if(c==8)fp[a].h=task->completion?task->completion:vm->box(Reg(),ZINC_VOID,fp);else task->sent=fp[b+1].h;
    } else {
      auto* task=fp[b].h;if(!task || !task->generator)throw std::runtime_error("invalid VM generator");
      if(task->running)generatorTypeError(*vm,"generator is already running",fp);
      bool yielded=false;const bool wasDone=task->done;
      if(c==3)task->sent=fp[b+1].h;
      if(c==4)task->completion=fp[b+1].h;
      if(c==5 || c==6) {
        if(task->done || !task->pc){task->done=true;vm->exception=fp[b+1];throw GuestThrow();}
        task->awaited=fp[b+1].h;
      }
      if(!task->done) {
        if(c==1 || c==4) {
          if(!task->pc){task->done=true;std::fill(task->slots.begin(),task->slots.end(),Reg());}
          else {task->closing=true;yielded=generatorStep(*vm,ip,fp);}
        } else yielded=generatorStep(*vm,ip,fp);
      }
      if(c==6)fp[a].u=yielded;
      else if(c>=3) {
        auto& result=vm->object(fp[a],false);const auto& shape=vm->layouts[result.layout];if(result.slots.size()!=2 || shape.types.size()!=2 || shape.types[0]!=ZINC_BOOL || shape.types[1]!=VM_REF)throw std::runtime_error("invalid iterator result layout");
        result.iteratorResult=true;result.slots[0].u=!yielded;
        if(yielded)result.slots[1].h=vm->box(task->yielded,task->payloadType,fp);
        else {result.slots[1].h=(!wasDone || c==4)&&task->completion?task->completion:vm->box(Reg(),ZINC_VOID,fp);task->completion=nullptr;}
      }
    }
  } else if constexpr(O==GENSTEP) { fp[a].u=generatorStep(*vm,ip,fp);
  } else if constexpr(O==GENVALUE) {
    auto* task=fp[b].h;
    if(!task || !task->generator || task->payloadType!=T)throw std::runtime_error("invalid VM generator value");
    fp[a]=task->yielded;
  } else if constexpr(O==PENDING) { fp[a].h=vm->allocate(UINT32_MAX,1,fp);fp[a].h->promiseState=1;
  } else if constexpr(O==SETTLE) {
    auto* p=fp[a].h;
    if(!p || !p->promiseState)throw std::runtime_error("invalid VM promise resolver");
    if(p->promiseState==1)vm->settle(p,fp[b],T,c!=0,fp);
  } else if constexpr(O==MICROTASK) { vm->jobs.push_back(callbackTask(*vm,fp[a],fp));
  } else if constexpr(O==TIMER) { setTimer(*vm,ip,fp);
  } else if constexpr(O==CANCELTIMER) {
    const double id=number(fp[a],T);
    // ponytail: cancellation scans active timers; add an ID index if timer-heavy workloads justify it.
    for(auto it=vm->timers.begin();it!=vm->timers.end();++it)if(it->second.id==id){vm->timers.erase(it);break;}
  } else if constexpr(O==PROMISE) {
    if(c==VM_REF && fp[b].h && fp[b].h->promiseState)fp[a]=fp[b];
    else { auto* h=vm->allocate(UINT32_MAX,1,fp);vm->settle(h,fp[b],c&255,(c&256)!=0);fp[a].h=h; }
  } else if constexpr(O==AWAIT) { vm->suspend(ip,fp);ip=nullptr;return;
  } else if constexpr(O==THROW) { vm->poll();vm->exception=fp[a];throw GuestThrow(); }
  else if constexpr(O==EXCEPTION) { fp[a]=vm->exception;vm->exception=Reg(); }
  else if constexpr(O==INSTANCEOF) {
    auto* object=vm->fns[vm->fn].types[b]==VM_REF?fp[b].h:nullptr;
    if(object && object->dynamic)object=object->payloadType==VM_REF?object->slots[0].h:nullptr;
    fp[a].u=object && object->layout<vm->layouts.size() && std::any_of(vm->layouts[object->layout].methods.begin(),vm->layouts[object->layout].methods.end(),[&](auto entry){return entry.first==c;});
  }
  else if constexpr(O==METHODREF) {
    auto& object=vm->object(fp[b],false);const auto& layout=vm->layouts[object.layout];
    const auto method=std::find_if(layout.methods.begin(),layout.methods.end(),[&](auto entry){return entry.first==c;});
    if(method==layout.methods.end())throw std::runtime_error("VM method not found");
    const uint32_t target=method->second;
    if(!vm->functionValues[target].h){auto* h=vm->allocate(vm->fns[target].closureLayout,0,fp);h->function=target;vm->functionValues[target].h=h;}
    fp[a]=vm->functionValues[target];
  }
  else if constexpr(O==FNREF) {
    if (!vm->functionValues[b].h) { auto* h=vm->allocate(vm->fns[b].closureLayout,0,fp);h->function=b;vm->functionValues[b].h=h; }
    fp[a]=vm->functionValues[b];
  } else if constexpr(O==CLOSURE) {
    const auto& fn=vm->fns[b];
    auto* h=vm->allocate(fn.closureLayout,fn.captures.size(),fp);h->function=b;
    for(size_t j=0;j<fn.captures.size();j++)h->slots[j]=fp[c+j];
    fp[a].h=h;
  } else if constexpr(O==ALLOC) {
    fp[a].h=vm->allocate(b,c,fp);
  } else if constexpr(O==INIT) {
    if (!fp[a].h || fp[a].h->layout>=vm->layouts.size()) throw std::runtime_error("invalid VM initialization");
    auto& h=*fp[a].h;const auto& l=vm->layouts[h.layout];
    if (b>=h.slots.size() || l.types[l.array?0:b]!=T) throw std::runtime_error("VM initializer type mismatch");
    h.slots[b]=fp[c];
  } else if constexpr(O==FIELDGET) fp[a]=vm->field(fp[b],c,T);
  else if constexpr(O==FIELDSET) vm->field(fp[a],c,T)=fp[b];
  else if constexpr(O==INDEXGET || O==INDEXSET || O==PUSH || O==POP || O==LENGTH) {
    auto& h=vm->object(fp[O==INDEXSET?a:b],true);const auto& l=vm->layouts[h.layout];
    if constexpr(O==LENGTH) fp[a]=value((double)h.slots.size(),T);
    else if constexpr(O==PUSH) {
      if (l.types[0]!=vm->fns[vm->fn].types[c]) throw std::runtime_error("VM array element type mismatch");
      vm->push(&h,fp[c],fp);fp[a]=value((double)h.slots.size(),T);
    } else {
      if (l.types[0]!=T) throw std::runtime_error("VM array element type mismatch");
      if constexpr(O==POP) {
        fp[a]=h.slots.empty()?Reg():c?h.slots.front():h.slots.back();
        if(!h.slots.empty()) {if(c)h.slots.erase(h.slots.begin());else h.slots.pop_back();}
      }
      else {
        const auto index=O==INDEXSET?b:c;
        const double n=number(fp[index],vm->fns[vm->fn].types[index]);
        if (!std::isfinite(n) || trunc(n)!=n) throw std::runtime_error("non-integer array index");
        if (n<0 || n>(double)h.slots.size() || (O==INDEXGET && n==(double)h.slots.size())) throw std::runtime_error("array index out of bounds");
        if constexpr(O==INDEXGET) fp[a]=h.slots[(size_t)n];
        else { if (n==(double)h.slots.size())vm->push(&h,fp[c],fp);else h.slots[(size_t)n]=fp[c]; }
      }
    }
  } else if constexpr(O==STRING) {
    const auto method=c&255,count=c>>8;const zrt::String empty;const auto& text=method==22?empty:string(fp[b]);
    const auto index=[&](uint32_t j,int32_t fallback) {
      if(j>=count)return fallback;
      const double n=number(fp[b+j],vm->fns[vm->fn].types[b+j]);
      return std::isnan(n)?0:(int32_t)std::max(double(INT32_MIN),std::min(double(INT32_MAX),n));
    };
    zrt::String result;
    if(method==0) {fp[a]=value(text.length(),T);}
    else if(method==1)result=text.slice(index(1,0),index(2,text.length()));
    else if(method==2)result=text.substring(index(1,0),index(2,text.length()));
    else if(method==3)fp[a]=value(text.indexOf(string(fp[b+1]),index(2,0)),T);
    else if(method==4)fp[a]=value(text.lastIndexOf(string(fp[b+1]),index(2,INT32_MAX)),T);
    else if(method==5)fp[a].u=text.includes(string(fp[b+1]),index(2,0));
    else if(method==6)fp[a].u=text.startsWith(string(fp[b+1]),index(2,0));
    else if(method==7)fp[a].u=text.endsWith(string(fp[b+1]),index(2,text.length()));
    else if(method==8)result=text.trim();
    else if(method==9)result=text.trimStart();
    else if(method==10)result=text.trimEnd();
    else if(method==11)result=text.toLowerCase();
    else if(method==12)result=text.toUpperCase();
    else if(method==13)result=text.charAt(index(1,0));
    else if(method==14) {
      auto parts=text.split(string(fp[b+1]));
      const auto layout=vm->object(fp[a],true).layout;
      if(vm->layouts[layout].types[0]!=ZINC_STRING)throw std::runtime_error("split requires a string array layout");
      fp[a].h=vm->allocate(layout,parts.length(),fp);
      for(int32_t j=0;j<parts.length();j++)fp[a].h->slots[j].h=vm->keepString(parts.get(j).ptr(),parts.get(j).bytes(),fp);
    }
    else if(method==15)fp[a]=value(text.charCodeAt(index(1,0)),T);
    else if(method==20)fp[a]=value(zrt::parse_float(text),T);
    else if(method==21)fp[a]=value(zrt::parse_int(text,index(1,0)),T);
    else if(method==22) {
      const int32_t digits=index(1,0);
      if(digits<0 || digits>100)throw std::runtime_error("RangeError: toFixed() digits argument must be between 0 and 100");
      result=zrt::to_fixed(number(fp[b],vm->fns[vm->fn].types[b]),digits);
    } else if(method==23) {
      const auto& pattern=string(fp[b+1]);const auto& replacement=string(fp[b+2]);
      const int32_t match=text.indexOf(pattern);
      if(match<0)result=text;
      else {
        const size_t prefix=text.slice(0,match).bytes(),suffix=text.bytes()-prefix-pattern.bytes();
        size_t bytes=prefix+suffix;
        for(uint32_t j=0;j<replacement.bytes();j++) {
          size_t addition=1;
          if(replacement.ptr()[j]=='$' && j+1<replacement.bytes()) {
            const char next=replacement.ptr()[j+1];
            if(next=='$' || next=='&' || next=='`' || next=='\'') {
              ++j;addition=next=='$'?1:next=='&'?pattern.bytes():next=='`'?prefix:suffix;
            }
          }
          if(addition>vm->heapLimit || bytes>vm->heapLimit-addition)throw std::runtime_error("VM heap memory limit exceeded");
          bytes+=addition;
        }
        vm->reserveHeap(sizeof(Heap)+sizeof(zrt::StrObj)+1+bytes,fp);
        result=text.replace(pattern,replacement);
      }
    }
    else if(method>=16 && method<=19) {
      size_t bytes=text.bytes();
      if(method==16) {
        const int32_t repeats=index(1,0);
        if(repeats<0)throw std::runtime_error("RangeError: invalid count");
        if(bytes && size_t(repeats)>vm->heapLimit/bytes)throw std::runtime_error("VM heap memory limit exceeded");
        bytes*=size_t(repeats);
        vm->reserveHeap(sizeof(Heap)+sizeof(zrt::StrObj)+1+bytes,fp);
        if(bytes)result=text.repeat(repeats);
      } else if(method==19) {
        const auto& suffix=string(fp[b+1]);
        if(suffix.bytes()>vm->heapLimit || bytes>vm->heapLimit-suffix.bytes())throw std::runtime_error("VM heap memory limit exceeded");
        vm->reserveHeap(sizeof(Heap)+sizeof(zrt::StrObj)+1+bytes+suffix.bytes(),fp);
        result=text.concat(suffix);
      } else {
        const int32_t target=index(1,0);
        const int64_t needed=int64_t(target)-text.length();
        const zrt::String fill=count>2?string(fp[b+2]):zrt::String::from(" ",1);
        if(needed>0 && fill.length()) {
          const size_t full=size_t(needed)/size_t(fill.length());
          if(full>vm->heapLimit/std::max(size_t(1),size_t(fill.bytes())))throw std::runtime_error("VM heap memory limit exceeded");
          bytes+=full*fill.bytes()+fill.slice(0,int32_t(needed%fill.length())).bytes();
        }
        vm->reserveHeap(sizeof(Heap)+sizeof(zrt::StrObj)+1+bytes,fp);
        result=method==17?text.padStart(target,fill):text.padEnd(target,fill);
      }
    }
    if constexpr(T==ZINC_STRING)fp[a].h=vm->keepString(result.ptr(),result.bytes(),fp);
  } else if constexpr(O==JOIN) {
    auto& array=vm->object(fp[b],true);const auto element=vm->layouts[array.layout].types[0];
    if(!element || element>ZINC_STRING)throw std::runtime_error("join requires scalar array elements");
    zrt::StrBuilder out;
    for(size_t j=0;j<array.slots.size();j++) {
      if(j) {if(c)zrt::to_s(out,string(fp[c-1]));else out.ch(',');}
      const auto r=array.slots[j];
      if(element==ZINC_STRING)zrt::to_s(out,string(r));
      else if(element==ZINC_BOOL)zrt::to_s(out,r.u!=0);
      else zrt::to_s(out,number(r,element));
      if(out.len>vm->heapLimit)throw std::runtime_error("VM heap memory limit exceeded");
    }
    fp[a].h=vm->keepString(out.buf,out.len,fp);
  } else if constexpr(O==COLLECTION) {
    const uint32_t method=b&255,keyType=(b>>8)&255,valueType=(b>>16)&255;
    if(method==0) {
      vm->reserveHeap(sizeof(Heap)+sizeof(Collection)+sizeof(zrt::MapObj<CollectionKey,Reg>),fp);
      auto* h=vm->allocate(UINT32_MAX,0,fp);fp[a].h=h;
      h->collection=std::make_unique<Collection>(keyType,valueType);
      vm->heapBytes+=h->collection->bytes();vm->peakHeapBytes=std::max(vm->peakHeapBytes,vm->heapBytes);
    } else {
      auto* h=fp[c].h;
      if(!h || !h->collection || h->collection->keyType!=keyType || h->collection->valueType!=valueType)throw std::runtime_error("invalid VM collection type");
      auto& collection=*h->collection;auto& entries=collection.entries;
      CollectionKey key;key.type=keyType;
      if(method>=2 && method<=5) {key.value=fp[c+1];if((keyType==ZINC_F32 || keyType==ZINC_F64) && key.value.f==0)key.value.f=0;}
      const auto before=collection.bytes();
      if(method==1)fp[a].i=entries.size();
      else if(method==2)fp[a]=entries.get(key);
      else if(method==3) {
        if(entries.find(key)<0 && entries.m->n==entries.m->cap) {
          const auto used=entries.m->iterators?entries.m->n:entries.m->live;
          const size_t capacity=std::max(size_t(8),size_t(used)*2);size_t indexCapacity=16;while(indexCapacity<capacity*2)indexCapacity*=2;
          const size_t required=Collection::storage(capacity,indexCapacity),current=Collection::storage(entries.m->cap,entries.m->icap);
          if(required>current)vm->reserveHeap(required-current,fp);
        }
        entries.set(key,valueType?fp[c+2]:Reg());fp[a]=fp[c];
      } else if(method==4)fp[a].u=entries.has(key);
      else if(method==5)fp[a].u=entries.del(key);
      else if(method==6)entries.clear();
      else if(method==7)fp[a].i=entries.slots();
      else if(method>=8 && method<=10) {
        const int32_t index=fp[c+1].i;if(index<0 || index>=entries.slots())throw std::runtime_error("VM collection index out of bounds");
        if(method==8)fp[a].u=entries.live_at(index);
        else {if(!entries.live_at(index))throw std::runtime_error("VM collection slot is deleted");fp[a]=method==9?entries.key_at(index).value:entries.val_at(index);}
      } else if(method==11 || method==12) {
        auto& target=vm->object(fp[a],true);const auto& shape=vm->layouts[target.layout];const auto element=method==11 || !valueType?keyType:valueType;
        if(shape.types.size()!=1 || shape.types[0]!=element || !target.slots.empty())throw std::runtime_error("invalid VM collection snapshot layout");
        for(int32_t j=0;j<entries.slots();j++)if(entries.live_at(j))vm->push(&target,method==11 || !valueType?entries.key_at(j).value:entries.val_at(j),fp);
      } else if(method==13) {
        if(entries.m->iterators==UINT32_MAX)throw std::runtime_error("too many VM collection iterators");++entries.m->iterators;
      } else if(method==14) {if(!entries.m->iterators)throw std::runtime_error("invalid VM collection iterator release");--entries.m->iterators;}
      vm->heapBytes=vm->heapBytes-before+collection.bytes();vm->peakHeapBytes=std::max(vm->peakHeapBytes,vm->heapBytes);
    }
  } else if constexpr(O==SPLICE) {
    auto& source=vm->object(fp[b],true);const auto length=(int64_t)source.slots.size();
    const auto integer=[&](uint32_t index){return (int64_t)(int32_t)uint32(number(fp[index],vm->fns[vm->fn].types[index]));};
    const bool slice=(c&256)!=0;const auto argc=c&255;
    const auto clamp=[&](int64_t n){return std::max(int64_t(0),std::min(length,n<0?length+n:n));};
    const auto start=argc>1?clamp(integer(b+1)):0;
    const auto count=argc<3?length-start:slice?std::max(int64_t(0),clamp(integer(b+2))-start):std::max(int64_t(0),std::min(length-start,integer(b+2)));
    auto* removed=vm->allocate(source.layout,(size_t)count,fp);
    std::copy_n(source.slots.begin()+start,count,removed->slots.begin());fp[a].h=removed;
    if(!slice)source.slots.erase(source.slots.begin()+start,source.slots.begin()+start+count);
  } else if constexpr(O==MATH) {
    const auto method=c&255,count=c>>8;
    const auto argument=[&](uint32_t j){return number(fp[b+j],vm->fns[vm->fn].types[b+j]);};
    const double x=count?argument(0):0,y=count>1?argument(1):0;double result=0;
    switch(method) {
      case 0:result=zrt::math::abs(x);break;case 1:result=zrt::math::floor(x);break;
      case 2:result=zrt::math::ceil(x);break;case 3:result=zrt::math::round(x);break;
      case 4:result=zrt::math::trunc(x);break;case 5:result=zrt::math::sign(x);break;
      case 6:result=zrt::math::sqrt(x);break;case 7:result=zrt::math::pow(x,y);break;
      case 8:result=zrt::math::sin(x);break;case 9:result=zrt::math::cos(x);break;
      case 10:result=zrt::math::tan(x);break;case 11:result=zrt::math::atan2(x,y);break;
      case 12:result=zrt::math::exp(x);break;case 13:result=zrt::math::log(x);break;
      case 14:result=zrt::math::hypot(x,y);break;
      case 15:case 16:
        result=method==15?zrt::Inf:-zrt::Inf;
        for(uint32_t j=0;j<count;j++)result=method==15?zrt::math::min(result,argument(j)):zrt::math::max(result,argument(j));
        break;
      case 17:result=zrt::math::fround(x);break;
      case 18:result=zrt::math::imul((int32_t)uint32(x),(int32_t)uint32(y));break;
      case 19:result=zrt::math::clz32((int32_t)uint32(x));break;
      case 20:result=zrt::math::random(vm->randomState);break;
      case 21:zrt::math::seed(vm->randomState,uint32(x));break;
    }
    fp[a]=value(result,T);
  } else if constexpr(O==CONCAT) {
    std::string out;
    for (uint32_t j=0;j<c;j++) {
      const auto type=vm->fns[vm->fn].types[b+j];std::string part;
      if(type==ZINC_STRING) part.assign(string(fp[b+j]).ptr(),string(fp[b+j]).bytes());
      else if(type==ZINC_BOOL) part=fp[b+j].u?"true":"false";
      else { zrt::StrBuilder sb;zrt::str_num(sb,number(fp[b+j],type));part.assign(sb.buf,sb.len); }
      if(part.size()>vm->heapLimit || out.size()>vm->heapLimit-part.size())throw std::runtime_error("VM heap memory limit exceeded");
      out+=part;
    }
    fp[a].h=vm->keepString(out.data(),out.size(),fp);
  } else if constexpr(O==TRUTHY) {
    if constexpr(T==ZINC_STRING) fp[a].u=string(fp[b]).bytes()!=0;
    else if constexpr(T==VM_REF) fp[a].u=fp[b].h!=nullptr;
    else { const auto n=number(fp[b],T);fp[a].u=n!=0&&!std::isnan(n); }
  } else if constexpr(O>=SQRT && O<=TRUNC) {
    const double x=number(fp[b],T);
    if constexpr(O==SQRT) fp[a]=value(sqrt(x),T); if constexpr(O==ABS) fp[a]=value(fabs(x),T);
    if constexpr(O==FLOOR) fp[a]=value(floor(x),T); if constexpr(O==CEIL) fp[a]=value(ceil(x),T); if constexpr(O==TRUNC) fp[a]=value(trunc(x),T);
  }
  ++ip;
}
// Branches use relative instruction offsets, so no pointer can originate in a bundle.
template<int O,int T> void handle(VM* vm,const Ins* ip,Reg* fp) {
  if constexpr(O==JMP) { vm->poll(); ip += (int32_t)ip->a; }
  else if constexpr(O==BR) { vm->poll(); ip += (int32_t)(fp[ip->a].u ? ip->b : ip->c); }
  else { try { step<O,T>(vm,ip,fp); } catch(const GuestThrow&) { if(!routeException(vm,ip,fp))throw; } }
#if defined(__clang__)
  if (ip) { [[clang::musttail]] return ip->h(vm,ip,fp); }
#else
  // The portable runner calls one handler at a time through these saved continuation fields.
  vm->frames.back()={ip,fp,0,0};
#endif
}
template<int O> Handler typed(uint32_t t) {
  switch(t) {
#define T(n) case n: return handle<O,n>;
    T(0) T(1) T(2) T(3) T(4) T(5) T(6) T(7)
#undef T
  } throw std::runtime_error("invalid instruction type");
}
Handler handler(uint32_t op,uint32_t t) {
  switch(op) {
#define O(n) case n: return typed<n>(t);
    O(K) O(MOV) O(LOAD) O(STORE) O(ADD) O(SUB) O(MUL) O(DIV) O(MOD) O(LT) O(LE) O(GT) O(GE) O(EQ) O(NE) O(AND) O(OR) O(XOR) O(SHL) O(SHR) O(USHR) O(NEG) O(NOT) O(BITNOT) O(CONV) O(JMP) O(BR) O(CALL) O(RET) O(PRINT) O(SPACE) O(NEWLINE) O(SQRT) O(ABS) O(FLOOR) O(CEIL) O(TRUNC) O(NATIVE) O(ALLOC) O(INIT) O(FIELDGET) O(FIELDSET) O(INDEXGET) O(INDEXSET) O(LENGTH) O(PUSH) O(POP) O(CONCAT) O(TRUTHY) O(CLOSURE) O(CALLF) O(FNREF) O(METHOD) O(THROW) O(EXCEPTION) O(PROMISE) O(AWAIT) O(PENDING) O(SETTLE) O(MICROTASK) O(TIMER) O(CANCELTIMER) O(YIELD) O(GENSTEP) O(GENVALUE) O(STRING) O(MATH) O(SPLICE) O(JOIN) O(COLLECTION) O(GENCONTROL) O(METHODREF) O(DYNAMIC) O(INSTANCEOF)
#undef O
  } throw std::runtime_error("invalid opcode");
}
uint32_t load(VM& vm,Reader r) {
  if(r.bytes.size()<4 || r.bytes.size()>(64u<<20))throw std::runtime_error("invalid bytecode file size");
  if(memcmp(r.bytes.data(),"ZBC4",4))throw std::runtime_error("unsupported bytecode format");r.at=4;
  if(r.u()!=ZINC_ABI_VERSION)throw std::runtime_error("native ABI version mismatch");
  auto ng=r.count(); vm.globals.resize(ng); for(uint32_t j=0;j<ng;j++) vm.gt.push_back(r.u());
  auto nk=r.count(); vm.constants.resize(nk);
  for(uint32_t j=0;j<nk;j++) { auto t=r.u(); if(!t || t>VM_REF) throw std::runtime_error("invalid constant type"); vm.kt.push_back(t);
    if(t==ZINC_STRING) { auto s=r.str(); vm.constants[j].h=vm.keepString(s.data(),s.size()); }
    else { auto n=r.number(); if(t==VM_REF) { if(n!=0)throw std::runtime_error("invalid reference constant"); } else vm.constants[j]=value(n,t); }
  }
  for(uint32_t j=0;j<ng;j++) { if(!vm.gt[j] || vm.gt[j]>VM_REF) throw std::runtime_error("invalid global type"); }
  auto nn=r.count();
  for(uint32_t j=0;j<nn;j++) {
    auto module=r.str(),name=r.str();const auto& f=vm.modules.resolve(module.c_str(),name.c_str());
    const auto count=r.count();if(count!=f.parameter_count)throw std::runtime_error("native import signature mismatch");
    for(uint32_t k=0;k<count;k++)if(r.u()!=f.parameters[k])throw std::runtime_error("native import signature mismatch");
    if(r.u()!=f.result)throw std::runtime_error("native import result mismatch");vm.imports.push_back(&f);

  }
  auto nl=r.count();vm.layouts.resize(nl);
  for (auto& l:vm.layouts) {
    auto array=r.u(),count=r.count();if(array>1 || (array && count!=1))throw std::runtime_error("invalid VM layout");l.array=array;
    std::unordered_set<uint32_t> keys, methodKeys;
    for(uint32_t j=0;j<count;j++) {
      auto key=r.u(),type=r.u();if(!type || type>VM_REF || !keys.insert(key).second)throw std::runtime_error("invalid VM field layout");
      l.keys.push_back(key);l.types.push_back(type);
    }
    const auto methods=r.count();if(l.array && methods)throw std::runtime_error("array method layout");
    for(uint32_t j=0;j<methods;j++){auto key=r.u(),fn=r.u();if(!methodKeys.insert(key).second)throw std::runtime_error("duplicate VM method");l.methods.emplace_back(key,fn);}
  }
  if(vm.layouts.empty() || vm.layouts[0].array || vm.layouts[0].keys!=std::vector<uint32_t>{0,1} || vm.layouts[0].types!=std::vector<uint32_t>{ZINC_STRING,ZINC_STRING} || !vm.layouts[0].methods.empty())throw std::runtime_error("invalid VM error layout");
  auto nf=r.count(), entry=r.u(); if(entry>=nf) throw std::runtime_error("invalid entry"); vm.fns.resize(nf);vm.functionValues.resize(nf);
  for(auto& f:vm.fns) {
    auto nr=r.count(), np=r.count();const auto header=r.u();
    if(header & ~uint32_t(255|256|3584|4096|57344))throw std::runtime_error("invalid function flags");
    f.ret=header&255;f.async=(header&256)!=0;f.gen=(header&4096)!=0;f.yieldType=(header>>13)&7;
    f.bodyRet=f.async?((header>>9)&7):f.gen?ZINC_VOID:f.ret;
    if((f.async && f.gen) || (f.gen && f.ret!=VM_REF) || (!f.gen && f.yieldType) || (!f.async && (header&3584)))throw std::runtime_error("invalid function flags");
    auto ni=r.count(), nc=r.count(), nh=r.count();
    if(nr>(1<<16) || np>nr || nc>nr || !ni || f.ret>VM_REF || f.bodyRet>VM_REF || (f.async && f.ret!=VM_REF)) throw std::runtime_error("invalid function header");
    for(uint32_t j=0;j<nr;j++) { auto t=r.u(); if(t>VM_REF) throw std::runtime_error("invalid register type"); f.types.push_back(t); if(t>=ZINC_STRING)f.refs.push_back(j); }
    std::vector<bool> bindings(nr);
    for(uint32_t j=0;j<np;j++) { auto p=r.u(); if(p>=nr || bindings[p]) throw std::runtime_error("invalid parameter"); bindings[p]=true;f.params.push_back(p); }
    for(uint32_t j=0;j<nc;j++) { auto p=r.u();if(p>=nr || bindings[p])throw std::runtime_error("invalid capture register");bindings[p]=true;f.captures.push_back(p); }
    {
      Layout frame{};frame.types=f.types;for(uint32_t j=0;j<nr;j++)frame.keys.push_back(j);
      f.frameLayout=(uint32_t)vm.layouts.size();vm.layouts.push_back(std::move(frame));
    }
    Layout closure{};for(uint32_t j=0;j<nc;j++){closure.keys.push_back(j);closure.types.push_back(f.types[f.captures[j]]);}
    f.closureLayout=(uint32_t)vm.layouts.size();vm.layouts.push_back(std::move(closure));
    for(uint32_t j=0;j<ni;j++) { auto word=r.u(); auto op=word&255,t=(word>>8)&255; if(word>>16) throw std::runtime_error("reserved instruction bits"); f.code.push_back({handler(op,t),r.u(),r.u(),r.u(),(uint8_t)op,(uint8_t)t}); }
    for(uint32_t j=0;j<nh;j++){auto at=r.u(),target=r.u();if(at>=ni || target>=ni || f.code[at].catchPc!=UINT32_MAX)throw std::runtime_error("invalid exception handler");f.code[at].catchPc=target;}
  }
  const auto ne=r.count();std::unordered_set<std::string> exportNames;
  for(uint32_t j=0;j<ne;j++) {
    auto name=r.str();const auto kind=r.u(),index=r.u(),writable=r.u();
    if(name.empty() || name.find('\0')!=std::string::npos || !exportNames.insert(name).second || kind>1 || writable>1)
      throw std::runtime_error("invalid VM export descriptor");
    if(kind==0) {
      if(index>=vm.fns.size() || writable)throw std::runtime_error("invalid VM function export");
      const auto& f=vm.fns[index];
      if(f.async || f.gen || !f.captures.empty() || f.ret>ZINC_STRING)throw std::runtime_error("unsupported VM function export");
      for(auto p:f.params)if(!f.types[p] || f.types[p]>ZINC_STRING)throw std::runtime_error("unsupported VM export parameter");
    } else if(index>=vm.globals.size() || !vm.gt[index] || vm.gt[index]>ZINC_STRING)throw std::runtime_error("invalid VM global export");
    vm.exports.push_back({std::move(name),kind,index,writable!=0});
  }
  if(r.at!=r.bytes.size() || (!vm.fns[entry].params.empty() || !vm.fns[entry].captures.empty())) throw std::runtime_error("invalid bundle end or entry signature");
  for(const auto& l:vm.layouts)for(auto m:l.methods)if(m.second>=vm.fns.size() || vm.fns[m.second].params.empty() || vm.fns[m.second].types[vm.fns[m.second].params[0]]!=VM_REF || !vm.fns[m.second].captures.empty())throw std::runtime_error("invalid VM method target");
  for(auto& f:vm.fns) for(size_t pc=0;pc<f.code.size();pc++) {
    auto& i=f.code[pc]; const uint32_t a=i.a,b=i.b,c=i.c,t=i.t;
    auto check=[&](bool ok) { if(!ok) throw std::runtime_error("bytecode verification failed at function " + std::to_string(&f-vm.fns.data()) + ", instruction " + std::to_string(pc) + ", opcode " + std::to_string(i.op)); };
    auto reg=[&](uint32_t n,uint32_t want) { check(n<f.types.size() && f.types[n]==want); };
    auto jump=[&](uint32_t n) { check(n<f.code.size()); };
    if(i.op==K) { reg(a,t); check(b<vm.kt.size() && vm.kt[b]==t); }
    else if(i.op==MOV) { reg(a,t); reg(b,t); }
    else if(i.op==LOAD || i.op==STORE) { reg(a,t); check(b<vm.gt.size() && vm.gt[b]==t); }
    else if(i.op>=ADD && i.op<=USHR) { reg(b,t);reg(c,t);reg(a,i.op>=LT&&i.op<=NE?ZINC_BOOL:t); check(t>=ZINC_I32 && t<=ZINC_F64 || (t==ZINC_BOOL && (i.op==EQ||i.op==NE)) || (t>=ZINC_STRING && (i.op==EQ||i.op==NE))); }
    else if(i.op==NEG || i.op==BITNOT || (i.op>=SQRT && i.op<=TRUNC)) { reg(a,t);reg(b,t);check(t>=ZINC_I32&&t<=ZINC_F64); }
    else if(i.op==NOT) { check(t==ZINC_BOOL);reg(a,t);reg(b,t); }
    else if(i.op==CONV) { reg(a,t);reg(b,c);check(t>=ZINC_I32&&t<=ZINC_F64&&c>=ZINC_I32&&c<=ZINC_F64); }
    else if(i.op==JMP) { jump(a);i.a=a-(uint32_t)pc; }
    else if(i.op==BR) { reg(a,ZINC_BOOL);jump(b);jump(c);i.b=b-(uint32_t)pc;i.c=c-(uint32_t)pc; }
    else if(i.op==CALL) { check(b<vm.fns.size());const auto& callee=vm.fns[b];reg(a,callee.ret);check(callee.captures.empty() && t==callee.ret && c<=f.types.size() && callee.params.size()<=f.types.size()-c);for(size_t j=0;j<callee.params.size();j++)reg(c+j,callee.types[callee.params[j]]); }
    else if(i.op==NATIVE) { check(b<vm.imports.size());const auto& native=*vm.imports[b];reg(a,(native.result==ZINC_BYTES || native.result==ZINC_RECORD)?VM_REF:native.result);check(t==((native.result==ZINC_BYTES || native.result==ZINC_RECORD)?VM_REF:native.result)&&c<=f.types.size()&&native.parameter_count<=f.types.size()-c);for(uint32_t j=0;j<native.parameter_count;j++)reg(c+j,(native.parameters[j]==ZINC_CALLBACK || native.parameters[j]==ZINC_BYTES || native.parameters[j]==ZINC_NUMBERS)?VM_REF:native.parameters[j]); }
    else if(i.op==RET) { check(t==f.bodyRet || ((f.async || f.gen) && t==VM_REF));if(t)reg(a,t); }
    else if(i.op==PRINT) { check(t!=ZINC_VOID && t<=VM_REF);reg(a,t); }
    else if(i.op==YIELD) { reg(a,t);check(f.gen && t==f.yieldType); }
    else if(i.op==DYNAMIC) {
      const auto action=c&255,source=c>>8;check(action<=8);
      if(action==0){check(source<=8 && t==VM_REF);if(source && source!=8)reg(b,source);}
      else {check(!source);reg(b,VM_REF);if(action==1)check(t>=ZINC_BOOL && t<=VM_REF);else if(action==2)check(t==ZINC_STRING);else check(t==ZINC_BOOL);if(action>=4 && action<=7)reg(b+1,VM_REF);}
      reg(a,t);
    }
    else if(i.op==GENCONTROL) {check(c<=9 && t==(c==0 || c==6?ZINC_BOOL:c==1 || c==9?ZINC_VOID:VM_REF));reg(a,t);if(c==0 || c==2 || c==7)check(f.gen);else {reg(b,VM_REF);if(c>=3 && c!=8)reg(b+1,VM_REF);}}
    else if(i.op==GENSTEP) { reg(a,ZINC_BOOL);reg(b,VM_REF);check(t==ZINC_BOOL); }
    else if(i.op==GENVALUE) { reg(a,t);reg(b,VM_REF); }
    else if(i.op==PENDING) { reg(a,VM_REF);check(t==VM_REF); }
    else if(i.op==SETTLE) { reg(a,VM_REF);reg(b,t);check(c<=1 && (!c || t==VM_REF)); }
    else if(i.op==TIMER) { reg(a,ZINC_I32);reg(b,VM_REF);check(t<=1 && c<f.types.size() && f.types[c]>=ZINC_I32 && f.types[c]<=ZINC_F64); }
    else if(i.op==CANCELTIMER) { reg(a,t);check(t>=ZINC_I32 && t<=ZINC_F64); }
    else if(i.op==MICROTASK) { reg(a,VM_REF);check(t==ZINC_VOID); }
    else if(i.op==PROMISE) { reg(a,VM_REF);reg(b,c&255);check(t==VM_REF && (c<=VM_REF || c==(256|VM_REF))); }
    else if(i.op==AWAIT) { reg(a,t);reg(b,VM_REF);check(f.async); }
    else if(i.op==FNREF) { reg(a,VM_REF);check(t==VM_REF && b<vm.fns.size() && vm.fns[b].captures.empty()); }
    else if(i.op==CLOSURE) { reg(a,VM_REF);check(t==VM_REF && b<vm.fns.size());const auto& callee=vm.fns[b];check(c<=f.types.size() && callee.captures.size()<=f.types.size()-c);for(size_t j=0;j<callee.captures.size();j++)reg(c+j,callee.types[callee.captures[j]]); }
    else if(i.op==THROW || i.op==EXCEPTION) { check(t==VM_REF);reg(a,VM_REF); }
    else if(i.op==METHOD) { reg(a,t);reg(b,VM_REF); }
    else if(i.op==METHODREF) {check(t==VM_REF);reg(a,VM_REF);reg(b,VM_REF);}
    else if(i.op==INSTANCEOF) {check(t==ZINC_BOOL);reg(a,ZINC_BOOL);check(b<f.types.size());}
    else if(i.op==CALLF) { reg(a,t);reg(b,VM_REF);check(c<=f.types.size()); }
    else if(i.op==ALLOC) { reg(a,VM_REF);check(t==VM_REF && b<vm.layouts.size());check(vm.layouts[b].array ? c<=(1u<<20) : c==vm.layouts[b].types.size()); }
    else if(i.op==INIT) { reg(a,VM_REF);reg(c,t);check(t!=ZINC_VOID); }
    else if(i.op==FIELDGET) { reg(a,t);reg(b,VM_REF);check(t!=ZINC_VOID); }
    else if(i.op==FIELDSET) { reg(a,VM_REF);reg(b,t);check(t!=ZINC_VOID); }
    else if(i.op==INDEXGET || i.op==INDEXSET) {
      reg(i.op==INDEXGET?a:c,t);reg(i.op==INDEXGET?b:a,VM_REF);check(t!=ZINC_VOID);
      const auto index=i.op==INDEXGET?c:b;check(index<f.types.size() && f.types[index]>=ZINC_I32 && f.types[index]<=ZINC_F64);
    }
    else if(i.op==COLLECTION) {
      const auto method=b&255,key=(b>>8)&255,value=(b>>16)&255;
      check(!(b>>24) && method<=14 && key>=ZINC_BOOL && key<=VM_REF && value<=VM_REF);
      const auto expected=method==0 || method==3 || method==11 || method==12?VM_REF:method==1 || method==7?ZINC_I32:method==4 || method==5 || method==8?ZINC_BOOL:method==2 || method==10?value:method==9?key:ZINC_VOID;
      check(t==expected);reg(a,t);
      if(method==0)check(c==0);
      else {
        reg(c,VM_REF);
        if(method>=2 && method<=5)reg(c+1,key);
        if(method==2 || method==10)check(value!=ZINC_VOID);
        if(method==3 && value)reg(c+2,value);
        if(method>=8 && method<=10)reg(c+1,ZINC_I32);
      }
    }
    else if(i.op==SPLICE) {
      const auto argc=c&255;check(!(c&~511u) && t==VM_REF && argc>=((c&256)?1u:2u) && argc<=3 && b<=f.types.size() && argc<=f.types.size()-b);reg(a,VM_REF);reg(b,VM_REF);
      for(uint32_t j=1;j<argc;j++)check(f.types[b+j]>=ZINC_I32 && f.types[b+j]<=ZINC_F64);
    }
    else if(i.op==MATH) {
      const auto method=c&255,count=c>>8;
      check(method<=21 && b<=f.types.size() && count<=f.types.size()-b);
      const bool variadic=method==15 || method==16;
      const auto arity=method==20?0u:method==7 || method==11 || method==14 || method==18?2u:1u;
      check(variadic || count==arity);reg(a,t);
      check(method==21?t==ZINC_VOID:method==18 || method==19?t==ZINC_I32:t>=ZINC_I32 && t<=ZINC_F64);
      for(uint32_t j=0;j<count;j++)check(f.types[b+j]>=ZINC_I32 && f.types[b+j]<=ZINC_F64);
    }
    else if(i.op==STRING) {
      const auto method=c&255,count=c>>8;
      check(method<=23 && b<=f.types.size() && count<=f.types.size()-b);
      const auto minimum=method==23?3u:(method>=1&&method<=7)||(method>=14&&method<=19)?2u:1u,maximum=(method>=1&&method<=7)||method==17||method==18||method==23?3u:method==20?1u:method>=13?2u:1u;
      check(count>=minimum && count<=maximum);if(method==22)check(f.types[b]>=ZINC_I32&&f.types[b]<=ZINC_F64);else reg(b,ZINC_STRING);reg(a,t);
      if(method>=5 && method<=7)check(t==ZINC_BOOL);
      else if(method==0 || method==3 || method==4 || method==15 || method==20 || method==21)check(t>=ZINC_I32 && t<=ZINC_F64);
      else check(t==(method==14?VM_REF:ZINC_STRING));
      for(uint32_t j=1;j<count;j++) {
        if(method==23 || (j==1 && ((method>=3 && method<=7)||method==14||method==19)) || (j==2 && (method==17||method==18)))reg(b+j,ZINC_STRING);
        else check(f.types[b+j]>=ZINC_I32 && f.types[b+j]<=ZINC_F64);
      }
    }
    else if(i.op==JOIN) { check(t==ZINC_STRING);reg(a,ZINC_STRING);reg(b,VM_REF);if(c)reg(c-1,ZINC_STRING); }
    else if(i.op==LENGTH || i.op==PUSH) { reg(a,t);reg(b,VM_REF);check(t>=ZINC_I32&&t<=ZINC_F64);if(i.op==PUSH)check(c<f.types.size() && f.types[c]!=ZINC_VOID); }
    else if(i.op==POP) { reg(a,t);reg(b,VM_REF);check(t!=ZINC_VOID && c<=1); }
    else if(i.op==CONCAT) { reg(a,ZINC_STRING);check(t==ZINC_STRING && b<=f.types.size() && c<=f.types.size()-b);for(uint32_t j=0;j<c;j++)check(f.types[b+j]>ZINC_VOID && f.types[b+j]<=ZINC_STRING); }
    else if(i.op==TRUTHY) { reg(a,ZINC_BOOL);reg(b,t);check(t!=ZINC_VOID); }
    if(i.op!=RET && i.op!=THROW && i.op!=JMP && i.op!=BR) check(pc+1<f.code.size());
  }
  return entry;
}
uint32_t load(VM& vm,const char* file) {
  std::ifstream in(file,std::ios::binary|std::ios::ate);
  if(!in || in.tellg()<4 || in.tellg()>(64<<20))throw std::runtime_error("invalid bytecode file size");
  Reader r;r.bytes.resize((size_t)in.tellg());in.seekg(0);in.read((char*)r.bytes.data(),r.bytes.size());
  if(!in)throw std::runtime_error("cannot read bytecode file");
  return load(vm,std::move(r));
}
}
#include "jit.h"

namespace {
// A continuation always enters through the normal prologue, so the JIT restores
// pinned registers from the same verified frame used by the interpreter.
void execute(VM& vm, uint32_t function, Reg* fp, uint32_t pc=0) {
  if (function>=vm.fns.size() || pc>=vm.fns[function].code.size() || (pc && !vm.fns[function].async && !vm.fns[function].gen)) throw std::runtime_error("invalid VM continuation");
  vm.fn=function;
  if (!vm.jit.empty()) {
    const int status=vm.jit[function](&vm,fp,pc);
    if(status==3)return;
    if(status==2)throw GuestThrow();
    if(status)throw std::runtime_error(vm.jitError);
    return;
  }
  const Ins* ip=vm.fns[function].code.data()+pc;
#if defined(__clang__)
  ip->h(&vm,ip,fp);
#else
  while(ip) { ip->h(&vm,ip,fp);ip=vm.frames.back().ip;fp=vm.frames.back().fp; }
#endif
}
int32_t invokeCallback(void* context,const ZincValue* args,uint32_t count,uint32_t type,ZincValue* out,ZincError* error) {
  auto& callback=*(GuestCallback*)context;auto& vm=*callback.vm;callback.guestError=false;
  const auto oldFn=vm.fn,oldDepth=vm.depth,oldBoundary=vm.boundary,oldType=vm.resultType;
  const auto oldResult=vm.result,oldException=vm.exception;const bool wasSuspended=vm.suspended;
  auto* oldTask=vm.currentTask;
  const auto roots=vm.callbackRoots.size();
  const auto restore=[&](){vm.callbackRoots.resize(roots);vm.fn=oldFn;vm.depth=oldDepth;vm.boundary=oldBoundary;vm.result=oldResult;vm.resultType=oldType;vm.exception=oldException;vm.currentTask=oldTask;vm.suspended=wasSuspended;};
  try {
    if(oldType>=ZINC_STRING)vm.callbackRoots.push_back(oldResult);
    vm.callbackRoots.push_back(oldException);
    const auto& f=vm.fns[callback.function->function];
    if(f.async || f.gen || f.params.size()!=count || f.ret!=type)throw std::runtime_error("native callback signature mismatch");
    for(uint32_t j=0;j<count;j++)if(f.types[f.params[j]]!=args[j].type)throw std::runtime_error("native callback argument type mismatch");
    if(vm.depth>=1024)throw std::runtime_error("VM native callback stack overflow");
    Reg* fp=vm.nativeFp?vm.nativeFp+vm.fns[oldFn].types.size():vm.stack.data();
    if(f.types.size()>(size_t)(vm.stack.data()+vm.stack.size()-fp))throw std::runtime_error("VM register stack overflow");
    if(vm.nativeFp)vm.frames[vm.depth++]={vm.nativeIp,vm.nativeFp,0,oldFn};
    vm.boundary=vm.depth;vm.fn=callback.function->function;vm.suspended=false;
    for(auto r:f.refs)fp[r].h=nullptr;
    for(size_t j=0;j<f.captures.size();j++)fp[f.captures[j]]=callback.function->slots[j];
    for(uint32_t j=0;j<count;j++) {
      const auto& a=args[j];auto& r=fp[f.params[j]];
      if(a.type==ZINC_STRING)r.h=vm.keepString(a.as.string,a.length,fp);
      else if(a.type==ZINC_I32)r.i=a.as.integer;
      else if(a.type==ZINC_U32 || a.type==ZINC_BOOL)r.u=a.as.unsigned_integer;
      else r=value(a.as.number,a.type);
    }
    execute(vm,callback.function->function,fp);out->type=type;
    if(type==ZINC_STRING) {callback.text.assign(string(vm.result).ptr(),string(vm.result).bytes());out->as.string=callback.text.data();out->length=(uint32_t)callback.text.size();}
    else if(type==ZINC_I32)out->as.integer=vm.result.i;
    else if(type==ZINC_U32 || type==ZINC_BOOL)out->as.unsigned_integer=vm.result.u;
    else if(type!=ZINC_VOID)out->as.number=vm.result.f;
    restore();
    if(vm.nativeEvents && !vm.nativeFp) {
      const auto text=callback.text;
      drainMicrotasks(vm);
      if(type==ZINC_STRING){callback.text=text;out->as.string=callback.text.data();out->length=(uint32_t)callback.text.size();}
    }
    return ZINC_OK;
  } catch(const GuestThrow&) {
    callback.guestError=true;
    try {const auto& message=string(vm.field(vm.exception,0,ZINC_STRING));callback.error.assign(message.ptr(),message.bytes());}catch(...){callback.error="guest callback threw";}
    restore();
  } catch(const std::exception& e) {restore();callback.error=e.what();}
  catch(...) {restore();callback.error="guest callback threw";}
  *error={callback.error.data(),(uint32_t)callback.error.size()};return ZINC_HOST_ERROR;
}
ZincHandle callbackHandle(VM& vm,Reg fn) {
  if(!fn.h || fn.h->function>=vm.fns.size() || fn.h->generator)throw std::runtime_error("native callback must be a function");
  auto context=std::make_unique<GuestCallback>();context->vm=&vm;context->function=fn.h;
  auto callback=std::unique_ptr<zinc::Callback>(new zinc::Callback{context.get(),invokeCallback,[](void* p){delete (GuestCallback*)p;}});context.release();
  const auto handle=vm.modules.resources.add(callback.get(),zinc::callbackKind,[](void* p){delete (zinc::Callback*)p;});callback.release();return handle;
}
void runTask(VM& vm, Heap* task, Reg* fp) {
  if(task->function==UINT32_MAX) {
    auto* source=task->awaited;
    if(!task->pc) {
      task->pc=1;source->handled=true;
      if(source->promiseState==1) {
        if(source->last)source->last->nextTask=task;else source->waiting=task;
        source->last=task;
      } else vm.jobs.push_back(task);
    } else {
      vm.finishPromise(task->completion,source->slots[0],source->payloadType,source->promiseState==3);
      task->completion=task->awaited=nullptr;
    }
    return;
  }
  auto* previousTask=vm.currentTask;const auto previousFn=vm.fn,previousDepth=vm.depth,previousBoundary=vm.boundary;
  const bool previousSuspended=vm.suspended;
  task->parent=previousTask;vm.currentTask=task;vm.fn=task->function;vm.boundary=vm.depth;vm.suspended=false;
  try {
    std::copy(task->slots.begin(),task->slots.end(),fp);
    uint32_t pc=task->pc;
    if(task->awaited) {
      auto* promise=task->awaited;task->awaited=nullptr;
      if(promise->promiseState==3) {
        vm.exception=promise->slots[0];
        if(task->catchPc==UINT32_MAX)throw GuestThrow();
        pc=task->catchPc;
      } else {
        if(promise->payloadType!=vm.fns[task->function].types[task->awaitDst])throw std::runtime_error("VM await result type mismatch");
        fp[task->awaitDst]=promise->slots[0];
      }
    }
    execute(vm,task->function,fp,pc);
    if(!vm.suspended && task->completion)vm.settle(task->completion,vm.result,vm.resultType,false,fp);
  } catch(const GuestThrow&) { if(!task->completion)throw;vm.settle(task->completion,vm.exception,VM_REF,true);vm.exception=Reg(); }
  catch(...) { vm.currentTask=previousTask;vm.fn=previousFn;vm.depth=previousDepth;vm.boundary=previousBoundary;vm.suspended=previousSuspended;throw; }
  task->parent=nullptr;vm.currentTask=previousTask;vm.fn=previousFn;vm.depth=previousDepth;vm.boundary=previousBoundary;vm.suspended=previousSuspended;
}
void startAsync(VM* vm,const Ins* ip,Reg* fp,uint32_t target,uint32_t args,Heap* closure) {
  if(vm->depth>=1024)throw std::runtime_error("VM async call stack overflow");
  const auto& f=vm->fns[target];Reg* next=fp+vm->fns[vm->fn].types.size();
  if(f.types.size()>(size_t)(vm->stack.data()+vm->stack.size()-next))throw std::runtime_error("VM register stack overflow");
  auto* task=vm->allocate(f.frameLayout,f.types.size(),fp);task->function=target;
  for(size_t j=0;j<f.params.size();j++)task->slots[f.params[j]]=fp[args+j];
  if(closure)for(size_t j=0;j<f.captures.size();j++)task->slots[f.captures[j]]=closure->slots[j];
  vm->result.h=task;vm->resultType=VM_REF;
  auto* promise=vm->allocate(UINT32_MAX,1,fp);promise->promiseState=1;fp[ip->a].h=promise;task->completion=promise;
  vm->frames[vm->depth++]={ip+1,fp,ip->a,vm->fn};
  try { runTask(*vm,task,next); } catch(...) { --vm->depth;throw; }
  --vm->depth;
}
void generatorCall(VM& vm,const Ins* ip,Reg* fp,uint32_t target,uint32_t args,Heap* closure) {
  const auto& f=vm.fns[target];auto* task=vm.allocate(f.frameLayout,f.types.size(),fp);
  task->function=target;task->generator=true;task->payloadType=f.yieldType;
  for(size_t j=0;j<f.params.size();j++)task->slots[f.params[j]]=fp[args+j];
  if(closure)for(size_t j=0;j<f.captures.size();j++)task->slots[f.captures[j]]=closure->slots[j];
  fp[ip->a].h=task;
}
bool generatorStep(VM& vm,const Ins* ip,Reg* fp) {
  auto* task=fp[ip->b].h;
  if(!task || !task->generator)throw std::runtime_error("invalid VM generator");
  if(task->done)return false;
  if(task->running)generatorTypeError(vm,"generator is already running",fp);
  if(vm.depth>=1024)throw std::runtime_error("VM generator call stack overflow");
  Reg* next=fp+vm.fns[vm.fn].types.size();
  if(task->slots.size()>(size_t)(vm.stack.data()+vm.stack.size()-next))throw std::runtime_error("VM register stack overflow");
  auto* parent=vm.currentTask;const auto oldFn=vm.fn,oldDepth=vm.depth,oldBoundary=vm.boundary;const bool wasSuspended=vm.suspended;
  vm.frames[vm.depth++]={ip+1,fp,ip->a,vm.fn};vm.boundary=vm.depth;vm.fn=task->function;vm.currentTask=task;vm.suspended=false;
  task->parent=parent;task->running=true;
  const auto restore=[&](){task->running=false;task->parent=nullptr;vm.currentTask=parent;vm.fn=oldFn;vm.depth=oldDepth;vm.boundary=oldBoundary;vm.suspended=wasSuspended;};
  std::copy(task->slots.begin(),task->slots.end(),next);
  try { execute(vm,task->function,next,task->pc); }
  catch(...) {task->done=true;std::fill(task->slots.begin(),task->slots.end(),Reg());restore();throw;}
  const bool yielded=vm.suspended;
  if(!yielded){if(vm.resultType==VM_REF)task->completion=vm.result.h;task->done=true;std::fill(task->slots.begin(),task->slots.end(),Reg());}
  restore();return yielded;
}
Heap* callbackTask(VM& vm,Reg callback,Reg* fp) {
  auto* closure=callback.h;
  if(!closure || closure->function>=vm.fns.size())throw std::runtime_error("invalid VM microtask callback");
  const auto& f=vm.fns[closure->function];
  if(!f.params.empty() || closure->slots.size()!=f.captures.size())throw std::runtime_error("VM microtask callback signature mismatch");
  auto* task=vm.allocate(f.frameLayout,f.types.size(),fp);task->function=closure->function;
  for(size_t j=0;j<f.captures.size();j++)task->slots[f.captures[j]]=closure->slots[j];
  if(f.async) {
    vm.result.h=task;vm.resultType=VM_REF;
    task->completion=vm.allocate(UINT32_MAX,1,fp);task->completion->promiseState=1;
  }
  return task;
}
void setTimer(VM& vm,const Ins* ip,Reg* fp) {
  double ms=number(fp[ip->c],vm.fns[vm.fn].types[ip->c]);
  if(!std::isfinite(ms) || ms<1 || ms>2147483647)ms=1;
  ms=trunc(ms);
  if(vm.nextTimer==INT32_MAX)throw std::runtime_error("VM timer ID limit exceeded");
  const auto id=++vm.nextTimer;
  auto* callback=fp[ip->b].h;
  if(!callback || callback->function>=vm.fns.size() || !vm.fns[callback->function].params.empty() || callback->slots.size()!=vm.fns[callback->function].captures.size())throw std::runtime_error("VM timer callback signature mismatch");
  vm.timers.emplace(std::chrono::steady_clock::now()+std::chrono::milliseconds((int64_t)ms),VM::Timer{id,callback,ip->t?ms:0});
  fp[ip->a].i=(int32_t)id;
}
void drainMicrotasks(VM& vm) {
    while(!vm.jobs.empty()) { vm.poll();auto* task=vm.jobs.front();vm.jobs.pop_front();runTask(vm,task,vm.stack.data()); }
    for(auto* promise:vm.rejections)if(!promise->handled)throw std::runtime_error("unhandled VM promise rejection");
    vm.rejections.clear();
}
void drainJobs(VM& vm) {
  for(;;) {
    drainMicrotasks(vm);
    bool nativeFrame=false;
    const bool active=vm.nativeEvents && zrt::poll_host(nativeFrame);
    if(nativeFrame && !active)break; // Closing the graphics host ends guest timers too.
    if(!vm.jobs.empty())continue;
    if(vm.timers.empty() && !active)break;
    const auto now=std::chrono::steady_clock::now();
    if(vm.interrupted.load(std::memory_order_relaxed))throw std::runtime_error("execution interrupted");
    if(now>=vm.deadline)throw std::runtime_error("execution timed out");
    if(vm.timers.empty() || vm.timers.begin()->first>now) {
      if(active && nativeFrame)continue; // loop_once already paces graphics.
      auto wake=std::min(vm.deadline,now+std::chrono::milliseconds(active?1:10));
      if(!vm.timers.empty())wake=std::min(wake,vm.timers.begin()->first);
      std::this_thread::sleep_until(wake);continue;
    }
    auto it=vm.timers.begin();auto timer=it->second;vm.timers.erase(it);
    if(timer.interval)vm.timers.emplace(now+std::chrono::milliseconds((int64_t)timer.interval),timer);
    vm.result.h=timer.callback;vm.resultType=VM_REF;
    vm.jobs.push_back(callbackTask(vm,vm.result,nullptr));
  }
}
}

#ifndef ZINC_VM_EMBEDDED
int main(int argc,char** argv) {
  try {
    zinc::RunnerOptions options(argc,argv,true);
    VM vm;vm.nativeEvents=true;
    zinc::RunnerHost host(argc,argv);
    options.load(vm.modules);registerGeneratedModules(vm.modules); const auto entry=load(vm,argv[1]); vm.deadline=zinc::deadline();
    if(options.jit) { Jit code(vm);execute(vm,entry,vm.stack.data());drainJobs(vm); }
    else { execute(vm,entry,vm.stack.data());drainJobs(vm); }
    if (std::getenv("ZINC_VM_STATS")) fprintf(stderr,"{\"engine\":\"zinc-vm\",\"tier\":%d,\"heapBytes\":%zu,\"peakHeapBytes\":%zu,\"collections\":%llu}\n",options.jit?1:0,vm.heapBytes,vm.peakHeapBytes,(unsigned long long)vm.collections);
  } catch(const std::exception& e) { fprintf(stderr,"zinc-vm: %s\n",e.what());return 1; }
}

#endif
