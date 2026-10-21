#pragma once
// The driver of the engines beside QuickJS (ZN-773): src/engine/driver.cpp runs a bundled program over Node-API alone, what src/qjs/qjs.cpp's run
// does over the QuickJS API (the host rows, the prelude, the web environment, the promise jobs, the timers and the frame loop). Each engine module
// links it with the few calls below, the ones Node-API has no word for.
#include <napi/js_native_api.h>

#include <string>

#include "zn/engine.h"

namespace zn::engine {

extern const char* kName;             // "jsc", "v8": __ZINC_ENGINE__
napi_env open();                      // a context and its Node-API environment
// fn(promise, reason) for each promise still rejected with no handler once the microtasks have run
void onRejection(napi_env env, napi_value fn);
void drainJobs(napi_env env);         // runs the microtasks (JavaScriptCore runs them when the outermost call returns)
void beforeEntry(napi_env env, const zn_engine_args* a, std::string& js);   // the bundle about to run (the inspectors)
void inlineSourceMap(std::string& js);   // driver.cpp: the bundle's map as a data: URL, for an inspector that fetches no file:// map

int run(const zn_engine_args* a);     // the driver, the module's zn_engine_run
void takeZinc(const zn_engine_args* a);   // zinc.cpp: zinc's state into the module's variables
extern void (**zincRedraw)();

}  // namespace zn::engine
