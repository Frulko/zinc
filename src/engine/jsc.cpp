// The JavaScriptCore engine (ZN-773.03): `zinc run --engine jsc`. On macOS the system's JavaScriptCore.framework (nothing to download), with
// JsRuntimeHost's Node-API over its C API (third_party/node-api); the driver (driver.cpp) does the rest. Built as libzn_engine_jsc beside zinc.
#include <JavaScriptCore/JavaScript.h>
#include <napi/env.h>
#include <unistd.h>

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
