// The allocator of the runtime: mimalloc serves the objects (zn::rt::alloc below) and their containers (ObjAlloc in rt.h). The global
// `new`/`delete` stay the system's in zinc (ZN-592: replacing them cost 8 ms of dyld patching at every launch) and in compiled programs,
// except those with a heap budget, which link alloc_new.cpp (ZN-146).
#include <cstddef>
#if !defined(__wasi__) && !defined(ESP_PLATFORM) && !defined(ZN_NO_MIMALLOC)
#include <mimalloc.h>
#else
inline std::size_t mi_usable_size(const void*) { return 0; }   // WASI, ESP-IDF and the console cores: the plain allocator, no heap budget (a browser tab, the device's heap have their own limit)
#endif
#include <cstdio>
#include <cstdlib>
#include <new>
#include "rt/rt.h"

// Heap budget of a target profile (ZN-120). Every allocation of the program (objects, and the global new/delete behind its arrays, strings and Maps) is counted by its usable size
// once the budget is set; going over it stops the program like the target's allocator does. Blocks allocated before the budget (the compiler's own) count when freed: the
// balance is signed and starts at 0, so only what the program holds counts.
namespace zn::rt {
bool gHeapBudgetOn = false;
static std::size_t gHeapBudget = 0, gHeapLimit = 0;
static std::int64_t gHeapUsed = 0;
void heapAccount(void* p, bool add) {
  if (!p) return;
  std::int64_t n = static_cast<std::int64_t>(mi_usable_size(p));
  if (!add) { gHeapUsed -= n; return; }
  gHeapUsed += n;
  if (gHeapUsed > static_cast<std::int64_t>(gHeapLimit)) {
    std::fprintf(stderr, "panic: out of memory (heap budget %zu bytes, asked %lld, in use %lld)\n", gHeapBudget, static_cast<long long>(n), static_cast<long long>(gHeapUsed - n));
    std::fflush(stderr);
    std::_Exit(101);
  }
}
// The interpreter's own structures (its register stack, the loaded module) are not the program's heap: they get a fixed headroom on top of the budget.
constexpr std::size_t kInterpreterHeadroom = 1u << 20;
void setHeapBudget(std::size_t bytes) { gHeapBudget = bytes; gHeapLimit = bytes + kInterpreterHeadroom; gHeapUsed = 0; gHeapBudgetOn = true; }
}  // namespace zn::rt


#if defined(__GLIBC__) && __GLIBC__ == 2 && __GLIBC_MINOR__ < 16
// glibc before 2.16 has no aligned_alloc, which libc++abi calls for an exception (webOS 3 on the HP TouchPad has 2.8). libc++abi gives the block
// back with free(), so it comes from the C library, not from mimalloc.
extern "C" void* aligned_alloc(std::size_t align, std::size_t n) noexcept {
  void* p = nullptr;
  return posix_memalign(&p, align < sizeof(void*) ? sizeof(void*) : align, n) ? nullptr : p;
}
#endif

#if defined(__arm__) && defined(__GLIBC__) && defined(__ARM_FP) && !defined(__ARM_PCS_VFP)
// ARM with an FPU and the soft-float calling convention (webOS 3): zig builds its own sin, cos, exp, log and sqrt without the FPU for this
// ABI, and a program takes them before the C library's, so every call was computed in software (a sine: microseconds). These send the
// calls to the device's libm, which uses the FPU. In this file because it is always linked.
#include <dlfcn.h>
#define FWD_LIBM(T, name) extern "C" T name(T x) { static T (*f)(T); if (!f) f = reinterpret_cast<T (*)(T)>(dlsym(RTLD_NEXT, #name)); return f(x); }
FWD_LIBM(double, sin) FWD_LIBM(double, cos) FWD_LIBM(double, tan) FWD_LIBM(double, exp) FWD_LIBM(double, exp2) FWD_LIBM(double, log) FWD_LIBM(double, sqrt)
FWD_LIBM(float, sinf) FWD_LIBM(float, cosf) FWD_LIBM(float, sqrtf)
extern "C" double fmod(double x, double y) { static double (*f)(double, double); if (!f) f = reinterpret_cast<double (*)(double, double)>(dlsym(RTLD_NEXT, "fmod")); return f(x, y); }
#undef FWD_LIBM
#endif
