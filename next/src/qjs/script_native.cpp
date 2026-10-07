// zinc:script on the engine's own QuickJS-ng (ZN-103, decision D22): the native module "QuickJS" that plugins/script/native/quickjs.spec.ts describes, written against the C ABI
// (include/zn/native.h) and registered by zinc itself. One Vm per Script handle: a JSRuntime (memory limit, stack limit, interrupt handler for the time limit) with one JSContext
// that has the standard built-ins only. Every host -> script entry (eval, call, set/get, settling a promise) is an Entry: the outermost one arms the deadline and runs the
// pending promise jobs before it returns. Values cross as JSON text (the Zinc wrapper of the spec converts `unknown` with __nativeJson / __nativeValue); a function of the script
// becomes the object {"__zn_fn": n}, n a handle into the Vm's reference table, and comes back as the function when it is sent in again.
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include <string>
#include <vector>

extern "C" {
void zn_lre_delegate(void* (*)(void*, void*, size_t), int (*)(void*), bool (*)(void*, size_t));   // src/host/lre_host.c: the regexp engine's callbacks answer for QuickJS
void* qjs_lre_realloc(void*, void*, size_t);                                                       // quickjs.c, renamed (CMakeLists.txt)
int qjs_lre_check_timeout(void*);
bool qjs_lre_check_stack_overflow(void*, size_t);
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "zn/native.h"

namespace {

const ZnHostApi* H;

double monoMs() { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return static_cast<double>(t.tv_sec) * 1e3 + static_cast<double>(t.tv_nsec) / 1e6; }

struct Call { int32_t id; JSValue resolve, reject; };
struct Mod { std::string name, src; };

struct Vm {
  int32_t h = 0;
  JSRuntime* rt = nullptr;
  JSContext* ctx = nullptr;
  double limitMs = 0, memLimit = 0, deadline = 0;
  bool interrupted = false, stopped = false, closing = false, cut = false;
  int depth = 0;
  std::string result, err;
  std::vector<JSValue> refs;               // function handles (JS_UNINITIALIZED = free slot)
  std::vector<Call> calls;                 // pending async host calls
  std::vector<Mod> mods;                   // defined module sources
  std::vector<JSValue> ns;                 // namespaces of loaded modules, in load order
  std::vector<uint64_t> fns, asyncFns;     // callbacks of exposed functions
  uint64_t resolver = 0;
  int32_t nextId = 0;
  std::vector<int32_t> pending;            // followed promises not settled yet
  std::string bytes;                       // scratch for string results
};

const int kMaxVm = 64;
Vm* vms[kMaxVm];
uint64_t onEventCb = 0;

Vm* vmOf(int64_t h) { return h >= 0 && h < kMaxVm && vms[h] && !vms[h]->closing ? vms[h] : nullptr; }

std::string jsonString(const char* s) {   // a JSON string literal
  std::string r = "\"";
  for (; *s; ++s) {
    unsigned char c = static_cast<unsigned char>(*s);
    if (c == '"' || c == '\\') { r += '\\'; r += static_cast<char>(c); }
    else if (c == '\n') r += "\\n";
    else if (c == '\r') r += "\\r";
    else if (c == '\t') r += "\\t";
    else if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); r += b; }
    else r += static_cast<char>(c);
  }
  return r + "\"";
}

// ---------------------------------------------------------------- function handles
int refAdd(Vm* vm, JSValueConst f) {
  size_t i = 0;
  while (i < vm->refs.size() && !JS_IsUninitialized(vm->refs[i])) ++i;
  if (i == vm->refs.size()) vm->refs.push_back(JS_UNINITIALIZED);
  vm->refs[i] = JS_DupValue(vm->ctx, f);
  return static_cast<int>(i);
}
void refDrop(Vm* vm, int64_t r) {
  if (r < 0 || r >= static_cast<int64_t>(vm->refs.size()) || JS_IsUninitialized(vm->refs[static_cast<size_t>(r)])) return;
  JS_FreeValue(vm->ctx, vm->refs[static_cast<size_t>(r)]);
  vm->refs[static_cast<size_t>(r)] = JS_UNINITIALIZED;
}

// ---------------------------------------------------------------- values
JSValue fnReplacer(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int, JSValueConst* data) {
  Vm* vm = static_cast<Vm*>(JS_GetContextOpaque(ctx));
  (void)data;
  JSValueConst v = argc > 1 ? argv[1] : JS_UNDEFINED;
  if (!JS_IsFunction(ctx, v)) return JS_DupValue(ctx, v);
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "__zn_fn", JS_NewInt32(ctx, refAdd(vm, v)));
  return o;
}

// JS -> JSON text; "" for undefined. false with a pending exception when a getter threw or a cycle was found.
bool toJson(Vm* vm, JSValueConst v, std::string& out) {
  JSContext* ctx = vm->ctx;
  if (JS_IsUndefined(v)) { out.clear(); return true; }
  if (JS_IsFunction(ctx, v)) { out = "{\"__zn_fn\":" + std::to_string(refAdd(vm, v)) + "}"; return true; }
  JSValue rep = JS_NewCFunctionData(ctx, fnReplacer, 2, 0, 0, nullptr);
  JSValue s = JS_JSONStringify(ctx, v, rep, JS_UNDEFINED);
  JS_FreeValue(ctx, rep);
  if (JS_IsException(s)) return false;
  if (JS_IsUndefined(s)) { out.clear(); return true; }
  size_t n;
  const char* p = JS_ToCStringLen(ctx, &n, s);
  if (!p) { JS_FreeValue(ctx, s); return false; }
  out.assign(p, n);
  JS_FreeCString(ctx, p);
  JS_FreeValue(ctx, s);
  return true;
}

// Replaces {"__zn_fn": n} by the function behind handle n, in place.
JSValue revive(Vm* vm, JSValue v, int depth) {
  JSContext* ctx = vm->ctx;
  if (!JS_IsObject(v) || depth > 64) return v;
  if (JS_IsArray(v)) {
    int64_t n = 0;
    JS_GetLength(ctx, v, &n);
    for (int64_t i = 0; i < n; ++i) {
      JSValue x = JS_GetPropertyInt64(ctx, v, static_cast<uint32_t>(i));
      JS_SetPropertyInt64(ctx, v, static_cast<uint32_t>(i), revive(vm, x, depth + 1));
    }
    return v;
  }
  JSValue marker = JS_GetPropertyStr(ctx, v, "__zn_fn");
  if (JS_IsNumber(marker)) {
    int32_t r = 0;
    JS_ToInt32(ctx, &r, marker);
    JS_FreeValue(ctx, marker);
    if (r >= 0 && r < static_cast<int32_t>(vm->refs.size()) && !JS_IsUninitialized(vm->refs[static_cast<size_t>(r)])) { JS_FreeValue(ctx, v); return JS_DupValue(ctx, vm->refs[static_cast<size_t>(r)]); }
    JS_FreeValue(ctx, v);
    return JS_UNDEFINED;
  }
  JS_FreeValue(ctx, marker);
  JSPropertyEnum* tab = nullptr;
  uint32_t n = 0;
  if (JS_GetOwnPropertyNames(ctx, &tab, &n, v, JS_GPN_STRING_MASK | JS_GPN_ENUM_ONLY)) return v;
  for (uint32_t i = 0; i < n; ++i) {
    JSValue x = JS_GetProperty(ctx, v, tab[i].atom);
    if (JS_IsObject(x)) JS_SetProperty(ctx, v, tab[i].atom, revive(vm, x, depth + 1)); else JS_FreeValue(ctx, x);
  }
  JS_FreePropertyEnum(ctx, tab, n);
  return v;
}

// JSON text -> JS ("" is undefined)
JSValue fromJson(Vm* vm, const char* p, size_t n) {
  if (n == 0) return JS_UNDEFINED;
  JSValue v = JS_ParseJSON(vm->ctx, p, n, "<host>");
  if (JS_IsException(v)) return v;
  return revive(vm, v, 0);
}

// ---------------------------------------------------------------- errors
std::string errorInfo(const char* kind, const std::string& type, const std::string& message, const std::string& file, int line, const std::string& stack) {
  return std::string("{\"kind\":") + jsonString(kind) + ",\"type\":" + jsonString(type.c_str()) + ",\"message\":" + jsonString(message.c_str()) + ",\"file\":" + jsonString(file.c_str()) +
         ",\"line\":" + std::to_string(line) + ",\"stack\":" + jsonString(stack.c_str()) + "}";
}
std::string propStr(JSContext* ctx, JSValueConst o, const char* k) {
  JSValue v = JS_GetPropertyStr(ctx, o, k);
  std::string r;
  if (!JS_IsUndefined(v) && !JS_IsException(v)) { size_t n; const char* s = JS_ToCStringLen(ctx, &n, v); if (s) { r.assign(s, n); JS_FreeCString(ctx, s); } }
  if (JS_IsException(v)) JS_FreeValue(ctx, JS_GetException(ctx));
  JS_FreeValue(ctx, v);
  return r;
}
// Script frames of a QuickJS stack in the shape of the simulator's: `at fn (file:line:col)` or `at file:line:col`; native frames dropped. Sets file and line from the first one.
std::string frames(const std::string& stack, std::string& file, int& line) {
  std::string out;
  size_t pos = 0;
  while (pos < stack.size()) {
    size_t nl = stack.find('\n', pos);
    if (nl == std::string::npos) nl = stack.size();
    std::string ln = stack.substr(pos, nl - pos);
    pos = nl + 1;
    size_t s = ln.find_first_not_of(' ');
    if (s == std::string::npos || ln.compare(s, 3, "at ") != 0) continue;
    std::string rest = ln.substr(s + 3), fn, loc = rest;
    if (!rest.empty() && rest.back() == ')') {
      size_t open = rest.rfind(" (");
      if (open == std::string::npos) continue;
      fn = rest.substr(0, open);
      loc = rest.substr(open + 2, rest.size() - open - 3);
    }
    size_t c2 = loc.rfind(':');
    if (c2 == std::string::npos || c2 == 0) continue;
    size_t c1 = loc.rfind(':', c2 - 1);
    if (c1 == std::string::npos || c1 == 0) continue;
    int l = atoi(loc.c_str() + c1 + 1);
    if (l <= 0) continue;
    bool anon = fn.empty() || fn == "<eval>" || fn == "<anonymous>";
    if (!out.empty()) out += '\n';
    out += "at " + (anon ? loc : fn + " (" + loc + ")");
    if (!line) { file = loc.substr(0, c1); line = l; }
  }
  return out;
}
// Takes the pending exception `ex` (consumed) and describes it in vm->err.
void takeError(Vm* vm, JSValue ex) {
  JSContext* ctx = vm->ctx;
  char buf[96];
  if (vm->stopped) {
    vm->stopped = false;
    vm->cut = true;
    if (vm->interrupted) vm->err = errorInfo("interrupted", "", "script interrupted", "", 0, "");
    else { snprintf(buf, sizeof buf, "script ran longer than %.0f ms", vm->limitMs); vm->err = errorInfo("timeout", "", buf, "", 0, ""); }
    JS_FreeValue(ctx, ex);
    return;
  }
  if (JS_IsError(ex)) {
    std::string type = propStr(ctx, ex, "name"), message = propStr(ctx, ex, "message"), file;
    int line = 0;
    std::string stack = frames(propStr(ctx, ex, "stack"), file, line);
    const char* kind = type == "SyntaxError" ? "syntax" : "error";
    if (type == "InternalError" && (message == "out of memory" || message == "string too long")) {
      snprintf(buf, sizeof buf, "out of memory (limit %.0f bytes)", vm->memLimit);
      vm->err = errorInfo("memory", "RangeError", buf, "", 0, "");
    } else vm->err = errorInfo(kind, type, message, file, line, stack);
  } else if (JS_IsNull(ex) || JS_IsUninitialized(ex)) {   // out of memory while throwing
    snprintf(buf, sizeof buf, "out of memory (limit %.0f bytes)", vm->memLimit);
    vm->err = errorInfo("memory", "RangeError", buf, "", 0, "");
  } else {
    std::string m = "Uncaught ";
    size_t n;
    const char* s = JS_ToCStringLen(ctx, &n, ex);
    if (s) { m.append(s, n); JS_FreeCString(ctx, s); } else JS_FreeValue(ctx, JS_GetException(ctx));
    vm->err = errorInfo("error", "", m, "", 0, "");
  }
  JS_FreeValue(ctx, ex);
}
void hostError(Vm* vm, const char* type, const char* message) { vm->err = errorInfo("error", type, message, "", 0, ""); }

// ---------------------------------------------------------------- entries
int interruptHandler(JSRuntime*, void* opaque) {
  Vm* vm = static_cast<Vm*>(opaque);
  if (vm->interrupted || (vm->deadline > 0 && monoMs() > vm->deadline)) { vm->stopped = true; return 1; }
  return 0;
}
void freeVm(Vm* vm);
// Runs the pending promise jobs; false (error in vm->err) when one hit a limit.
bool pump(Vm* vm) {
  for (;;) {
    JSContext* c = nullptr;
    int r = JS_ExecutePendingJob(vm->rt, &c);
    if (r == 0) return true;
    if (r < 0) { takeError(vm, JS_GetException(c)); return false; }
  }
}
void sendEvent(Vm* vm, int32_t kind, int32_t id, const std::string& json) {
  if (!onEventCb) return;
  ZnVal v[4];
  v[0].i = vm->h; v[1].i = kind; v[2].i = id;
  v[3].s.p = json.c_str(); v[3].s.n = static_cast<uint32_t>(json.size());
  H->cb_call(onEventCb, v, 4, nullptr);
}
// A limit stopped the jobs of an entry: the promises they were settling never will, so every pending async result rejects with that error.
void rejectPending(Vm* vm) {
  vm->cut = false;
  std::vector<int32_t> ids;
  ids.swap(vm->pending);
  for (int32_t id : ids) sendEvent(vm, 2, id, vm->err);
}
struct Entry {
  Vm* vm;
  explicit Entry(Vm* v) : vm(v) {
    if (vm->depth++ == 0) {
      vm->deadline = vm->limitMs > 0 ? monoMs() + vm->limitMs : 0;
      vm->interrupted = false;
      vm->stopped = false;
      JS_UpdateStackTop(vm->rt);
    }
  }
  bool finish() { return vm->depth > 1 || pump(vm); }   // ends the entry's work: pumps jobs when outermost
  ~Entry() {
    if (vm->depth == 1 && vm->cut) rejectPending(vm);
    if (--vm->depth == 0 && vm->closing) freeVm(vm);
  }
};

// Consumes v: success -> result, exception -> error.
bool settleValue(Vm* vm, Entry& en, JSValue v) {
  if (JS_IsException(v)) { takeError(vm, JS_GetException(vm->ctx)); en.finish(); return false; }
  std::string json;
  bool ok = toJson(vm, v, json);
  JS_FreeValue(vm->ctx, v);
  if (!ok) { takeError(vm, JS_GetException(vm->ctx)); return false; }
  if (!en.finish()) return false;
  vm->result = json;
  return true;
}

JSValue settleCb(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst* data) {
  Vm* vm = static_cast<Vm*>(JS_GetContextOpaque(ctx));
  int32_t id = JS_VALUE_GET_INT(data[0]);
  size_t at = 0;
  while (at < vm->pending.size() && vm->pending[at] != id) ++at;
  if (at == vm->pending.size()) return JS_UNDEFINED;   // already rejected by a limit
  vm->pending.erase(vm->pending.begin() + static_cast<long>(at));
  JSValueConst x = argc > 0 ? argv[0] : JS_UNDEFINED;
  std::string json;
  if (magic == 1) {
    if (!toJson(vm, x, json)) { takeError(vm, JS_GetException(ctx)); magic = 2; json = vm->err; }
  } else { takeError(vm, JS_DupValue(ctx, x)); json = vm->err; }
  sendEvent(vm, magic, id, json);
  return JS_UNDEFINED;
}
// Consumes v after an entry: a promise is followed (0 settled now, an id when pending), else like settleValue.
int32_t follow(Vm* vm, Entry& en, JSValue v) {
  if (JS_IsException(v) || !JS_IsPromise(v)) return settleValue(vm, en, v) ? 0 : -1;
  if (!en.finish()) { JS_FreeValue(vm->ctx, v); return -1; }
  JSContext* ctx = vm->ctx;
  JSPromiseStateEnum st = JS_PromiseState(ctx, v);
  if (st == JS_PROMISE_FULFILLED) { JSValue r = JS_PromiseResult(ctx, v); JS_FreeValue(ctx, v); return settleValue(vm, en, r) ? 0 : -1; }
  if (st == JS_PROMISE_REJECTED) { JS_PromiseMarkAsHandled(ctx, v); takeError(vm, JS_PromiseResult(ctx, v)); JS_FreeValue(ctx, v); return -1; }
  int32_t id = ++vm->nextId;
  vm->pending.push_back(id);
  JSValue data = JS_NewInt32(ctx, id);
  JSValue ok = JS_NewCFunctionData(ctx, settleCb, 1, 1, 1, &data), fail = JS_NewCFunctionData(ctx, settleCb, 1, 2, 1, &data);
  JS_FreeValue(ctx, JS_PromiseThen(ctx, v, ok, fail));
  JS_FreeValue(ctx, ok); JS_FreeValue(ctx, fail); JS_FreeValue(ctx, v);
  return id;
}

// ---------------------------------------------------------------- host functions
// The script's arguments as one JSON array text.
bool argsJson(Vm* vm, int argc, JSValueConst* argv, std::string& out) {
  JSContext* ctx = vm->ctx;
  JSValue arr = JS_NewArray(ctx);
  for (int i = 0; i < argc; ++i) JS_SetPropertyUint32(ctx, arr, static_cast<uint32_t>(i), JS_DupValue(ctx, argv[i]));
  bool ok = toJson(vm, arr, out);
  JS_FreeValue(ctx, arr);
  return ok;
}
// A failed callback (the Zinc function threw) becomes an Error of the same message in the script.
JSValue rethrow(JSContext* ctx) {
  const char* m = H->cb_error ? H->cb_error() : "";
  JSValue err = JS_NewError(ctx);
  std::string msg = m && *m ? m : "the host function failed", name = "Error";
  size_t colon = msg.find(": ");
  if (msg.compare(0, 9, "Uncaught ") == 0) msg = msg.substr(9);
  colon = msg.find(": ");
  if (colon != std::string::npos && colon < 24 && msg.compare(colon - 5 < msg.size() ? colon - 5 : 0, 5, "Error") == 0) { name = msg.substr(0, colon); msg = msg.substr(colon + 2); }
  JS_SetPropertyStr(ctx, err, "message", JS_NewStringLen(ctx, msg.data(), msg.size()));
  if (name != "Error") JS_SetPropertyStr(ctx, err, "name", JS_NewStringLen(ctx, name.data(), name.size()));
  return JS_Throw(ctx, err);
}
JSValue hostCall(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst*) {
  Vm* vm = static_cast<Vm*>(JS_GetContextOpaque(ctx));
  std::string json;
  if (!argsJson(vm, argc, argv, json)) return JS_EXCEPTION;
  ZnVal v, r;
  v.s.p = json.c_str(); v.s.n = static_cast<uint32_t>(json.size());
  r.u = 0;
  if (H->cb_call(vm->fns[static_cast<size_t>(magic)], &v, 1, &r) != 0) return rethrow(ctx);
  return fromJson(vm, r.s.p, r.s.n);
}
JSValue hostAsync(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst*) {
  Vm* vm = static_cast<Vm*>(JS_GetContextOpaque(ctx));
  std::string json;
  if (!argsJson(vm, argc, argv, json)) return JS_EXCEPTION;
  JSValue fns[2];
  JSValue p = JS_NewPromiseCapability(ctx, fns);
  if (JS_IsException(p)) return p;
  int32_t id = ++vm->nextId;
  vm->calls.push_back(Call{id, fns[0], fns[1]});
  ZnVal v[2];
  v[0].i = id;
  v[1].s.p = json.c_str(); v[1].s.n = static_cast<uint32_t>(json.size());
  if (H->cb_call(vm->asyncFns[static_cast<size_t>(magic)], v, 2, nullptr) != 0) { JS_FreeValue(ctx, p); return rethrow(ctx); }
  return p;
}
void defineFn(Vm* vm, const std::string& name, JSCFunctionData* fn, int magic) {
  JSValue f = JS_NewCFunctionData2(vm->ctx, fn, name.c_str(), 0, magic, 0, nullptr);
  JSValue g = JS_GetGlobalObject(vm->ctx);
  JS_SetPropertyStr(vm->ctx, g, name.c_str(), f);
  JS_FreeValue(vm->ctx, g);
}

// ---------------------------------------------------------------- modules
JSModuleDef* moduleLoader(JSContext* ctx, const char* name, void*) {
  Vm* vm = static_cast<Vm*>(JS_GetContextOpaque(ctx));
  std::string src;
  bool have = false;
  for (const Mod& m : vm->mods) if (m.name == name) { src = m.src; have = true; break; }
  if (!have && vm->resolver) {
    ZnVal a, r;
    a.s.p = name; a.s.n = static_cast<uint32_t>(strlen(name));
    r.u = 0;
    if (H->cb_call(vm->resolver, &a, 1, &r) == 0 && r.s.n) { src.assign(r.s.p, r.s.n); have = true; }
  }
  if (!have) { JS_ThrowReferenceError(ctx, "could not load module '%s'", name); return nullptr; }
  JSValue f = JS_Eval(ctx, src.c_str(), src.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(f)) return nullptr;
  JSModuleDef* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(f));
  JS_FreeValue(ctx, f);
  return m;
}
// A global, else an export of a loaded module (latest first); undefined if none.
JSValue lookup(Vm* vm, const std::string& name) {
  JSValue g = JS_GetGlobalObject(vm->ctx);
  JSValue f = JS_GetPropertyStr(vm->ctx, g, name.c_str());
  JS_FreeValue(vm->ctx, g);
  for (size_t i = vm->ns.size(); i-- > 0 && JS_IsUndefined(f);) f = JS_GetPropertyStr(vm->ctx, vm->ns[i], name.c_str());
  return f;
}

void freeVm(Vm* vm) {
  JSContext* ctx = vm->ctx;
  for (JSValue r : vm->refs) if (!JS_IsUninitialized(r)) JS_FreeValue(ctx, r);
  for (Call& c : vm->calls) { JS_FreeValue(ctx, c.resolve); JS_FreeValue(ctx, c.reject); }
  for (JSValue n : vm->ns) JS_FreeValue(ctx, n);
  for (uint64_t cb : vm->fns) H->cb_release(cb);
  for (uint64_t cb : vm->asyncFns) H->cb_release(cb);
  if (vm->resolver) H->cb_release(vm->resolver);
  JS_FreeContext(ctx);
  JS_FreeRuntime(vm->rt);
  vms[vm->h] = nullptr;
  delete vm;
}

// ---------------------------------------------------------------- exports
using Args = const ZnVal*;
std::string str(const ZnVal& v) { return std::string(v.s.p, v.s.n); }
int32_t ok(ZnVal* r, bool b) { r->i = b ? 1 : 0; return ZN_OK; }
int32_t giveStr(ZnCtx* cx, ZnVal* r, const std::string& s) { r->s = H->ret_str(cx, s.data(), static_cast<uint32_t>(s.size())); return ZN_OK; }

int32_t qCreate(void*, ZnCtx*, Args a, ZnVal* r) {
  int h = 0;
  while (h < kMaxVm && vms[h]) ++h;
  r->i = -1;
  if (h == kMaxVm) return ZN_OK;
  JSRuntime* rt = JS_NewRuntime();
  if (!rt) return ZN_OK;
  if (a[0].d > 0) JS_SetMemoryLimit(rt, static_cast<size_t>(a[0].d));
  if (a[2].d > 0) JS_SetMaxStackSize(rt, static_cast<size_t>(a[2].d));
  JSContext* ctx = JS_NewContext(rt);
  if (!ctx) { JS_FreeRuntime(rt); return ZN_OK; }
  Vm* vm = new Vm();
  vm->h = h; vm->rt = rt; vm->ctx = ctx; vm->limitMs = a[1].d; vm->memLimit = a[0].d;
  JS_SetContextOpaque(ctx, vm);
  JS_SetInterruptHandler(rt, interruptHandler, vm);
  JS_SetModuleLoaderFunc(rt, nullptr, moduleLoader, vm);
  vms[h] = vm;
  r->i = h;
  return ZN_OK;
}
int32_t qDestroy(void*, ZnCtx*, Args a, ZnVal*) {
  Vm* vm = vmOf(a[0].i);
  if (!vm) return ZN_OK;
  if (vm->depth > 0) vm->closing = true;   // freed when the running entry returns
  else freeVm(vm);
  return ZN_OK;
}
int32_t evalGlobal(Args a, ZnVal* r, bool async) {
  Vm* vm = vmOf(a[0].i);
  if (!vm) { r->i = async ? -1 : 0; return ZN_OK; }
  Entry en(vm);
  std::string src = str(a[1]), file = str(a[2]);
  JSValue v = JS_Eval(vm->ctx, src.c_str(), src.size(), file.c_str(), JS_EVAL_TYPE_GLOBAL);
  if (async) r->i = follow(vm, en, v); else r->i = settleValue(vm, en, v) ? 1 : 0;
  return ZN_OK;
}
int32_t qEval(void*, ZnCtx*, Args a, ZnVal* r) { return evalGlobal(a, r, false); }
int32_t qEvalAsync(void*, ZnCtx*, Args a, ZnVal* r) { return evalGlobal(a, r, true); }
int32_t qDefine(void*, ZnCtx*, Args a, ZnVal*) { if (Vm* vm = vmOf(a[0].i)) vm->mods.push_back(Mod{str(a[1]), str(a[2])}); return ZN_OK; }
int32_t qResolver(void*, ZnCtx*, Args a, ZnVal*) {
  if (Vm* vm = vmOf(a[0].i)) { if (vm->resolver) H->cb_release(vm->resolver); vm->resolver = H->cb_retain(a[1].h); }
  return ZN_OK;
}
int32_t qLoad(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = 0;
  if (!vm) return ZN_OK;
  Entry en(vm);
  JSContext* ctx = vm->ctx;
  std::string src = str(a[2]), name = str(a[1]);
  JSValue f = JS_Eval(ctx, src.c_str(), src.size(), name.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(f)) { r->i = settleValue(vm, en, f) ? 1 : 0; return ZN_OK; }
  JSModuleDef* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(f));
  if (follow(vm, en, JS_EvalFunction(ctx, f)) < 0) return ZN_OK;   // module evaluation returns a promise
  vm->ns.push_back(JS_GetModuleNamespace(ctx, m));
  vm->result.clear();
  r->i = 1;
  return ZN_OK;
}
// Calls f (a function value, consumed) with the JSON array of arguments.
JSValue invoke(Vm* vm, JSValue f, const std::string& name, const std::string& argsText) {
  JSContext* ctx = vm->ctx;
  if (!JS_IsFunction(ctx, f)) { JS_FreeValue(ctx, f); return JS_ThrowTypeError(ctx, "%s is not a function", name.c_str()); }
  JSValue arr = fromJson(vm, argsText.data(), argsText.size());
  if (JS_IsException(arr)) { JS_FreeValue(ctx, f); return arr; }
  std::vector<JSValue> av;
  int64_t n = 0;
  if (JS_IsArray(arr)) JS_GetLength(ctx, arr, &n);
  for (int64_t i = 0; i < n; ++i) av.push_back(JS_GetPropertyInt64(ctx, arr, static_cast<uint32_t>(i)));
  JSValue res = JS_Call(ctx, f, JS_UNDEFINED, static_cast<int>(av.size()), av.data());
  for (JSValue x : av) JS_FreeValue(ctx, x);
  JS_FreeValue(ctx, arr);
  JS_FreeValue(ctx, f);
  return res;
}
int32_t qCall(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = 0;
  if (!vm) return ZN_OK;
  Entry en(vm);
  std::string name = str(a[1]);
  r->i = settleValue(vm, en, invoke(vm, lookup(vm, name), name, str(a[2]))) ? 1 : 0;
  return ZN_OK;
}
int32_t qCallAsync(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = -1;
  if (!vm) return ZN_OK;
  Entry en(vm);
  std::string name = str(a[1]);
  r->i = follow(vm, en, invoke(vm, lookup(vm, name), name, str(a[2])));
  return ZN_OK;
}
int32_t qCallRef(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = 0;
  if (!vm) return ZN_OK;
  int64_t ref = a[1].i;
  if (ref < 0 || ref >= static_cast<int64_t>(vm->refs.size()) || JS_IsUninitialized(vm->refs[static_cast<size_t>(ref)])) { hostError(vm, "TypeError", "released function handle"); return ZN_OK; }
  Entry en(vm);
  r->i = settleValue(vm, en, invoke(vm, JS_DupValue(vm->ctx, vm->refs[static_cast<size_t>(ref)]), "function", str(a[2]))) ? 1 : 0;
  return ZN_OK;
}
int32_t qRefNamed(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = -1;
  if (!vm) return ZN_OK;
  Entry en(vm);
  JSValue f = lookup(vm, str(a[1]));
  r->i = JS_IsFunction(vm->ctx, f) ? refAdd(vm, f) : -1;
  if (JS_IsException(f)) JS_FreeValue(vm->ctx, JS_GetException(vm->ctx));
  JS_FreeValue(vm->ctx, f);
  return ZN_OK;
}
int32_t qRefValue(void*, ZnCtx*, Args a, ZnVal* r) {   // a function value sent out as {"__zn_fn": n}: a new handle on the same function
  Vm* vm = vmOf(a[0].i);
  r->i = -1;
  if (!vm) return ZN_OK;
  JSValue v = fromJson(vm, a[1].s.p, a[1].s.n);
  if (JS_IsFunction(vm->ctx, v)) r->i = refAdd(vm, v);
  if (JS_IsException(v)) JS_FreeValue(vm->ctx, JS_GetException(vm->ctx));
  JS_FreeValue(vm->ctx, v);
  return ZN_OK;
}
int32_t qUnref(void*, ZnCtx*, Args a, ZnVal*) { if (Vm* vm = vmOf(a[0].i)) refDrop(vm, a[1].i); return ZN_OK; }
int32_t qSet(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = 0;
  if (!vm) return ZN_OK;
  Entry en(vm);
  JSValue x = fromJson(vm, a[2].s.p, a[2].s.n);
  if (JS_IsException(x)) { r->i = settleValue(vm, en, x) ? 1 : 0; return ZN_OK; }
  std::string name = str(a[1]);
  JSValue g = JS_GetGlobalObject(vm->ctx);
  int rc = JS_SetPropertyStr(vm->ctx, g, name.c_str(), x);
  JS_FreeValue(vm->ctx, g);
  r->i = settleValue(vm, en, rc < 0 ? JS_EXCEPTION : JS_UNDEFINED) ? 1 : 0;
  return ZN_OK;
}
int32_t qGet(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->i = 0;
  if (!vm) return ZN_OK;
  Entry en(vm);
  JSValue g = JS_GetGlobalObject(vm->ctx);
  JSValue v = JS_GetPropertyStr(vm->ctx, g, str(a[1]).c_str());
  JS_FreeValue(vm->ctx, g);
  r->i = settleValue(vm, en, v) ? 1 : 0;
  return ZN_OK;
}
int32_t qResult(void*, ZnCtx* cx, Args a, ZnVal* r) { Vm* vm = vmOf(a[0].i); return giveStr(cx, r, vm ? vm->result : std::string()); }
int32_t qError(void*, ZnCtx* cx, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  return giveStr(cx, r, vm ? vm->err : errorInfo("host", "Error", "zinc:script: the script was disposed", "", 0, ""));
}
int32_t qExpose(void*, ZnCtx*, Args a, ZnVal*) {
  Vm* vm = vmOf(a[0].i);
  if (!vm) return ZN_OK;
  vm->fns.push_back(H->cb_retain(a[2].h));
  defineFn(vm, str(a[1]), hostCall, static_cast<int>(vm->fns.size() - 1));
  return ZN_OK;
}
int32_t qExposeAsync(void*, ZnCtx*, Args a, ZnVal*) {
  Vm* vm = vmOf(a[0].i);
  if (!vm) return ZN_OK;
  vm->asyncFns.push_back(H->cb_retain(a[2].h));
  defineFn(vm, str(a[1]), hostAsync, static_cast<int>(vm->asyncFns.size() - 1));
  return ZN_OK;
}
int32_t qSettle(void*, ZnCtx*, Args a, ZnVal*) {   // settle(h, id, ok, value json, message): a host async function finished
  Vm* vm = vmOf(a[0].i);
  if (!vm) return ZN_OK;
  size_t i = 0;
  while (i < vm->calls.size() && vm->calls[i].id != a[1].i) ++i;
  if (i == vm->calls.size()) return ZN_OK;
  Call c = vm->calls[i];
  vm->calls.erase(vm->calls.begin() + static_cast<long>(i));
  JSContext* ctx = vm->ctx;
  Entry en(vm);
  bool good = a[2].i != 0;
  JSValue arg;
  if (good) arg = fromJson(vm, a[3].s.p, a[3].s.n);
  else {   // value carries the error's name as a JSON string, message its text
    arg = JS_NewError(ctx);
    std::string msg = str(a[4]);
    JS_SetPropertyStr(ctx, arg, "message", JS_NewStringLen(ctx, msg.data(), msg.size()));
    std::string nameJson = str(a[3]);
    if (nameJson.size() > 2 && nameJson != "\"Error\"") { JSValue nv = JS_ParseJSON(ctx, nameJson.data(), nameJson.size(), "<host>"); if (!JS_IsException(nv)) JS_SetPropertyStr(ctx, arg, "name", nv); }
  }
  if (JS_IsException(arg)) { arg = JS_GetException(ctx); good = false; }
  JSValue res = JS_Call(ctx, good ? c.resolve : c.reject, JS_UNDEFINED, 1, &arg);
  JS_FreeValue(ctx, arg); JS_FreeValue(ctx, res); JS_FreeValue(ctx, c.resolve); JS_FreeValue(ctx, c.reject);
  en.finish();   // a job that hits a limit here has no caller to report to; it stays in vm->err
  return ZN_OK;
}
int32_t qInterrupt(void*, ZnCtx*, Args a, ZnVal*) { if (Vm* vm = vmOf(a[0].i)) vm->interrupted = true; return ZN_OK; }
int32_t qMemoryUsed(void*, ZnCtx*, Args a, ZnVal* r) {
  Vm* vm = vmOf(a[0].i);
  r->d = 0;
  if (!vm) return ZN_OK;
  JSMemoryUsage u;
  JS_ComputeMemoryUsage(vm->rt, &u);
  r->d = static_cast<double>(u.malloc_size);
  return ZN_OK;
}
int32_t qOnEvent(void*, ZnCtx*, Args a, ZnVal*) { if (onEventCb) H->cb_release(onEventCb); onEventCb = H->cb_retain(a[0].h); return ZN_OK; }

const ZnExport kExports[] = {
  {"create", "ddd>i", qCreate, 0}, {"destroy", "i>n", qDestroy, 0}, {"eval", "iss>b", qEval, 0}, {"evalAsync", "iss>i", qEvalAsync, 0}, {"define", "iss>n", qDefine, 0},
  {"resolver", "ic(s>s)>n", qResolver, 0}, {"load", "iss>b", qLoad, 0}, {"call", "iss>b", qCall, 0}, {"callAsync", "iss>i", qCallAsync, 0}, {"callRef", "iis>b", qCallRef, 0},
  {"refNamed", "is>i", qRefNamed, 0}, {"refValue", "is>i", qRefValue, 0}, {"unref", "ii>n", qUnref, 0}, {"set", "iss>b", qSet, 0}, {"get", "is>b", qGet, 0},
  {"result", "i>s", qResult, 0}, {"error", "i>s", qError, 0}, {"expose", "isc(s>s)>n", qExpose, 0}, {"exposeAsync", "isc(is>n)>n", qExposeAsync, 0},
  {"settle", "iibss>n", qSettle, 0}, {"interrupt", "i>n", qInterrupt, 0}, {"memoryUsed", "i>d", qMemoryUsed, 0}, {"onEvent", "c(iiis>n)>n", qOnEvent, 0}};

int32_t qInit(const ZnHostApi* host, void** self) {
  H = host;
  *self = nullptr;
  zn_lre_delegate(qjs_lre_realloc, qjs_lre_check_timeout, qjs_lre_check_stack_overflow);
  return ZN_OK;
}
void qShutdown(void*) {
  for (int i = 0; i < kMaxVm; ++i) if (vms[i]) { vms[i]->depth = 0; freeVm(vms[i]); }
  if (onEventCb) { H->cb_release(onEventCb); onEventCb = 0; }
}

}  // namespace

extern "C" const ZnModule* zn_module_QuickJS(void) {
  static ZnModule m;
  m.abi = ZN_ABI_VERSION;
  m.size = static_cast<uint32_t>(sizeof m);
  m.name = "QuickJS";
  m.exports = kExports;
  m.nexports = static_cast<uint32_t>(sizeof kExports / sizeof kExports[0]);
  m.init = qInit;
  m.shutdown = qShutdown;
  return &m;
}
