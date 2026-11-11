#pragma once
// Extensions for trusted QuickJS contexts. Sandboxed zinc:script contexts get nothing unless the host exposes it.
// Context hooks receive QuickJS's Node-API environment; portable engines install their bindings separately.
#include <string>
struct JSContext;
typedef struct napi_env__* napi_env;

namespace zn::qjs {

using ContextHook = void (*)(napi_env);
using SourceHook = void (*)(std::string&);
void addContextHook(ContextHook h); // retain the original ABI for cached consumers
void addContextHook(ContextHook h, SourceHook source);
void runContextHooks(napi_env env);
// Raw module text, before cache lookup. Newest transforms run first; compiled recognizers run last.
// Unsupported sources stay unchanged; bundles must work without the context binding.
void runSourceHooks(std::string& source);

// The Node-API environment of a QuickJS context, made at its first use; napiRelease before JS_FreeContext. contextOf: the way back, for code not ported yet.
napi_env napiEnv(JSContext* ctx);
void napiRelease(JSContext* ctx);
JSContext* contextOf(napi_env env);

}  // namespace zn::qjs
