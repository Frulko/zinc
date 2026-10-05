#include <cstdio>
#include <cstring>

#include "vm/vm.h"
#include "zbc/zbc.h"

int main(int argc, char** argv) {
  if (argc == 2 && !std::strcmp(argv[1], "--version")) {
    std::puts("zinc-next 0.0.1");
    return 0;
  }
  if (argc == 2 && !std::strcmp(argv[1], "--selftest")) {  // stub: emitter output runs on the VM
    auto code = zn::zbc::stubProgram();
    return zn::zbc::fits(2, 1) && zn::vm::run(code) == static_cast<int>(code.size()) ? 0 : 1;
  }
  std::fputs("usage: zinc --version\n", stderr);
  return 2;
}
