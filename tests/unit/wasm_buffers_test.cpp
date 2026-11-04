// Exercise both WASM entry points on the host, with decoder/executor stubs at their ownership boundary.
#include <cassert>
#include <cstdlib>
#include <new>
#include "vm/vm.h"
#define main zinc_wasi_main
#include "../../targets/wasm/vm_main.cpp"
#undef main
#include "../../targets/wasm/web_main.cpp"
static const void* encoded;
static bool released;
static int executed;
void* operator new(std::size_t n) { if (void* p = std::malloc(n ? n : 1)) return p; throw std::bad_alloc(); }
void operator delete(void* p) noexcept { if (p == encoded) released = true; std::free(p); }
void operator delete(void* p, std::size_t) noexcept { ::operator delete(p); }
namespace zn::zbc {
bool decode(const std::vector<std::uint8_t>& bytes, Module&, std::string&) { encoded = bytes.data(); released = false; return true; }
std::string verify(const Module&) { assert(!released); return ""; }
}
namespace zn::vm {
zn::rt::Result run(const zn::zbc::Module&, std::string&, bool) { assert(released); ++executed; return {}; }
}
namespace zn::rt { int report(const Result&, const std::string&, bool) { return 0; } }
int main(int argc, char** argv) {
  assert(argc == 2);
  const unsigned char input[4096] = {};
  assert(zn_run(input, sizeof input) == 0 && executed == 1);
  FILE* f = std::fopen(argv[1], "wb"); assert(f);
  assert(std::fwrite(input, 1, sizeof input, f) == sizeof input); std::fclose(f);
  char* args[] = {argv[0], argv[1]};
  assert(zinc_wasi_main(2, args) == 0 && executed == 2);
  std::puts("wasm entry buffers: released before execution");
}
