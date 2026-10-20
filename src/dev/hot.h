#pragma once
// zinc dev's Fast Refresh on the interpreter (ZN-742, docs/reports/zinc-next-fast-refresh.md §7 A and §10). The child zinc dev starts runs its
// program through run() with a channel to zinc dev (ZINC_HOT_FD). On `reload` it compiles the whole program again in hot mode (ZINC_HOT=1),
// plans the update with React Native's rules, ends the frame loop without closing the window, and once the stack is empty moves the heap onto
// the new code by stable keys, re-runs the init functions of the modules the update re-evaluates and starts the event loop again: same
// process, same window, the state of the other modules kept. Anything it cannot do safely answers `restart <reason>`. Linked into the zinc
// command line only, never into a runtime or host library an AOT program links.
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "rt/rt.h"
#include "zbc/zbc.h"

namespace zn::frontend { struct Program; }
namespace zn::ir { struct Module; }

namespace zn::dev::hot {

// One compile of the program in hot mode: its ZBC and what an update compares between two compiles.
struct Unit {
  zbc::Module zbc;
  std::vector<std::string> functions, classes, globals;   // the stable keys, by ZBC index (ir.h Module::hot); classes also the ZBC's builtins
  std::vector<std::string> fields;                        // per class of the IR: its field names, joined
  struct Mod {
    std::string path;                  // as the keys name it
    std::size_t hash = 0;              // of its text
    std::vector<std::string> imports;  // the modules it imports or re-exports from
    bool library = false;              // the engine's (zinc:*, <prelude>, lib/, plugins/)
    bool boundary = false;             // exports only code and types (functions, classes, interfaces, type aliases) or calls import.meta.hot.accept
    bool disposes = false;             // calls import.meta.hot.dispose
    std::string effect;                // its first top-level effect ("src/main.ts:4 `setInterval(...)`"), empty when none
  };
  std::vector<Mod> modules;   // in initialisation order
  std::string hotPath;        // zinc:hot's module path
  std::vector<std::uint8_t> resources;   // the baked fonts and images
  std::vector<std::string> plugins;      // per native module of the ZBC (zbc.natives, by module): "<module> <plugin>", for a player that lacks it
};

// From a hot compile, before emit: the keys of the IR's functions, classes and globals, and the modules.
void describe(const frontend::Program& prog, const ir::Module& low, Unit& u);
// After emit: the keys of the builtin classes the ZBC appended (strings, arrays, Map, Set), by their element types.
void finish(Unit& u);

// The runtime half (hot_swap.cpp, no compiler: a player links it, src/app/player.cpp):
// The module path as zinc dev's user reads it: relative to the working directory when under it.
std::string shown(const std::string& path);
// The index of `key` in `keys`, UINT32_MAX when it is not there.
std::uint32_t keyIndex(const std::vector<std::string>& keys, const std::string& key);
// React Native's rules over the two compiles: the modules to run again (in order) and those whose text changed; empty, or why only a restart can
// take the new code.
std::string plan(const Unit& old, const Unit& neu, std::vector<std::string>& reeval, std::vector<std::string>& changed);
// With the machine's stack empty: moves the program running on `m` from the code of `old` onto that of `neu` (the live objects by key, the
// globals that stay), runs the inits of `reeval` again: empty, or why it failed. Past its first step the old program cannot go on.
std::string swap(rt::Machine& m, const Unit& old, Unit& neu, const std::vector<std::string>& reeval, const std::vector<std::string>& changed);
// The unit as bytes for another machine (zinc dev --lan to Zinc Go), and back; load verifies the ZBC.
std::vector<std::uint8_t> save(const Unit& u);
bool load(const std::uint8_t* p, std::size_t n, Unit& u, std::string& err);

// Compiles the program again: true with `u` filled (finish() done), or false with the diagnostics in `errors`.
using Compile = std::function<bool(Unit& u, std::string& errors)>;

// Runs main as rt::runModule does, answering zinc dev on `fd` between frames: `hot ready` once the frame loop runs; to `reload`, one of
// `ok <ms> <module>...` (sent at the end of the first frame of the new code), `restart <reason>` or `error` + the diagnostics + `end`.
rt::Result run(std::unique_ptr<Unit> first, std::string& out, bool traceFree, Compile compile, int fd);

}  // namespace zn::dev::hot
