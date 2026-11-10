#pragma once
// zinc:worker for another engine than the typed ones (QuickJS, src/qjs/worker_js.cpp): the threads, queues, loop events and tools of
// src/rt/worker.cpp, with the program run and the messages encoded by that engine. Apart from zn/host.h, which runtime/zrt.h follows in
// the host (no standard header before it).
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace zn::host {

struct WorkerSource {
  enum class Kind { Typed, ClassicFile, ModuleFile, ClassicSource, ModuleSource };
  Kind kind = Kind::Typed;
  std::string text, base;
};

// The calls mirror the Rt::HostWorker* rows; a handle is what start returned, 0 the worker itself.
struct WorkerBridge {
  static constexpr std::size_t kQueueMessages = 256, kQueueBytes = 16 * 1024 * 1024;
  // Runs `run(entry)` on a new thread (its own engine; false with the error onerror receives): the handle, or 0 with `err`.
  int (*start)(const std::string& entry, const std::string& sIn, const std::string& sOut, const WorkerSource& source, bool (*run)(const std::string& entry, const WorkerSource& source, std::string& error), std::string& err);
  const char* (*post)(std::int64_t h, std::vector<std::uint8_t>&& bytes);   // an encoded message onto its queue: null or the error
  bool (*next)(std::int64_t h, std::vector<std::uint8_t>& out);            // the next message's bytes; false when none waits
  std::string (*error)(std::int64_t h);   // Rt::HostWorkerError
  void (*close)(std::int64_t h);          // Rt::HostWorkerClose
  std::string (*schema)(int which);       // Rt::HostWorkerSchema
  void (*mark)(std::int64_t h, int phase);   // Rt::HostWorkerMark
  bool (*onWorker)();                     // the calling thread is a worker's
  bool (*stopping)();                     // ... and terminate() asked it to stop
  void (*deliver)();                      // at Rt::HostEvReady
  void (*idleWait)();                     // at Rt::HostLoopWait
  void (*shutdown)();                     // the main program returned
};
extern const WorkerBridge workerBridge;   // defined in src/rt/worker.cpp

}  // namespace zn::host
