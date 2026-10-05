#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

#include "frontend/lexer.h"
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
  if (argc == 4 && !std::strcmp(argv[1], "lex")) {  // zinc lex --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    std::string_view name = argv[3];
    auto toks = zn::frontend::lex(src, name.size() >= 4 && name.substr(name.size() - 4) == ".tsx");
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(src, toks).c_str(), stdout); return 0; }
    std::string err = zn::frontend::check(src, toks);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  std::fputs("usage: zinc --version | lex --check|--dump <file>\n", stderr);
  return 2;
}
