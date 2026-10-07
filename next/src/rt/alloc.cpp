// The allocator of the runtime: mimalloc serves every global `new`/`delete` (the heap objects, their vectors, the compiler's own
// data) so interpreter and compiled programs allocate the same way. Objects themselves use zn::rt::alloc below.
#include <mimalloc.h>
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

// The global operators: mimalloc, with the budget counting.
using zn::rt::gHeapBudgetOn;
using zn::rt::heapAccount;
static inline void* counted(void* p) { if (gHeapBudgetOn) heapAccount(p, true); return p; }
static inline void uncount(void* p) { if (gHeapBudgetOn) heapAccount(p, false); }
void operator delete(void* p) noexcept { uncount(p); mi_free(p); }
void operator delete[](void* p) noexcept { uncount(p); mi_free(p); }
void operator delete(void* p, const std::nothrow_t&) noexcept { uncount(p); mi_free(p); }
void operator delete[](void* p, const std::nothrow_t&) noexcept { uncount(p); mi_free(p); }
void* operator new(std::size_t n) noexcept(false) { return counted(mi_new(n)); }
void* operator new[](std::size_t n) noexcept(false) { return counted(mi_new(n)); }
void* operator new(std::size_t n, const std::nothrow_t&) noexcept { return counted(mi_new_nothrow(n)); }
void* operator new[](std::size_t n, const std::nothrow_t&) noexcept { return counted(mi_new_nothrow(n)); }
void operator delete(void* p, std::size_t) noexcept { uncount(p); mi_free(p); }
void operator delete[](void* p, std::size_t) noexcept { uncount(p); mi_free(p); }
void operator delete(void* p, std::align_val_t al) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void operator delete[](void* p, std::align_val_t al) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void operator delete(void* p, std::size_t, std::align_val_t al) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void operator delete[](void* p, std::size_t, std::align_val_t al) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void operator delete(void* p, std::align_val_t al, const std::nothrow_t&) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void operator delete[](void* p, std::align_val_t al, const std::nothrow_t&) noexcept { uncount(p); mi_free_aligned(p, static_cast<std::size_t>(al)); }
void* operator new(std::size_t n, std::align_val_t al) noexcept(false) { return counted(mi_new_aligned(n, static_cast<std::size_t>(al))); }
void* operator new[](std::size_t n, std::align_val_t al) noexcept(false) { return counted(mi_new_aligned(n, static_cast<std::size_t>(al))); }
void* operator new(std::size_t n, std::align_val_t al, const std::nothrow_t&) noexcept { return counted(mi_new_aligned_nothrow(n, static_cast<std::size_t>(al))); }
void* operator new[](std::size_t n, std::align_val_t al, const std::nothrow_t&) noexcept { return counted(mi_new_aligned_nothrow(n, static_cast<std::size_t>(al))); }
