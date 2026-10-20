// The native modules of a console core (ZN-454, ZN-759): no dlopen and no plugin threads on a console, so the only modules are the ones linked into
// the core (zinc:audio's mixer, audio_console.cpp); a program that calls another gets "not linked into this engine", as on WASI.
// src/rt/native.cpp stays out of the core.
#include <cstring>

#include "zn/native.h"

extern "C" const ZnModule zn_console_audio_module;

namespace {
const ZnModule* const kModules[] = {&zn_console_audio_module};
const ZnModule* moduleOf(const char* name) {
  for (const ZnModule* m : kModules) if (!std::strcmp(m->name, name)) return m;
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
  if (e) return e->fn(nullptr, nullptr, args, ret);
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
