#pragma once
// Multi-file programs: starting from an entry file, follows relative imports, parses every file once and merges them into
// one Ast. Modules are ordered so each comes after the modules it imports (initialisation order); `Ast::root`'s kids are
// every module's statements in that order, with imports and exports unwrapped, and `Ast::modules` keeps the structure.
#include <deque>
#include <set>
#include <functional>
#include <string_view>
#include <string>
#include <vector>

#include "frontend/ast.h"
#include "frontend/resolve.h"

namespace zn::frontend {

struct SourceFile {
  std::string path;
  std::string text;  // nodes view this text, so files never move (a deque)
  std::string original;            // a .tsx file: the text before its JSX was lowered, and where each piece of `text` comes from in it (ZN-371.03)
  std::vector<SrcPiece> map;
  bool typesOnly = false;          // a module only type-only imports reach: no code, host import or plugin of it is in the program
};

struct NativeFallback { std::string module, backend, reason; };

struct Program {
  Ast ast;
  std::deque<SourceFile> files;  // files[0] is the entry
  std::vector<Diag> diags;       // syntax and module resolution errors; Diag::file indexes `files`
  std::vector<NativeFallback> nativeFallbacks;
  std::vector<std::pair<std::string, std::string>> workers;   // zinc:worker: each worker's key (its path from the entry's directory) and its file, compiled as a program of its own
};

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

// `hot`: zinc dev's hot mode (ZINC_HOT=1, ZN-742): zinc:hot is loaded first and import.meta.hot is each module's record; in any other build
// the statements that only run with import.meta.hot are removed.
Program loadProgram(const std::string& entry, const ReadFile& read, bool strict = false, const std::string& stdRoot = "", bool hot = false);
// The suffixes a module's files take for the platform being built, in the order they are tried ({".android", ".native", ""}): Metro's platform
// extensions, the moduleSuffixes zinc new and zinc tsconfig write for editors and tsc (docs/react-native.md, "Platform-specific files").
std::vector<std::string> platformSuffixes();
// A module of the engine (zinc:*, a prelude, lib/std, lib/compat, plugins/), not of the project: Fast Refresh never runs one again, and hot
// mode wraps only the project's components in their refresh proxies.
bool libraryModule(const std::string& path);

// The source (Zinc, over the __host_* calls) of a module the host provides ('zinc:gfx', 'zinc:sys', 'zinc:fs'...); null for any other spec.
const char* builtinModuleSource(std::string_view spec);
// The source of zinc:platform (the capabilities of this host's profile from `capsFile`, and UI_LAYOUT), generated for each run.
std::string platformModule(const std::string& capsFile);
// The source of zinc:icons/lucide: the Lucide icons the project of `entry` names (ZN-374), from `nodesFile` (third_party/lucide/icon-nodes.json).
std::string lucideModule(const std::string& entry, const std::string& nodesFile);
// The file under lib/std of a standard module written in Zinc ('zinc:ui' is "ui.ts"); empty for any other spec.
std::string_view stdModuleFile(std::string_view spec);
// Every standard module written in Zinc ('zinc:ui', 'zinc:path'...), in the table's order (zinc doc lists their API).
std::vector<std::string_view> stdModuleSpecs();
// The source of a module generated for the program (zinc:telemetry, zinc:system/permissions, zinc:system/app from zinc.json); "" for any other spec.
std::string generatedModuleSource(std::string_view spec);
// The file (relative to lib/std) of a compat package the engine maps by itself ('inferno', '@pocketjs/framework/solid'...); empty for any other spec.
std::string_view compatModuleFile(std::string_view spec);
// `import { navigator } from 'zinc:web'` and the like for the web globals a parsed file reads and does not declare (appended to its text by the loader).
std::string webImportsOf(const Ast& A);
// The JSX tags of `path` that are components written as classes (Inferno, React classes): declared in its text or in a file it imports with a relative path (ZN-163).
std::set<std::string> jsxClassTags(const std::string& path, const std::string& text, const ReadFile& read);

// `file:line:col: error Zxxxx: title: detail` for a diagnostic of the program.
std::string formatDiag(const Program& p, const Diag& d);

}  // namespace zn::frontend
