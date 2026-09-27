# 0002 — `hal_alloc` (malloc) before TLSF

**Context.** MEM-10 requires a TLSF heap over the region given by `hal_heap_region`. On macOS and Linux the system allocator is
available and the first increment targets only those.

**Choice.** `hal.h` exposes `hal_alloc`/`hal_free`, implemented with `malloc`/`free` in `targets/common/hal_posix.cpp`.
`hal_heap_region` is not declared yet. The runtime counts allocations and live objects, which is enough for the leak report.

**Consequences.** No heap cap for `--profile` emulation yet (TGT-MAC-03 is partial). TLSF lands with the first constrained target;
only `zrt::alloc`/`zrt::mfree` change.
