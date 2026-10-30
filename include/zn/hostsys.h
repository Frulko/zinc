#pragma once
// The program arguments zinc:sys args() returns: set by the command line before the program runs (src/host/sys_host.cpp).
#include <string>
#include <vector>

namespace zn::host {
void setProgramArgs(const std::vector<std::string>& args);
// zinc.json targets.<id>.growDrawCommands: the draw command pool grows instead of dropping commands (off by default, as in the old toolchain).
void setGrowDrawCommands(bool on);
// The engine the perf panel names (ZINC_PERF_HUD, ZN-375): "interpreter" or "QuickJS"; an AOT program keeps "AOT".
void setEngineName(const char* name);
// What the command line knows of the program for the inspector's Info view (Zinc.getProgramInfo): a JSON object (entry, project, zinc
// version, profile, files, functions, imports, plugins), asked again at each request: a plugin loaded while the program runs (QuickJS) shows.
// An AOT program gets it once from ZINC_PROGRAM_INFO, which it drops at start.
void setProgramInfo(std::string (*source)());
}  // namespace zn::host
namespace zn::netlog {
// A line the program printed (console.error: err), for the inspector's Console (ZN-373.01); nothing until plugins/devtools starts the
// capture. Wired to zn::rt::gConsoleTap by the program's main (the runtime and the host do not know each other).
void consoleLine(const char* p, std::size_t n, bool err);
}  // namespace zn::netlog
