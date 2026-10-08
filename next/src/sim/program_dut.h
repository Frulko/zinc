#pragma once
// The device under test that is a Zinc program run by `zinc run` (ZN-295.01): headless, deterministic, a frame every 1/60 s of virtual time. The run is replayed rather than steered:
// what a step injects (a key, at a virtual time) becomes a line of the ZINC_INPUT script, the program is run again from the start for as many frames as the scenario has reached, and
// what it printed (ZINC_STAMP_OUT), the hash of each frame (ZINC_FRAMEHASH) and the PNG of a frame come back from that run. A deterministic program says the same again, so a replay is
// an exact answer; runs go ahead of the clock (a wait-serial costs one run, not one per millisecond) and are dropped when an input lands before their horizon.
#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include "sim/board.h"
#include "sim/scenario.h"

namespace zn::sim {

class ProgramDut : public Dut {
 public:
  struct Config {
    std::string zinc;       // the zinc executable
    std::string project;    // the program (a directory or a file), as `zinc run` takes it
    std::string scratch;    // a directory for the files of the runs
    const Board* board = nullptr;   // parts with `attrs.inputs` (control name -> input event, as ZINC_INPUT writes it) turn set-control into scripted input
    std::string log;        // set when a run could not start or the program crashed (read it after a failure)
  };
  explicit ProgramDut(Config c);
  std::uint64_t now() const override { return t_; }
  void advance(std::uint64_t ns) override { t_ += ns; }
  std::string takeSerial() override;
  bool writeSerial(const std::string& s, std::string& err) override { (void)s; err = "a program run by zinc sim has no serial input yet"; return false; }
  bool setControl(const std::string& part, const std::string& control, double value, std::string& err) override;
  bool pinLevel(const std::string&, const std::string&, int&, std::string& err) override { err = "a program run by zinc sim does not report pins yet"; return false; }
  bool busWrites(const std::string&, const std::string&, std::int64_t, std::vector<std::vector<std::uint8_t>>&, std::string& err) override { err = "a program run by zinc sim has no buses yet"; return false; }
  bool frameHash(const std::string& part, std::string& hash, std::string& err) override;
  bool screenshot(const std::string& part, const std::string& pngPath, std::string& err) override;
  static constexpr std::uint64_t kFrameNs = 16'666'667;   // one frame of the headless clock

 private:
  struct Line { std::uint64_t frame; std::string text; };
  struct Run { std::uint64_t frames = 0; std::vector<Line> lines; std::map<std::uint64_t, std::string> hashes; bool ok = false; };
  Config c_;
  std::uint64_t t_ = 0;
  std::vector<std::pair<std::uint64_t, std::string>> inputs_;   // (frame, ZINC_INPUT event)
  Run run_;
  std::size_t delivered_ = 0;   // lines of run_ already given out by takeSerial
  std::uint64_t framesAt(std::uint64_t t) const { return t / kFrameNs; }
  bool ensure(std::uint64_t frames, std::string& err);
  bool execute(std::uint64_t frames, std::uint64_t shotFrame, const std::string& shotPng, Run* out, std::string& err);
};

}  // namespace zn::sim
