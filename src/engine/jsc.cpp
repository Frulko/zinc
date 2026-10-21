// The JavaScriptCore engine (ZN-773.03): `zinc run --engine jsc`. On macOS the system's JavaScriptCore.framework (nothing to download), with
// JsRuntimeHost's Node-API over its C API (third_party/node-api); the driver (driver.cpp) does the rest. Built as libzn_engine_jsc beside zinc.
#include <JavaScriptCore/JavaScript.h>
#include <napi/env.h>

#include "engine/driver.h"

// JSContextRefPrivate.h, exported by the framework since macOS 10.15.4 and iOS 13.4: fn(promise, reason) for the rejections still unhandled once
// the microtasks have run
extern "C" void JSGlobalContextSetUnhandledRejectionCallback(JSGlobalContextRef ctx, JSObjectRef function, JSValueRef* exception);

namespace zn::engine {

const char* kName = "jsc";

namespace { JSGlobalContextRef gContext = nullptr; }

napi_env open() {
  JSClassDefinition global = kJSClassDefinitionEmpty;
  global.className = "Window";   // its own prototype object, which the web environment can put Window.prototype under (the global's own is immutable)
  gContext = JSGlobalContextCreate(JSClassCreate(&global));
  return Napi::Attach(gContext);
}

void onRejection(napi_env, napi_value fn) {
  JSGlobalContextSetUnhandledRejectionCallback(gContext, reinterpret_cast<JSObjectRef>(fn), nullptr);
}

void drainJobs(napi_env) {}   // JavaScriptCore runs the microtasks when the outermost call into it returns

}  // namespace zn::engine

extern "C" __attribute__((visibility("default"))) int zn_engine_run(const zn_engine_args* a) { return zn::engine::run(a); }
