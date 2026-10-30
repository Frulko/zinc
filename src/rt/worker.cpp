// Workers (zinc:worker, D181): see worker.h. One OS thread per worker, created with an explicit stack; its Machine, heap, loop and native
// state are its own (the thread_local state of rtcalls.cpp, loop.cpp, sys_host.cpp). Only this file's queues cross threads, under a lock.
#include "rt/worker.h"

#include <pthread.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <thread>
#include <time.h>

#include "zn/alloc_stats.h"
#include "zn/host.h"
#include "zn/worker_bridge.h"
#include "zn/rec.h"

namespace zn::host { LoopBridge loopBridge; }

namespace zn::rt::worker {

bool gBytecode = false;
TraceHook traceHook = nullptr;
MachineHook machineHook = nullptr;

namespace {

using zn::host::loopBridge;

struct W {
  int id = 0;
  std::string entry, sIn, sOut;
  std::shared_ptr<const zbc::Module> mod;
  int (*const* natives)(Machine&, Slot*) = nullptr;   // a compiled program: the worker's functions
  bool (*runner)(const std::string&, std::string&) = nullptr;   // another engine's program (QuickJS): run instead of `mod`
  std::size_t nativeCount = 0;
  std::mutex mu;                                    // guards the queues, the wake-ups and the end
  std::deque<std::vector<std::uint8_t>> toWorker, toMain;
  bool ended = false, endTaken = false, terminated = false, closedSelf = false;
  bool notifiedMain = false, notifiedWorker = false;   // an event of kind 70 waits in that loop: no second one until the program drained it
  std::string error;
  void* wakeWorker = nullptr;                       // the worker's loop (set by its thread)
  void* wakeMain = nullptr;                         // the owner's loop
  std::atomic<bool> stop{false}, idle{false};
  std::atomic<std::uint64_t> in{0}, out{0}, live{0};
  std::atomic<double> cpuMs{0};
  pthread_t th{};
  bool joined = false;
};

std::mutex gRegMu;
std::vector<std::shared_ptr<W>> gAll;               // every worker started and not yet joined: the registry of snapshot()
std::mutex gModMu;
std::map<std::string, std::shared_ptr<const zbc::Module>> gMods;   // decoded worker programs, by the bytes' address and key: N instances share one
struct Compiled { std::string key; const unsigned char* packed; std::size_t size; int (*const* natives)(Machine&, Slot*); std::size_t count; };
std::vector<Compiled>& compiled() { static std::vector<Compiled> v; return v; }   // filled by static initialisers, before main
std::mutex gOutMu;                                  // a worker's console lines go out whole, between the main program's

thread_local std::vector<std::shared_ptr<W>> tOwned;   // the workers this thread started: handle = index + 1
thread_local W* tSelf = nullptr;                       // on a worker's thread: its own record
thread_local void* tWake = nullptr;                    // this thread's wake-up

double threadCpuMs() {   // this thread's CPU time
#ifdef CLOCK_THREAD_CPUTIME_ID
  timespec ts{};
  if (clock_gettime(CLOCK_THREAD_CPUTIME_ID, &ts) == 0) return static_cast<double>(ts.tv_sec) * 1e3 + static_cast<double>(ts.tv_nsec) / 1e6;
#endif
  return 0;
}
double nowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
void trace(Event e, const W& w, std::size_t bytes = 0) { if (TraceHook h = traceHook) h(e, w.id, w.entry.c_str(), bytes, nowMs()); }
void wake(void* h) { if (h && loopBridge.wakeSend) loopBridge.wakeSend(h); }
void* myWake() { if (!tWake && loopBridge.wakeNew) tWake = loopBridge.wakeNew(); return tWake; }
bool deterministic() { static const bool d = std::getenv("ZINC_DETERMINISTIC") && !std::getenv("ZINC_REALTIME"); return d; }
W* owned(Slot h) { std::int64_t i = static_cast<std::int64_t>(h); return i >= 1 && static_cast<std::size_t>(i) <= tOwned.size() ? tOwned[static_cast<std::size_t>(i - 1)].get() : nullptr; }

// ---- the typed wire: a message is encoded from the sender's own objects and decoded into the receiver's, by the record schema (the D173 wire,
// include/zn/rec.h: the sender's field names, in declared order) matched once against the program's layout of the type (the lowering's
// recLayout: the fields of each record in slot order). No Dyn tree, no JSON, no u8[]: one pass over the objects into the bytes, one back.

struct Lay {   // a parsed layout (see recLayout in src/ir/lower.cpp)
  char k = 0;
  std::uint32_t cls = 0;            // # and {: the class
  std::vector<std::string> names;   // {: the fields, in slot order
  std::vector<Lay> kids;            // {: per field; * ? #: the one inside
};
bool parseLay(const char*& p, const char* e, Lay& out, int depth = 0) {
  if (p >= e || depth > 40) return false;
  out = Lay{*p++, 0, {}, {}};
  auto cls = [&] {
    if (p >= e || *p < '0' || *p > '9') return false;
    for (out.cls = 0; p < e && *p >= '0' && *p <= '9'; ++p) out.cls = out.cls * 10 + static_cast<std::uint32_t>(*p - '0');
    return p < e && *p++ == ':';
  };
  switch (out.k) {
    case 'd': case 'f': case 'i': case 'u': case 'b': case 's': case 'B': case '-': return true;
    case '#': if (!cls()) return false; [[fallthrough]];
    case '*': case '?': out.kids.emplace_back(); return parseLay(p, e, out.kids.back(), depth + 1);
    case '{':
      if (!cls()) return false;
      while (p < e && *p != '}') {
        const char* eq = static_cast<const char*>(std::memchr(p, '=', static_cast<std::size_t>(e - p)));
        if (!eq || eq == p) return false;
        out.names.emplace_back(p, eq);
        p = eq + 1;
        out.kids.emplace_back();
        if (!parseLay(p, e, out.kids.back(), depth + 1)) return false;
        if (p < e && *p == ',') ++p;
      }
      return p++ < e;
    default: return false;
  }
}

// How one value crosses: its letter on the wire against where it sits in memory.
struct Plan {
  char w = 0;              // the wire's letter (d i u b s B * {); 0 for a default only
  bool opt = false;        // the wire has a presence byte (?T)
  char st = 0;             // how it is stored: d f i u b s B * {
  bool box = false;        // in a box (`number | null`): field 0 holds it
  bool nullable = false;   // the stored reference may be null (?T, or a box)
  std::uint32_t cls = 0;   // the record's or the box's class
  const ClassRT* arr = nullptr;   // B and *: the array class a decoded one is made of
  std::string where;       // the field, for the errors ("" for the message itself)
  std::vector<Plan> kids;                          // *: [0] the item; {: one per wire field
  std::vector<int> slot;                           // {: per wire field, its slot (-1: not in this type)
  std::vector<const rec::Schema*> wire;            // {: per wire field, to skip one this type does not have
  std::vector<std::pair<std::uint32_t, Plan>> defaults;   // { (decode): the fields that cannot stay null, with how to make their default
};
struct PlanEntry { rec::Schema schema; Lay lay; Plan plan; };
using Plans = std::unordered_map<std::string, std::unique_ptr<PlanEntry>>;

std::string named(const std::string& at) { return at.empty() ? "the message" : "'" + at + "'"; }
const char* letterName(char k) {
  switch (k) {
    case 'd': case 'f': case 'i': case 'u': return "a number";
    case 'b': return "a boolean";
    case 's': return "a string";
    case 'B': return "a u8[]";
    case '*': return "an array";
    case '{': return "a record";
    default: return "not data";
  }
}
// The class of a value of layout `l` as an array element, for the array class that holds it.
bool elemType(Machine& m, const Lay& l, zbc::VType& vt);
const ClassRT* arrayOf(Machine& m, const zbc::VType& e) {
  for (std::size_t c = 0; c < m.mod->classes.size(); ++c)
    if (m.mod->classes[c].kind == zbc::CKind::Array && m.mod->classes[c].elem == e) return &m.classes[c];
  return nullptr;
}
bool elemType(Machine& m, const Lay& l, zbc::VType& vt) {
  switch (l.k) {
    case 'd': vt = {zbc::Cls::D, 0}; return true;
    case 'f': vt = {zbc::Cls::S, 0}; return true;
    case 'i': case 'u': case 'b': vt = {zbc::Cls::I, 0}; return true;
    case 's':
      for (std::size_t c = 0; c < m.mod->classes.size(); ++c) if (m.mod->classes[c].kind == zbc::CKind::String) { vt = {zbc::Cls::R, static_cast<std::uint16_t>(c)}; return true; }
      return false;
    case 'B': case '*': {
      zbc::VType e{zbc::Cls::I, 0};
      if (l.k == '*' && !elemType(m, l.kids[0], e)) return false;
      const ClassRT* a = arrayOf(m, e);
      if (!a) return false;
      vt = {zbc::Cls::R, static_cast<std::uint16_t>(a->id)};
      return true;
    }
    case '?': return elemType(m, l.kids[0], vt);
    case '#': case '{': vt = {zbc::Cls::R, static_cast<std::uint16_t>(l.cls)}; return true;
    default: return false;
  }
}

// The plan of wire `s` (null: a default only) against layout `l`; `dec` for a decoder (defaults, array classes; a field the wire lacks is skipped).
bool build(Machine& m, const rec::Schema* s, const Lay& l, const std::string& at, bool dec, Plan& p, std::string& err) {
  p.where = at;
  const Lay* v = &l;
  if (v->k == '?') { p.nullable = true; v = &v->kids[0]; }
  else if (v->k == '#') { p.nullable = p.box = true; p.cls = v->cls; v = &v->kids[0]; }
  p.st = v->k;
  if (p.st == '-') { err = named(at) + " is not data (numbers, booleans, strings, u8[], arrays, T | null and records)"; return false; }
  const std::uint32_t ncls = static_cast<std::uint32_t>(m.classes.size());
  if (p.st == '{') {
    p.cls = v->cls;
    if (p.cls >= ncls || m.classes[p.cls].kind != zbc::CKind::Object || m.classes[p.cls].nfields != v->kids.size()) { err = "the layout of " + named(at) + " does not match its class"; return false; }
  }
  if (p.box && (p.cls >= ncls || m.classes[p.cls].nfields != 1)) { err = "the layout of " + named(at) + " does not match its class"; return false; }
  if (dec && (p.st == 'B' || p.st == '*')) {
    zbc::VType vt;
    if (!elemType(m, *v, vt)) { err = "the program has no array class for " + named(at); return false; }
    p.arr = &m.classes[vt.ref];
  }
  if (dec && p.st == '{')   // the fields that cannot stay null get their default when the wire has none
    for (std::uint32_t j = 0; j < v->kids.size(); ++j) {
      const char k = v->kids[j].k;
      if (k != 's' && k != 'B' && k != '*' && k != '{' && k != '-') continue;
      Plan d;
      if (!build(m, nullptr, v->kids[j], at.empty() ? v->names[j] : at + "." + v->names[j], true, d, err)) return false;
      p.defaults.emplace_back(j, std::move(d));
    }
  if (!s) return true;
  if (s->k == '?') { p.opt = true; s = &s->kids[0]; }
  p.w = s->k;
  const auto numeric = [](char c) { return c == 'd' || c == 'f' || c == 'i' || c == 'u'; };
  if (!(numeric(p.w) ? numeric(p.st) : p.w == p.st)) { err = named(at) + " is " + letterName(p.w) + " in the message and " + letterName(p.st) + " here"; return false; }
  if (p.w == '*') { p.kids.emplace_back(); return build(m, &s->kids[0], v->kids[0], at + "[]", dec, p.kids[0], err); }
  if (p.w != '{') return true;
  p.kids.resize(s->kids.size());
  for (std::size_t k = 0; k < s->kids.size(); ++k) {
    int j = -1;
    for (std::size_t q = 0; q < v->names.size(); ++q) if (v->names[q] == s->names[k]) { j = static_cast<int>(q); break; }
    p.slot.push_back(j);
    p.wire.push_back(&s->kids[k]);
    const std::string f = at.empty() ? s->names[k] : at + "." + s->names[k];
    if (j >= 0) { if (!build(m, &s->kids[k], v->kids[static_cast<std::size_t>(j)], f, dec, p.kids[k], err)) return false; }
    else if (!dec && s->kids[k].k != '?') { err = "'" + f + "' is missing from the message"; return false; }
  }
  return true;
}

// The plan of a schema and a layout text, made once per program and kept on its Machine; null with `err`.
const Plan* planFor(Machine& m, const StrObj* schema, const StrObj* layout, bool dec, std::string& err) {
  if (!m.recPlans) m.recPlans = std::make_shared<Plans>();
  Plans& all = *static_cast<Plans*>(m.recPlans.get());
  std::string key;
  key.reserve(schema->len + layout->len + 2);
  key.append(dec ? "D" : "E").append(schema->data(), schema->len).append(1, '\n').append(layout->data(), layout->len);
  auto it = all.find(key);
  if (it != all.end()) return &it->second->plan;
  auto e = std::make_unique<PlanEntry>();
  const char* lp = layout->data();
  if (layout->len == 0) { err = "the message's type has no message form (numbers, booleans, strings, u8[], arrays, T | null and records)"; return nullptr; }
  if (!rec::parse(std::string(schema->data(), schema->len), e->schema) || !parseLay(lp, lp + layout->len, e->lay) || lp != layout->data() + layout->len) { err = "a schema or layout this engine cannot read"; return nullptr; }
  if (!build(m, &e->schema, e->lay, "", dec, e->plan, err)) return nullptr;
  return &all.emplace(std::move(key), std::move(e)).first->second->plan;
}

double numOf(Slot x, char st) {
  switch (st) {
    case 'd': return std::bit_cast<double>(x);
    case 'f': return std::bit_cast<float>(static_cast<std::uint32_t>(x));
    case 'i': return static_cast<std::int32_t>(x);
    default: return static_cast<std::uint32_t>(x);
  }
}
std::int64_t intOf(Slot x, char st) {   // the integer the wire's i or u carries (a fraction is dropped, as the Dyn encoder did)
  if (st == 'i') return static_cast<std::int32_t>(x);
  if (st == 'u') return static_cast<std::uint32_t>(x);
  const double d = numOf(x, st);
  return std::isfinite(d) && std::fabs(d) < 9.2e18 ? static_cast<std::int64_t>(d) : 0;
}
Slot storeNum(double d, char st) {
  switch (st) {
    case 'd': return std::bit_cast<Slot>(d);
    case 'f': return std::bit_cast<std::uint32_t>(static_cast<float>(d));
    case 'i': return static_cast<Slot>(static_cast<std::int64_t>(static_cast<std::int32_t>(std::isfinite(d) && std::fabs(d) < 9.2e18 ? static_cast<std::int64_t>(d) : 0)));
    default: return static_cast<std::uint32_t>(std::isfinite(d) && std::fabs(d) < 9.2e18 ? static_cast<std::int64_t>(d) : 0);
  }
}

bool encodeValue(Slot v, const Plan& p, rec::Writer& w, std::string& err) {
  if (v == 0 && (p.nullable || p.st == 's' || p.st == 'B' || p.st == '*' || p.st == '{')) {
    if (p.opt) { w.u8(0); return true; }
    err = named(p.where) + " is null";
    return false;
  }
  if (p.opt) w.u8(1);
  const Slot x = p.box ? reinterpret_cast<Obj*>(v)->fields()[0] : v;
  switch (p.w) {
    case 'd': w.f64(numOf(x, p.st)); return true;
    case 'i': w.i32(static_cast<std::int32_t>(intOf(x, p.st))); return true;
    case 'u': w.u32(static_cast<std::uint32_t>(intOf(x, p.st))); return true;
    case 'b': w.u8(x != 0); return true;
    case 's': { const auto* s = reinterpret_cast<const StrObj*>(x); w.bytes(s->data(), s->len); return true; }
    case 'B': {
      const auto* a = reinterpret_cast<const ArrObj*>(x);
      const std::size_t n = a->v.size(), at = w.out.size();
      w.u32(static_cast<std::uint32_t>(n));
      w.out.resize(at + 4 + n);
      for (std::size_t i = 0; i < n; ++i) w.out[at + 4 + i] = static_cast<std::uint8_t>(a->v[i]);
      return true;
    }
    case '*': {
      const auto* a = reinterpret_cast<const ArrObj*>(x);
      w.u32(static_cast<std::uint32_t>(a->v.size()));
      for (Slot e : a->v) if (!encodeValue(e, p.kids[0], w, err)) return false;
      return true;
    }
    default: {
      auto* o = reinterpret_cast<Obj*>(x);
      if (o->cls->id != p.cls) { err = named(p.where) + " is a " + o->cls->name + ", not the record its type names"; return false; }
      const std::size_t at = w.begin();
      for (std::size_t k = 0; k < p.kids.size(); ++k) {
        if (p.slot[k] < 0) { w.u8(0); continue; }   // an optional field of the message this type does not have
        if (!encodeValue(o->fields()[p.slot[k]], p.kids[k], w, err)) return false;
      }
      w.end(at);
      return true;
    }
  }
}

bool skipValue(rec::Reader& r, const rec::Schema& s) {
  double d; std::uint32_t u; std::uint8_t b; const std::uint8_t* at;
  switch (s.k) {
    case 'd': return r.f64(d);
    case 'i': case 'u': return r.u32(u);
    case 'b': return r.u8(b);
    case 's': case 'B': return r.bytes(at, u);
    case '*': if (!r.u32(u)) return false; while (u--) if (!skipValue(r, s.kids[0])) return false; return true;
    case '?': return r.u8(b) && (!b || skipValue(r, s.kids[0]));
    default: { rec::Reader body; return r.record(body); }
  }
}

bool defaultValue(Machine& m, const Plan& p, Slot& out);
bool fillDefaults(Machine& m, const Plan& p, Obj* o) {
  for (const auto& [j, d] : p.defaults)
    if (o->fields()[j] == 0 && !defaultValue(m, d, o->fields()[j])) return false;
  return true;
}
bool defaultValue(Machine& m, const Plan& p, Slot& out) {   // what a field the wire does not carry holds: 0, false, "", [], null, a record of defaults
  out = 0;
  if (p.nullable) return true;
  switch (p.st) {
    case 's': out = reinterpret_cast<Slot>(m.newStr("", 0)); return true;
    case 'B': case '*': out = reinterpret_cast<Slot>(m.newArr(p.arr)); return true;
    case '{': if (op::newObject(m, p.cls, out)) return false; return fillDefaults(m, p, reinterpret_cast<Obj*>(out));
    default: return true;
  }
}

// One value from the wire into a new object of the receiver's type (owned by the caller); false when the bytes do not match.
bool decodeValue(Machine& m, rec::Reader& r, const Plan& p, Slot& out) {
  out = 0;
  if (p.opt) { std::uint8_t b; if (!r.u8(b)) return false; if (!b) return defaultValue(m, p, out); }
  Slot x = 0;
  switch (p.w) {
    case 'd': { double d; if (!r.f64(d)) return false; x = storeNum(d, p.st); break; }
    case 'i': { std::int32_t i; if (!r.i32(i)) return false; x = p.st == 'i' ? static_cast<Slot>(static_cast<std::int64_t>(i)) : storeNum(i, p.st); break; }
    case 'u': { std::uint32_t u; if (!r.u32(u)) return false; x = p.st == 'u' ? static_cast<Slot>(u) : storeNum(u, p.st); break; }
    case 'b': { std::uint8_t b; if (!r.u8(b)) return false; x = b != 0; break; }
    case 's': { const std::uint8_t* at; std::uint32_t n; if (!r.bytes(at, n)) return false; x = reinterpret_cast<Slot>(m.newStr(reinterpret_cast<const char*>(at), n)); break; }
    case 'B': {
      const std::uint8_t* at; std::uint32_t n;
      if (!r.bytes(at, n)) return false;
      ArrObj* a = m.newArr(p.arr);
      a->v.assign(at, at + n);
      x = reinterpret_cast<Slot>(a);
      break;
    }
    case '*': {
      std::uint32_t n;
      if (!r.u32(n) || n > static_cast<std::uint64_t>(r.end - r.p)) return false;   // every item is at least one byte
      ArrObj* a = m.newArr(p.arr);
      a->v.reserve(n);
      for (std::uint32_t i = 0; i < n; ++i) {
        Slot e;
        if (!decodeValue(m, r, p.kids[0], e)) { m.release(a); return false; }
        a->v.push_back(e);
      }
      x = reinterpret_cast<Slot>(a);
      break;
    }
    default: {
      rec::Reader body;
      if (!r.record(body) || op::newObject(m, p.cls, x)) return false;
      auto* o = reinterpret_cast<Obj*>(x);
      for (std::size_t k = 0; k < p.kids.size() && body.more(); ++k) {   // a field past the end of the body keeps its default (an older sender)
        const bool ok = p.slot[k] < 0 ? skipValue(body, *p.wire[k]) : decodeValue(m, body, p.kids[k], o->fields()[p.slot[k]]);
        if (!ok) { m.release(o); return false; }
      }
      if (!fillDefaults(m, p, o)) { m.release(o); return false; }
      break;
    }
  }
  if (p.box) {
    Slot b;
    if (op::newObject(m, p.cls, b)) { m.releaseSlot(x); return false; }
    reinterpret_cast<Obj*>(b)->fields()[0] = x;
    x = b;
  }
  out = x;
  return true;
}

std::size_t stackBytes() {
#if defined(__aarch64__) || defined(__x86_64__)
  return std::size_t(8) << 20;   // the interpreter's own register stack is on the heap; this is the C++ stack of the runtime calls (JSON, sort, regexp)
#else
  return std::size_t(1) << 20;   // a 32-bit board (Pi, the handhelds): the design's 1 MB
#endif
}

void* body(void* arg) {
  std::shared_ptr<W> w(*static_cast<std::shared_ptr<W>*>(arg));
  delete static_cast<std::shared_ptr<W>*>(arg);
  {
    std::string name = "zinc worker " + w->entry + "#" + std::to_string(w->id);   // what the profiler and the debugger show (a name is at most 15 bytes on Linux)
#ifdef __APPLE__
    pthread_setname_np(name.substr(0, 63).c_str());
#elif defined(__linux__)
    pthread_setname_np(pthread_self(), name.substr(0, 15).c_str());
#endif
  }
  gOnWorker = true;
  tSelf = w.get();
  { std::lock_guard<std::mutex> g(w->mu); w->wakeWorker = myWake(); }
  if (loopBridge.active) loopBridge.active(1);   // the parent's port keeps the worker's loop running until terminate() or self.close()
  std::string out;
  auto bind = [](Machine& m, const void* data) {   // as program.cpp binds a compiled program's functions
    const W* self = static_cast<const W*>(data);
    if (self->natives) {
      m.registry = false;   // ponytail: as a compiled main program, its leftovers at the end are not walked (they are freed with the heap only at exit)
      for (std::size_t i = 0; i < self->nativeCount && i < m.funcs.size(); ++i) m.funcs[i].native = self->natives[i];
    }
    if (MachineHook h = machineHook) h(m, self->id, self->entry, true);
  };
  auto done = [](Machine& m, const void* data) {
    const W* self = static_cast<const W*>(data);
    if (MachineHook h = machineHook) h(m, self->id, self->entry, false);
  };
  const bool hooked = machineHook != nullptr;
  Result r;
  if (w->runner) { r.ok = w->runner(w->entry, r.error); }   // its engine prints as it goes (QuickJS)
  else r = runModuleHooked(*w->mod, out, false, w->natives || hooked ? +bind : nullptr, w.get(), hooked ? +done : nullptr, w.get(), 0, 0, true);
  w->cpuMs.store(threadCpuMs(), std::memory_order_relaxed);
  if (!out.empty()) { std::lock_guard<std::mutex> g(gOutMu); std::fwrite(out.data(), 1, out.size(), stdout); std::fflush(stdout); }
  void* wm;
  bool failed = false;
  {
    std::lock_guard<std::mutex> g(w->mu);
    w->ended = true;
    w->wakeWorker = nullptr;
    if (!r.ok && !w->stop) { w->error = r.error.rfind("panic: ", 0) == 0 ? r.error.substr(7) : r.error; failed = true; }
    wm = w->wakeMain;
  }
  trace(failed ? Error : End, *w);
  wake(wm);
  return nullptr;
}

bool spawn(const std::shared_ptr<W>& w, std::string& err);

const char* start(Machine& m, Slot* a, std::string& err) {
  auto str = [](Slot s) { auto* o = reinterpret_cast<StrObj*>(s); return o ? std::string(o->data(), o->len) : std::string(); };
  std::string key = str(a[0]);
  if (gOnWorker) { err = "a worker cannot start another worker yet (start it from the main program)"; return nullptr; }
  if (!loopBridge.wakeNew) { err = "workers need the system host (an event loop) in this build"; return nullptr; }
  const Compiled* comp = nullptr;
  for (const Compiled& c : compiled()) if (c.key == key) comp = &c;
  const std::vector<std::uint8_t>* bytes = nullptr;
  if (!comp) for (const auto& [k, b] : m.mod->workers) if (k == key) bytes = &b;
  if (!comp && (!bytes || !gBytecode)) { err = "the worker '" + key + "' is not part of this build (its entry must be a literal path, compiled with the program)"; return nullptr; }
  std::shared_ptr<const zbc::Module> mod;
  {
    std::lock_guard<std::mutex> g(gModMu);
    std::string ck = std::to_string(reinterpret_cast<std::uintptr_t>(comp ? comp->packed : bytes->data())) + ":" + key;
    auto it = gMods.find(ck);
    if (it != gMods.end()) mod = it->second;
    else {
      auto zm = std::make_shared<zbc::Module>();
      std::string why;
      std::vector<std::uint8_t> unpacked;
      if (comp && !zbc::unpackRuns(comp->packed, comp->size, unpacked)) why = "its tables do not unpack";
      else if (!zbc::decode(comp ? unpacked : *bytes, *zm, why) || !(why = zbc::verify(*zm)).empty()) {}
      if (!why.empty()) { err = "the worker '" + key + "' is damaged: " + why; return nullptr; }
      mod = gMods[ck] = zm;
    }
  }
  auto w = std::make_shared<W>();
  w->entry = key;
  w->sIn = str(a[1]);
  w->sOut = str(a[2]);
  w->mod = mod;
  if (comp) { w->natives = comp->natives; w->nativeCount = comp->count; }
  if (!spawn(w, err)) return nullptr;
  a[0] = static_cast<Slot>(w->id);
  return nullptr;
}

bool spawn(const std::shared_ptr<W>& w, std::string& err) {   // its thread started, the worker is this thread's next handle
  w->id = static_cast<int>(tOwned.size()) + 1;
  w->wakeMain = myWake();
  pthread_attr_t at;
  pthread_attr_init(&at);
  pthread_attr_setstacksize(&at, stackBytes());
  auto* arg = new std::shared_ptr<W>(w);
  int rc = pthread_create(&w->th, &at, body, arg);
  pthread_attr_destroy(&at);
  if (rc != 0) { delete arg; err = "the system refused a thread for the worker '" + w->entry + "'"; return false; }
  tOwned.push_back(w);
  { std::lock_guard<std::mutex> g(gRegMu); gAll.push_back(w); }
  if (loopBridge.active) loopBridge.active(1);   // a running worker keeps the main program's loop running, as in Node and Deno
  trace(Start, *w);
  return true;
}

void finishOwn(W&) {   // the main side has seen the end: the loop no longer waits for it
  if (loopBridge.active) loopBridge.active(-1);
}

void join(W& w) {
  if (w.joined) return;
  w.joined = true;
  pthread_join(w.th, nullptr);
  std::lock_guard<std::mutex> g(gRegMu);
  for (std::size_t i = 0; i < gAll.size(); ++i) if (gAll[i].get() == &w) { gAll.erase(gAll.begin() + static_cast<std::ptrdiff_t>(i)); break; }
}

void terminate(W& w) {
  void* ww;
  {
    std::lock_guard<std::mutex> g(w.mu);
    if (w.terminated) return;
    w.terminated = true;
    w.toMain.clear();   // its pending messages are dropped, as on the web
    ww = w.wakeWorker;
    if (!w.endTaken) { w.endTaken = true; finishOwn(w); }
  }
  w.stop = true;
  wake(ww);
  trace(Terminate, w);
}

std::string errorOf(Slot h) {   // main side: "" while it runs (or its end was already taken); else the error, or "<ended>"
  W* w = owned(h);
  if (!w) return "";
  std::lock_guard<std::mutex> g(w->mu);
  if (!w->ended || w->endTaken || !w->toMain.empty()) return "";
  w->endTaken = true;
  finishOwn(*w);
  return w->error.empty() ? "<ended>" : w->error;
}

thread_local std::vector<std::uint8_t> tCurrent;   // the message HostWorkerNext took, read by HostWorkerRead

const char* post(Slot h, std::vector<std::uint8_t>&& b) {   // a message's bytes onto its queue (handle 0: a worker to its parent), the receiver woken
  const std::size_t n = b.size();
  if (h == 0) {
    W* w = tSelf;
    if (!w) return "postMessage: this program is not a worker (use a Worker's postMessage)";
    void* wm;
    { std::lock_guard<std::mutex> g(w->mu); if (w->terminated) return nullptr; w->toMain.push_back(std::move(b)); wm = w->wakeMain; }
    w->out.fetch_add(1, std::memory_order_relaxed);
    trace(PostToMain, *w, n);
    wake(wm);
    return nullptr;
  }
  W* w = owned(h);
  if (!w) return "postMessage: not a worker of this program";
  void* ww;
  {
    std::lock_guard<std::mutex> g(w->mu);
    if (w->terminated || w->ended) return nullptr;   // a message to a worker that is gone is dropped, as on the web
    w->idle.store(false, std::memory_order_relaxed);
    w->toWorker.push_back(std::move(b));
    ww = w->wakeWorker;
  }
  w->in.fetch_add(1, std::memory_order_relaxed);
  trace(PostToWorker, *w, n);
  wake(ww);
  return nullptr;
}

thread_local std::string tStartError;   // why the last start failed: workerError(0) on the main side

bool nextBytes(std::int64_t h, std::vector<std::uint8_t>& out) {   // Rt::HostWorkerNext: the next message's bytes, or false when none waits
  W* w = h == 0 ? tSelf : owned(static_cast<Slot>(h));
  bool got = false;
  if (w) {
    std::lock_guard<std::mutex> g(w->mu);
    auto& q = h == 0 ? w->toWorker : w->toMain;
    if (!q.empty()) { out = std::move(q.front()); q.pop_front(); got = true; }
    else if (h == 0) w->notifiedWorker = false;
    else w->notifiedMain = false;
  }
  if (got) trace(h == 0 ? ReceiveInWorker : ReceiveInMain, *w, out.size());
  return got;
}
std::string errorText(std::int64_t h) { return h == 0 ? tStartError : errorOf(static_cast<Slot>(h)); }
void closeWorker(std::int64_t h) {
  if (h == 0) {   // self.close(): the worker's loop ends once it has nothing else to do
    W* w = tSelf;
    if (w && !w->closedSelf) { w->closedSelf = true; if (loopBridge.active) loopBridge.active(-1); }
    return;
  }
  if (W* w = owned(static_cast<Slot>(h))) terminate(*w);
}
std::string schemaText(int which) { W* w = tSelf; return !w ? std::string() : which == 0 ? w->sIn : w->sOut; }   // a worker's schemas, as its parent declared them
void markHandler(std::int64_t h, int phase) {   // onmessage begins (1) or ends (2): trace spans only
  if (!traceHook) return;
  W* w = h == 0 ? tSelf : owned(static_cast<Slot>(h));
  if (w) trace(phase == 1 ? HandlerBegin : HandlerEnd, *w);
}
int startRunner(const std::string& entry, const std::string& sIn, const std::string& sOut, bool (*run)(const std::string&, std::string&), std::string& err) {
  tStartError.clear();
  if (tSelf) err = "a worker cannot start another worker yet (start it from the main program)";
  else if (!loopBridge.wakeNew) err = "workers need the system host (an event loop) in this build";
  else {
    auto w = std::make_shared<W>();
    w->entry = entry; w->sIn = sIn; w->sOut = sOut; w->runner = run;
    if (spawn(w, err)) return w->id;
  }
  tStartError = err;
  return 0;
}

}  // namespace

void addCompiled(const char* key, const unsigned char* packed, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count) {
  compiled().push_back({key, packed, size, natives, count});
}

bool stopping() { return tSelf && tSelf->stop.load(std::memory_order_relaxed); }

void idleWait() {
  W* w = tSelf;
  if (!w) return;
  std::lock_guard<std::mutex> g(w->mu);
  if (w->toWorker.empty()) w->idle.store(true, std::memory_order_release);
}

void deliver() {
  if (W* w = tSelf) {
    w->live.store(gAllocs - gFrees, std::memory_order_relaxed);
    w->cpuMs.store(threadCpuMs(), std::memory_order_relaxed);
    bool any;
    { std::lock_guard<std::mutex> g(w->mu); any = !w->toWorker.empty() && !w->notifiedWorker; if (any) w->notifiedWorker = true; }
    if (any && loopBridge.push) loopBridge.push(0, 70);
    return;
  }
  if (tOwned.empty()) return;
  if (deterministic())   // every worker answers within the turn: what it posted is read at the same turn on every run
    for (auto& w : tOwned)
      for (;;) {
        { std::lock_guard<std::mutex> g(w->mu); if (w->ended || w->terminated || (w->idle.load(std::memory_order_acquire) && w->toWorker.empty())) break; }
        std::this_thread::sleep_for(std::chrono::microseconds(100));
      }
  for (std::size_t i = 0; i < tOwned.size(); ++i) {
    W& w = *tOwned[i];
    bool any;
    {
      std::lock_guard<std::mutex> g(w.mu);
      any = !w.terminated && !w.notifiedMain && (!w.toMain.empty() || (w.ended && !w.endTaken));
      if (any) w.notifiedMain = true;
    }
    if (any && loopBridge.push) loopBridge.push(w.id, 70);
    if (w.ended && w.endTaken) join(w);   // its thread is done: no record left behind it
  }
}

const char* call(Machine& m, Rt id, Slot* a) {
  std::string& startError = tStartError;
  auto retStr = [&](const std::string& s) { a[0] = reinterpret_cast<Slot>(m.newStr(s.data(), s.size())); };
  switch (id) {
    case Rt::HostWorkerStart: {
      startError.clear();
      start(m, a, startError);
      if (!startError.empty()) a[0] = 0;
      return nullptr;
    }
    case Rt::HostWorkerPostRec: {   // (handle, value, schema, layout): the value's bytes onto the receiver's queue
      thread_local std::string err;
      err.clear();
      const Plan* p = planFor(m, reinterpret_cast<const StrObj*>(a[2]), reinterpret_cast<const StrObj*>(a[3]), false, err);
      thread_local std::size_t lastSize = 0;   // the size of the last message: a program posts alike messages, so one allocation usually holds the next
      rec::Writer w;
      w.out.reserve(lastSize + lastSize / 8);
      if (!p || !encodeValue(a[1], *p, w, err)) { err = "postMessage: " + err; return err.c_str(); }
      lastSize = w.out.size();
      return post(a[0], std::move(w.out));
    }
    case Rt::HostWorkerNext:   // the next message becomes the current one (HostWorkerRead decodes it): true, or false when none waits
      a[0] = nextBytes(static_cast<std::int64_t>(a[0]), tCurrent);
      return nullptr;
    case Rt::HostWorkerRead: {   // (schema, layout, a null of the receiver's type): the current message as a value of that type
      thread_local std::string err;
      err.clear();
      const Plan* p = planFor(m, reinterpret_cast<const StrObj*>(a[0]), reinterpret_cast<const StrObj*>(a[1]), true, err);
      if (!p) { err = "onmessage: " + err; return err.c_str(); }
      rec::Reader r{tCurrent.data(), tCurrent.data() + tCurrent.size()};
      Slot v;
      const bool ok = decodeValue(m, r, *p, v);
      std::vector<std::uint8_t>().swap(tCurrent);   // its bytes are not kept past the read
      if (!ok) return "onmessage: the message's bytes do not match its type";
      a[0] = v;
      return nullptr;
    }
    case Rt::HostWorkerError: retStr(errorText(static_cast<std::int64_t>(a[0]))); return nullptr;
    case Rt::HostWorkerClose: closeWorker(static_cast<std::int64_t>(a[0])); return nullptr;
    case Rt::HostWorkerSchema: retStr(schemaText(static_cast<int>(a[0]))); return nullptr;   // 0 what it receives, 1 what it posts
    case Rt::HostWorkerMark: markHandler(static_cast<std::int64_t>(a[0]), static_cast<int>(a[1])); return nullptr;
    default: return "zinc:worker: unknown call";
  }
}

void shutdown() {   // the main program returned: its workers are stopped and their threads joined (a worker busy in a loop finishes it first)
  if (gOnWorker) return;
  for (auto& w : tOwned) terminate(*w);
  for (auto& w : tOwned) join(*w);
  tOwned.clear();
}

std::vector<Info> snapshot() {
  std::vector<std::shared_ptr<W>> all;
  { std::lock_guard<std::mutex> g(gRegMu); all = gAll; }
  std::vector<Info> v;
  for (auto& w : all) {
    Info i;
    i.id = w->id;
    i.entry = w->entry;
    i.messagesIn = w->in.load(std::memory_order_relaxed);
    i.messagesOut = w->out.load(std::memory_order_relaxed);
    i.liveBlocks = w->live.load(std::memory_order_relaxed);
    i.cpuMs = w->cpuMs.load(std::memory_order_relaxed);
    std::lock_guard<std::mutex> g(w->mu);
    i.state = w->terminated ? 2 : w->ended ? 1 : 0;
    i.queuedIn = w->toWorker.size();
    i.queuedOut = w->toMain.size();
    i.error = w->error;
    v.push_back(std::move(i));
  }
  return v;
}

// ---- the trace of the workers (zn::host::threadTrace)
namespace {

struct Collector {
  std::mutex mu;
  std::uint64_t (*clock)() = nullptr;
  std::string events;                // ",{...},{...}"
  std::map<int, bool> named;         // the worker tracks named so far
  // per direction (0 to a worker, 1 to the main program), per worker: the messages posted, received and handled so far (the flows' ids), a handler's start
  std::map<int, std::uint64_t> posted[2], received[2], handled[2], open[2];
  std::size_t count = 0;
  std::string out;
};
Collector gTrace;

std::string jq(const std::string& s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += c; } else if (static_cast<unsigned char>(c) < 0x20) r += ' '; else r += c; }
  return r + "\"";
}

// One event of traceHook: slices and flow steps on the track of the thread it happens on (a flow binds to the slice around it).
void collect(Event e, int id, const char* entry, std::size_t bytes, double) {
  Collector& c = gTrace;
  const bool onWorker = tSelf != nullptr;
  const int tid = onWorker ? 100 + id : 1;
  std::lock_guard<std::mutex> g(c.mu);
  if (!c.clock || c.count > 400000) return;   // ponytail: a bounded trace; a ring when long recordings need their end
  ++c.count;
  const std::uint64_t t = c.clock();
  const std::string name = std::string(entry) + "#" + std::to_string(id);
  auto ev = [&](const char* ph, const std::string& n, std::uint64_t ts, const std::string& extra) {
    c.events += ",{\"name\":" + jq(n) + ",\"cat\":\"zinc.worker\",\"ph\":\"" + ph + "\",\"pid\":1,\"tid\":" + std::to_string(tid) + ",\"ts\":" + std::to_string(ts) + extra + "}";
  };
  if (onWorker && !c.named[id]) {
    c.named[id] = true;
    c.events += ",{\"name\":\"thread_name\",\"ph\":\"M\",\"pid\":1,\"tid\":" + std::to_string(tid) + ",\"args\":{\"name\":" + jq("zinc worker " + name) + "}}";
  }
  auto flowId = [&](int dir, std::uint64_t k) { return std::to_string((static_cast<std::uint64_t>(id) << 33) | (static_cast<std::uint64_t>(dir) << 32) | k); };
  const std::string args = ",\"args\":{\"worker\":" + jq(name) + ",\"bytes\":" + std::to_string(bytes) + "}";
  switch (e) {
    case PostToWorker: case PostToMain: {
      const int dir = e == PostToMain;
      ev("X", dir ? "postMessage to main" : "postMessage to " + name, t, ",\"dur\":1" + args);
      ev("s", "message", t, ",\"id\":" + flowId(dir, ++c.posted[dir][id]));
      break;
    }
    case ReceiveInWorker: case ReceiveInMain: {
      const int dir = e == ReceiveInMain;
      ev("X", "receive", t, ",\"dur\":1" + args);
      ev("t", "message", t, ",\"id\":" + flowId(dir, ++c.received[dir][id]));
      break;
    }
    case HandlerBegin: c.open[onWorker ? 0 : 1][id] = t; break;
    case HandlerEnd: {   // the handler's slice; the flow of its message ends at its start
      const int dir = onWorker ? 0 : 1;
      auto it = c.open[dir].find(id);
      if (it == c.open[dir].end()) break;
      const std::uint64_t t0 = it->second;
      c.open[dir].erase(it);
      ev("X", dir ? "onmessage " + name : "onmessage", t0, ",\"dur\":" + std::to_string(t > t0 ? t - t0 : 1) + ",\"args\":{\"worker\":" + jq(name) + "}");
      ev("f", "message", t0, ",\"bp\":\"e\",\"id\":" + flowId(dir, ++c.handled[dir][id]));
      break;
    }
    default: {   // start, terminate, error, end
      static const char* const kNames[] = {"worker start", "", "", "", "", "", "", "worker terminate", "worker error", "worker end"};
      ev("i", std::string(kNames[e]) + " " + name, t, ",\"s\":\"t\"");
      break;
    }
  }
}

}  // namespace

const char* traceThreads(int op, std::uint64_t (*clock)(), std::size_t* n) {
  Collector& c = gTrace;
  std::lock_guard<std::mutex> g(c.mu);
  c.out.clear();
  if (op == 1) {
    c.clock = clock;
    c.events.clear(); c.named.clear(); c.count = 0;
    for (int d = 0; d < 2; ++d) { c.posted[d].clear(); c.received[d].clear(); c.handled[d].clear(); c.open[d].clear(); }
    traceHook = collect;
  } else if (op == 0 || op == 2) {
    if (op == 0 && traceHook == collect) { traceHook = nullptr; c.clock = nullptr; }
    c.out = c.events;
  } else if (op == 3) {
    c.out = "[";
    for (const Info& i : snapshot()) {
      char cpu[32];
      std::snprintf(cpu, sizeof cpu, "%.1f", i.cpuMs);
      c.out += std::string(c.out.size() > 1 ? "," : "") + "{\"id\":" + std::to_string(i.id) + ",\"name\":" + jq("zinc worker " + i.entry + "#" + std::to_string(i.id)) +
               ",\"entry\":" + jq(i.entry) + ",\"state\":\"" + (i.state == 2 ? "terminated" : i.state == 1 ? "ended" : "running") + "\",\"queuedIn\":" + std::to_string(i.queuedIn) +
               ",\"queuedOut\":" + std::to_string(i.queuedOut) + ",\"messagesIn\":" + std::to_string(i.messagesIn) + ",\"messagesOut\":" + std::to_string(i.messagesOut) +
               ",\"liveBlocks\":" + std::to_string(i.liveBlocks) + ",\"cpuMs\":" + cpu + ",\"error\":" + jq(i.error) + "}";
    }
    c.out += "]";
  }
  if (n) *n = c.out.size();
  return c.out.c_str();
}

}  // namespace zn::rt::worker

namespace zn::host {
const char* (*threadTrace)(int, std::uint64_t (*)(), std::size_t*) = zn::rt::worker::traceThreads;
const WorkerBridge workerBridge = {
  zn::rt::worker::startRunner,
  [](std::int64_t h, std::vector<std::uint8_t>&& b) { return zn::rt::worker::post(static_cast<zn::rt::Slot>(h), std::move(b)); },
  zn::rt::worker::nextBytes, zn::rt::worker::errorText, zn::rt::worker::closeWorker, zn::rt::worker::schemaText, zn::rt::worker::markHandler,
  [] { return zn::rt::worker::tSelf != nullptr; }, zn::rt::worker::stopping, zn::rt::worker::deliver, zn::rt::worker::idleWait, zn::rt::worker::shutdown,
};
}
