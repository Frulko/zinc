// Run the real launcher with a stub decoder/machine to check ownership at the execution boundary.
#include <cassert>
#include <cstdlib>
#include <new>
#include "rt/rt.h"
#include "rt/worker.h"
static const void* encoded;
static const void* unpacked;
static bool released;
static int executed, scenario;
void* operator new(std::size_t n) {
  if (void* p = std::malloc(n ? n : 1)) return p;
  throw std::bad_alloc();
}
void operator delete(void* p) noexcept { if (p == encoded) released = true; std::free(p); }
void operator delete(void* p, std::size_t) noexcept { ::operator delete(p); }
namespace zn::zbc {
bool unpackRuns(const std::uint8_t* p, std::size_t n, std::vector<std::uint8_t>& out) {
  if (scenario == 3) return false;
  out.assign(p, p + n); unpacked = out.data(); return true;
}
bool decode(const std::vector<std::uint8_t>& bytes, Module& mod, std::string& err) {
  if (unpacked) assert(bytes.data() == unpacked);   // no second encoded copy
  encoded = bytes.data(); released = false;
  if (scenario == 1) { err = "test decode failure"; return false; }
  mod.functions.resize(1); return true;
}
std::string verify(const Module&) { assert(!released); return scenario == 2 ? "test verification failure" : ""; }
}
namespace zn::rt {
Machine::~Machine() = default;
bool Machine::load(const zbc::Module&, std::string&) {
  assert(released); funcs.resize(1); return true;   // encoded buffers must be gone before the app starts
}
bool Machine::exec(const Func*, Slot*) { assert(released); ++executed; return true; }
void Machine::destroy(Obj*) { assert(false); }
void nativeEnd(Machine&) {}
namespace worker { void shutdown() {} }
}
int main() {
  const unsigned char bytes[4096] = {};
  for (scenario = 0; scenario < 4; ++scenario) {
    unpacked = nullptr; encoded = nullptr; released = false; executed = 0;
    int status = zn::rt::runProgramPacked(bytes, sizeof bytes, nullptr, 0);
    assert(status == (scenario ? 1 : 0)); assert(executed == (scenario ? 0 : 1));
    if (scenario == 3) continue;
    unpacked = nullptr; encoded = nullptr; released = false; executed = 0;
    status = zn::rt::runProgram(bytes, sizeof bytes, nullptr, 0);
    assert(status == (scenario ? 1 : 0)); assert(executed == (scenario ? 0 : 1));
  }
  std::puts("program buffers: ok");
}
