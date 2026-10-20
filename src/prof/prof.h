#pragma once
// Profilers of the interpreter (ZN-046): `zinc profile` samples the call stack on a timer and writes a flame graph and a table;
// `zinc mem` counts objects, bytes and reference-counting traffic per class. Both run the program in the interpreter.
// Dependency direction: prof includes rt and vm, nothing includes prof but main.
#include <string>

#include "rt/rt.h"
#include "zbc/zbc.h"

namespace zn::prof {

struct ProfileOptions {
  int hz = 1000;             // samples per second of CPU time
  std::string speedscope;    // path of the speedscope file (https://www.speedscope.app), empty: none
  std::string folded;        // path of the folded stacks (flamegraph.pl, inferno), empty: none
};

// Runs the module with the sampling profiler. `report` gets the table of functions by self time.
rt::Result profile(const zbc::Module& m, std::string& out, const ProfileOptions& o, std::string& report);

// Runs the module counting allocations. `report` is a table, or a JSON object when `json`.
// Fills `leaked` with the objects alive at the end (by class) in the table.
rt::Result memory(const zbc::Module& m, std::string& out, bool json, std::string& report);

}  // namespace zn::prof
