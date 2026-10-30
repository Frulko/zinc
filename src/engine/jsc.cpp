// The JavaScriptCore engine (ZN-773.03): `zinc run --engine jsc`. On macOS the system's JavaScriptCore.framework (nothing to download), with
// JsRuntimeHost's Node-API over its C API (third_party/node-api); the driver (driver.cpp) does the rest. Built as libzn_engine_jsc beside zinc.
#include <JavaScriptCore/JavaScript.h>
#include <napi/env.h>
#include <unistd.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>

#include "engine/driver.h"

// JSContextRefPrivate.h, exported by the framework since macOS 10.15.4 and iOS 13.4: fn(promise, reason) for the rejections still unhandled once
// the microtasks have run
extern "C" void JSGlobalContextSetUnhandledRejectionCallback(JSGlobalContextRef ctx, JSObjectRef function, JSValueRef* exception);

namespace zn::engine {

const char* kName = "jsc";

namespace { JSGlobalContextRef gContext = nullptr; }

napi_env open() {
  // a global of no class: one of a JSClass is a callback object, and every global lookup then misses JavaScriptCore's caches (the host call
  // went from about 75 to 130 ns, Math and the rest the same way); the web environment copes with its immutable prototype
  gContext = JSGlobalContextCreate(nullptr);
  return Napi::Attach(gContext);
}

void onRejection(napi_env, napi_value fn) {
  JSGlobalContextSetUnhandledRejectionCallback(gContext, reinterpret_cast<JSObjectRef>(fn), nullptr);
}

// JSBasePrivate.h's JSGetMemoryUsageStatistics, exported by the framework: the heap's capacity and its objects
// It walks the whole heap (about 11 ns an object on an M1 Pro: 2.7 ms for 280k objects, 28 ms for 2.5M), and nothing public is cheaper: a
// reading is kept for 1000 times what it cost, so the walk takes at most about 1 ms a second whatever the heap (the Info view asks each second)
extern "C" JSObjectRef JSGetMemoryUsageStatistics(JSContextRef ctx);
ZnResourceStats heapStats(napi_env) {
  static ZnResourceStats last{};
  static std::chrono::steady_clock::time_point next{};
  const auto t0 = std::chrono::steady_clock::now();
  if (t0 < next) return last;
  JSObjectRef o = JSGetMemoryUsageStatistics(gContext);
  auto num = [&](const char* k) { JSStringRef n = JSStringCreateWithUTF8CString(k); const double v = JSValueToNumber(gContext, JSObjectGetProperty(gContext, o, n, nullptr), nullptr); JSStringRelease(n); return v > 0 ? static_cast<uint64_t>(v) : 0; };
  last = {num("objectCount"), num("heapCapacity") + num("extraMemorySize"), 0, 0, 0};
  const auto t1 = std::chrono::steady_clock::now();
  next = t1 + (t1 - t0) * 1000;
  return last;
}

void drainJobs(napi_env) {}   // JavaScriptCore runs the microtasks when the outermost call into it returns
// `zinc run --engine jsc --inspect[-brk]` (ZINC_INSPECT): Safari's Web Inspector on the context, through the public JSGlobalContextSetInspectable
// (macOS 13.3). Safari lists it under Develop > this Mac by the program's name; the inspector speaks to JavaScriptCore itself, no port of ours.
void beforeEntry(napi_env, const zn_engine_args* a, std::string& js) {
  const char* e = std::getenv("ZINC_INSPECT");
  if (!e || !*e) return;
  const std::string name = "zinc: " + std::filesystem::path(a->entry).filename().string();
  JSStringRef n = JSStringCreateWithUTF8CString(name.c_str());
  JSGlobalContextSetName(gContext, n);
  JSStringRelease(n);
  if (__builtin_available(macOS 13.3, iOS 16.4, *)) JSGlobalContextSetInspectable(gContext, true);   // before 13.3 a context is inspectable without asking
  inlineSourceMap(js);
  std::fprintf(stderr, "zinc: Safari's Web Inspector: Develop > this Mac > \"%s\" (Safari > Settings > Advanced > Show features for web developers)\n", name.c_str());
  if (std::strstr(e, "brk")) {   // no public call says when the inspector is attached: Enter says it, then the program stops at its first line
    std::fprintf(stderr, "zinc: open the inspector, then press Enter\n");
    if (isatty(STDIN_FILENO)) for (int c = std::getchar(); c != '\n' && c != EOF; c = std::getchar()) {}
    js = "debugger; " + js;   // on the banner's line: the source map's lines stay where they are
  }
}

}  // namespace zn::engine

extern "C" __attribute__((visibility("default"))) int zn_engine_run(const zn_engine_args* a) { return zn::engine::run(a); }
