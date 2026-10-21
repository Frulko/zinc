// The V8 engine (ZN-773.05): `zinc run --engine v8`. V8 from tools/v8-pack (Homebrew's build of V8 stable), JsRuntimeHost's Node-API over it
// (third_party/node-api), the driver (driver.cpp) for the rest. Built as libzn_engine_v8 beside zinc when the engine directory is there.
#include <dlfcn.h>

#include <cstdio>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <libplatform/libplatform.h>
#include <napi/env.h>

#include "engine/driver.h"

namespace zn::engine {

const char* kName = "v8";

namespace {
std::unique_ptr<v8::Platform> gPlatform;
v8::Isolate* gIsolate = nullptr;
struct Rejected { v8::Global<v8::Promise> promise; v8::Global<v8::Value> reason; };
std::vector<Rejected> gRejected;   // rejected with no handler: told to the driver after the microtask checkpoint, unless a handler came meanwhile
v8::Global<v8::Function> gTell;

void onReject(v8::PromiseRejectMessage m) {
  v8::Local<v8::Promise> p = m.GetPromise();
  if (m.GetEvent() == v8::kPromiseRejectWithNoHandler) gRejected.push_back({v8::Global<v8::Promise>(gIsolate, p), v8::Global<v8::Value>(gIsolate, m.GetValue())});
  else if (m.GetEvent() == v8::kPromiseHandlerAddedAfterReject)
    for (std::size_t i = 0; i < gRejected.size(); ++i)
      if (gRejected[i].promise == p) { gRejected.erase(gRejected.begin() + static_cast<long>(i)); break; }
}
}  // namespace

napi_env open() {
  Dl_info info;   // icudtl.dat (Intl) beside libv8
  if (dladdr(reinterpret_cast<void*>(&v8::V8::GetVersion), &info) && info.dli_fname) {
    std::string dir = info.dli_fname;
    v8::V8::InitializeICU((dir.substr(0, dir.rfind('/') + 1) + "icudtl.dat").c_str());
  }
  gPlatform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(gPlatform.get());
  v8::V8::Initialize();
  v8::Isolate::CreateParams params;
  params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  gIsolate = v8::Isolate::New(params);
  gIsolate->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);   // the jobs run where the driver drains, as on QuickJS
  gIsolate->SetPromiseRejectCallback(onReject);
  // the whole run is in this isolate and context: their scopes stay open to the process exit (the driver opens a handle scope per frame)
  static std::optional<v8::Isolate::Scope> isolateScope;
  static std::optional<v8::HandleScope> handleScope;
  static std::optional<v8::Context::Scope> contextScope;
  isolateScope.emplace(gIsolate);
  handleScope.emplace(gIsolate);
  v8::Local<v8::Context> ctx = v8::Context::New(gIsolate);
  contextScope.emplace(ctx);
  return Napi::Attach(ctx);
}

void onRejection(napi_env, napi_value fn) {
  gTell.Reset(gIsolate, *reinterpret_cast<v8::Local<v8::Function>*>(&fn));   // a napi_value is a v8::Local (js_native_api_v8.h V8LocalValueFromJsValue)
}

void drainJobs(napi_env) {
  gIsolate->PerformMicrotaskCheckpoint();
  if (gRejected.empty()) return;
  v8::HandleScope scope(gIsolate);
  std::vector<Rejected> told;
  told.swap(gRejected);
  v8::Local<v8::Context> ctx = gIsolate->GetCurrentContext();
  for (Rejected& r : told) {
    v8::Local<v8::Value> args[2] = {r.promise.Get(gIsolate), r.reason.Get(gIsolate)};
    (void)gTell.Get(gIsolate)->Call(ctx, v8::Undefined(gIsolate), 2, args);
  }
}

}  // namespace zn::engine

extern "C" __attribute__((visibility("default"))) int zn_engine_run(const zn_engine_args* a) { return zn::engine::run(a); }
