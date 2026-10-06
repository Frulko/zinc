#include "qjs/qjs.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <unistd.h>
#include <vector>

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "frontend/modules.h"
#include "qjs/strip.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace zn::qjs {
namespace {

struct Engine {
  JSRuntime* rt = nullptr;
  JSContext* ctx = nullptr;
  std::string stdRoot;
};

bool readFile(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}
bool endsWith(const std::string& s, const char* suffix) { std::size_t n = std::strlen(suffix); return s.size() >= n && s.compare(s.size() - n, n, suffix) == 0; }

std::string dirOf(const std::string& p) { auto k = p.find_last_of('/'); return k == std::string::npos ? "" : p.substr(0, k); }
std::string normalize(const std::string& p) {
  std::vector<std::string> parts;
  std::stringstream ss(p);
  std::string seg;
  bool abs = !p.empty() && p[0] == '/';
  while (std::getline(ss, seg, '/')) {
    if (seg.empty() || seg == ".") continue;
    if (seg == ".." && !parts.empty() && parts.back() != "..") parts.pop_back(); else parts.push_back(seg);
  }
  std::string r = abs ? "/" : "";
  for (std::size_t i = 0; i < parts.size(); ++i) r += (i ? "/" : "") + parts[i];
  return r;
}

// ---- the host calls, generated from the runtime table: one JS function per `host.*` row, its arguments decoded by the row's letters
using zn::host::HostArg;

JSValue hostFn(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic) {
  const auto id = static_cast<zn::Rt>(magic);
  const zn::RtInfo& ri = zn::rtInfo(id);
  const bool sys = id >= zn::Rt::HostSysFirst;
  if (id == zn::Rt::HostSysWrite || id == zn::Rt::HostSysWriteErr || id == zn::Rt::HostSysExit) {
    if (id == zn::Rt::HostSysExit) {
      int32_t code = 0;
      if (argc > 0) JS_ToInt32(ctx, &code, argv[0]);
      std::fflush(stdout);
      std::exit(code);
    }
    size_t n = 0;
    const char* p = argc > 0 ? JS_ToCStringLen(ctx, &n, argv[0]) : nullptr;
    if (p) { std::fwrite(p, 1, n, id == zn::Rt::HostSysWrite ? stdout : stderr); JS_FreeCString(ctx, p); }
    return JS_UNDEFINED;
  }
  zn::host::HostCall call = sys ? zn::host::hostSys : zn::host::hostGfx;
  if (!call) return JS_ThrowInternalError(ctx, "%s is not available in this build", ri.name);
  HostArg args[12], res;
  std::vector<std::string> strings;
  std::vector<std::vector<std::uint64_t>> arrays;
  strings.reserve(12); arrays.reserve(12);
  const unsigned np = zn::rtParamCount(ri);
  for (unsigned k = 0; k < np && k < 12; ++k) {
    JSValueConst v = static_cast<int>(k) < argc ? argv[k] : JS_UNDEFINED;
    HostArg& h = args[k];
    switch (zn::rtParam(ri, k)) {
      case 'd': { double d = 0; JS_ToFloat64(ctx, &d, v); h.d = d; break; }
      case 's': {
        size_t n = 0;
        const char* p = JS_ToCStringLen(ctx, &n, v);
        if (!p) return JS_EXCEPTION;
        strings.emplace_back(p, n);
        JS_FreeCString(ctx, p);
        h.p = strings.back().data(); h.n = static_cast<std::uint32_t>(n);
        break;
      }
      case 'D': case 'B': {
        JSValue len = JS_GetPropertyStr(ctx, v, "length");
        int32_t n = 0;
        JS_ToInt32(ctx, &n, len);
        JS_FreeValue(ctx, len);
        arrays.emplace_back(static_cast<size_t>(n < 0 ? 0 : n));
        for (int32_t i = 0; i < n; ++i) {
          JSValue e = JS_GetPropertyUint32(ctx, v, static_cast<uint32_t>(i));
          double d = 0;
          JS_ToFloat64(ctx, &d, e);
          JS_FreeValue(ctx, e);
          if (zn::rtParam(ri, k) == 'D') std::memcpy(&arrays.back()[static_cast<size_t>(i)], &d, 8);
          else arrays.back()[static_cast<size_t>(i)] = static_cast<std::uint64_t>(static_cast<std::int64_t>(d)) & 0xFF;
        }
        h.p = arrays.back().data(); h.n = static_cast<std::uint32_t>(n);
        break;
      }
      case 'u': { double d = 0; JS_ToFloat64(ctx, &d, v); h.i = static_cast<std::int64_t>(static_cast<std::uint32_t>(static_cast<std::int64_t>(d))); break; }
      case 'b': h.i = JS_ToBool(ctx, v) ? 1 : 0; break;
      default: { int32_t i = 0; JS_ToInt32(ctx, &i, v); h.i = i; break; }
    }
  }
  call(static_cast<int>(id), args, &res);
  switch (zn::rtRet(ri)) {
    case 'd': return JS_NewFloat64(ctx, res.d);
    case 'i': return JS_NewInt32(ctx, static_cast<int32_t>(res.i));
    case 'b': return JS_NewBool(ctx, res.i != 0);
    case 's': return JS_NewStringLen(ctx, static_cast<const char*>(res.p), res.n);
    default: return JS_UNDEFINED;
  }
}

void installHost(JSContext* ctx) {
  JSValue g = JS_GetGlobalObject(ctx);
  for (unsigned i = static_cast<unsigned>(zn::Rt::HostGfxFrames); i < static_cast<unsigned>(zn::Rt::HostHostLast); ++i) {
    const zn::RtInfo& ri = zn::kRtInfo[i];
    std::string name = std::string("__host_") + zn::rtMember(ri);
    JS_SetPropertyStr(ctx, g, name.c_str(), JS_NewCFunctionMagic(ctx, hostFn, name.c_str(), static_cast<int>(zn::rtParamCount(ri)), JS_CFUNC_generic_magic, static_cast<int>(i)));
  }
  JS_FreeValue(ctx, g);
}

// ---- modules
// zinc:gfx brings its own frame loop (the C++ one below): the API part of the Zinc module follows the marker line.
std::string gfxSource() {
  const char* full = zn::frontend::builtinModuleSource("zinc:gfx");
  std::string s = full ? full : "";
  auto at = s.find("// ---- api");
  std::string api = at == std::string::npos ? "" : s.substr(at);
  return "let __frameCb = null;\n"
         "export function onFrame(cb) { __frameCb = cb; globalThis.__zincFrameCb = cb; }\n"
         "export function frame() { return globalThis.__zincFrameNo | 0; }\n" + api;
}

bool moduleText(Engine& e, const std::string& name, std::string& js, std::string& err) {
  std::string src, path = name;
  if (name.rfind("zinc:", 0) == 0) {
    if (name == "zinc:gfx") src = gfxSource();
    else if (const char* b = zn::frontend::builtinModuleSource(name)) src = b;
    else {
      std::string_view f = zn::frontend::stdModuleFile(name);
      if (f.empty() || e.stdRoot.empty()) { err = "cannot find module '" + name + "'"; return false; }
      path = e.stdRoot + "/" + std::string(f);
      if (!readFile(path, src)) { err = "cannot read " + path; return false; }
    }
  } else if (!readFile(path, src)) { err = "cannot load module " + name; return false; }
  if (endsWith(path, ".tsx")) { err = path + ": JSX needs the typed engine (zinc run)"; return false; }
  if (name.rfind("zinc:", 0) == 0 || endsWith(path, ".ts")) return stripTypes(src, name, js, err);
  js = std::move(src);
  return true;
}

char* normalizeName(JSContext* ctx, const char* base, const char* name, void*) {
  std::string n = name;
  std::string r = n;
  if (n.rfind("zinc:", 0) != 0 && (n.rfind("./", 0) == 0 || n.rfind("../", 0) == 0)) {
    r = normalize(dirOf(base) + "/" + n);
    std::string probe;
    for (const char* ext : {"", ".ts", ".js", ".mjs", "/index.ts"}) {
      std::ifstream f(r + ext);
      if (f) { r += ext; break; }
    }
  }
  char* out = static_cast<char*>(js_malloc(ctx, r.size() + 1));
  std::memcpy(out, r.c_str(), r.size() + 1);
  return out;
}

JSModuleDef* loadModule(JSContext* ctx, const char* name, void* opaque) {
  auto* e = static_cast<Engine*>(opaque);
  std::string js, err;
  if (!moduleText(*e, name, js, err)) { JS_ThrowReferenceError(ctx, "%s", err.c_str()); return nullptr; }
  JSValue v = JS_Eval(ctx, js.data(), js.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(v)) return nullptr;
  auto* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(v));
  JS_FreeValue(ctx, v);
  return m;
}

// ---- running
void report(JSContext* ctx, JSValue ex) {
  const char* s = JS_ToCString(ctx, ex);
  JSValue st = JS_GetPropertyStr(ctx, ex, "stack");
  const char* stack = JS_IsUndefined(st) ? nullptr : JS_ToCString(ctx, st);
  std::fflush(stdout);
  std::fprintf(stderr, "Uncaught %s\n%s", s ? s : "exception", stack ? stack : "");
  if (stack) JS_FreeCString(ctx, stack);
  JS_FreeValue(ctx, st);
  if (s) JS_FreeCString(ctx, s);
}

// Runs the pending promise jobs; false (the error printed) if one throws.
bool drain(Engine& e) {
  for (;;) {
    JSContext* c = nullptr;
    int r = JS_ExecutePendingJob(e.rt, &c);
    if (r == 0) return true;
    if (r < 0) { JSValue ex = JS_GetException(c); report(c, ex); JS_FreeValue(c, ex); return false; }
  }
}

bool callFn(Engine& e, JSValueConst f, JSValueConst arg, bool hasArg) {
  JSValue r = JS_Call(e.ctx, f, JS_UNDEFINED, hasArg ? 1 : 0, hasArg ? &arg : nullptr);
  if (JS_IsException(r)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return false; }
  JS_FreeValue(e.ctx, r);
  return drain(e);
}

JSValue global(Engine& e, const char* name) { JSValue g = JS_GetGlobalObject(e.ctx); JSValue v = JS_GetPropertyStr(e.ctx, g, name); JS_FreeValue(e.ctx, g); return v; }

void hostCall(zn::Rt id, HostArg* r, const HostArg* a = nullptr) { (id >= zn::Rt::HostSysFirst ? zn::host::hostSys : zn::host::hostGfx)(static_cast<int>(id), a, r); }

// the frame loop of a zinc:gfx program: poll, clock, due timers, begin, the callback, end (what the typed engine's __gfxLoop does)
bool frameLoop(Engine& e) {
  HostArg r;
  hostCall(zn::Rt::HostGfxFrames, &r);
  const long frames = static_cast<long>(r.i);
  JSValue setClock = global(e, "__setClock"), due = global(e, "__dueTimer"), cb = global(e, "__zincFrameCb"), clockFn = global(e, "__clock");
  double clock = 0;
  bool ok = true;
  for (long f = 0; f < frames && ok; ++f) {
    hostCall(zn::Rt::HostGfxPoll, &r);
    double dt = r.d;
    clock += dt * 1000;
    JSValue cv = JS_NewFloat64(e.ctx, clock);
    JS_FreeValue(e.ctx, JS_Call(e.ctx, setClock, JS_UNDEFINED, 1, &cv));
    JS_FreeValue(e.ctx, cv);
    for (;;) {  // timers due at the new clock fire in order of time then creation
      JSValue now = JS_NewFloat64(e.ctx, clock);
      JSValue fn = JS_Call(e.ctx, due, JS_UNDEFINED, 1, &now);
      JS_FreeValue(e.ctx, now);
      if (JS_IsNull(fn) || JS_IsException(fn)) { JS_FreeValue(e.ctx, fn); break; }
      ok = callFn(e, fn, JS_UNDEFINED, false);
      JS_FreeValue(e.ctx, fn);
      if (!ok) break;
    }
    if (!ok) break;
    hostCall(zn::Rt::HostGfxBegin, &r);
    if (JS_IsFunction(e.ctx, cb)) { JSValue dv = JS_NewFloat64(e.ctx, dt); ok = callFn(e, cb, dv, true); JS_FreeValue(e.ctx, dv); }
    hostCall(zn::Rt::HostGfxEnd, &r);
    JSValue g = JS_GetGlobalObject(e.ctx);
    JS_SetPropertyStr(e.ctx, g, "__zincFrameNo", JS_NewInt32(e.ctx, static_cast<int32_t>(f + 1)));
    JS_FreeValue(e.ctx, g);
    hostCall(zn::Rt::HostGfxShouldQuit, &r);
    if (r.i) break;
  }
  hostCall(zn::Rt::HostGfxFinish, &r);
  JS_FreeValue(e.ctx, setClock); JS_FreeValue(e.ctx, due); JS_FreeValue(e.ctx, cb); JS_FreeValue(e.ctx, clockFn);
  return ok;
}

// no frame loop: timers in order, the clock jumping to each
bool timerLoop(Engine& e) {
  JSValue next = global(e, "__nextTimer");
  bool ok = true;
  while (ok) {
    JSValue fn = JS_Call(e.ctx, next, JS_UNDEFINED, 0, nullptr);
    if (JS_IsNull(fn) || JS_IsException(fn)) { JS_FreeValue(e.ctx, fn); break; }
    ok = callFn(e, fn, JS_UNDEFINED, false);
    JS_FreeValue(e.ctx, fn);
  }
  JS_FreeValue(e.ctx, next);
  return ok;
}

}  // namespace

int run(const Options& o) {
  Engine e;
  e.stdRoot = o.stdRoot;
  e.rt = JS_NewRuntime();
  e.ctx = JS_NewContext(e.rt);
  JS_SetMemoryLimit(e.rt, 0);
  JS_SetMaxStackSize(e.rt, 8u << 20);
  JS_SetModuleLoaderFunc(e.rt, normalizeName, loadModule, &e);
  installHost(e.ctx);
  JSValue pre = JS_Eval(e.ctx, kPrelude, std::strlen(kPrelude), "<prelude>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(pre)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); return 101; }
  JS_FreeValue(e.ctx, pre);

  std::string entry = o.entry;
  if (!entry.empty() && entry[0] != '/') { char b[4096]; if (getcwd(b, sizeof b)) entry = normalize(std::string(b) + "/" + entry); }
  int rc = 0;
  std::string js, err;
  if (!moduleText(e, entry, js, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 101; }
  JSValue mod = JS_Eval(e.ctx, js.data(), js.size(), entry.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(mod)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return 101; }
  JSValue res = JS_EvalFunction(e.ctx, mod);  // links the imports through the loader, then runs; a promise (top-level await)
  if (JS_IsException(res)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); rc = 101; }
  else {
    bool ok = drain(e);
    if (ok && JS_PromiseState(e.ctx, res) == JS_PROMISE_REJECTED) { JSValue ex = JS_PromiseResult(e.ctx, res); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); ok = false; }
    JS_FreeValue(e.ctx, res);
    if (ok) {
      JSValue cb = global(e, "__zincFrameCb");
      bool gfx = JS_IsFunction(e.ctx, cb);
      JS_FreeValue(e.ctx, cb);
      ok = gfx ? frameLoop(e) : timerLoop(e);
    }
    if (!ok) rc = 101;
  }
  std::fflush(stdout);
  return rc;
}

}  // namespace zn::qjs
