// Fuzz target (ZN-147): a program of arbitrary text through the whole front end: module loading, checker, lowering to IR, reference counting, the verifier, ZBC emission and its verifier.
// A program the checker accepts must lower and verify: an internal error (a failed verify) is a bug, like a crash.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include "frontend/check.h"
#include "frontend/modules.h"
#include "ir/ir.h"
#include "zbc/zbc.h"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  if (size > (1u << 15)) return 0;
  std::string text(reinterpret_cast<const char*>(data), size);
  auto read = [&](const std::string& path, std::string& out) { if (path != "main.ts" && path != "main.tsx") return false; out = text; return true; };
  zn::frontend::Program prog = zn::frontend::loadProgram("main.ts", read, false, "");
  if (!prog.diags.empty()) return 0;
  zn::frontend::Checked checked = zn::frontend::check(prog.ast);
  if (!checked.diags.empty()) return 0;
  auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
  if (!low.diags.empty()) return 0;
  zn::ir::optimize(low.module, false);
  zn::ir::insertRc(low.module);
  std::string bad = zn::ir::verify(low.module);
  if (!bad.empty()) { std::fprintf(stderr, "invalid IR after reference counting: %s\n", bad.c_str()); std::abort(); }
  auto em = zn::zbc::emit(low.module);
  if (!em.errors.empty()) return 0;
  bad = zn::zbc::verify(em.module);
  if (!bad.empty()) { std::fprintf(stderr, "invalid ZBC: %s\n", bad.c_str()); std::abort(); }
  return 0;
}
