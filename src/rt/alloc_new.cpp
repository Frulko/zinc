// The global operators new and delete on mimalloc, with the heap budget counting (ZN-120). Kept apart from alloc.cpp: a program that replaces the global operators makes dyld bind them
// across libc++ at every launch (3 ms and 8 MB for a program that prints one line, ZN-146), so `zinc build` links this file into a program only when it needs the budget.
#include <mimalloc.h>
#include <cstdlib>
#include <new>
#include "rt/rt.h"

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
