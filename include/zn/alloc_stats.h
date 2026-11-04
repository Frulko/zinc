#pragma once
// Blocks the runtime allocated and freed since the start (objects and the storage of their arrays and Maps): `allocations()` and `liveObjects()` of zinc:sys read them,
// so a frame that must not allocate can be checked (ZN-192). Per thread: each worker (D181) counts its own program's blocks, with plain increments.
#include <cstdint>
#include "zn/thread_local.h"
namespace zn::rt {
inline std::uint64_t& gAllocs() { struct State { std::uint64_t value = 0; }; return zn::threadLocal<State>().value; }
inline std::uint64_t& gFrees() { struct State { std::uint64_t value = 0; }; return zn::threadLocal<State>().value; }
}
