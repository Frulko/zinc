// Scenario runner (ZN-295): the YAML steps parse (ours and Wokwi's), run against a scripted fake device, and a failing step names its number and the virtual time.
#include <cstdio>
#include <fstream>
#include <sstream>

#include "sim/scenario.h"

using namespace zn::sim;
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { std::printf("FAIL: %s\n", msg); ++fails; } } while (0)
static std::string slurp(const std::string& p) { std::ifstream f(p); std::stringstream s; s << f.rdbuf(); return s.str(); }

// A device that prints "ready"/"Hello" at 100 ms, has GPIO2 (a blinker, high from 500 ms, flipping every 500 ms), answers a button with "button down" after 50 ms, echoes serial input
// and writes the I2C display-on bytes at 20 ms.
struct Fake : Dut {
  std::uint64_t t = 0, pressedAt = 0; bool pressed = false, ready = false, down = false; std::string out, in, echoed;
  std::uint64_t now() const override { return t; }
  void advance(std::uint64_t ns) override {
    const std::uint64_t to = t + ns;
    auto cross = [&](std::uint64_t at) { return t < at && to >= at; };
    if (cross(100'000'000)) { out += "ready\nHello\n"; ready = true; }
    if (pressed && cross(pressedAt + 50'000'000)) out += "button down\n";
    if (!in.empty()) { out += "echo: " + in; in.clear(); }
    t = to;
  }
  std::string takeSerial() override { std::string s; s.swap(out); return s; }
  bool writeSerial(const std::string& s, std::string&) override { in += s; return true; }
  bool setControl(const std::string& p, const std::string& c, double v, std::string& err) override {
    if (p != "btn" && p != "btn1") { err = "no part " + p; return false; }
    if (c != "pressed") { err = "no control " + c; return false; }
    pressed = v != 0; pressedAt = t; return true;
  }
  bool pinLevel(const std::string& p, const std::string& pin, int& level, std::string& err) override {
    if (p == "led1" && pin == "A") { level = pressed && t >= pressedAt + 100'000'000 - 1; return true; }
    if (p != "mcu" || (pin != "GPIO2" && pin != "2")) { err = "no pin " + p + ":" + pin; return false; }
    level = static_cast<int>((t / 500'000'000) % 2); return true;
  }
  bool busWrites(const std::string& p, const std::string& proto, std::int64_t addr, std::vector<std::vector<std::uint8_t>>& o, std::string& err) override {
    if (p != "oled" || proto != "i2c") { err = "no bus " + p; return false; }
    if (addr == 0x3c) o = {{0x00, 0xAE}, {0x00, 0xAF, 0x21}};
    return true;
  }
};

int main(int argc, char** argv) {
  const std::string dir = argc > 1 ? argv[1] : "tests/golden/sim";
  Scenario sc; std::string err;
  CHECK(parseScenario(slurp(dir + "/scenarios/blink-and-button.yaml"), sc, err), ("parses: " + err).c_str());
  CHECK(sc.steps.size() == 10 && sc.name == "blink and button", "ten steps");
  { Fake d; RunResult r = runScenario(sc, d); CHECK(r.ok, ("the scenario passes: " + describe(sc, r)).c_str()); std::printf("%s\n", describe(sc, r).c_str()); }
  Scenario wk;
  CHECK(parseScenario(slurp(dir + "/scenarios/wokwi-example.yaml"), wk, err), ("the Wokwi example parses: " + err).c_str());
  { Fake d; RunResult r = runScenario(wk, d); CHECK(r.ok, ("the Wokwi example runs unchanged: " + describe(wk, r)).c_str()); }
  // failures carry the step number and the virtual time
  Scenario bad;
  CHECK(parseScenario("steps:\n  - advance: 1s\n  - wait-serial: { text: nope, timeout: 20ms }\n", bad, err), "bad parses");
  { Fake d; RunResult r = runScenario(bad, d); const std::string m = describe(bad, r);
    CHECK(!r.ok && r.failedStep == 2 && r.t_ns == 1'020'000'000ull, m.c_str()); CHECK(m.find("FAIL step 2 (wait-serial) at t=1.020000s") == 0, m.c_str()); std::printf("%s\n", m.c_str()); }
  Scenario pin;
  CHECK(parseScenario("steps:\n  - expect-pin: { part-id: mcu, pin: GPIO2, value: 1 }\n", pin, err), "pin parses");
  { Fake d; RunResult r = runScenario(pin, d); CHECK(!r.ok && r.failedStep == 1 && r.message.find("expected 1") != std::string::npos, "expect-pin failure says what it saw"); }
  // malformed input is named, not accepted
  for (const char* y : {"steps: [", "steps:\n  - fly: 1\n", "steps:\n  - advance: soon\n", "name: x\n", "steps:\n  - expect-pin: { part-id: a }\n", "- 1\n"}) {
    Scenario s2; CHECK(!parseScenario(y, s2, err) && !err.empty(), (std::string("rejected: ") + y).c_str());
  }
  std::printf(fails ? "scenario: FAILED\n" : "scenario: ok\n");
  return fails ? 1 : 0;
}
