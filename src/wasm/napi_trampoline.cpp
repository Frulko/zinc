// The Node-API of libzn_wasm (ZN-773.06), as src/gl/napi_trampoline.cpp does for libzn_webgl: each napi_* the module calls is a hidden function
// that calls the engine's own through the tables zn_wasm_install received, so the module resolves no napi_* from the program that loads it.
#include "zn/napi_table.h"

namespace zn::wasm {
const zn_napi_table* gNapi = nullptr;          // set by zn_wasm_install before anything else runs
const zn_napi_table_ext* gNapiExt = nullptr;
}

extern "C" {
#define NAPI_TRAMPOLINE(ret, name, params, args) \
  ret NAPI_CDECL name params { return zn::wasm::gNapi->name##_ args; }
ZN_NAPI_FUNCTIONS(NAPI_TRAMPOLINE)
#undef NAPI_TRAMPOLINE
#define NAPI_TRAMPOLINE(ret, name, params, args) \
  ret NAPI_CDECL name params { return zn::wasm::gNapiExt->name##_ args; }
ZN_NAPI_EXT_FUNCTIONS(NAPI_TRAMPOLINE)
#undef NAPI_TRAMPOLINE
}
