// Running a module on the shared machine: the part of `zinc run` that does not depend on how functions are executed.
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "rt/rt.h"

namespace zn::rt {

Result runModule(const zbc::Module& mod, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData) {
  return runModuleHooked(mod, out, traceFree, setup, setupData, nullptr, nullptr);
}

Result runModuleHooked(const zbc::Module& mod, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData,
                       void (*finish)(Machine&, const void*), const void* finishData, std::size_t stackSlots, std::size_t maxDepth) {
  Machine m;
  m.stackSlots = stackSlots;
  m.maxDepth = maxDepth;
  m.out = &out;
  m.traceFree = traceFree;
  Result res;
  std::string err;
  if (!m.load(mod, err)) { res.ok = false; res.error = err; return res; }
  if (setup) setup(m, setupData);
  if (!m.exec(&m.funcs[0], m.stack)) { res.ok = false; res.error = m.error; }
  else {
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }  // statics die in reverse order of definition
    for (const Obj* o : m.allocated) if (o->rc != kImmortal) ++res.leaked;
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
  const auto* n = static_cast<const Natives*>(data);
  for (std::size_t i = 0; i < n->count && i < m.funcs.size(); ++i) m.funcs[i].native = n->fns[i];
}
}  // namespace

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
