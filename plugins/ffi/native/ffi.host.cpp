// zinc:ffi for macos and linux: dlopen / dlsym, and calls through libffi (the system's: the macOS SDK, libffi-dev elsewhere).
// The Spec passes the integer-class arguments (integers, pointers, strings) and the floating-point ones as two lists, so the call is
// prepared as R f(i64 x n, double x m): the order that both System V and AAPCS64 use for their register files, and libffi handles the
// stack and the calling convention of the machine (the 32-bit Pi included, where the hand-rolled call of the first version did not reach).
// ponytail: no variadic functions, no struct by value, no f32 arguments (the Spec has none), no callbacks.
#include "zinc_native_ffi.h"
#include <dlfcn.h>
#if __has_include(<ffi.h>)
#include <ffi.h>
#else
#include <ffi/ffi.h>   // the macOS SDK keeps it in a directory
#endif
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static const int MAXLIB = 64;
static void* libs[MAXLIB];
static char err_msg[512];
static zrt::String last_text;
static zrt::String str(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
struct CStr { zrt::StrBuilder sb; CStr(const zrt::String& s) { zrt::to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };

struct HostFfi : NativeFfi {
  int32_t open(zrt::String path) override {
    int h = 0;
    while (h < MAXLIB && libs[h]) h++;
    if (h == MAXLIB) { strcpy(err_msg, "too many libraries"); return -1; }
    CStr p(path);
    void* l = dlopen(path.bytes() ? p.c() : nullptr, RTLD_NOW | RTLD_LOCAL);
    if (!l) { const char* e = dlerror(); snprintf(err_msg, sizeof err_msg, "%s", e ? e : "dlopen failed"); return -1; }
    libs[h] = l;
    return h;
  }
  void close(int32_t h) override { if (h >= 0 && h < MAXLIB && libs[h]) { dlclose(libs[h]); libs[h] = nullptr; } }
  double sym(int32_t h, zrt::String name) override {
    if (h < 0 || h >= MAXLIB || !libs[h]) { strcpy(err_msg, "library is closed"); return 0; }
    CStr n(name);
    dlerror();
    void* s = dlsym(libs[h], n.c());
    if (!s) { snprintf(err_msg, sizeof err_msg, "symbol not found: %s", n.c()); return 0; }
    return (double)(uintptr_t)s;
  }
  zrt::String error() override { return str(err_msg); }
  double call(double fn, zrt::Array<double> ints, zrt::Array<zrt::String> strs, zrt::Array<int32_t> strAt, zrt::Array<double> floats, int32_t ret) override {
    int64_t I[6] = {0, 0, 0, 0, 0, 0};
    double D[8] = {0, 0, 0, 0, 0, 0, 0, 0};
    char* owned[6] = {nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
    for (int32_t i = 0; i < ints.length() && i < 6; i++) I[i] = (int64_t)ints.get(i);
    for (int32_t k = 0; k < strs.length() && k < 6; k++) {  // strings: NUL-terminated copies, alive during the call
      int32_t at = strAt.get(k);
      if (at < 0 || at >= 6) continue;
      zrt::String s = strs.get(k);
      owned[at] = (char*)malloc(s.bytes() + 1);
      memcpy(owned[at], s.ptr(), s.bytes()); owned[at][s.bytes()] = 0;
      I[at] = (int64_t)(intptr_t)owned[at];
    }
    for (int32_t i = 0; i < floats.length() && i < 8; i++) D[i] = floats.get(i);
    void* f = (void*)(uintptr_t)fn;
    int ni = ints.length() > 6 ? 6 : ints.length(), nf = floats.length() > 8 ? 8 : floats.length();
    for (int32_t k = 0; k < strs.length() && k < 6; k++) { int32_t at = strAt.get(k); if (at >= ni && at < 6) ni = at + 1; }   // a string argument beyond the integers
    ffi_type* types[14];
    void* values[14];
    int64_t iv[6];
    double dv[8];
    for (int i = 0; i < ni; i++) { types[i] = &ffi_type_sint64; iv[i] = I[i]; values[i] = &iv[i]; }
    for (int i = 0; i < nf; i++) { types[ni + i] = &ffi_type_double; dv[i] = D[i]; values[ni + i] = &dv[i]; }
    ffi_type* rt = ret == 4 ? &ffi_type_double : ret == 7 ? &ffi_type_float : ret == 0 ? &ffi_type_void : &ffi_type_sint64;
    ffi_cif cif;
    double r = 0;
    if (ffi_prep_cif(&cif, FFI_DEFAULT_ABI, (unsigned)(ni + nf), rt, types) != FFI_OK) { strcpy(err_msg, "ffi_prep_cif failed"); for (char* o : owned) ::free(o); return 0; }
    union { int64_t i; double d; float f; } res;
    res.i = 0;
    ffi_call(&cif, FFI_FN(f), &res, values);
    if (ret == 4) r = res.d;
    else if (ret == 7) r = (double)res.f;
    else {
      int64_t v = res.i;
      if (ret == 1) r = (double)(int32_t)v;
      else if (ret == 2) r = (double)(uint32_t)v;
      else if (ret == 3) r = (double)v;
      else if (ret == 5) r = (double)(uintptr_t)v;
      else if (ret == 6) { const char* s = (const char*)(intptr_t)v; last_text = s ? str(s) : zrt::String(); r = s ? 1 : 0; }
    }
    for (char* o : owned) ::free(o);
    return r;
  }
  zrt::String text() override { return last_text; }
  double alloc(int32_t n) override { return (double)(uintptr_t)calloc(1, n > 0 ? (size_t)n : 1); }
  void free(double p) override { ::free((void*)(uintptr_t)p); }
  zrt::Array<uint8_t> read(double p, int32_t n) override {
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n);
    if (p && n > 0) { memcpy(r.a->data, (const void*)(uintptr_t)p, (size_t)n); r.a->len = n; }
    return r;
  }
  void write(double p, zrt::Array<uint8_t> data) override { if (p && data.length()) memcpy((void*)(uintptr_t)p, data.a->data, (size_t)data.length()); }
  zrt::String readCString(double p) override { return p ? str((const char*)(uintptr_t)p) : zrt::String(); }
};

NativeFfi* zinc_create_Ffi() {
  static HostFfi inst;
  inst.rc = zrt::IMMORTAL;
  zrt::at_finish([] { last_text = zrt::String(); });  // before the leak report
  return &inst;
}
