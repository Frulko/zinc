// The Node-API of libzn_webgl (ZN-773.02): each napi_* the module calls is a hidden function of the module that calls the engine's own through
// the table zn_webgl_open received (include/zn/napi_table.h), so one build of the module runs on QuickJS, JavaScriptCore and V8 and resolves
// no napi_* from the program that loads it. One indirect call per Node-API call.
#include "zn/napi_table.h"

namespace zn::gl {
const zn_napi_table* gNapi = nullptr;   // set by zn_webgl_open (webgl_js.cpp) before anything else runs
}

extern "C" {
#define NAPI_TRAMPOLINE(ret, name, params, args) \
  ret NAPI_CDECL name params { return zn::gl::gNapi->name##_ args; }
ZN_NAPI_FUNCTIONS(NAPI_TRAMPOLINE)
#undef NAPI_TRAMPOLINE
}
