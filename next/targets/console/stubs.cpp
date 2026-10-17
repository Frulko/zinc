// What a console core does without (ZN-454): native plugin modules (no dlopen and no plugin threads on a console: a program that calls one gets
// "unknown module", as on WASI). src/rt/native.cpp stays out of the core.
#include <cstring>

#include "zn/native.h"

extern "C" {
const ZnExport* zn_native_find(const char*, const char*) { return nullptr; }
int32_t zn_native_has_module(const char*) { return 0; }
int32_t zn_native_call(const char*, const char*, const char*, const ZnVal*, ZnVal*, char* err, size_t errsize) {
  if (err && errsize) std::strncpy(err, "native modules are not available on a console core", errsize - 1);
  return -1;
}
uint64_t zn_native_last_promise(void) { return 0; }
void zn_native_set_sink(const ZnSink*) {}
void zn_native_drop_callbacks(void) {}
uint32_t zn_native_drain(void) { return 0; }
int32_t zn_native_pending(void) { return 0; }
void zn_native_poll(uint64_t) {}
}
