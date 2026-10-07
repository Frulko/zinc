// `zinc test [--profile P] [dir]` (ZN-122): the conformance programs of tests/conformance run under a profile and compared with the golden of that profile and size:
// <name>.out (f64, 320x240), <name>.f32.out, <name>.fx12.out, <name>.1280x720.out... Directives in the program's comments (`// zinc-test: requires heap>=4M net`, `skip ps1`,
// `gradual`, `deterministic`, `max-frames N`) decide what is skipped, and the listing says why.
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <sys/wait.h>
#include <unistd.h>

#include "frontend/capabilities.h"
#include "frontend/profile.h"

namespace fs = std::filesystem;
using namespace zn::frontend;

namespace {

std::string readFile(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
std::string quote(const std::string& s) { std::string o = "'"; for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; } return o + "'"; }

/** The text after `// zinc-test: <key> ` on a line of its own, or "" (npos: no such line). */
bool directive(const std::string& text, const std::string& key, std::string& value) {
  std::string tag = "// zinc-test: " + key;
  for (std::size_t at = text.find(tag); at != std::string::npos; at = text.find(tag, at + 1)) {
    if (at != 0 && text[at - 1] != '\n') continue;
    std::size_t e = text.find('\n', at);
    value = text.substr(at + tag.size(), e == std::string::npos ? std::string::npos : e - at - tag.size());
    while (!value.empty() && (value.front() == ' ' || value.front() == '\t')) value.erase(value.begin());
    while (!value.empty() && (value.back() == '\r' || value.back() == ' ')) value.pop_back();
    return true;
  }
  return false;
}
std::vector<std::string> words(const std::string& s) { std::vector<std::string> out; std::istringstream is(s); std::string w; while (is >> w) out.push_back(w); return out; }

/** The part of a golden's name that depends on the profile: the number kind when it is not f64, the screen when it is not 320x240 ("f32", "1280x720", "fx12.1280x720"). */
std::string profileKey(const Profile& p) {
  std::string key = p.number == Num::f64 ? "" : p.number == Num::f32 ? "f32" : p.number == Num::fx12 ? "fx12" : "fx16";
  if (!(p.width == 320 && p.height == 240)) key += (key.empty() ? "" : ".") + std::to_string(p.width) + "x" + std::to_string(p.height);
  return key;
}

}  // namespace

int runTestCommand(const std::string& self, const Profile& p, const std::string& engineRoot, std::string dir) {
  if (dir.empty()) dir = (fs::path(engineRoot) / ".." / "tests" / "conformance").lexically_normal().string();
  if (!fs::is_directory(dir)) { std::fprintf(stderr, "zinc test: %s is not a directory\n", dir.c_str()); return 2; }
  Caps caps = capsFor(p, engineRoot);
  std::vector<fs::path> files;
  for (const auto& e : fs::directory_iterator(dir)) if (e.path().extension() == ".ts" || e.path().extension() == ".tsx") files.push_back(e.path());
  std::sort(files.begin(), files.end());
  setenv("ZINC_HEADLESS", "1", 1);
  setenv("ZINC_DETERMINISTIC", "1", 1);
  std::string key = profileKey(p);
  int ran = 0, failed = 0, skipped = 0;
  std::string errFile = (fs::temp_directory_path() / ("zinc-test-" + std::to_string(::getpid()) + ".err")).string();
  for (const fs::path& f : files) {
    std::string name = f.stem().string(), text = readFile(f), v, label = f.filename().string();
    auto skip = [&](const std::string& why) { std::printf("skip %s (%s)\n", label.c_str(), why.c_str()); ++skipped; };
    bool strictProfile = p.strict;
    if (strictProfile && text.rfind("// zinc-test: gradual", 0) == 0) { skip("needs the gradual typing profile"); continue; }
    bool consoleTarget = std::string(p.name) == "esp32" || std::string(p.name) == "ps1" || std::string(p.name) == "ps2" || std::string(p.name) == "wasm";
    if (consoleTarget && text.rfind("// zinc-test: deterministic", 0) == 0) { skip("needs deterministic mode"); continue; }
    if (directive(text, "skip", v)) { auto w = words(v); if (std::find(w.begin(), w.end(), p.name) != w.end()) { skip(std::string("not for the ") + p.name + " profile"); continue; } }
    if (directive(text, "requires", v)) { std::string why = explain(words(v), caps, p.name); if (!why.empty()) { skip("requires " + why); continue; } }
    fs::path golden = f.parent_path() / (name + (key.empty() ? "" : "." + key) + ".out");
    if (!fs::exists(golden)) { skip("no golden " + golden.filename().string()); continue; }
    if (directive(text, "max-frames", v)) setenv("ZINC_FRAMES", v.c_str(), 1); else unsetenv("ZINC_FRAMES");
    setenv("ZINC_SIZE", (std::to_string(p.width) + "x" + std::to_string(p.height)).c_str(), 1);   // the profile's screen
    std::string cmd = quote(self) + " run --profile " + p.name + " " + quote(f.string()) + " 2>" + quote(errFile);
    std::string out;
    int code = 0;
    if (FILE* pipe = popen(cmd.c_str(), "r")) {
      char buf[4096];
      std::size_t n;
      while ((n = std::fread(buf, 1, sizeof buf, pipe)) > 0) out.append(buf, n);
      int st = pclose(pipe);
      code = WIFEXITED(st) ? WEXITSTATUS(st) : 128 + WTERMSIG(st);
    }
    if (code != 0) {   // a failing program: the exit code and what it said on stderr (the engine's own `zinc:` notes left out), like the golden of the old runner
      std::string err = readFile(errFile), kept;
      bool first = true;   // split on \n keeping the empty piece after the last newline, filter, join: what the old runner wrote
      for (std::size_t from = 0; from <= err.size();) {
        std::size_t nl = err.find('\n', from);
        std::string line = err.substr(from, nl == std::string::npos ? std::string::npos : nl - from);
        if (line.rfind("zinc:", 0) != 0) { kept += (first ? "" : "\n") + line; first = false; }
        if (nl == std::string::npos) break;
        from = nl + 1;
      }
      out += "[exit " + std::to_string(code) + "] " + kept;
    }
    std::string want = readFile(golden);
    ++ran;
    if (out == want) std::printf("ok   %s [%s] %s\n", label.c_str(), p.name, golden.filename().string().c_str());
    else {
      ++failed;
      std::printf("FAIL %s [%s] %s\n", label.c_str(), p.name, golden.filename().string().c_str());
      std::istringstream a(want), b(out);
      std::string la, lb;
      for (int line = 1; ; ++line) {
        bool ga = static_cast<bool>(std::getline(a, la)), gb = static_cast<bool>(std::getline(b, lb));
        if (!ga && !gb) break;
        if (!ga || !gb || la != lb) { std::printf("  line %d: expected '%s', got '%s'\n", line, ga ? la.c_str() : "<end>", gb ? lb.c_str() : "<end>"); break; }
      }
    }
  }
  std::remove(errFile.c_str());
  std::printf("%d programs run, %d failure(s), %d skipped (profile %s, goldens %s)\n", ran, failed, skipped, p.name, key.empty() ? "<name>.out" : ("<name>." + key + ".out").c_str());
  return failed ? 1 : 0;
}
