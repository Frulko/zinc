#pragma once
// Multi-file programs: starting from an entry file, follows relative imports, parses every file once and merges them into
// one Ast. Modules are ordered so each comes after the modules it imports (initialisation order); `Ast::root`'s kids are
// every module's statements in that order, with imports and exports unwrapped, and `Ast::modules` keeps the structure.
#include <deque>
#include <functional>
#include <string_view>
#include <string>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

struct SourceFile {
  std::string path;
  std::string text;  // nodes view this text, so files never move (a deque)
};

struct Program {
  Ast ast;
  std::deque<SourceFile> files;  // files[0] is the entry
  std::vector<Diag> diags;       // syntax and module resolution errors; Diag::file indexes `files`
};

// Reads a file into `out`; false if it cannot be read.
using ReadFile = std::function<bool(const std::string& path, std::string& out)>;

// `strict` selects the strict profile; so does a line `// zinc-profile: strict` among the first lines of the entry file.
// `stdRoot` is the directory of the standard modules written in Zinc (lib/std): 'zinc:ui' and the like resolve to files there.
// Native modules that are not registered yet (ZN-101): the provider builds and loads the plugin that has the module and says whether it is registered now (else `err` says
// why not: a missing library, a compiler error). Set by the command line; null in a frontend used alone.
extern std::function<bool(const std::string& module, std::string& err)> gNativeProvider;
// ZINC_NATIVE: "real" (native code wins over a stand-in x.next.ts / x.sim.ts), "sim" (a stand-in wins, today's default when there is one), "auto" (the default: a stand-in when
// there is one, else native code).

// Whether the plugin's native code should win over its x.sim.ts stand-in in "auto" mode: not in a deterministic run (ZINC_DETERMINISTIC: golden tests, headless captures) unless the
// manifest says `"deterministic": true` (no clock, no network, no machine state).
extern std::function<bool(const std::string& module)> gNativePreferred;
// Whether the module's native code wins even over an x.next.ts stand-in in "auto" mode: outside deterministic runs, for a plugin whose manifest says `"live": true` (a real video decoder).
extern std::function<bool(const std::string& module)> gNativeLive;

Program loadProgram(const std::string& entry, const ReadFile& read, bool strict = false, const std::string& stdRoot = "");

// The source (Zinc, over the __host_* calls) of a module the host provides ('zinc:gfx', 'zinc:sys', 'zinc:fs'...); null for any other spec.
const char* builtinModuleSource(std::string_view spec);
// The source of zinc:platform (the capabilities of this host's profile from `capsFile`, and UI_LAYOUT), generated for each run.
std::string platformModule(const std::string& capsFile);
// The file under lib/std of a standard module written in Zinc ('zinc:ui' is "ui.ts"); empty for any other spec.
std::string_view stdModuleFile(std::string_view spec);

// `file:line:col: error Zxxxx: title: detail` for a diagnostic of the program.
std::string formatDiag(const Program& p, const Diag& d);

}  // namespace zn::frontend
