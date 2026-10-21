#pragma once
// Forced into every file of libzn_engine_hermes (CMakeLists.txt). Hermes's Node-API has the standard napi_run_script(env, script, result);
// zinc's bindings name the script (the four-argument form of JsRuntimeHost and of zinc's QuickJS), so src/engine/hermes.cpp gives that form.
#ifdef __cplusplus
#include <napi/js_native_api.h>
napi_status napi_run_script(napi_env env, napi_value script, const char* source_url, napi_value* result);
#endif
