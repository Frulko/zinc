// The Zinc compiler as a WASI program (ZN-774.29): `zinc-compile.wasm main.ts out.zbc` reads the source and the standard library (lib/std,
// targets/capabilities.json) from the WASI file system, checks, lowers and optimises it, and writes the ZBC module that vm.wasm runs. The
// root of the engine files is $ZINC_ROOT (default /zinc): Node and wasmtime preopen the checkout there, a page serves the files from memory.
// It is the pipeline of compileToZbc in src/main.cpp without plugins, workers, hot mode or debug lines. The project's zinc.json gives the
// system permissions, the app and the scopes, as loadManifestPermissions does (target: $ZINC_PLATFORM, default web); not the UI layout.
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "frontend/check.h"
#include "frontend/modules.h"
#include "frontend/project.h"
#include "ir/ir.h"
#include "zbc/zbc.h"

static bool readFile(const std::string& path, std::string& out) {
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  out.clear();
  char buf[65536];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) out.append(buf, n);
  std::fclose(f);
  return true;
}

int main(int argc, char** argv) {
  if (argc < 3) { std::fprintf(stderr, "usage: zinc-compile.wasm main.ts out.zbc\n"); return 2; }
  const char* r = std::getenv("ZINC_ROOT");
  const std::string root = r && *r ? r : "/zinc";
  static std::vector<std::string> granted;
  if (std::string pf = zn::frontend::findProjectFile(argv[1]), text; !pf.empty() && readFile(pf, text)) {
    zn::frontend::Project p;
    std::string err;
    if (!zn::frontend::parseProject(text, p, err)) { if (p.fatal) { std::fprintf(stderr, "zinc: %s: %s\n", pf.c_str(), err.c_str()); return 1; } }
    else {
      const char* t = std::getenv("ZINC_PLATFORM");
      granted = zn::frontend::permissionsFor(p, t && *t ? t : "web");
      zn::frontend::setSystemAppJson(p.app.json);
      zn::frontend::setSystemScopesJson(p.scopes);
    }
  }
  zn::frontend::setSystemPermissions(&granted);
  zn::frontend::Program prog = zn::frontend::loadProgram(argv[1], readFile, false, root + "/lib/std");
  auto diags = prog.diags;
  zn::frontend::Checked checked;
  if (diags.empty()) { checked = zn::frontend::check(prog.ast); diags = checked.diags; }
  if (diags.empty()) {
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    diags = low.diags;
    if (diags.empty()) {
      zn::ir::optimize(low.module);
      zn::ir::insertRc(low.module);
      if (std::string bad = zn::ir::verify(low.module); !bad.empty()) { std::fprintf(stderr, "internal error: invalid IR: %s\n", bad.c_str()); return 3; }
      auto em = zn::zbc::emit(low.module);
      for (const auto& e : em.errors) std::fprintf(stderr, "%s: %s\n", argv[1], e.c_str());
      if (!em.errors.empty()) return 1;
      if (std::string bad = zn::zbc::verify(em.module); !bad.empty()) { std::fprintf(stderr, "internal error: invalid ZBC: %s\n", bad.c_str()); return 3; }
      if (!prog.workers.empty()) { std::fprintf(stderr, "%s: zinc:worker is not available in the browser compiler yet\n", argv[1]); return 1; }
      const std::vector<std::uint8_t> bytes = zn::zbc::encode(em.module);
      std::FILE* f = std::fopen(argv[2], "wb");
      if (!f || std::fwrite(bytes.data(), 1, bytes.size(), f) != bytes.size()) { std::fprintf(stderr, "cannot write %s\n", argv[2]); return 2; }
      std::fclose(f);
      return 0;
    }
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return 1;
}
