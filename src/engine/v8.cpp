// The V8 engine (ZN-773.05): `zinc run --engine v8`. V8 from tools/v8-pack (Homebrew's build of V8 stable), JsRuntimeHost's Node-API over it
// (third_party/node-api), the driver (driver.cpp) for the rest. Built as libzn_engine_v8 beside zinc when the engine directory is there.
#include <dlfcn.h>

#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <fstream>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include <libplatform/libplatform.h>
#include <napi/env.h>
#include <v8-inspector.h>

#include "dbg/ws.h"
#include "engine/driver.h"
#include "mbedtls/base64.h"

namespace zn::engine {

const char* kName = "v8";

namespace {
std::unique_ptr<v8::Platform> gPlatform;
v8::Isolate* gIsolate = nullptr;
struct Rejected { v8::Global<v8::Promise> promise; v8::Global<v8::Value> reason; };
std::vector<Rejected> gRejected;   // rejected with no handler: told to the driver after the microtask checkpoint, unless a handler came meanwhile
v8::Global<v8::Function> gTell;
v8::Global<v8::Value> gV8Console;   // V8's own console, before the prelude's: it is the one that reaches DevTools

void onReject(v8::PromiseRejectMessage m) {
  v8::Local<v8::Promise> p = m.GetPromise();
  if (m.GetEvent() == v8::kPromiseRejectWithNoHandler) gRejected.push_back({v8::Global<v8::Promise>(gIsolate, p), v8::Global<v8::Value>(gIsolate, m.GetValue())});
  else if (m.GetEvent() == v8::kPromiseHandlerAddedAfterReject)
    for (std::size_t i = 0; i < gRejected.size(); ++i)
      if (gRejected[i].promise == p) { gRejected.erase(gRejected.begin() + static_cast<long>(i)); break; }
}
// ---- Chrome DevTools: `zinc run --engine v8 --inspect[-brk][=port]` (ZINC_INSPECT=port[,brk]). V8's own inspector behind the target of
// src/dbg/ws.cpp; the client's messages run on the main thread: at each drain of the driver, at once through an interrupt while JavaScript
// runs, and in the loop below while the program is paused.
// ponytail: a program idle in a blocking wait hears DevTools at its next frame or timer; a wake-up of the loop if that ever shows.
std::unique_ptr<v8_inspector::V8Inspector> gInspector;
std::unique_ptr<v8_inspector::V8InspectorSession> gSession;
std::mutex gInMu;
std::condition_variable gInCv;
std::deque<std::string> gIn;   // the client's messages; an empty one: the client went
bool gPaused = false, gWaiting = false, gDrop = false;

std::string utf8(const v8_inspector::StringView& v) {
  v8::HandleScope scope(gIsolate);
  v8::Local<v8::String> s = (v.is8Bit() ? v8::String::NewFromOneByte(gIsolate, v.characters8(), v8::NewStringType::kNormal, static_cast<int>(v.length()))
                                        : v8::String::NewFromTwoByte(gIsolate, v.characters16(), v8::NewStringType::kNormal, static_cast<int>(v.length()))).ToLocalChecked();
  v8::String::Utf8Value u(gIsolate, s);
  return std::string(*u, static_cast<std::size_t>(u.length()));
}

struct Channel final : v8_inspector::V8Inspector::Channel {
  void sendResponse(int, std::unique_ptr<v8_inspector::StringBuffer> m) override { zn::dbg::ws::send(utf8(m->string())); }
  void sendNotification(std::unique_ptr<v8_inspector::StringBuffer> m) override { zn::dbg::ws::send(utf8(m->string())); }
  void flushProtocolNotifications() override {}
} gChannel;

bool take(std::string& m, bool wait) {
  std::unique_lock<std::mutex> lock(gInMu);
  if (wait) gInCv.wait(lock, [] { return !gIn.empty(); });
  if (gIn.empty()) return false;
  m = std::move(gIn.front());
  gIn.pop_front();
  return true;
}

void dispatch(const std::string& m) {
  if (m.empty()) {   // the client went: the program goes on, and the session ends once no pause loop is on the stack
    if (gSession && gPaused) gSession->resume();
    gPaused = gWaiting = false;
    gDrop = true;
    return;
  }
  if (gDrop && gSession) { gSession.reset(); gDrop = false; }
  if (!gSession) gSession = gInspector->connect(1, &gChannel, {}, v8_inspector::V8Inspector::kFullyTrusted);
  v8::HandleScope scope(gIsolate);
  v8::Local<v8::String> s = v8::String::NewFromUtf8(gIsolate, m.data(), v8::NewStringType::kNormal, static_cast<int>(m.size())).ToLocalChecked();
  std::vector<std::uint16_t> w(s->Length());
  s->WriteV2(gIsolate, 0, s->Length(), w.data());
  gSession->dispatchProtocolMessage(v8_inspector::StringView(w.data(), w.size()));
}

void pump() {
  std::string m;
  while (take(m, false)) dispatch(m);
}

struct Client final : v8_inspector::V8InspectorClient {
  void runMessageLoopOnPause(int) override {
    gPaused = true;
    std::string m;
    while (gPaused && take(m, true)) dispatch(m);
  }
  void quitMessageLoopOnPause() override { gPaused = false; }
  void runIfWaitingForDebugger(int) override { gWaiting = false; }
  double currentTimeMS() override { return gPlatform->CurrentClockTimeMillis(); }
  v8::Local<v8::Context> ensureDefaultContextInGroup(int) override { return gIsolate->GetCurrentContext(); }
} gClient;

void received(std::string m) {   // on the connection's thread
  { std::lock_guard<std::mutex> lock(gInMu); gIn.push_back(std::move(m)); }
  gInCv.notify_one();
  gIsolate->RequestInterrupt([](v8::Isolate*, void*) { pump(); }, nullptr);
}

void runScript(const char* src) {
  v8::HandleScope scope(gIsolate);
  v8::Local<v8::Context> ctx = gIsolate->GetCurrentContext();
  v8::Local<v8::Script> script;
  if (v8::Script::Compile(ctx, v8::String::NewFromUtf8(gIsolate, src).ToLocalChecked()).ToLocal(&script)) (void)script->Run(ctx);
}
}  // namespace

void beforeEntry(napi_env, const zn_engine_args* a, std::string& js) {
  const char* e = std::getenv("ZINC_INSPECT");
  if (!e || !*e) return;
  const int port = std::atoi(e);
  gInspector = v8_inspector::V8Inspector::create(gIsolate, &gClient);
  const char* name = "zinc";
  gInspector->contextCreated(v8_inspector::V8ContextInfo(gIsolate->GetCurrentContext(), 1, v8_inspector::StringView(reinterpret_cast<const std::uint8_t*>(name), std::strlen(name))));
  const std::string entry = a->entry;
  const int at = zn::dbg::ws::start(port, {"zinc-v8", entry, "file://" + entry}, received, [] { received(""); });
  if (!at) { std::fprintf(stderr, "zinc: --inspect: port %d is taken (another one: --inspect=<port>)\n", port); return; }
  std::fprintf(stderr, "zinc: Chrome DevTools: chrome://inspect (localhost:%d is in its default list), or devtools://devtools/bundled/js_app.html?ws=127.0.0.1:%d/zinc-v8\n", at, at);
  {   // console.* reaches DevTools too: V8's console beside the prelude's
    v8::HandleScope scope(gIsolate);
    v8::Local<v8::Context> ctx = gIsolate->GetCurrentContext();
    (void)ctx->Global()->Set(ctx, v8::String::NewFromUtf8Literal(gIsolate, "__v8console"), gV8Console.Get(gIsolate));
  }
  runScript("(function (v, c) { delete globalThis.__v8console; for (const k of ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table', 'trace']) { const z = c[k]; if (typeof z === 'function' && typeof v[k] === 'function') c[k] = function (...a) { v[k](...a); return z.apply(this, a); }; } })(globalThis.__v8console, console)");
  // the source map inline: DevTools reads no file:// map of a node target by itself
  const std::string tail = "//# sourceMappingURL=";
  const std::size_t mapAt = js.rfind(tail);
  std::ifstream in(std::string(a->bundle) + ".map", std::ios::binary);
  std::stringstream ms;
  ms << in.rdbuf();
  const std::string map = ms.str();
  std::string b64(4 * ((map.size() + 2) / 3) + 1, '\0');
  std::size_t n = 0;
  if (mapAt != std::string::npos && !map.empty() && mbedtls_base64_encode(reinterpret_cast<unsigned char*>(b64.data()), b64.size(), &n, reinterpret_cast<const unsigned char*>(map.data()), map.size()) == 0)
    js = js.substr(0, mapAt) + tail + "data:application/json;charset=utf-8;base64," + b64.substr(0, n) + "\n";
  if (std::strstr(e, "brk")) {   // --inspect-brk: wait for DevTools, then stop at the program's first statement
    std::fprintf(stderr, "zinc: waiting for the debugger\n");
    gWaiting = true;
    std::string m;
    while (gWaiting && take(m, true)) dispatch(m);
    if (gSession) gSession->schedulePauseOnNextStatement(v8_inspector::StringView(reinterpret_cast<const std::uint8_t*>("Break on start"), 14), {});
  }
}

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
  gV8Console.Reset(gIsolate, ctx->Global()->Get(ctx, v8::String::NewFromUtf8Literal(gIsolate, "console")).ToLocalChecked());
  return Napi::Attach(ctx);
}

void onRejection(napi_env, napi_value fn) {
  gTell.Reset(gIsolate, *reinterpret_cast<v8::Local<v8::Function>*>(&fn));   // a napi_value is a v8::Local (js_native_api_v8.h V8LocalValueFromJsValue)
}

void drainJobs(napi_env) {
  if (gInspector) {
    pump();
    if (gDrop && !gPaused && gSession) { gSession.reset(); gDrop = false; }
  }
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
