#pragma once
// The program arguments zinc:sys args() returns: set by the command line before the program runs (src/host/sys_host.cpp).
#include <string>
#include <vector>

namespace zn::host {
void setProgramArgs(const std::vector<std::string>& args);
// zinc.json targets.<id>.growDrawCommands: the draw command pool grows instead of dropping commands (off by default, as in the old toolchain).
void setGrowDrawCommands(bool on);
}  // namespace zn::host
