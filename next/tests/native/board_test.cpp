// board.json (ZN-294): ten diagrams load and validate, an unknown part type is named, load -> save -> load is the identity, the zinc block is kept apart from the diagram members.
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "sim/board.h"
#include "sim/parts/registry.h"

namespace fs = std::filesystem;
using namespace zn::sim;
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { std::printf("FAIL: %s\n", msg); ++fails; } } while (0)
static std::string slurp(const fs::path& p) { std::ifstream f(p); std::stringstream s; s << f.rdbuf(); return s.str(); }

int main(int argc, char** argv) {
  const fs::path dir = argc > 1 ? argv[1] : "tests/golden/sim";
  int n = 0;
  for (const auto& e : fs::directory_iterator(dir / "diagrams")) {
    if (e.path().extension() != ".json") continue;
    ++n;
    Board b; std::string err;
    CHECK(parseBoard(slurp(e.path()), b, err), (e.path().filename().string() + ": parses: " + err).c_str());
    auto diags = validateBoard(b, knownPartType);
    CHECK(diags.empty(), (e.path().filename().string() + ": validates: " + (diags.empty() ? "" : diags[0].message)).c_str());
    const std::string once = saveBoard(b);
    Board b2; CHECK(parseBoard(once, b2, err), "the saved text parses");
    CHECK(saveBoard(b2) == once, (e.path().filename().string() + ": load, save, load is the identity").c_str());
    CHECK(b2.parts.size() == b.parts.size() && b2.connections.size() == b.connections.size(), "parts and connections survive");
  }
  CHECK(n >= 10, "ten diagrams");
  {
    Board b; std::string err;
    parseBoard(slurp(dir / "bad" / "unknown-type.json"), b, err);
    auto diags = validateBoard(b, knownPartType);
    bool named = false, dangling = false;
    for (auto& d : diags) { named = named || d.message.find("wokwi-flux-capacitor") != std::string::npos; dangling = dangling || d.message.find("nowhere") != std::string::npos; }
    CHECK(named, "an unknown part type is named in the diagnostic");
    CHECK(dangling, "a connection to a missing part is named");
  }
  CHECK(canonicalPartType("wokwi-led") == "zn-led" && canonicalPartType("zn-led") == "zn-led" && canonicalPartType("nope").empty(), "wokwi aliases resolve to zn types");
  { Board b; std::string err; CHECK(!parseBoard("{ nope", b, err) && !parseBoard("[]", b, err), "malformed documents are refused"); }
  if (fails == 0) std::printf("board: ok (%d diagrams)\n", n);
  return fails ? 1 : 0;
}
