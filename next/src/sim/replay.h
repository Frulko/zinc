#pragma once
// Replay of a recorded run (ZN-296): only the inputs of the trace are injected, the program runs again, and what it did (its lines, the hash of each frame) is compared event by event with what the
// trace says it did; the first event that differs is named with its time.
#include <cstdint>
#include <string>

#include "sim/program_dut.h"

namespace zn::sim {

struct ReplayResult {
  bool ok = false;
  std::string message;            // "ok 3601 outputs, hash 1f2e..." or "diverges at t=1.250s: ..."
  std::uint64_t outputHash = 0;   // the hash of the produced outputs (lines and frames), what two replays must share
  std::size_t outputs = 0;
};
// `recorded` is the trace of a run (ProgramDut::recordTrace); the dut must be a fresh one for the same program.
ReplayResult replayTrace(ProgramDut& dut, const Trace& recorded);
// The outputs (kinds serial and frame) of a trace as a trace of their own.
Trace outputsOf(const Trace& t);

}  // namespace zn::sim
