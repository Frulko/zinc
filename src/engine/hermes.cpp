// The Hermes engine (ZN-773.07, spike): `zinc run --engine hermes`. Hermes from tools/hermes-pack (facebook/hermes static_h built from source),
// its own Node-API (API/napi, in libhermesvm) and the few entry points tools/hermes-patches/zinc-embed.patch adds to it (a Runtime, its job
// queue, an optimised compile, a Static Hermes unit); the driver (driver.cpp) for the rest. Built as libzn_engine_hermes beside zinc when the
// SDK directory is there. No inspector in this spike (Hermes's CDP agent, API/hermes/cdp, would sit behind src/dbg/ws.cpp as V8's does) and no
// WebAssembly (Hermes has none).
#include <dlfcn.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "engine/driver.h"

struct SHUnit;
extern "C" {   // libhermesvm, tools/hermes-patches/zinc-embed.patch
napi_env zn_hermes_create(bool jit);
napi_status zn_hermes_drain(napi_env env);
napi_status zn_hermes_run(napi_env env, const char* src, size_t size, const char* url, bool optimize, napi_value* result);
napi_status zn_hermes_run_unit(napi_env env, SHUnit* (*creator)(), napi_value* result);
}

namespace zn::engine {

const char* kName = "hermes";

namespace {
napi_ref gFlush = nullptr;   // the rejections the polyfill told since the last drain, handed to the driver
std::string gBundle;         // the bundle's path: its run is the one a Static Hermes unit replaces (ZINC_HERMES_UNIT)
bool gOptimize = false;

bool on(const char* var, bool dflt) { const char* v = std::getenv(var); return v && *v ? std::strcmp(v, "0") != 0 : dflt; }
}  // namespace

napi_env open() {
  gOptimize = on("ZINC_HERMES_OPT", false);   // eager compile through the full optimisation pipeline, against a lazy one (the start of a big bundle)
  napi_env env = zn_hermes_create(on("ZINC_HERMES_JIT", true));   // the arm64 baseline JIT
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

void drainJobs(napi_env env) {
  if (zn_hermes_drain(env) != napi_ok || !gFlush) return;   // the exception stays pending: the driver reports it
  napi_value flush, undefined, r;
  napi_get_reference_value(env, gFlush, &flush);
  napi_get_undefined(env, &undefined);
  napi_call_function(env, undefined, flush, 0, nullptr, &r);
}

void beforeEntry(napi_env, const zn_engine_args* a, std::string&) {
  gBundle = a->bundle;
  if (std::getenv("ZINC_INSPECT")) std::fprintf(stderr, "zinc: --inspect: no inspector on --engine hermes yet (v8: Chrome DevTools, jsc: Safari)\n");
}

}  // namespace zn::engine

// zinc's bindings name their scripts (hermes.h). The bundle itself runs from a Static Hermes unit when ZINC_HERMES_UNIT names one: a library
// shermes compiled from this bundle (`shermes -shared -exported-unit=zinc_bundle`), loaded here and run in this env's Runtime.
napi_status napi_run_script(napi_env env, napi_value script, const char* source_url, napi_value* result) {
  using zn::engine::gBundle;
  if (const char* unit = std::getenv("ZINC_HERMES_UNIT"); unit && *unit && source_url && gBundle == source_url) {
    void* h = dlopen(unit, RTLD_NOW | RTLD_LOCAL);
    auto creator = h ? reinterpret_cast<SHUnit* (*)()>(dlsym(h, "sh_export_zinc_bundle")) : nullptr;
    if (!creator) { std::fprintf(stderr, "zinc: ZINC_HERMES_UNIT %s: %s\n", unit, h ? "no sh_export_zinc_bundle" : dlerror()); return napi_generic_failure; }
    return zn_hermes_run_unit(env, creator, result);
  }
  size_t n = 0;
  if (napi_get_value_string_utf8(env, script, nullptr, 0, &n) != napi_ok) return napi_string_expected;
  std::string src(n, '\0');
  napi_get_value_string_utf8(env, script, src.data(), n + 1, &n);
  return zn_hermes_run(env, src.data(), n, source_url, zn::engine::gOptimize, result);
}

extern "C" __attribute__((visibility("default"))) int zn_engine_run(const zn_engine_args* a) { return zn::engine::run(a); }
