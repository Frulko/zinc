#pragma once
// The program arguments zinc:sys args() returns: set by the command line before the program runs (src/host/sys_host.cpp).
#include <string>
#include <vector>

namespace zn::host {
void setProgramArgs(const std::vector<std::string>& args);
}  // namespace zn::host
