# third_party

Vendored libraries. Each directory keeps the library's licence and the pinned version below; a dependency builds with clang
and `zig c++` and needs no install step (ARCHITECTURE.md, rules).

| Library | Version | Licence | Used for |
|---|---|---|---|
| mimalloc | v2.1.7 (`src/static.c` build, global `operator new/delete` and the object allocator of `src/rt`) | MIT | Fast malloc/free for the many small objects of the runtime (interpreter and AOT programs) |
