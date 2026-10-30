// Running a module on the shared machine: the part of `zinc run` that does not depend on how functions are executed.
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "rt/rt.h"
#include "rt/worker.h"

namespace zn::rt {

Result runModule(const zbc::Module& mod, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData) {
  return runModuleHooked(mod, out, traceFree, setup, setupData, nullptr, nullptr, 0, 0, true);
}

Result runModuleHooked(const zbc::Module& mod, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData,
                       void (*finish)(Machine&, const void*), const void* finishData, std::size_t stackSlots, std::size_t maxDepth, bool outLive) {
  Machine m;
  m.stackSlots = stackSlots;
  m.maxDepth = maxDepth;
  m.out = &out;
  m.outLive = outLive;
  m.traceFree = traceFree;
  Result res;
  std::string err;
  if (!m.load(mod, err)) { res.ok = false; res.error = err; return res; }
#ifndef ZN_NO_MIMALLOC   // the sanitizer build keeps ASan's allocator, without the budget of src/rt/alloc.cpp
  if (mod.heapBytes && !gOnWorker) setHeapBudget(mod.heapBytes);   // the target profile's heap, carried by the program (ZN-229); a worker counts against it
#endif
  if (setup) setup(m, setupData);
  const bool ran = m.exec(&m.funcs[0], m.stack);
  worker::shutdown();   // the workers it started end with it
  if (!ran) { res.ok = false; res.error = m.error; nativeEnd(m); }
  else {
    nativeEnd(m);
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }  // statics die in reverse order of definition
    res.leaked = m.live - m.immortals;   // the same count as walking the registry, which an AOT program does not keep (ZN-422)
  }
  if (finish) finish(m, finishData);
  res.trace = std::move(m.trace);
  return res;
}

int report(const Result& res, const std::string& out, bool traceFree) {
  std::fwrite(out.data(), 1, out.size(), stdout);
  if (traceFree) std::fwrite(res.trace.data(), 1, res.trace.size(), stderr);
  if (!res.ok) {
    std::fflush(stdout);  // what the program printed comes before the error
    if (res.error.rfind("panic: ", 0) == 0) { std::fprintf(stderr, "%s\n", res.error.c_str()); return 101; }  // an uncaught exception
    std::fprintf(stderr, "runtime error: %s\n", res.error.c_str());
    return 1;
  }
  if (std::getenv("ZN_LEAK_CHECK") && res.leaked) { std::fprintf(stderr, "leaked %zu object(s)\n", res.leaked); return 4; }
  return 0;
}

namespace {
struct Natives { int (*const* fns)(Machine&, Slot*); std::size_t count; };
void bind(Machine& m, const void* data) {
  m.registry = false;   // an AOT program: its process ends with this machine, the leftovers need no freeing (ZN-422)
  const auto* n = static_cast<const Natives*>(data);
  for (std::size_t i = 0; i < n->count && i < m.funcs.size(); ++i) m.funcs[i].native = n->fns[i];
}
}  // namespace

int runProgramPacked(const unsigned char* packed, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count) {
  std::vector<std::uint8_t> bytes;
  if (!zbc::unpackRuns(packed, size, bytes)) { std::fprintf(stderr, "embedded module: damaged\n"); return 1; }
  return runProgram(bytes.data(), bytes.size(), natives, count);
}

int runProgram(const unsigned char* zbcBytes, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count) {
  zbc::Module mod;
  std::string err;
  std::vector<std::uint8_t> bytes(zbcBytes, zbcBytes + size);
  if (!zbc::decode(bytes, mod, err)) { std::fprintf(stderr, "embedded module: %s\n", err.c_str()); return 1; }
  err = zbc::verify(mod);
  if (!err.empty()) { std::fprintf(stderr, "embedded module: invalid ZBC: %s\n", err.c_str()); return 1; }
  std::string out;
  bool trace = std::getenv("ZN_TRACE_FREE") != nullptr;
  Natives n{natives, count};
  Result res = runModule(mod, out, trace, bind, &n);
  return report(res, out, trace);
}

}  // namespace zn::rt
