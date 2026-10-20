#pragma once
// Blocks the runtime allocated and freed since the start (objects and the storage of their arrays and Maps): `allocations()` and `liveObjects()` of zinc:sys read them,
// so a frame that must not allocate can be checked (ZN-192). Plain increments: no atomics, the program runs on one thread.
#include <cstdint>
namespace zn::rt {
inline std::uint64_t gAllocs = 0, gFrees = 0;
}
