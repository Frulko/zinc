#pragma once
// Extension point of the QuickJS engine (ZN-203.03): a module that wants native classes in the JS global scope (WebGL) registers a hook; the engine runs the hooks on every
// context it creates for a trusted program (`zinc run --engine quickjs`). Sandboxed zinc:script contexts get nothing unless the host exposes it.
struct JSContext;

namespace zn::qjs {

using ContextHook = void (*)(JSContext*);
void addContextHook(ContextHook h);
void runContextHooks(JSContext* ctx);

}  // namespace zn::qjs
