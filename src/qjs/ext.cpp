#include "zn/js_ext.h"

#include <unordered_map>
#include <vector>

#include <napi/env.h>

namespace zn::qjs {
// The compiled extension table is owned outside the engine.
void libraryHooks(ContextHook& context, SourceHook& source);
namespace {
struct Hook { ContextHook context; SourceHook source; };
std::vector<Hook>& hooks() {
  static std::vector<Hook> v = [] {
    Hook h{};
    libraryHooks(h.context, h.source);
    return std::vector<Hook>{h};
  }();
  return v;
}
std::unordered_map<JSContext*, napi_env>& envs() { static std::unordered_map<JSContext*, napi_env> m; return m; }
}  // namespace
void addContextHook(ContextHook h) { addContextHook(h, nullptr); }
void addContextHook(ContextHook h, SourceHook source) { hooks().push_back({h, source}); }
void runContextHooks(napi_env env) { for (const Hook& h : hooks()) h.context(env); }
void runSourceHooks(std::string& source) {
  for (auto h=hooks().rbegin(); h!=hooks().rend(); ++h) if (h->source) h->source(source);
}

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
