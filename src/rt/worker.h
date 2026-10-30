#pragma once
// Workers (zinc:worker, D181, docs/reports/threads-ui-compute-animation.md §3): a worker is a second program of the build (its own zbc::Module,
// embedded in the main one as zbc::Module::workers) run by its own Machine on its own thread, with its own heap and event loop. Nothing is
// shared: messages are the bytes of the D173 record wire (include/zn/rec.h), copied into a queue; the receiving loop is woken and the program
// reads them as an event of kind 70 of its loop. The program side is lib/std/worker.ts; the rows are Rt::HostWorker* (include/zn/runtime.h).
#include <cstdint>
#include <string>
#include <vector>

#include "rt/rt.h"

namespace zn::rt::worker {

// The runtime calls of zinc:worker, served here (src/rt/rtcalls.cpp sends the HostWorker* rows); an error message or null.
const char* call(Machine& m, Rt id, Slot* a);
// At the start of each loop turn (Rt::HostEvReady) on a thread that owns workers or is one: queued messages and endings become events of
// its loop; under ZINC_DETERMINISTIC the main thread first waits for each of its workers to be idle, so replies arrive at the same turn on
// every run.
void deliver();
// A worker's thread at a wait of its loop (Rt::HostLoopWait): it is idle when nothing waits in its queue (the deterministic wait above).
void idleWait();
// True on a worker's thread once terminate() asked it to stop: its next host call ends its program.
bool stopping();
// The main program returned: its workers are terminated and their threads joined (one busy in a long loop finishes it first).
void shutdown();
// The engine runs bytecode (src/vm sets it): a worker program can run from its bytecode.
extern bool gBytecode;
// A compiled program (AOT, src/aot) registers each worker's compiled code at start: its packed tables and its functions, by its key.
void addCompiled(const char* key, const unsigned char* packed, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count);

// ---- for the profiler, the debugger and DevTools (read from the main thread; cheap when nothing listens)
struct Info {
  int id = 0;                 // the handle the main program holds (1, 2...)
  std::string entry;          // the worker's file, as the program names it
  int state = 0;              // 0 running, 1 ended (its program returned or threw), 2 terminated
  std::size_t queuedIn = 0;   // messages waiting for the worker
  std::size_t queuedOut = 0;  // messages waiting for the main program
  std::uint64_t messagesIn = 0, messagesOut = 0;   // posted to it, posted by it
  std::uint64_t liveBlocks = 0;                    // the worker's live heap blocks (zinc:sys liveObjects), refreshed at each turn of its loop
  double cpuMs = 0;                                // the CPU time of its thread, refreshed at each turn of its loop and at its end
  std::string error;          // what ended it
};
std::vector<Info> snapshot();
// Trace events: the kinds below with the worker's id, its entry and, for messages, the byte count. The hook runs on the thread where the
// event happens (start, post, terminate on the poster's; receive and handler spans on the receiver's): it must be thread-safe and quick.
enum Event : int { Start = 0, PostToWorker, PostToMain, ReceiveInWorker, ReceiveInMain, HandlerBegin, HandlerEnd, Terminate, Error, End };
using TraceHook = void (*)(Event kind, int id, const char* entry, std::size_t bytes, double nowMs);
extern TraceHook traceHook;   // null: nothing listens, and nothing is measured
// The profiler and the debugger: called on a worker's thread with its machine, once loaded and before its program runs (begin), then once it has
// returned (the machine still alive). Null: nothing.
using MachineHook = void (*)(Machine& m, int id, const std::string& entry, bool begin);
extern MachineHook machineHook;
// The Chrome trace of the workers (zn::host::threadTrace, the same ops): a track per worker (tid 100 + id, named "zinc worker <entry>#<id>"), its
// onmessage spans, its posts and receives as slices joined by flow events (post, receive, handler), its start and end; the main thread is tid 1.
// It installs traceHook while it collects.
const char* traceThreads(int op, std::uint64_t (*clock)(), std::size_t* n);

}  // namespace zn::rt::worker
