// The Hermes engine (ZN-773.07, ZN-773.08): `zinc run --engine hermes`. Hermes from tools/hermes-pack (facebook/hermes static_h built from source),
// its own Node-API (API/napi, in libhermesvm) and the few entry points tools/hermes-patches/zinc-embed.patch adds to it (a Runtime, its job
// queue, an optimised compile, bytecode, a Static Hermes unit, its Chrome DevTools agent); the driver (driver.cpp) for the rest. Built as
// libzn_engine_hermes beside zinc when the SDK directory is there, published as a pack (tools/engine-pack hermes). No WebAssembly (Hermes has none).
#include <dlfcn.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>
#include <string>

#include "dbg/ws.h"
#include "engine/driver.h"
#include "zn/log.h"

struct SHUnit;
extern "C" {   // libhermesvm, tools/hermes-patches/zinc-embed.patch
napi_env zn_hermes_create(bool jit);
void zn_hermes_set_debug(bool on);
napi_status zn_hermes_drain(napi_env env);
napi_status zn_hermes_run(napi_env env, const char* src, size_t size, const char* url, bool optimize, napi_value* result);
bool zn_hermes_compile(const char* src, size_t size, const char* url, bool optimize, uint8_t** out, size_t* out_size, char** error);
napi_status zn_hermes_run_unit(napi_env env, SHUnit* (*creator)(), napi_value* result);
bool zn_hermes_cdp_start(void (*send)(const char*, size_t), void (*wake)());
void zn_hermes_cdp_message(const char* json, size_t size);
void zn_hermes_cdp_run();
void zn_hermes_cdp_pause();
struct hermes_bytecode_flags { size_t struct_size; bool persistent, hides_epilogue, funcs_are_builtins; };   // hermes_napi.h
napi_status hermes_run_bytecode(napi_env env, const uint8_t* data, size_t size, void (*finalize_cb)(const uint8_t*, size_t, void*), void* hint,
                                const char* source_url, const hermes_bytecode_flags* flags, napi_value* result);
}

namespace zn::engine {

const char* kName = "hermes";

namespace {
napi_ref gFlush = nullptr;   // the rejections the polyfill told since the last drain, handed to the driver
std::string gBundle;         // the bundle's path: its run is the one a Static Hermes unit or its bytecode replaces
std::string gBytecode;       // <bundle>.hbc that zinc build compiled from it (zn_engine_compile), when it is there and not older than the bundle
bool gOptimize = false, gInspect = false;

bool on(const char* var, bool dflt) { const char* v = std::getenv(var); return v && *v ? std::strcmp(v, "0") != 0 : dflt; }

// the precompiled bytecode of a bundle: <dir>/<name>.hbc beside <dir>/<name>.js
std::string bytecodeOf(const std::string& bundle) {
  const std::filesystem::path p(bundle);
  return (p.parent_path() / (p.stem().string() + ".hbc")).string();
}

// the bytecode file is of this VM's bytecode version (its header: 8 bytes of magic, then the version): one compiled by another Hermes (a pack
// updated since zinc build) is refused by the VM, so the source runs instead
bool sameVersion(const std::string& hbc) {
  uint8_t* mine = nullptr;
  size_t n = 0;
  char* err = nullptr;
  char head[12] = {};
  std::ifstream(hbc, std::ios::binary).read(head, sizeof head);
  const bool same = zn_hermes_compile("0", 1, "", false, &mine, &n, &err) && n >= sizeof head && std::memcmp(mine, head, sizeof head) == 0;
  std::free(mine);
  std::free(err);
  return same;
}

// ---- Chrome DevTools: `zinc run --engine hermes --inspect[-brk][=port]` (ZINC_INSPECT=port[,brk]). Hermes's CDP agent (API/hermes/cdp) behind
// the target of src/dbg/ws.cpp; the agent queues its work for the JavaScript thread, which runs it at each drain of the driver and, while the
// program waits for the debugger (--inspect-brk), in the loop below. While JavaScript runs or is paused, Hermes's debugger runs it itself.
// ponytail: a program idle in a blocking wait hears DevTools at its next frame or timer, as on V8.
std::mutex gMu;
std::condition_variable gCv;
bool gWaiting = false, gWork = false;

void wake() {
  { std::lock_guard<std::mutex> lock(gMu); gWork = true; }
  gCv.notify_all();
}

void received(std::string m) {   // on the connection's thread
  if (m.empty()) {   // the client went: the program goes on
    zn_hermes_cdp_message("", 0);
    { std::lock_guard<std::mutex> lock(gMu); gWaiting = false; }
    gCv.notify_all();
    return;
  }
  // what the target answers itself, as V8's inspector does: the program's start, and its one execution context
  if (m.find("\"Runtime.runIfWaitingForDebugger\"") != std::string::npos) {
    const std::size_t at = m.find("\"id\"");
    const long id = at == std::string::npos ? 0 : std::strtol(m.c_str() + m.find(':', at) + 1, nullptr, 10);
    zn::dbg::ws::send("{\"id\":" + std::to_string(id) + ",\"result\":{}}");
    { std::lock_guard<std::mutex> lock(gMu); gWaiting = false; }
    gCv.notify_all();
    return;
  }
  if (m.find("\"Runtime.enable\"") != std::string::npos)
    zn::dbg::ws::send(R"({"method":"Runtime.executionContextCreated","params":{"context":{"id":1,"origin":"","name":"zinc","uniqueId":"1"}}})");
  zn_hermes_cdp_message(m.data(), m.size());
}

void unmap(const uint8_t* data, size_t size, void*) { munmap(const_cast<uint8_t*>(data), size); }
}  // namespace

napi_env open() {
  gOptimize = on("ZINC_HERMES_OPT", false);   // eager compile through the full optimisation pipeline, against a lazy one (the start of a big bundle)
  gInspect = std::getenv("ZINC_INSPECT") && *std::getenv("ZINC_INSPECT");
  // the arm64 baseline JIT, off under the debugger: its breakpoints and steps are the interpreter's
  napi_env env = zn_hermes_create(on("ZINC_HERMES_JIT", true) && !gInspect);
  if (gInspect) zn_hermes_set_debug(true);   // the scripts keep their scopes and variables, and hear DevTools while they run
  // the run's outermost handle scope, open to the process exit as v8.cpp's: Hermes's env marks its slots only while a scope is open, so a value
  // made outside one (the driver's setup) was a dangling root at the first young collection (hero crashed in HadesGC::youngGenEvacuate)
  napi_handle_scope scope;
  if (env) napi_open_handle_scope(env, &scope);
  return env;
}

// Hermes's Promise is a bytecode polyfill whose rejection tracker reports after a timer; the patched tracker tells each rejection and each late
// handler at once (V8's PromiseRejectCallback), and drainJobs hands what is left after the jobs to the driver, as v8.cpp does.
void onRejection(napi_env env, napi_value fn) {
  static const char* kTrack = R"JS((function (tell) {
  const promises = [], reasons = [];
  HermesInternal.enablePromiseRejectionTracker({
    onReject(p, e) { promises.push(p); reasons.push(e); },
    onHandle(p) { const i = promises.indexOf(p); if (i >= 0) { promises.splice(i, 1); reasons.splice(i, 1); } },
  });
  return function () { while (promises.length) tell(promises.shift(), reasons.shift()); };
}))JS";
  napi_value make, flush;
  if (zn_hermes_run(env, kTrack, std::strlen(kTrack), "<rejections>", false, &make) != napi_ok) return;
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  if (napi_call_function(env, undefined, make, 1, &fn, &flush) == napi_ok) napi_create_reference(env, flush, 1, &gFlush);
}

// HermesInternal.getInstrumentedStats(): the GC's own numbers (js_heapSize: the bytes the heap holds now)
ZnResourceStats heapStats(napi_env env) {
  napi_handle_scope scope;
  if (napi_open_handle_scope(env, &scope) != napi_ok) return {};
  napi_value g, hi, fn, stats, v;
  double bytes = 0;
  bool fun = false;
  if (napi_get_global(env, &g) == napi_ok && napi_get_named_property(env, g, "HermesInternal", &hi) == napi_ok &&
      napi_get_named_property(env, hi, "getInstrumentedStats", &fn) == napi_ok) {
    napi_valuetype t;
    fun = napi_typeof(env, fn, &t) == napi_ok && t == napi_function;
  }
  if (fun && napi_call_function(env, hi, fn, 0, nullptr, &stats) == napi_ok && napi_get_named_property(env, stats, "js_heapSize", &v) == napi_ok) napi_get_value_double(env, v, &bytes);
  napi_close_handle_scope(env, scope);
  return {0, bytes > 0 ? static_cast<uint64_t>(bytes) : 0, 0, 0, 0};
}

void drainJobs(napi_env env) {
  if (gInspect) zn_hermes_cdp_run();
  if (zn_hermes_drain(env) != napi_ok || !gFlush) return;   // the exception stays pending: the driver reports it
  napi_value flush, undefined, r;
  napi_get_reference_value(env, gFlush, &flush);
  napi_get_undefined(env, &undefined);
  napi_call_function(env, undefined, flush, 0, nullptr, &r);
}

void beforeEntry(napi_env env, const zn_engine_args* a, std::string& js) {
  gBundle = a->bundle;
  std::error_code ec;
  if (const std::string hbc = bytecodeOf(gBundle); !gInspect && std::filesystem::exists(hbc, ec) &&
      std::filesystem::last_write_time(hbc, ec) >= std::filesystem::last_write_time(gBundle, ec) && sameVersion(hbc)) {
    gBytecode = hbc;
    traceName(std::filesystem::path(gBundle).filename().string());   // the name zn_engine_compile gave its frames
    zn::log::step("bytecode", std::filesystem::path(hbc).filename().string() + " instead of the source");
  }
  if (!gInspect) return;
  const char* e = std::getenv("ZINC_INSPECT");
  const int port = std::atoi(e);
  if (!zn_hermes_cdp_start([](const char* m, size_t n) { zn::dbg::ws::send(std::string(m, n)); }, wake)) {
    std::fprintf(stderr, "zinc: --inspect: this Hermes was built without its debugger (tools/hermes-pack builds it with)\n");
    return;
  }
  const std::string entry = a->entry;
  const int at = zn::dbg::ws::start(port, {"zinc-hermes", entry, "file://" + entry}, received, [] { received(""); });
  if (!at) { std::fprintf(stderr, "zinc: --inspect: port %d is taken (another one: --inspect=<port>)\n", port); return; }
  std::fprintf(stderr, "zinc: Chrome DevTools: chrome://inspect (localhost:%d is in its default list), or devtools://devtools/bundled/js_app.html?ws=127.0.0.1:%d/zinc-hermes\n", at, at);
  // console.* reaches DevTools too, beside the prelude's console
  static const char* kConsole = "(function (c) { const t = globalThis.__zn_cdp_console; delete globalThis.__zn_cdp_console; for (const k of ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table', 'trace']) { const z = c[k]; if (typeof z === 'function') c[k] = function (...a) { t(k, ...a); return z.apply(this, a); }; } })(console)";
  napi_value r;
  if (zn_hermes_run(env, kConsole, std::strlen(kConsole), "<inspector>", false, &r) != napi_ok) { bool p; napi_is_exception_pending(env, &p); if (p) napi_get_and_clear_last_exception(env, &r); }
  inlineSourceMap(js);   // DevTools reads no file:// map of a node target by itself
  if (std::strstr(e, "brk")) {   // --inspect-brk: wait for DevTools, then stop at the program's first statement
    std::fprintf(stderr, "zinc: waiting for the debugger\n");
    std::unique_lock<std::mutex> lock(gMu);
    gWaiting = true;
    while (gWaiting) {
      gCv.wait(lock, [] { return gWork || !gWaiting; });
      gWork = false;
      lock.unlock();
      zn_hermes_cdp_run();
      lock.lock();
    }
    lock.unlock();
    zn_hermes_cdp_run();
    zn_hermes_cdp_pause();
  }
}

}  // namespace zn::engine

// zinc's bindings name their scripts (hermes.h). The bundle itself runs from its bytecode when zinc build compiled one (gBytecode), or from a
// Static Hermes unit when ZINC_HERMES_UNIT names one: a library shermes compiled from this bundle (`shermes -shared -exported-unit=zinc_bundle`),
// loaded here and run in this env's Runtime.
napi_status napi_run_script(napi_env env, napi_value script, const char* source_url, napi_value* result) {
  using zn::engine::gBundle;
  const bool bundle = source_url && gBundle == source_url;
  if (const char* unit = std::getenv("ZINC_HERMES_UNIT"); unit && *unit && bundle) {
    void* h = dlopen(unit, RTLD_NOW | RTLD_LOCAL);
    auto creator = h ? reinterpret_cast<SHUnit* (*)()>(dlsym(h, "sh_export_zinc_bundle")) : nullptr;
    if (!creator) { std::fprintf(stderr, "zinc: ZINC_HERMES_UNIT %s: %s\n", unit, h ? "no sh_export_zinc_bundle" : dlerror()); return napi_generic_failure; }
    return zn_hermes_run_unit(env, creator, result);
  }
  if (bundle && !zn::engine::gBytecode.empty()) {   // mapped, not read: Hermes runs bytecode in place
    const int fd = ::open(zn::engine::gBytecode.c_str(), O_RDONLY);
    struct stat st{};
    void* p = fd >= 0 && fstat(fd, &st) == 0 && st.st_size > 0 ? mmap(nullptr, static_cast<size_t>(st.st_size), PROT_READ, MAP_PRIVATE, fd, 0) : MAP_FAILED;
    if (fd >= 0) close(fd);
    if (p != MAP_FAILED) {
      const hermes_bytecode_flags flags{sizeof(hermes_bytecode_flags), true, false, false};   // persistent: the program's code lives to the exit
      return hermes_run_bytecode(env, static_cast<const uint8_t*>(p), static_cast<size_t>(st.st_size), zn::engine::unmap, nullptr, source_url, &flags, result);
    }
  }
  size_t n = 0;
  if (napi_get_value_string_utf8(env, script, nullptr, 0, &n) != napi_ok) return napi_string_expected;
  std::string src(n, '\0');
  napi_get_value_string_utf8(env, script, src.data(), n + 1, &n);
  return zn_hermes_run(env, src.data(), n, source_url, zn::engine::gOptimize, result);
}

extern "C" __attribute__((visibility("default"))) int zn_engine_run(const zn_engine_args* a) { return zn::engine::run(a); }

// zinc build of a project on Hermes: the bundle compiled to Hermes bytecode beside it (<name>.hbc, optimised as hermesc -O), which zinc run then
// loads instead of the source (beforeEntry). No Runtime is made. The frames of its stack traces name the bundle's file; the driver maps them back
// through the bundle's source map. 0, or 1 with the reason on stderr.
extern "C" __attribute__((visibility("default"))) int zn_engine_compile(const char* bundle) {
  std::ifstream in(bundle, std::ios::binary);
  if (!in) { std::fprintf(stderr, "zinc: cannot read %s\n", bundle); return 1; }
  std::stringstream ss;
  ss << in.rdbuf();
  const std::string src = ss.str();
  uint8_t* out = nullptr;
  size_t size = 0;
  char* err = nullptr;
  if (!zn_hermes_compile(src.data(), src.size(), std::filesystem::path(bundle).filename().c_str(), true, &out, &size, &err)) {
    std::fprintf(stderr, "zinc: Hermes does not compile %s: %s\n", bundle, err ? err : "?");
    std::free(err);
    return 1;
  }
  const std::string path = zn::engine::bytecodeOf(bundle), tmp = path + ".tmp";
  std::ofstream o(tmp, std::ios::binary);
  o.write(reinterpret_cast<const char*>(out), static_cast<std::streamsize>(size));
  o.close();
  std::free(out);
  std::error_code ec;
  if (!o || (std::filesystem::rename(tmp, path, ec), ec)) { std::fprintf(stderr, "zinc: cannot write %s\n", path.c_str()); return 1; }
  return 0;
}
