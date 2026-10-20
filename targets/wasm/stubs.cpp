// What the WASI build of the pure runtime does without (ZN-135): native modules (no dlopen, no threads here: a program that calls one gets "unknown module") and C++ exceptions
// (libc++ for WASI is built without them; the only throws left are the library's length_error / bad_alloc on absurd sizes, which end the program).
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "zn/native.h"

extern "C" {
const ZnExport* zn_native_find(const char*, const char*) { return nullptr; }
int32_t zn_native_has_module(const char*) { return 0; }
int32_t zn_native_call(const char*, const char*, const char*, const ZnVal*, ZnVal*, char* err, size_t errsize) { if (err && errsize) std::strncpy(err, "native modules are not available on WASI", errsize - 1); return -1; }
uint64_t zn_native_last_promise(void) { return 0; }
void zn_native_set_sink(const ZnSink*) {}
void zn_native_drop_callbacks(void) {}
uint32_t zn_native_drain(void) { return 0; }
int32_t zn_native_pending(void) { return 0; }
void zn_native_poll(uint64_t) {}

void* __cxa_allocate_exception(size_t n) { return std::malloc(n); }
void __cxa_throw(void*, void*, void (*)(void*)) { std::fputs("panic: C++ exception in the WASI runtime\n", stderr); std::abort(); }
}
