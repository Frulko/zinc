#pragma once
// The command line beyond the compiler (ZN-138, audit 01 table D): bare `zinc run|build|check` in a project, `zinc help [command]`, `zinc init <dir> [--template t]`, `zinc doctor`.
#include <string>
#include <vector>

namespace zn::cli {

/** `zinc run|build|check` with no entry (or only options): the project of the working directory supplies it (zinc.json "entry", else src/main.ts[x]).
 *  Rewrites `args` in place to the form the compiler commands take; false with `err` set when there is no project. Other commands are left alone. */
bool discoverEntry(std::vector<std::string>& args, std::string& err);

/** `zinc help [command]`, `zinc --help`, `zinc <command> --help`: the text on stdout, exit code 0; an unknown command: stderr, 2. */
int help(const std::vector<std::string>& args);

/** `zinc init <dir> [--template game|cli|server|iot|remarkable]`: a project that `zinc run` runs. */
int init(const std::vector<std::string>& args, const std::string& engineRoot);

/** `zinc doctor`: the engine, this machine's renderer, the pinned tools it downloads on first use, the host tools and the plugins. `renderer` is the lines main() already prints. */
int doctor(const std::string& engineRoot, const std::string& rendererLines);

}  // namespace zn::cli
