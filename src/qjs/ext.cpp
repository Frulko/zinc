#include "zn/js_ext.h"

#include <unordered_map>
#include <vector>

#include <napi/env.h>

namespace zn::qjs {
namespace {
std::vector<ContextHook>& hooks() { static std::vector<ContextHook> v; return v; }
std::unordered_map<JSContext*, napi_env>& envs() { static std::unordered_map<JSContext*, napi_env> m; return m; }
}  // namespace
void addContextHook(ContextHook h) { hooks().push_back(h); }
void runContextHooks(napi_env env) { for (ContextHook h : hooks()) h(env); }

napi_env napiEnv(JSContext* ctx) {
  napi_env& env = envs()[ctx];
  if (!env) env = Napi::Attach(ctx);
  return env;
}
void napiRelease(JSContext* ctx) {
  auto it = envs().find(ctx);
  if (it == envs().end()) return;
  Napi::Detach(it->second);
  envs().erase(it);
}
JSContext* contextOf(napi_env env) { return Napi::GetContext(env); }

}  // namespace zn::qjs
