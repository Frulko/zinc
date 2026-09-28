// zinc:ffi for macos and linux on x86-64 and arm64: dlopen / dlsym, and calls without libffi.
// Integer-class arguments (integers, pointers) and floating-point arguments travel in separate register files on both
// System V x86-64 (rdi.. / xmm0..) and AAPCS64 (x0.. / d0..), whatever their order in the C prototype. So a
// function taking up to 6 integer-class and 8 double arguments can be called through one prototype,
// R f(i64 x6, double x8), and the unused registers are ignored by the callee.
// ponytail: no variadic functions (printf: Apple arm64 puts variadics on the stack), no struct by value, no f32
// arguments (a float is read from the low half of the register), no callbacks; libffi when those are needed.
#include "zinc_native_ffi.h"
#include <dlfcn.h>
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

typedef int64_t (*IntFn)(int64_t, int64_t, int64_t, int64_t, int64_t, int64_t, double, double, double, double, double, double, double, double);
typedef double (*DblFn)(int64_t, int64_t, int64_t, int64_t, int64_t, int64_t, double, double, double, double, double, double, double, double);
typedef float (*FltFn)(int64_t, int64_t, int64_t, int64_t, int64_t, int64_t, double, double, double, double, double, double, double, double);

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
    double r = 0;
    if (ret == 4) r = ((DblFn)f)(I[0], I[1], I[2], I[3], I[4], I[5], D[0], D[1], D[2], D[3], D[4], D[5], D[6], D[7]);
    else if (ret == 7) r = (double)((FltFn)f)(I[0], I[1], I[2], I[3], I[4], I[5], D[0], D[1], D[2], D[3], D[4], D[5], D[6], D[7]);
    else {
      int64_t v = ((IntFn)f)(I[0], I[1], I[2], I[3], I[4], I[5], D[0], D[1], D[2], D[3], D[4], D[5], D[6], D[7]);
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
