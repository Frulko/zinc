// zinc:worker in the browser build (tools/build-wasm): the WASI interpreter has one thread (no std::mutex, no pthread_create in wasm32-wasi), so
// src/rt/worker.cpp is replaced by this: the rest of the runtime links, and a program that starts a worker gets an error that says why.
// A worker on a Web Worker of its own is a later step (D181).
#include "rt/worker.h"
#include "zn/host.h"

namespace zn::host { LoopBridge loopBridge; }

namespace zn::rt::worker {

bool gBytecode = false;
TraceHook traceHook = nullptr;
MachineHook machineHook = nullptr;

const char* call(Machine&, Rt, Slot*) { return "zinc:worker is not available in the browser build (one thread)"; }
void deliver() {}
void idleWait() {}
bool stopping() { return false; }
void shutdown() {}
void addCompiled(const char*, const unsigned char*, std::size_t, int (*const*)(Machine&, Slot*), std::size_t) {}
std::vector<Info> snapshot() { return {}; }
const char* traceThreads(int op, std::uint64_t (*)(), std::size_t* n) { if (n) *n = 0; return op == 3 ? "[]" : ""; }

}  // namespace zn::rt::worker
