#pragma once
// Blocks the runtime allocated and freed since the start (objects and the storage of their arrays and Maps): `allocations()` and `liveObjects()` of zinc:sys read them,
// so a frame that must not allocate can be checked (ZN-192). Per thread: each worker (D181) counts its own program's blocks, with plain increments.
#include <cstdint>
namespace zn::rt {
inline thread_local std::uint64_t gAllocs = 0, gFrees = 0;
}
