#pragma once
// Extension point of the JavaScript engines (ZN-203.03): a module that wants native classes in the JS global scope (WebGL, Intl.Segmenter) registers a hook; the engine
// runs the hooks on every context it creates for a trusted program (`zinc run --engine quickjs`). Sandboxed zinc:script contexts get nothing unless the host exposes it.
// The hooks receive the context's Node-API environment (ZN-773, docs/reports/js-engines-jsc-v8.md): a binding is written once against Node-API and runs on every engine.
struct JSContext;
typedef struct napi_env__* napi_env;

namespace zn::qjs {

using ContextHook = void (*)(napi_env);
void addContextHook(ContextHook h);
void runContextHooks(napi_env env);

// The Node-API environment of a QuickJS context, made at its first use; napiRelease before JS_FreeContext. contextOf: the way back, for code not ported yet.
napi_env napiEnv(JSContext* ctx);
void napiRelease(JSContext* ctx);
JSContext* contextOf(napi_env env);

}  // namespace zn::qjs
