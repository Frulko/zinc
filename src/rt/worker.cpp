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

#include "zn/alloc_stats.h"
#include "zn/host.h"

namespace zn::host { LoopBridge loopBridge; }

namespace zn::rt::worker {

bool gBytecode = false;
TraceHook traceHook = nullptr;

namespace {

using zn::host::loopBridge;

struct W {
  int id = 0;
  std::string entry, sIn, sOut;
  std::shared_ptr<const zbc::Module> mod;
  std::mutex mu;                                    // guards the queues, the wake-ups and the end
  std::deque<std::vector<std::uint8_t>> toWorker, toMain;
  bool ended = false, endTaken = false, terminated = false, closedSelf = false;
  bool notifiedMain = false, notifiedWorker = false;   // an event of kind 70 waits in that loop: no second one until the program drained it
  std::string error;
  void* wakeWorker = nullptr;                       // the worker's loop (set by its thread)
  void* wakeMain = nullptr;                         // the owner's loop
  std::atomic<bool> stop{false}, idle{false};
  std::atomic<std::uint64_t> in{0}, out{0}, live{0};
  pthread_t th{};
  bool joined = false;
};

std::mutex gRegMu;
std::vector<std::shared_ptr<W>> gAll;               // every worker started and not yet joined: the registry of snapshot()
std::mutex gModMu;
std::map<std::string, std::shared_ptr<const zbc::Module>> gMods;   // decoded worker programs, by the bytes' address and key: N instances share one
std::mutex gOutMu;                                  // a worker's console lines go out whole, between the main program's

thread_local std::vector<std::shared_ptr<W>> tOwned;   // the workers this thread started: handle = index + 1
thread_local W* tSelf = nullptr;                       // on a worker's thread: its own record
thread_local void* tWake = nullptr;                    // this thread's wake-up

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
  Result r = runModuleHooked(*w->mod, out, false, nullptr, nullptr, nullptr, nullptr, 0, 0, true);
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
  if (!gBytecode) { err = "workers run on the interpreter in this build: run the program with zinc run --interp"; return nullptr; }
  if (!loopBridge.wakeNew) { err = "workers need the system host (an event loop) in this build"; return nullptr; }
  const std::vector<std::uint8_t>* bytes = nullptr;
  for (const auto& [k, b] : m.mod->workers) if (k == key) bytes = &b;
  if (!bytes) { err = "the worker '" + key + "' is not part of this build (its entry must be a literal path, compiled with the program)"; return nullptr; }
  std::shared_ptr<const zbc::Module> mod;
  {
    std::lock_guard<std::mutex> g(gModMu);
    std::string ck = std::to_string(reinterpret_cast<std::uintptr_t>(bytes->data())) + ":" + key;
    auto it = gMods.find(ck);
    if (it != gMods.end()) mod = it->second;
    else {
      auto zm = std::make_shared<zbc::Module>();
      std::string why;
      if (!zbc::decode(*bytes, *zm, why) || !(why = zbc::verify(*zm)).empty()) { err = "the worker '" + key + "' is damaged: " + why; return nullptr; }
      mod = gMods[ck] = zm;
    }
  }
  auto w = std::make_shared<W>();
  w->id = static_cast<int>(tOwned.size()) + 1;
  w->entry = key;
  w->sIn = str(a[1]);
  w->sOut = str(a[2]);
  w->mod = mod;
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
    std::lock_guard<std::mutex> g(w->mu);
    i.state = w->terminated ? 2 : w->ended ? 1 : 0;
    i.queuedIn = w->toWorker.size();
    i.queuedOut = w->toMain.size();
    i.error = w->error;
    v.push_back(std::move(i));
  }
  return v;
}

}  // namespace zn::rt::worker
