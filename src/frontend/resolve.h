#pragma once
// How an import specifier becomes a file, for every engine (owner, 2026-10-22): the typed loader of the interpreter and AOT (modules.cpp) and the
// QuickJS loader that QuickJS, mquickjs, JSC, V8, Hermes, zinc bundle and zinc dev's web staging share (src/qjs/qjs.cpp) ask this one resolver,
// so a program finds the same files whatever runs it.
//   a path (a relative import joined to its importer's directory): as written; else <path><suffix>.ts for each of the platform's suffixes in
//     Metro's order (platformSuffixes: x.esp32.ts, x.native.ts, x.ts), then the same with .tsx; the same for <path>/index; then <path>.js, .mjs,
//     /index.js; then the .ts/.tsx of an import written x.js or x.mjs. A suffixed file is passed over for its own importer (passOver), so
//     x.native.ts may import './x' and wrap it.
//   a bare specifier: the `paths` of the nearest tsconfig.json, a plugin (plugin.json "module" and "modules"), a compat package (lib/compat),
//     then node_modules for the engines that run packages (the JavaScript ones).
// The engines keep what is theirs: the zinc: modules they provide, QuickJS's importmap.json and the board's modules, the typed loader's
// diagnostics and its rule against cycles.
#include <functional>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "frontend/tsconfig.h"

namespace zn::frontend {

// Reads a file into `out`; false if it cannot be read.
using ReadFile = std::function<bool(const std::string& path, std::string& out)>;

// "a/b/../c/./d" -> "a/c/d"; backslashes become forward slashes first, a Windows drive ("C:") counts as a root
std::string normalize(const std::string& p);
// "a/b/c.ts" -> "a/b"; "" for a bare name
std::string dirOf(const std::string& p);

// zinc lsp: imports follow the moduleSuffixes of the nearest tsconfig.json (the platform the editor shows) instead of the build's.
void followModuleSuffixes(bool on);

struct ModuleResolver {
  ReadFile read;                                     // tsconfig.json, plugin.json, zinc.json, package.json (default: the file system)
  std::function<bool(const std::string&)> exists;    // whether a module file is there (default: a regular file)
  // A suffixed candidate the importer `from` does not get (default: the importer itself).
  std::function<bool(const std::string& candidate, const std::string& from)> passOver;
  std::string stdRoot;                               // lib/std: lib/compat and the engine's plugins/ are beside it

  ModuleResolver();
  // The file `path` names for the importer `from`; "" when none.
  std::string file(const std::string& path, const std::string& from);
  // A bare specifier imported by `from`. `paths` and `tried`: a tsconfig.json paths entry matched it with no file (its pattern, the files tried).
  struct Bare { std::string file, paths, tried; bool package = false; };   // package: found in node_modules (its real path)
  Bare bare(const std::string& spec, const std::string& from, bool packages);
  // The plugins `from` sees: the specifiers they answer ('zinc:lottie', 'three', 'three/addons/...') -> their entry files. Read from the
  // plugins/ directories above `from` and the "pluginDirs" of each zinc.json on the way (nearest first), then the engine's; the first one
  // that answers a specifier keeps it.
  const std::map<std::string, std::string>& plugins(const std::string& from);
  // The name and plugin.json "requires" of the plugin whose entry is `entry`; null for none.
  const std::pair<std::string, std::vector<std::string>>* needs(const std::string& entry) const;
  // A package of node_modules above `dir` (its real path), as Node and the bundlers find it; "" when none.
  std::string package(const std::string& dir, const std::string& spec);
  // The platform's suffixes for the files of `dir`: platformSuffixes(), or under zinc lsp the moduleSuffixes of its tsconfig.json.
  std::vector<std::string> suffixes(const std::string& dir);

 private:
  struct TsEntry { bool found = false; std::string dir; TsConfig cfg; };
  std::map<std::string, TsEntry> tsconfigs_;   // by directory searched from
  const TsEntry& tsconfigFor(const std::string& dir);
  std::map<std::string, std::string> plugins_;
  std::set<std::string> pluginDirsRead_;
  std::map<std::string, std::pair<std::string, std::vector<std::string>>> needs_;
  void readPluginsIn(const std::string& dir);
  void readPluginDirsOf(const std::string& dir);
};

}  // namespace zn::frontend
