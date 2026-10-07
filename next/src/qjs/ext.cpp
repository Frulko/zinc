#include "zn/js_ext.h"

#include <vector>

namespace zn::qjs {
namespace {
std::vector<ContextHook>& hooks() { static std::vector<ContextHook> v; return v; }
}  // namespace
void addContextHook(ContextHook h) { hooks().push_back(h); }
void runContextHooks(JSContext* ctx) { for (ContextHook h : hooks()) h(ctx); }
}  // namespace zn::qjs
