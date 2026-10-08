// The allocator of the runtime: mimalloc serves every global `new`/`delete` (the heap objects, their vectors, the compiler's own
// data) so interpreter and compiled programs allocate the same way. Objects themselves use zn::rt::alloc below.
#include <cstddef>
#ifndef __wasi__
#include <mimalloc.h>
#else
inline std::size_t mi_usable_size(const void*) { return 0; }   // WASI: the plain allocator, no heap budget (a browser tab has its own limit)
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

