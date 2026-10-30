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

// The bytes of a u8[] as a vector, and back.
std::vector<std::uint8_t> bytesOf(Slot s) {
  auto* arr = reinterpret_cast<ArrObj*>(s);
  std::vector<std::uint8_t> v(arr ? arr->v.size() : 0);
  for (std::size_t i = 0; i < v.size(); ++i) v[i] = static_cast<std::uint8_t>(arr->v[i]);
  return v;
}
const ClassRT* byteArrayClass(Machine& m) {
  for (std::size_t c = 0; c < m.mod->classes.size(); ++c) {
    const zbc::ClassInfo& ci = m.mod->classes[c];
    if (ci.kind == zbc::CKind::Array && ci.elem.cls == zbc::Cls::I) return &m.classes[c];
  }
  return nullptr;
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
  Result r = runModuleHooked(*w->mod, out, false, w->natives || hooked ? +bind : nullptr, w.get(), hooked ? +done : nullptr, w.get(), 0, 0, true);
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
  w->id = static_cast<int>(tOwned.size()) + 1;
  w->entry = key;
  w->sIn = str(a[1]);
  w->sOut = str(a[2]);
  w->mod = mod;
  if (comp) { w->natives = comp->natives; w->nativeCount = comp->count; }
  w->wakeMain = myWake();
  pthread_attr_t at;
  pthread_attr_init(&at);
  pthread_attr_setstacksize(&at, stackBytes());
  auto* arg = new std::shared_ptr<W>(w);
  int rc = pthread_create(&w->th, &at, body, arg);
  pthread_attr_destroy(&at);
  if (rc != 0) { delete arg; err = "the system refused a thread for the worker '" + key + "'"; return nullptr; }
  tOwned.push_back(w);
  { std::lock_guard<std::mutex> g(gRegMu); gAll.push_back(w); }
  if (loopBridge.active) loopBridge.active(1);   // a running worker keeps the main program's loop running, as in Node and Deno
  trace(Start, *w);
  a[0] = static_cast<Slot>(w->id);
  return nullptr;
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
  thread_local std::string startError;   // why the last start failed: workerError(0) on the main side
  auto retStr = [&](const std::string& s) { a[0] = reinterpret_cast<Slot>(m.newStr(s.data(), s.size())); };
  switch (id) {
    case Rt::HostWorkerStart: {
      startError.clear();
      start(m, a, startError);
      if (!startError.empty()) a[0] = 0;
      return nullptr;
    }
    case Rt::HostWorkerPost: {
      std::vector<std::uint8_t> b = bytesOf(a[1]);
      const std::size_t n = b.size();
      if (a[0] == 0) {   // a worker to its parent
        W* w = tSelf;
        if (!w) return "postMessage: this program is not a worker (use a Worker's postMessage)";
        void* wm;
        { std::lock_guard<std::mutex> g(w->mu); if (w->terminated) return nullptr; w->toMain.push_back(std::move(b)); wm = w->wakeMain; }
        w->out.fetch_add(1, std::memory_order_relaxed);
        trace(PostToMain, *w, n);
        wake(wm);
        return nullptr;
      }
      W* w = owned(a[0]);
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
    case Rt::HostWorkerRecv: {   // the next message, or an empty array (a message is never empty: a record has its length)
      std::vector<std::uint8_t> b;
      W* w = a[0] == 0 ? tSelf : owned(a[0]);
      bool got = false;
      if (w) {
        std::lock_guard<std::mutex> g(w->mu);
        auto& q = a[0] == 0 ? w->toWorker : w->toMain;
        if (!q.empty()) { b = std::move(q.front()); q.pop_front(); got = true; }
        else if (a[0] == 0) w->notifiedWorker = false;
        else w->notifiedMain = false;
      }
      if (got) trace(a[0] == 0 ? ReceiveInWorker : ReceiveInMain, *w, b.size());
      const ClassRT* cls = byteArrayClass(m);
      if (!cls) return "zinc:worker: the program has no u8[] class";
      ArrObj* arr = m.newArr(cls);
      arr->v.assign(b.begin(), b.end());
      a[0] = reinterpret_cast<Slot>(arr);
      return nullptr;
    }
    case Rt::HostWorkerError: {
      if (a[0] == 0) { retStr(startError); return nullptr; }
      retStr(errorOf(a[0]));
      return nullptr;
    }
    case Rt::HostWorkerClose: {
      if (a[0] == 0) {   // self.close(): the worker's loop ends once it has nothing else to do
        W* w = tSelf;
        if (w && !w->closedSelf) { w->closedSelf = true; if (loopBridge.active) loopBridge.active(-1); }
        return nullptr;
      }
      if (W* w = owned(a[0])) terminate(*w);
      return nullptr;
    }
    case Rt::HostWorkerSchema: {   // a worker's message schemas, as its parent declared them: 0 what it receives, 1 what it posts
      W* w = tSelf;
      retStr(!w ? std::string() : a[0] == 0 ? w->sIn : w->sOut);
      return nullptr;
    }
    case Rt::HostWorkerMark: {   // onmessage begins (1) or ends (2): trace spans only
      if (!traceHook) return nullptr;
      W* w = a[0] == 0 ? tSelf : owned(a[0]);
      if (w) trace(a[1] == 1 ? HandlerBegin : HandlerEnd, *w);
      return nullptr;
    }
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

namespace zn::host { const char* (*threadTrace)(int, std::uint64_t (*)(), std::size_t*) = zn::rt::worker::traceThreads; }
