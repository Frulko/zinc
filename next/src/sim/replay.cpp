#include "sim/replay.h"

#include <cstdio>

namespace zn::sim {
namespace {
std::string at(std::uint64_t ns) { char b[40]; std::snprintf(b, sizeof b, "%.6fs", static_cast<double>(ns) / 1e9); return b; }
std::string describe(const TraceEvent& e) { return std::string(e.kind == ProgramDut::kSerial ? "line \"" : "frame ") + std::to_string(e.kind == ProgramDut::kFrame ? e.a : 0) + (e.kind == ProgramDut::kSerial ? e.data + "\"" : " hash " + e.data); }
}  // namespace

Trace outputsOf(const Trace& t) {
  Trace o;
  for (const TraceEvent& e : t.events()) if (e.kind == ProgramDut::kSerial || e.kind == ProgramDut::kFrame) o.add(e.t_ns, e.kind, e.a, e.b, e.data);
  return o;
}

ReplayResult replayTrace(ProgramDut& dut, const Trace& recorded) {
  ReplayResult r;
  std::uint64_t last = 0;
  for (const TraceEvent& e : recorded.events()) {
    if (e.t_ns > last) last = e.t_ns;
    if (e.kind == ProgramDut::kInput) dut.addInput(e.a, e.data);
  }
  const std::uint64_t frames = std::max<std::uint64_t>(1, last / ProgramDut::kFrameNs);
  Trace again; std::string err;
  if (!dut.recordTrace(frames, again, err)) { r.message = err; return r; }
  const Trace want = outputsOf(recorded), got = outputsOf(again);
  r.outputs = got.events().size(); r.outputHash = got.hash();
  const auto& a = want.events(); const auto& b = got.events();
  for (std::size_t i = 0; i < a.size() || i < b.size(); ++i) {
    if (i >= b.size()) { r.message = "diverges at t=" + at(a[i].t_ns) + ": the run ended, the trace has " + describe(a[i]); return r; }
    if (i >= a.size()) { r.message = "diverges at t=" + at(b[i].t_ns) + ": the trace ended, the run has " + describe(b[i]); return r; }
    if (a[i].t_ns != b[i].t_ns || a[i].kind != b[i].kind || a[i].data != b[i].data) { r.message = "diverges at t=" + at(a[i].t_ns) + ": the trace has " + describe(a[i]) + ", the run has " + describe(b[i]) + " at t=" + at(b[i].t_ns); return r; }
  }
  char h[24]; std::snprintf(h, sizeof h, "%016llx", static_cast<unsigned long long>(r.outputHash));
  r.ok = true; r.message = "ok " + std::to_string(r.outputs) + " outputs, hash " + h;
  return r;
}

}  // namespace zn::sim
