// The native modules of a console core (ZN-454, ZN-759): no dlopen and no plugin threads on a console, so the only modules are the ones linked into
// the core (zinc:audio's mixer, audio_console.cpp; zinc:lan's sockets, plugins/lan/native/lan.abi.cpp; zinc:3d's Render3D when the core has
// graphics); a program that calls another gets "not linked into this engine", as on WASI. src/rt/native.cpp stays out of the core.
#include <cstring>
#include <deque>
#include <string>
#include <vector>

#include "zn/native.h"

extern "C" const ZnModule zn_console_audio_module;
extern "C" const ZnModule zn_console_lan_module;
#ifdef ZN_CONSOLE_WITH_3D
extern "C" const ZnModule* zn_module_Render3D(void);   // zinc:3d, the thunk zinc native-gen made from plugins/3d (targets/console/CMakeLists.txt)
#endif

namespace {
// What a call of the core's modules can ask of the engine: the error it throws and scratch for its string and array results (an array argument the
// module changed comes back through ret_buf). They live until the next call, as in src/rt/native.cpp; the rest of the table stays null.
std::deque<std::vector<char>> gBufs;
std::string gError;
void apiSetError(ZnCtx*, const char* message) { gError = message ? message : ""; }
void* apiRetBuf(ZnCtx*, uint32_t bytes) { gBufs.emplace_back(bytes ? bytes : 1); return gBufs.back().data(); }
ZnStr apiRetStr(ZnCtx* cx, const char* p, uint32_t n) { char* d = static_cast<char*>(apiRetBuf(cx, n)); if (n) std::memcpy(d, p, n); return ZnStr{d, n}; }
ZnHostApi makeApi() { ZnHostApi h{}; h.size = sizeof h; h.set_error = apiSetError; h.ret_str = apiRetStr; h.ret_buf = apiRetBuf; return h; }
const ZnHostApi gApi = makeApi();

const ZnModule* moduleOf(const char* name) {
  static const ZnModule* modules[3];
  static int count = -1;
  if (count < 0) {   // once: a module made by the thunk starts its implementation in init
    count = 0;
    modules[count++] = &zn_console_audio_module;
    modules[count++] = &zn_console_lan_module;
#ifdef ZN_CONSOLE_WITH_3D
    const ZnModule* m = zn_module_Render3D();
    void* self = nullptr;
    if (!m->init || m->init(&gApi, &self) == ZN_OK) modules[count++] = m;
#endif
  }
  for (int i = 0; i < count; i++) if (!std::strcmp(modules[i]->name, name)) return modules[i];
  return nullptr;
}
}  // namespace

extern "C" {
const ZnExport* zn_native_find(const char* module, const char* name) {
  const ZnModule* m = moduleOf(module);
  if (m) for (uint32_t i = 0; i < m->nexports; i++) if (!std::strcmp(m->exports[i].name, name)) return &m->exports[i];
  return nullptr;
}
int32_t zn_native_has_module(const char* module) { return moduleOf(module) != nullptr; }
int32_t zn_native_call(const char* module, const char* name, const char*, const ZnVal* args, ZnVal* ret, char* err, size_t errsize) {
  const ZnExport* e = zn_native_find(module, name);   // the signature was checked when the program was loaded (Machine::load)
  if (e) {
    gBufs.clear();
    gError.clear();
    int32_t st = e->fn(nullptr, nullptr, args, ret);
    if (st != ZN_OK && err && errsize) std::strncpy(err, gError.empty() ? "the native module failed" : gError.c_str(), errsize - 1);
    return st;
  }
  if (err && errsize) std::strncpy(err, "this native module is not linked into a console core", errsize - 1);
  return -1;
}
uint64_t zn_native_last_promise(void) { return 0; }
void zn_native_set_sink(const ZnSink*) {}
void zn_native_drop_callbacks(void) {}
uint32_t zn_native_drain(void) { return 0; }
int32_t zn_native_pending(void) { return 0; }
void zn_native_poll(uint64_t) {}
}
