#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>
#include <sstream>
#include <string>

#include "frontend/check.h"
#include "frontend/diagnostics.h"
#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "frontend/parser.h"
#include "ir/ir.h"
#include "aot/aot.h"
#include "zn/host.h"
#include "vm/vm.h"
#include "zbc/zbc.h"
#include "vm/vm.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

static bool readFile(const std::string& path, std::string& out) {
  if (!std::filesystem::is_regular_file(path)) return false;
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream buf;
  buf << in.rdbuf();
  out = buf.str();
  return true;
}

// Loads the entry file and the files it imports, checks the program; diagnostics are printed. Returns false on errors.
static bool gStrict = false;  // --strict (a file-local switch of the command line, set once in main)

static bool loadChecked(const char* path, zn::frontend::Program& prog, zn::frontend::Checked& checked) {
  prog = zn::frontend::loadProgram(path, readFile, gStrict, std::string(ZN_SOURCE_DIR) + "/../lib/std");
  auto diags = prog.diags;
  if (diags.empty()) {
    checked = zn::frontend::check(prog.ast);
    diags = checked.diags;
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return diags.empty();
}

// Compiles a source file down to a ZBC module, printing diagnostics; returns 0 on success.
static int compileToZbc(const char* path, zn::zbc::Module& out) {
  zn::frontend::Program prog;
  zn::frontend::Checked checked;
  if (!loadChecked(path, prog, checked)) return 1;
  std::vector<zn::frontend::Diag> diags;
  {
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    diags = low.diags;
    if (diags.empty()) {
      if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module);
      zn::ir::insertRc(low.module);
      std::string badIr = zn::ir::verify(low.module);
      if (!badIr.empty()) { std::fprintf(stderr, "internal error: invalid IR after reference counting: %s\n", badIr.c_str()); return 3; }
      auto em = zn::zbc::emit(low.module);
      for (const auto& e : em.errors) std::fprintf(stderr, "%s: %s\n", path, e.c_str());
      if (!em.errors.empty()) return 1;
      std::string bad = zn::zbc::verify(em.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid ZBC: %s\n", bad.c_str()); return 3; }
      out = std::move(em.module);
      return 0;
    }
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return 1;
}

int main(int argc, char** argv) {
#ifdef ZN_HOST_GFX
  zn::host::installGfx();
#endif
  for (int k = 1; k < argc; ++k)  // `--strict` anywhere on the command line selects the strict profile
    if (!std::strcmp(argv[k], "--strict")) { gStrict = true; for (int j = k; j + 1 < argc; ++j) argv[j] = argv[j + 1]; --argc; --k; }
  if (argc == 2 && !std::strcmp(argv[1], "--version")) {
    std::puts("zinc-next 0.0.1");
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "run")) {  // zinc run <file.ts|file.zbc>: compile if needed, verify, execute
    std::string path = argv[2];
    zn::zbc::Module zm;
    if (path.size() > 4 && path.substr(path.size() - 4) == ".zbc") {
      std::ifstream in(path, std::ios::binary);
      if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
      std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      std::string err;
      auto t0 = std::chrono::steady_clock::now();
      if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[2], err.c_str()); return 1; }
      auto t1 = std::chrono::steady_clock::now();
      err = zn::zbc::verify(zm);
      if (std::getenv("ZN_TIMING")) std::fprintf(stderr, "decode %.2f ms, verify %.2f ms\n", std::chrono::duration<double, std::milli>(t1 - t0).count(), std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count());
      if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[2], err.c_str()); return 1; }
    } else if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::string out;
    bool trace = std::getenv("ZN_TRACE_FREE") != nullptr;
    auto res = zn::vm::run(zm, out, trace);
    return zn::rt::report(res, out, trace);
  }
  if (argc == 5 && !std::strcmp(argv[1], "build") && !std::strcmp(argv[3], "-o")) {  // zinc build <file> -o <out>: compile to C++ and then to a native program
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    namespace fs = std::filesystem;
    fs::path libs = fs::absolute(argv[0]).parent_path(), cpp = fs::path(argv[4]).string() + ".cpp";
    { std::ofstream o(cpp); o << zn::aot::emitCpp(zm); if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    const char* cxx = std::getenv("CXX");
    std::string cmd = std::string(cxx ? cxx : "c++") + " -std=c++20 -O2 -w -I " ZN_SOURCE_DIR "/include -I " ZN_SOURCE_DIR "/src -I " ZN_SOURCE_DIR "/third_party/mimalloc/include '" + cpp.string() + "' '" + (libs / "libzn_rt.a").string() + "' '" + (libs / "libzn_mimalloc.a").string() + "' '" +
                      (libs / "libzn_zbc.a").string() + "' '" + (libs / "libzn_ir.a").string() + "' '" + (libs / "libzn_frontend.a").string() + "'" +
                      (fs::exists(libs / "libzn_host_gfx.a") ? " '" + (libs / "libzn_host_gfx.a").string() + "'" : std::string()) + " -o '" + argv[4] + "'";  // the graphics host, used by programs that call it
    int rc = std::system(cmd.c_str());
    if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
    if (rc != 0) { std::fprintf(stderr, "the C++ compiler failed: %s\n", cmd.c_str()); return 1; }
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=cpp")) {  // zinc --emit=cpp <file>: the C++ of the AOT build
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::aot::emitCpp(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=zbc")) { // zinc --emit=zbc <file>: disassembly
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "--emit=zbc-bin")) {  // zinc --emit=zbc-bin <file> <out.zbc>
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    auto bytes = zn::zbc::encode(zm);
    std::ofstream out(argv[3], std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    return out ? 0 : 2;
  }
  if (argc == 4 && !std::strcmp(argv[1], "zbc")) {  // zinc zbc --check|--dump <file.zbc>: decode and verify a bytecode file
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    zn::zbc::Module zm;
    std::string err;
    if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    err = zn::zbc::verify(zm);
    if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[3], err.c_str()); return 1; }
    if (!std::strcmp(argv[2], "--dump")) std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
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
  if (argc == 4 && !std::strcmp(argv[1], "parse")) {  // zinc parse --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    auto res = zn::frontend::parse(src);
    for (const auto& d : res.diags) std::fprintf(stderr, "%s\n", zn::frontend::format(d, src, argv[3]).c_str());
    if (!res.diags.empty()) return 1;
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(res.ast).c_str(), stdout); return 0; }
    std::string err = zn::frontend::validate(res.ast);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "check")) {  // zinc check --check|--types <file>: parse, then check
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[3], prog, checked)) return 1;
    if (!std::strcmp(argv[2], "--types")) std::fputs(zn::frontend::dumpTypes(checked, prog.ast, prog.files[0].text).c_str(), stdout);
    return 0;
  }
  if (argc == 3 && (!std::strcmp(argv[1], "--emit=ir") || !std::strcmp(argv[1], "--emit=ir-rc"))) {  // zinc --emit=ir <file>: parse, check, lower, verify, dump
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[2], prog, checked)) return 1;
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    if (low.diags.empty()) {
      if (!std::strcmp(argv[1], "--emit=ir-rc")) { if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module); zn::ir::insertRc(low.module); }
      std::string bad = zn::ir::verify(low.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid IR: %s\n", bad.c_str()); if (std::getenv("ZN_DUMP_BAD")) std::fputs(zn::ir::dump(low.module).c_str(), stdout); return 3; }
      std::fputs(zn::ir::dump(low.module).c_str(), stdout);
      return 0;
    }
    for (const auto& d : low.diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
    return 1;
  }
  if (argc == 3 && !std::strcmp(argv[1], "explain")) {  // zinc explain Z0001|--markdown|--codes
    std::string out = !std::strcmp(argv[2], "--markdown") ? zn::frontend::markdown()
                    : !std::strcmp(argv[2], "--codes")    ? zn::frontend::codes()
                                                          : zn::frontend::explain(argv[2]);
    if (out.empty()) { std::fprintf(stderr, "unknown diagnostic code: %s\n", argv[2]); return 1; }
    std::fputs(out.c_str(), stdout);
    return 0;
  }
  std::fputs("usage: zinc --version | lex|parse --check|--dump <file> | explain <code>\n", stderr);
  return 2;
}
