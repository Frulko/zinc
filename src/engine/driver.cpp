// The driver of the engines beside QuickJS (ZN-773): a bundled program run over Node-API alone. It follows src/qjs/qjs.cpp's run step by step
// (the host rows generated from the runtime table, the prelude, the defines, the web environment, the promise jobs and the rejections nobody
// handled, the timers on the virtual clock, the frame loop of a zinc:gfx program), so a program behaves the same on every engine.
#include "engine/driver.h"

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include "mbedtls/base64.h"
#include "qjs/napi_util.h"
#include "qjs/qjs.h"
#include "zn/host.h"
#include "zn/log.h"
#include "zn/napi_table.h"
#include "zn/runtime.h"

namespace zn::text { void installIntlSegmenter(napi_env env); }   // src/text/segmenter_js.cpp

namespace zn::engine {
namespace {
using namespace zn::napi;
using zn::host::HostArg;

napi_value global(napi_env env, const char* name) {
  napi_value g, v;
  napi_get_global(env, &g);
  return napi_get_named_property(env, g, name, &v) == napi_ok ? v : undefined(env);
}
bool isFunction(napi_env env, napi_value v) { napi_valuetype t; return v && napi_typeof(env, v, &t) == napi_ok && t == napi_function; }

// ---- the host calls, one function per `host.*` row as in qjs.cpp: the row's index is the function's data
// A host row as hostFn reads it, worked out once by installHost: the signature's parameter count and return letter, and the table that serves it
struct Row { zn::Rt id; unsigned np; char ret; zn::host::HostCall* call; };
Row gRows[static_cast<unsigned>(zn::Rt::Count)];

napi_value hostFn(napi_env env, napi_callback_info info) {
  void* data = nullptr;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
  const Row& row = *static_cast<const Row*>(data);
  const zn::Rt id = row.id;
  const zn::RtInfo& ri = zn::rtInfo(id);
  const unsigned np = row.np;
  napi_value argv[zn::kMaxHostParams];
  std::size_t argc = np;   // in: the row's parameters (the missing ones undefined); out: how many the call passed
  if (np) napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (id == zn::Rt::HostSysWrite || id == zn::Rt::HostSysWriteErr || id == zn::Rt::HostSysExit) {
    if (id == zn::Rt::HostSysExit) { const std::int32_t code = argc > 0 ? i32(env, argv[0]) : 0; std::fflush(stdout); std::exit(code); }
    std::string s;
    if (argc > 0 && !zn::napi::text(env, argv[0], s)) return nullptr;
    std::fwrite(s.data(), 1, s.size(), id == zn::Rt::HostSysWrite ? stdout : stderr);
    return nullptr;
  }
  const zn::host::HostCall call = *row.call;
  if (!call) { napi_throw_error(env, nullptr, (std::string(ri.name) + " is not available in this build").c_str()); return nullptr; }
  HostArg args[zn::kMaxHostParams], res;
  struct Heavy { std::array<std::string, zn::kMaxHostParams> strings; std::array<std::vector<std::uint64_t>, zn::kMaxHostParams> arrays; };
  std::optional<Heavy> heavy;   // made only for a row with strings or arrays: a numeric row (most of zinc:gfx) pays no constructor
  for (unsigned k = 0; k < np; ++k) {
    napi_value v = argv[k];
    HostArg& h = args[k];
    switch (zn::rtParam(ri, k)) {
      case 'd': h.d = num(env, v); break;
      case 's': {
        std::string& str = (heavy ? *heavy : heavy.emplace()).strings[k];
        if (!zn::napi::text(env, v, str)) return nullptr;
        h.p = str.data(); h.n = static_cast<std::uint32_t>(str.size());
        break;
      }
      case 'D': case 'B': {
        std::vector<std::uint64_t>& arr = (heavy ? *heavy : heavy.emplace()).arrays[k];
        const bool bytes = zn::rtParam(ri, k) == 'B';
        bool typed = false;
        napi_typedarray_type tt;
        std::size_t tn = 0;
        void* data = nullptr;
        bool array = false;
        if (napi_is_array(env, v, &array) == napi_ok && array) {   // a u8[] / f64[]: the engine copies it into a typed array in one call, not one call per element
          napi_value global, ctor, copy;
          if (napi_get_global(env, &global) == napi_ok && napi_get_named_property(env, global, bytes ? "Uint8Array" : "Float64Array", &ctor) == napi_ok &&
              napi_new_instance(env, ctor, 1, &v, &copy) == napi_ok) v = copy;
        }
        if (napi_is_typedarray(env, v, &typed) == napi_ok && typed && napi_get_typedarray_info(env, v, &tt, &tn, &data, nullptr, nullptr) == napi_ok &&
            (bytes ? tt == napi_uint8_array || tt == napi_uint8_clamped_array : tt == napi_float64_array)) {   // an image's pixels: read in place
          arr.resize(tn);
          if (bytes) for (std::size_t i = 0; i < tn; ++i) arr[i] = static_cast<const std::uint8_t*>(data)[i];
          else if (tn) std::memcpy(arr.data(), data, tn * 8);
          h.p = arr.data(); h.n = static_cast<std::uint32_t>(tn);
          break;
        }
        napi_value len;
        const std::int32_t n = napi_get_named_property(env, v, "length", &len) == napi_ok ? i32(env, len) : 0;
        arr.assign(static_cast<std::size_t>(n < 0 ? 0 : n), 0);
        for (std::int32_t i = 0; i < n; ++i) {
          napi_value e;
          const double d = napi_get_element(env, v, static_cast<std::uint32_t>(i), &e) == napi_ok ? num(env, e) : 0;
          if (zn::rtParam(ri, k) == 'D') std::memcpy(&arr[static_cast<std::size_t>(i)], &d, 8);
          else arr[static_cast<std::size_t>(i)] = static_cast<std::uint64_t>(static_cast<std::int64_t>(d)) & 0xFF;
        }
        h.p = arr.data(); h.n = static_cast<std::uint32_t>(n);
        break;
      }
      case 'u': h.i = static_cast<std::int64_t>(static_cast<std::uint32_t>(static_cast<std::int64_t>(num(env, v)))); break;
      case 'b': h.i = truthy(env, v) ? 1 : 0; break;
      default: h.i = i32(env, v); break;
    }
  }
  call(static_cast<int>(id), args, &res);
  switch (row.ret) {
    case 'd': return doublev(env, res.d);
    case 'i': return int32v(env, static_cast<std::int32_t>(res.i));
    case 'b': return boolean(env, res.i != 0);
    case 's': return string(env, static_cast<const char*>(res.p), res.n);
    default: return nullptr;
  }
}

void installHost(napi_env env) {
  napi_value g;
  napi_get_global(env, &g);
  for (unsigned i = static_cast<unsigned>(zn::Rt::HostGfxFrames); i < static_cast<unsigned>(zn::Rt::Count); ++i) {
    const bool loop = i >= static_cast<unsigned>(zn::Rt::HostLoopWait) && i <= static_cast<unsigned>(zn::Rt::HostLoopNow);
    if (i >= static_cast<unsigned>(zn::Rt::HostHostLast) && !loop && !zn::isLayoutRow(static_cast<zn::Rt>(i)) && !zn::isGfxTailRow(static_cast<zn::Rt>(i)) && !zn::isSysTailRow(static_cast<zn::Rt>(i))) continue;   // as qjs.cpp's installHost
    const std::string name = std::string("__host_") + zn::rtMember(zn::kRtInfo[i]);
    napi_value f;
    const auto id = static_cast<zn::Rt>(i);
    gRows[i] = {id, zn::rtParamCount(zn::kRtInfo[i]), zn::rtRet(zn::kRtInfo[i]), zn::isLayoutRow(id) ? &zn::host::hostLayout : zn::isSysRow(id) ? &zn::host::hostSys : &zn::host::hostGfx};
    napi_create_function(env, name.c_str(), name.size(), hostFn, &gRows[i], &f);
    napi_set_named_property(env, g, name.c_str(), f);
  }
}

// ---- errors and promises
std::string gBundle, gMap;   // the bundle and its source map: the traces through it
std::string (*gMapStack)(const std::string&, const std::string&, const std::string&) = nullptr;

void report(napi_env env, napi_value ex, const char* what) {
  std::string s = "exception", stack;
  napi_valuetype t = napi_undefined;
  napi_typeof(env, ex, &t);
  if (!zn::napi::text(env, ex, s)) s = "exception";
  napi_value st;
  if ((t == napi_object || t == napi_function) && napi_get_named_property(env, ex, "stack", &st) == napi_ok && isString(env, st)) zn::napi::text(env, st, stack);
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending) { napi_value x; napi_get_and_clear_last_exception(env, &x); }   // a toString that threw
  if (!gMap.empty() && gMapStack) stack = gMapStack(stack, gBundle, gMap);
  if (!stack.empty() && stack.back() != '\n') stack += '\n';
  std::fflush(stdout);
  std::fprintf(stderr, "%s %s\n%s", what, s.c_str(), stack.c_str());
}
// true (the exception printed) when a call left one pending
bool failed(napi_env env) {
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) != napi_ok || !pending) return false;
  napi_value ex;
  napi_get_and_clear_last_exception(env, &ex);
  report(env, ex, "Uncaught");
  return true;
}

struct Rejection { napi_ref promise, reason; };
std::vector<Rejection> gRejected;   // told by the engine once the microtasks have run, so the ones handled late are not here
napi_ref gEntry = nullptr;          // the program's own promise (the bundle runs in an async function): its rejection is the uncaught exception

napi_value js_rejected(napi_env env, napi_callback_info info) {
  Args<2> A(env, info);
  Rejection r;
  napi_create_reference(env, A.argv[0], 1, &r.promise);
  napi_create_reference(env, A.argv[1], 1, &r.reason);
  gRejected.push_back(r);
  return nullptr;
}

// the promise jobs, then the rejections nobody handled, as qjs.cpp's drain: false (printed) when the program must stop
bool drain(napi_env env) {
  drainJobs(env);
  if (failed(env)) return false;
  while (!gRejected.empty()) {
    const Rejection x = gRejected.front();
    gRejected.erase(gRejected.begin());
    napi_value promise, reason, entry = nullptr;
    napi_get_reference_value(env, x.promise, &promise);
    napi_get_reference_value(env, x.reason, &reason);
    bool isEntry = false;
    if (gEntry && napi_get_reference_value(env, gEntry, &entry) == napi_ok && entry) napi_strict_equals(env, promise, entry, &isEntry);
    napi_value hook = isEntry ? nullptr : global(env, "__zincUnhandledRejection");
    const bool web = isFunction(env, hook);
    bool quiet = false;
    if (web) {
      napi_value args[2] = {promise, reason}, q;
      if (napi_call_function(env, undefined(env), hook, 2, args, &q) == napi_ok) quiet = truthy(env, q);
      else { bool p; napi_value ex; if (napi_is_exception_pending(env, &p) == napi_ok && p) napi_get_and_clear_last_exception(env, &ex); }
    }
    if (!quiet) report(env, reason, isEntry ? "Uncaught" : "Uncaught (in promise)");
    napi_delete_reference(env, x.promise);
    napi_delete_reference(env, x.reason);
    if (!web) return false;
  }
  return true;
}

bool callFn(napi_env env, napi_value f, napi_value arg) {
  napi_value r;
  if (napi_call_function(env, undefined(env), f, arg ? 1 : 0, arg ? &arg : nullptr, &r) != napi_ok && failed(env)) return false;
  return drain(env);
}

bool wantsFrames(napi_env env) { return isFunction(env, global(env, "__zincFrameCb")); }

void hostCall(zn::Rt id, HostArg* r) { (zn::isLayoutRow(id) ? zn::host::hostLayout : zn::isSysRow(id) ? zn::host::hostSys : zn::host::hostGfx)(static_cast<int>(id), nullptr, r); }

double call0(napi_env env, napi_value f) { napi_value r; return napi_call_function(env, undefined(env), f, 0, nullptr, &r) == napi_ok ? num(env, r) : 0; }

// the frame loop of a zinc:gfx program, qjs.cpp's frameLoop over Node-API; each frame in its own handle scope (V8 keeps a handle until its scope closes)
bool frameLoop(napi_env env) {
  HostArg r;
  hostCall(zn::Rt::HostGfxFrames, &r);
  const long frames = static_cast<long>(r.i);
  napi_ref setClockRef, dueRef, cbRef;
  napi_create_reference(env, global(env, "__setClock"), 1, &setClockRef);
  napi_create_reference(env, global(env, "__dueTimer"), 1, &dueRef);
  napi_create_reference(env, global(env, "__zincFrameCb"), 1, &cbRef);
  double clock = call0(env, global(env, "__clock"));
  bool ok = true;
  long drawn = 0;
  static std::function<bool()>* redrawStep = nullptr;
  std::function<bool()> step = [&]() -> bool {
    HostArg r;
    std::fflush(stdout);
    std::function<bool()>* saved = redrawStep;
    redrawStep = &step;
    *zincRedraw = [] { if (std::function<bool()>* s = redrawStep) { redrawStep = nullptr; (*s)(); redrawStep = s; } };   // zinc's own: its window HAL calls it
    hostCall(zn::Rt::HostGfxPoll, &r);
    redrawStep = saved;
    if (!ok) return false;
    napi_handle_scope scope;
    napi_open_handle_scope(env, &scope);
    napi_value setClock, due, cb, out;
    napi_get_reference_value(env, setClockRef, &setClock);
    napi_get_reference_value(env, dueRef, &due);
    napi_get_reference_value(env, cbRef, &cb);
    const double dt = r.d;
    clock += dt * 1000;
    napi_value cv = doublev(env, clock);
    napi_call_function(env, undefined(env), setClock, 1, &cv, &out);
    for (;;) {   // the timers due at the new clock, in order of time then creation
      napi_value now = doublev(env, clock), fn;
      if (napi_call_function(env, undefined(env), due, 1, &now, &fn) != napi_ok) { ok = !failed(env); break; }
      napi_valuetype t;
      if (napi_typeof(env, fn, &t) != napi_ok || t == napi_null) break;
      if (!(ok = callFn(env, fn, nullptr))) break;
    }
    if (ok) {
      hostCall(zn::Rt::HostGfxBegin, &r);
      if (isFunction(env, cb)) ok = callFn(env, cb, doublev(env, dt));
      hostCall(zn::Rt::HostGfxEnd, &r);
      napi_value g;
      napi_get_global(env, &g);
      napi_set_named_property(env, g, "__zincFrameNo", int32v(env, static_cast<std::int32_t>(++drawn)));
    }
    napi_close_handle_scope(env, scope);
    if (!ok) return false;
    hostCall(zn::Rt::HostGfxShouldQuit, &r);
    return !r.i;
  };
  for (long f = 0; f < frames && step(); ++f) {}
  *zincRedraw = nullptr;
  hostCall(zn::Rt::HostGfxFinish, &r);
  return ok;
}

// no frame loop yet: the timers in order, the clock jumping to each, until none is left or the program asks for frames
bool timerLoop(napi_env env) {
  napi_ref nextRef;
  napi_create_reference(env, global(env, "__nextTimer"), 1, &nextRef);
  bool ok = true;
  while (ok && !wantsFrames(env)) {
    std::fflush(stdout);
    napi_handle_scope scope;
    napi_open_handle_scope(env, &scope);
    napi_value next, fn;
    napi_valuetype t = napi_null;
    napi_get_reference_value(env, nextRef, &next);
    if (napi_call_function(env, undefined(env), next, 0, nullptr, &fn) != napi_ok) ok = !failed(env);
    else if (napi_typeof(env, fn, &t) == napi_ok && t != napi_null) ok = callFn(env, fn, nullptr);
    napi_close_handle_scope(env, scope);
    if (t == napi_null) break;
  }
  return ok;
}

bool eval(napi_env env, const std::string& src, const char* name, napi_value* out = nullptr) {
  napi_value code, r;
  napi_create_string_utf8(env, src.data(), src.size(), &code);
  if (napi_run_script(env, code, name, &r) != napi_ok) { failed(env); return false; }
  if (out) *out = r;
  return true;
}

// The web environment's engine services where the engine has no serializer and no module loader at run time: structuredClone in JavaScript (cycles,
// Map, Set, Date, RegExp, wrappers, array buffers and their views, errors; a function or a symbol refused as a browser does), and module(name)
// from the registry the script bundle fills (zinc:web, zinc:audio).
const char* kServices = R"JS((function (web) {
  function refuse(what) {
    const m = what + ' could not be cloned.';
    throw new TypeError(m);   // what QuickJS's serializer throws, so a program sees one error on every engine (a browser's is a DataCloneError DOMException)
  }
  function clone(v, seen) {
    const t = typeof v;
    if (t === 'function' || t === 'symbol') refuse(String(t === 'symbol' ? 'Symbol()' : v));
    if (t !== 'object' || v === null) return v;
    if (seen.has(v)) return seen.get(v);
    let r;
    if (v instanceof Date) r = new Date(v.getTime());
    else if (v instanceof RegExp) r = new RegExp(v.source, v.flags);
    else if (v instanceof Boolean || v instanceof Number || v instanceof String) r = Object(v.valueOf());
    else if (v instanceof ArrayBuffer) r = v.slice(0);
    else if (v instanceof DataView) r = new DataView(clone(v.buffer, seen), v.byteOffset, v.byteLength);
    else if (ArrayBuffer.isView(v)) r = new v.constructor(clone(v.buffer, seen), v.byteOffset, v.length);
    else if (v instanceof Error) { const C = globalThis[v.name]; r = new (typeof C === 'function' && C.prototype instanceof Error ? C : Error)(v.message); if (v.stack) r.stack = v.stack; }
    if (r !== undefined) { seen.set(v, r); return r; }
    if (v instanceof Map) { r = new Map(); seen.set(v, r); for (const [k, x] of v) r.set(clone(k, seen), clone(x, seen)); return r; }
    if (v instanceof Set) { r = new Set(); seen.set(v, r); for (const x of v) r.add(clone(x, seen)); return r; }
    r = Array.isArray(v) ? new Array(v.length) : {};
    seen.set(v, r);
    for (const k of Object.keys(v)) r[k] = clone(v[k], seen);
    return r;
  }
  web.structuredClone = (v) => clone(v, new Map());
  web.module = (name) => {
    const m = globalThis.__zincModules && globalThis.__zincModules[name];
    if (!m) throw new Error('module ' + name + ' is not in the bundle');
    return m;
  };
}))JS";

// What QuickJS-ng has built in and these engines leave to their embedder (a browser, Node): performance.now on the real clock, queueMicrotask.
const char* kGlobals = R"JS((function (g) {
  if (typeof g.performance === 'undefined') {
    const origin = Date.now() - g.__host_loopNow();   // before the prelude puts Date.now on the virtual clock
    g.performance = { now: () => g.__host_loopNow(), timeOrigin: origin, mark() {}, measure() {}, getEntriesByName: () => [] };
  }
  if (typeof g.queueMicrotask === 'undefined') g.queueMicrotask = (f) => { Promise.resolve().then(f); };
})(globalThis))JS";

void services(napi_env env, napi_value web) {
  napi_value fn, r;
  if (eval(env, kServices, "<web-services>", &fn)) napi_call_function(env, undefined(env), fn, 1, &web, &r);
}

}  // namespace

void inlineSourceMap(std::string& js) {
  const std::string tail = "//# sourceMappingURL=";
  const std::size_t at = js.rfind(tail);
  std::string b64(4 * ((gMap.size() + 2) / 3) + 1, '\0');
  std::size_t n = 0;
  if (at != std::string::npos && !gMap.empty() &&
      mbedtls_base64_encode(reinterpret_cast<unsigned char*>(b64.data()), b64.size(), &n, reinterpret_cast<const unsigned char*>(gMap.data()), gMap.size()) == 0)
    js = js.substr(0, at) + tail + "data:application/json;charset=utf-8;base64," + b64.substr(0, n) + "\n";
}

int run(const zn_engine_args* a) {
  if (a->abi != ZN_ENGINE_ABI) {
    std::fprintf(stderr, "zinc: the %s engine was built for another zinc (engine ABI %d, this zinc %d): zinc engine update %s\n", kName, a->abi, ZN_ENGINE_ABI, kName);
    return 2;
  }
  takeZinc(a);
  napi_env env = open();
  if (!env) { std::fprintf(stderr, "zinc: the %s engine did not start\n", kName); return 101; }
  {
    napi_value fn;
    napi_create_function(env, "rejected", NAPI_AUTO_LENGTH, js_rejected, nullptr, &fn);
    onRejection(env, fn);
  }
  installHost(env);
  zn::qjs::installNative(env);
  zn::text::installIntlSegmenter(env);
  if (a->webgl_open) {   // WebGL from libzn_webgl, calling this engine's Node-API (ZN-773.02); before the prelude, as on QuickJS
    static const zn_napi_table napi = {ZN_NAPI_TABLE_INIT};
    if (auto install = reinterpret_cast<void (*)(napi_env)>(a->webgl_open(&napi))) install(env);
  }
  const std::string defs = std::string("globalThis.__ZINC_ENGINE__ = '") + kName + "'; globalThis.__ZINC_CAPS__ = " + a->caps +
                           "; globalThis.__ZINC_TARGET__ = __ZINC_CAPS__.TARGET; globalThis.__ZINC_PROFILE__ = __ZINC_CAPS__.PROFILE;";
  if (!eval(env, kGlobals, "<globals>") || !eval(env, zn::qjs::kPrelude, "<prelude>") || !eval(env, zn::qjs::kWebShims, "<web-shims>") || !eval(env, defs, "<defines>")) return 101;
  if (*a->web && !zn::qjs::webEnv(env, a->std_root, a->web, a->web_base, services)) return 101;
  std::string js;
  {
    std::ifstream in(a->bundle, std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", a->bundle); return 101; }
    std::stringstream ss;
    ss << in.rdbuf();
    js = ss.str();
    std::ifstream map(std::string(a->bundle) + ".map", std::ios::binary);
    std::stringstream ms;
    ms << map.rdbuf();
    gMap = ms.str();
    gBundle = a->bundle;
    gMapStack = reinterpret_cast<decltype(gMapStack)>(a->map_stack);
  }
  zn::log::step("run", std::string(kName) + ", executing JavaScript");
  beforeEntry(env, a, js);
  napi_value res;
  int rc = 0;
  if (!eval(env, js, a->bundle, &res)) rc = 101;
  else {
    napi_create_reference(env, res, 1, &gEntry);
    if (!(drain(env) && timerLoop(env) && (!wantsFrames(env) || frameLoop(env)))) rc = 101;
  }
  std::fflush(stdout);
  return rc;   // ponytail: the context is left to the process exit, as qjs.cpp's run leaves QuickJS's
}

}  // namespace zn::engine
