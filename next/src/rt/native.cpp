// The registry of native modules (ZN-096): include/zn/native.h. No engine objects in here: callbacks and promises are handles the engine gave out, completions wait in a
// queue that the engine's loop drains (zn_native_drain), resources are a generational table with the kinds' finalizers.
#include "zn/native.h"

#include <atomic>
#include <cstdio>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace {

struct Mod {
  ZnModule m{};
  std::vector<ZnExport> exports;
  std::vector<ZnKind> kinds;
  std::string name;
  void* self = nullptr;
};

struct Res { std::uint32_t kind = 0; void* ptr = nullptr; int rc = 0; std::uint32_t gen = 1; bool live = false; const ZnKind* k = nullptr; };

}  // namespace

struct ZnCtx {
  std::string error;
  std::deque<std::string> strings;                  // copies made for the result (ret_str)
  std::deque<std::vector<unsigned char>> buffers;   // scratch for array results (ret_buf)
  std::uint64_t promise = 0;
};

namespace {

std::vector<std::unique_ptr<Mod>> gMods;
std::vector<Res> gRes;
std::vector<std::uint32_t> gFree;
std::map<std::uint64_t, int> gCbRefs;
ZnSink gSink{};
std::atomic<int> gPending{0};
std::atomic<std::uint64_t> gNextPromise{1};
ZnCtx gLast;   // the context of the last call: what a result points into stays valid until the next call

struct Work {
  enum Kind { Post, Resolve, Reject } kind;
  std::uint64_t id = 0;               // callback or promise
  std::vector<ZnVal> vals;
  std::deque<std::string> text;       // storage of the copied strings (values point into it)
  std::string message;
};
std::mutex gQueueLock;
std::deque<Work> gQueue;

void setError(char* err, std::size_t n, const std::string& msg) { if (err && n) std::snprintf(err, n, "%s", msg.c_str()); }

// ---- signatures
bool paramLetter(char c) { return std::strchr("siubdfhBIDSU", c) != nullptr; }
bool parseSig(const char*& p, bool callback, std::string& why);
bool parseType(const char*& p, bool result, std::string& why) {
  char c = *p;
  if (c == 0) { why = "a type is missing"; return false; }
  if (c == 'R') { ++p; if (*p < '0' || *p > '9') { why = "R needs a kind digit"; return false; } ++p; return true; }
  if (c == 'c' && !result) {
    ++p;
    if (*p != '(') { why = "c needs (signature)"; return false; }
    ++p;
    if (!parseSig(p, true, why)) return false;
    if (*p != ')') { why = "a callback signature is not closed"; return false; }
    ++p;
    return true;
  }
  if (c == 'P' && result) { ++p; return parseType(p, false, why) ; }
  if (c == 'n' && result) { ++p; return true; }
  if (paramLetter(c)) { ++p; return true; }
  why = std::string("unknown letter '") + c + "'";
  return false;
}
// params '>' result, up to the end (or the closing parenthesis of a callback)
bool parseSig(const char*& p, bool callback, std::string& why) {
  while (*p && *p != '>' && *p != ')') if (!parseType(p, false, why)) return false;
  if (*p != '>') { why = "the '>' before the result is missing"; return false; }
  ++p;
  if (!parseType(p, true, why)) return false;
  return callback ? true : *p == 0 ? true : (why = "text after the result", false);
}

// ---- the host API handed to the modules
void apiSetError(ZnCtx* cx, const char* message) { if (cx) cx->error = message ? message : ""; }
ZnStr apiRetStr(ZnCtx* cx, const char* p, std::uint32_t n) {
  cx->strings.emplace_back(p, n);
  const std::string& s = cx->strings.back();
  return ZnStr{s.c_str(), static_cast<std::uint32_t>(s.size())};
}
void* apiRetBuf(ZnCtx* cx, std::uint32_t bytes) { cx->buffers.emplace_back(bytes ? bytes : 1); return cx->buffers.back().data(); }

const ZnKind* kindOf(std::uint32_t id) {
  for (const auto& m : gMods) for (const ZnKind& k : m->kinds) if (k.id == id) return &k;
  return nullptr;
}
std::uint64_t apiResNew(std::uint32_t kind, void* ptr) {
  const ZnKind* k = kindOf(kind);
  if (!k) return 0;
  std::uint32_t idx;
  if (!gFree.empty()) { idx = gFree.back(); gFree.pop_back(); } else { idx = static_cast<std::uint32_t>(gRes.size()); gRes.emplace_back(); }
  Res& r = gRes[idx];
  r.kind = kind; r.ptr = ptr; r.rc = 1; r.live = true; r.k = k;
  return (static_cast<std::uint64_t>(r.gen) << 32) | (idx + 1);
}
Res* resOf(std::uint64_t h) {
  std::uint32_t idx = static_cast<std::uint32_t>(h & 0xFFFFFFFFu);
  if (idx == 0 || idx > gRes.size()) return nullptr;
  Res& r = gRes[idx - 1];
  return r.live && r.gen == static_cast<std::uint32_t>(h >> 32) ? &r : nullptr;
}
void* apiResGet(std::uint64_t h, std::uint32_t kind) { Res* r = resOf(h); return r && r->kind == kind ? r->ptr : nullptr; }
void apiResRetain(std::uint64_t h) { if (Res* r = resOf(h)) ++r->rc; }
void finalizeRes(Res& r, std::uint32_t idx) {
  r.live = false;
  ++r.gen;
  if (r.k && r.k->finalize) r.k->finalize(r.ptr);
  r.ptr = nullptr;
  gFree.push_back(idx);
}
void apiResRelease(std::uint64_t h) {
  Res* r = resOf(h);
  if (!r) return;
  if (--r->rc == 0) finalizeRes(*r, static_cast<std::uint32_t>(r - gRes.data()));
}
std::uint64_t apiCbRetain(std::uint64_t cb) { if (++gCbRefs[cb] == 1 && gSink.hold) gSink.hold(gSink.user, cb); return cb; }
void apiCbRelease(std::uint64_t cb) {
  auto it = gCbRefs.find(cb);
  if (it == gCbRefs.end()) return;
  if (--it->second == 0) { gCbRefs.erase(it); if (gSink.release) gSink.release(gSink.user, cb); }
}
std::int32_t apiCbCall(std::uint64_t cb, const ZnVal* args, std::uint32_t nargs, ZnVal* ret) {
  ZnVal scratch{};
  return gSink.call ? gSink.call(gSink.user, cb, args, nargs, ret ? ret : &scratch) : -1;
}
// Copies what a queued call must own: a string or an array behind the caller's pointer may be gone when the engine's thread gets to it.
bool copyVals(Work& w, const char* sig, const ZnVal* args, std::uint32_t n) {
  for (std::uint32_t i = 0; i < n; ++i) {
    char c = sig && sig[i] ? sig[i] : 'i';
    ZnVal v = args[i];
    if (c == 's') { w.text.emplace_back(v.s.p ? v.s.p : "", v.s.n); v.s.p = w.text.back().c_str(); }
    else if (c == 'B' || c == 'I' || c == 'D') {
      std::size_t bytes = static_cast<std::size_t>(v.v.n) * (c == 'B' ? 1 : c == 'I' ? 4 : 8);
      w.text.emplace_back(static_cast<const char*>(v.v.p), v.v.p ? bytes : 0);
      v.v.p = w.text.back().data();
    } else if (c == 'S') return false;
    w.vals.push_back(v);
  }
  return true;
}
std::int32_t apiCbPost(std::uint64_t cb, const char* sig, const ZnVal* args, std::uint32_t nargs) {
  Work w;
  w.kind = Work::Post; w.id = cb;
  if (!copyVals(w, sig, args, nargs)) return -1;
  std::lock_guard<std::mutex> g(gQueueLock);
  gQueue.push_back(std::move(w));
  return 0;
}
std::uint64_t apiPromiseTake(ZnCtx* cx) { cx->promise = gNextPromise++; return cx->promise; }
void apiPromiseResolve(std::uint64_t promise, const char* type, const ZnVal* value) {
  Work w;
  w.kind = Work::Resolve; w.id = promise;
  if (value && type && *type != 'n') copyVals(w, type, value, 1);
  std::lock_guard<std::mutex> g(gQueueLock);
  gQueue.push_back(std::move(w));
}
void apiPromiseReject(std::uint64_t promise, const char* message) {
  Work w;
  w.kind = Work::Reject; w.id = promise; w.message = message ? message : "";
  std::lock_guard<std::mutex> g(gQueueLock);
  gQueue.push_back(std::move(w));
}
void apiLoopRef() { ++gPending; }
void apiLoopUnref() { --gPending; }
double apiNow() { return 0; }
const char* apiCbError() { return gSink.error ? gSink.error(gSink.user) : ""; }

ZnHostApi gApi = {sizeof(ZnHostApi), apiSetError, apiRetStr, apiRetBuf, apiResNew, apiResGet, apiResRetain, apiResRelease, apiCbRetain, apiCbRelease, apiCbCall, apiCbPost,
                  apiPromiseTake, apiPromiseResolve, apiPromiseReject, apiLoopRef, apiLoopUnref, apiNow, apiCbError};

Mod* find(const char* name) { for (auto& m : gMods) if (m->name == name) return m.get(); return nullptr; }

}  // namespace

extern "C" {

std::int32_t zn_register_module(const ZnModule* module, char* err, std::size_t errsize) {
  if (!module) { setError(err, errsize, "no module"); return -1; }
  if ((module->abi >> 16) != ZN_ABI_MAJOR || (module->abi & 0xffffu) > ZN_ABI_MINOR) {   // another major, or a newer minor: refused; an older minor loads (ZN-353)
    auto v = [](std::uint32_t a) { return std::to_string(a >> 16) + "." + std::to_string(a & 0xffffu); };
    setError(err, errsize, std::string("module '") + (module->name ? module->name : "?") + "' was built for native ABI " + v(module->abi) + ", this engine speaks ABI " + v(ZN_ABI_VERSION) +
                               ((module->abi >> 16) != ZN_ABI_MAJOR ? " (another major version: rebuild the plugin for this zinc)" : " (a newer minor: update zinc)"));
    return -2;
  }
  auto m = std::make_unique<Mod>();
  std::size_t n = module->size < sizeof(ZnModule) ? module->size : sizeof(ZnModule);
  std::memcpy(&m->m, module, n);   // an older, shorter module: the newer fields stay null
  if (!module->name || !*module->name) { setError(err, errsize, "a module needs a name"); return -3; }
  m->name = module->name;
  if (find(module->name)) { setError(err, errsize, "module '" + m->name + "' is registered twice"); return -4; }
  for (std::uint32_t i = 0; i < module->nkinds; ++i) {
    if (module->kinds[i].id > 9) { setError(err, errsize, "module '" + m->name + "': a resource kind is a digit 0-9"); return -5; }
    m->kinds.push_back(module->kinds[i]);
  }
  for (std::uint32_t i = 0; i < module->nexports; ++i) {
    const ZnExport& e = module->exports[i];
    if (!e.name || !e.sig || !e.fn) { setError(err, errsize, "module '" + m->name + "': export " + std::to_string(i) + " is incomplete"); return -6; }
    for (const ZnExport& o : m->exports) if (!std::strcmp(o.name, e.name)) { setError(err, errsize, "module '" + m->name + "': export '" + e.name + "' twice"); return -6; }
    const char* p = e.sig;
    std::string why;
    if (!parseSig(p, false, why)) { setError(err, errsize, "module '" + m->name + "': export '" + e.name + "' has a bad signature '" + e.sig + "': " + why); return -7; }
    for (const char* q = e.sig; *q; ++q) if (*q == 'R') { std::uint32_t k = static_cast<std::uint32_t>(q[1] - '0'); bool known = false; for (const ZnKind& kd : m->kinds) known = known || kd.id == k; if (!known) { setError(err, errsize, "module '" + m->name + "': export '" + e.name + "' names the unknown resource kind " + std::to_string(k)); return -8; } }
    m->exports.push_back(e);
  }
  if (m->m.init && m->m.init(&gApi, &m->self) != 0) { setError(err, errsize, "module '" + m->name + "' refused to load (init failed)"); return -9; }
  gMods.push_back(std::move(m));
  return 0;
}

int32_t zn_native_has_module(const char* module) { return find(module) != nullptr; }

const ZnExport* zn_native_find(const char* module, const char* name) {
  Mod* m = find(module);
  if (!m) return nullptr;
  for (const ZnExport& e : m->exports) if (!std::strcmp(e.name, name)) return &e;
  return nullptr;
}

std::int32_t zn_native_call(const char* module, const char* name, const char* sig, const ZnVal* args, ZnVal* ret, char* err, std::size_t errsize) {
  Mod* m = find(module);
  const ZnExport* e = m ? zn_native_find(module, name) : nullptr;
  if (!e) { setError(err, errsize, std::string("native module '") + module + "' has no export '" + name + "'"); return -1; }
  if (sig && std::strcmp(sig, e->sig) != 0) { setError(err, errsize, std::string("native '") + module + "." + name + "': the program expects the signature '" + sig + "', the module has '" + e->sig + "'"); return -2; }
  gLast = ZnCtx{};
  ZnVal zero{};
  zero.u = 0;
  if (ret) *ret = zero;
  std::int32_t st = e->fn(m->self, &gLast, args, ret ? ret : &zero);
  if (st != ZN_OK && st != ZN_PENDING) setError(err, errsize, gLast.error.empty() ? std::string("native '") + module + "." + name + "' failed" : gLast.error);
  return st;
}

std::uint64_t zn_native_last_promise(void) { return gLast.promise; }

void zn_native_drop_callbacks(void) {
  std::map<std::uint64_t, int> held;
  held.swap(gCbRefs);
  for (auto& kv : held) if (gSink.release) gSink.release(gSink.user, kv.first);
}

void zn_native_set_sink(const ZnSink* sink) { gSink = sink ? *sink : ZnSink{}; }

std::uint32_t zn_native_drain(void) {
  std::uint32_t ran = 0;
  for (;;) {
    Work w;
    {
      std::lock_guard<std::mutex> g(gQueueLock);
      if (gQueue.empty()) break;
      w = std::move(gQueue.front());
      gQueue.pop_front();
    }
    if (w.kind == Work::Post) { if (gSink.call) { ZnVal r{}; gSink.call(gSink.user, w.id, w.vals.data(), static_cast<std::uint32_t>(w.vals.size()), &r); } }
    else if (w.kind == Work::Resolve) { if (gSink.resolve) gSink.resolve(gSink.user, w.id, w.vals.empty() ? nullptr : w.vals.data()); }
    else if (gSink.reject) gSink.reject(gSink.user, w.id, w.message.c_str());
    ++ran;
  }
  return ran;
}

std::int32_t zn_native_pending(void) {
  std::lock_guard<std::mutex> g(gQueueLock);
  return gPending.load() + static_cast<std::int32_t>(gQueue.size());
}

void zn_native_poll(std::uint64_t now_ms) { for (auto& m : gMods) if (m->m.poll) m->m.poll(m->self, now_ms); }

void zn_native_shutdown(void) {
  for (auto it = gMods.rbegin(); it != gMods.rend(); ++it) if ((*it)->m.shutdown) (*it)->m.shutdown((*it)->self);
  for (std::size_t i = gRes.size(); i-- > 0;) if (gRes[i].live) finalizeRes(gRes[i], static_cast<std::uint32_t>(i));
  gMods.clear();
  gRes.clear();
  gFree.clear();
  gCbRefs.clear();
  gSink = ZnSink{};
  { std::lock_guard<std::mutex> g(gQueueLock); gQueue.clear(); }
  gPending = 0;
}

}  // extern "C"
