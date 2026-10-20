#pragma once
// Scenarios (ZN-295): the YAML steps of Wokwi CI plus ours, run in virtual time against a device under test. The runner does not know what the device is: a program on the host, a
// program in an emulator, a scripted fake in a test. It only advances the device's clock and asks what the device did.
#include <cstdint>
#include <string>
#include <vector>

namespace zn::sim {

struct Step {
  std::string kind;                        // wait-serial, write-serial, delay, advance, set-control, expect-pin, expect-bus, expect-frame, expect-pixel, take-screenshot
  int index = 0;                           // 1-based position in the scenario
  std::string text;                        // wait-serial / write-serial text, expect-frame hash, screenshot save-to path
  std::string part, pin, control, protocol;
  double value = 0;                        // set-control value, expect-pin expected
  std::uint64_t ns = 0;                    // delay / advance duration, wait-serial timeout
  std::int64_t address = -1;               // expect-bus address
  std::vector<std::uint8_t> bytes;         // expect-bus contains
  std::string compareWith;                 // take-screenshot compare-with
  double tolerance = 0;                    // take-screenshot tolerance, a fraction (0.005 for "0.5%")
  int x = 0, y = 0;                        // expect-pixel
  std::vector<std::string> pins;           // expect-logic: part:pin names
  std::uint64_t windowNs = 0; int edges = -1;   // expect-logic: the window and the number of edges expected in it
  std::uint32_t rgb = 0;
};
struct Scenario {
  std::string name, board, project;   // board: board.json; project: the program the scenario runs (zinc sim), both relative to the scenario file
  int seed = 0;
  std::vector<Step> steps;
};
// Parses the YAML text; false with a message naming the step (and the line when libyaml has one).
bool parseScenario(const std::string& yaml, Scenario& out, std::string& err);

// What the runner needs of the device under test. Times are virtual nanoseconds.
class Dut {
 public:
  virtual ~Dut() = default;
  virtual std::uint64_t now() const = 0;
  virtual void advance(std::uint64_t ns) = 0;                       // runs the device for ns of virtual time
  virtual std::string takeSerial() = 0;                             // what the device wrote since the last call
  virtual bool writeSerial(const std::string& s, std::string& err) = 0;   // false with err when the device has no serial input
  virtual bool setControl(const std::string& part, const std::string& control, double value, std::string& err) = 0;
  // The level (0, 1) of a pin of a part; false with err when the pin is unknown. A number is a GPIO number, the device maps it.
  virtual bool pinLevel(const std::string& part, const std::string& pin, int& level, std::string& err) = 0;
  // The byte streams written to a bus address of a part, one entry per transaction.
  virtual bool busWrites(const std::string& part, const std::string& protocol, std::int64_t address, std::vector<std::vector<std::uint8_t>>& out, std::string& err) = 0;
  // The frame a part (a display) shows now: its hash (FNV-1a 64, 16 hex digits, the ZINC_FRAMEHASH contract) and as a PNG file. An empty part is the device's main display.
  virtual bool frameHash(const std::string& part, std::string& hash, std::string& err) { (void)part; (void)hash; err = "this device has no frames"; return false; }
  // The number of edges the given pins ('part:pin') made in the last windowNs; false with err when the device does not report pins.
  virtual bool logicEdges(const std::vector<std::string>& pins, std::uint64_t windowNs, int& edges, std::string& err) { (void)pins; (void)windowNs; (void)edges; err = "this device does not report pins"; return false; }
  virtual bool screenshot(const std::string& part, const std::string& pngPath, std::string& err) { (void)part; (void)pngPath; err = "this device has no frames"; return false; }
};

struct RunResult {
  bool ok = true;
  int failedStep = 0;                      // 1-based, 0 when ok
  std::uint64_t t_ns = 0;                  // virtual time at the end (or at the failure)
  std::string message;
  std::vector<std::pair<std::string, std::string>> newHashes;   // with updateGoldens: (old, new) of every expect-frame whose hash changed
};
struct RunOptions {
  std::uint64_t defaultTimeoutNs = 10'000'000'000ull;   // bounds a wait-serial without a timeout (virtual time)
  std::string baseDir = ".";                            // where the relative paths of the steps (compare-with, save-to) start: the scenario's directory
  std::string outDir;                                   // a failing step leaves the last frame here as fail-step-N.png ("" none)
  bool updateGoldens = false;                           // take-screenshot with compare-with writes the file instead of comparing, expect-frame accepts the frame it gets and reports the new hash
};
// Runs every step in order; the first failing step stops the run.
RunResult runScenario(const Scenario& sc, Dut& dut, const RunOptions& opt = RunOptions());
// Fraction (0..1) of the pixels that differ between two PNG files, -1 with err when one cannot be read or the sizes differ; `pixelAt` reads one pixel (0xRRGGBB).
double pngDiffFraction(const std::string& a, const std::string& b, std::string& err);
bool pngPixel(const std::string& path, int x, int y, std::uint32_t& rgb, std::string& err);
// "FAIL step 3 (wait-serial) at t=1.250s: ..." / "ok N steps at t=...", the line the CLI prints.
std::string describe(const Scenario& sc, const RunResult& r);

}  // namespace zn::sim
