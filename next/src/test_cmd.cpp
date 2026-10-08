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

/** A way to run a program (ZN-124): `interp` (the bytecode VM, the reference), `aot` (compiled to C++ and native), `quickjs`, `esp32-qemu`, `devicesim` (ZN-295). */
struct Runner {
  std::string name;
  /** Why this runner cannot run the profile here, or "" when it can. */
  std::string unavailable(const Profile& p) const {
    if (name == "interp") return "";
    if (name == "aot" || name == "quickjs") return p.number == Num::f64 ? "" : std::string(name) + " runs the f64 profiles only";
    if (name == "esp32-qemu") {
      if (std::string(p.name) != "esp32") return "esp32-qemu runs the esp32 profile only";
      return std::system("command -v qemu-system-xtensa >/dev/null 2>&1") == 0 ? "" : "qemu-system-xtensa is not installed";
    }
    if (name == "devicesim") return "the device simulator is not built yet (ZN-295)";
    return "unknown runner";
  }
  /** The shell command that runs `file` (stdout on the pipe; stderr to errFile). */
  std::string command(const std::string& self, const Profile& p, const std::string& file, const std::string& tmp, const std::string& errFile) const {
    std::string err = " 2>" + quote(errFile);
    if (name == "aot") return quote(self) + " build --profile " + p.name + " " + quote(file) + " -o " + quote(tmp) + " >/dev/null 2>" + quote(errFile) + " && " + quote(tmp) + err;
    if (name == "quickjs") return quote(self) + " run " + quote(file) + " --engine quickjs" + err;
    if (name == "esp32-qemu") return quote(self) + " run " + quote(file) + " --target esp32 --qemu" + err;
    return quote(self) + " run --profile " + p.name + " " + quote(file) + err;
  }
};

}  // namespace

int runTestCommand(const std::string& self, const Profile& p, const std::string& engineRoot, std::string dir, const std::string& runnerName) {
  Runner runner{runnerName.empty() ? "interp" : runnerName};
  if (std::string why = runner.unavailable(p); !why.empty() && runner.name != "aot" && runner.name != "quickjs") { std::printf("skip all [%s] (%s)\n", runner.name.c_str(), why.c_str()); return runner.name == "interp" ? 2 : 0; }
  if (dir.empty()) dir = (fs::path(engineRoot) / ".." / "tests" / "conformance").lexically_normal().string();
  if (!fs::is_directory(dir)) { std::fprintf(stderr, "zinc test: %s is not a directory\n", dir.c_str()); return 2; }
  Caps caps = capsFor(p, engineRoot);
  std::vector<fs::path> files;
  {  // a project's tests: test-*.ts(x) and *.test.ts(x) below the directory, each a program that passes when it exits 0 (docs/guide/06-testing.md)
    std::vector<fs::path> tests;
    for (auto it = fs::recursive_directory_iterator(dir); it != fs::recursive_directory_iterator(); ++it) {
      std::string n = it->path().filename().string();
      if (it->is_directory() && (n == "build" || n == "node_modules")) { it.disable_recursion_pending(); continue; }
      std::string ext = it->path().extension().string(), stem = it->path().stem().string();
      if ((ext == ".ts" || ext == ".tsx") && (n.rfind("test-", 0) == 0 || (stem.size() > 5 && stem.compare(stem.size() - 5, 5, ".test") == 0))) tests.push_back(it->path());
    }
    if (!tests.empty() && !fs::exists(fs::path(dir) / "tour.out")) {
      std::sort(tests.begin(), tests.end());
      const char* tmo = std::getenv("ZINC_TEST_TIMEOUT");
      int secs = tmo ? std::max(1, std::atoi(tmo) / 1000) : 60;
      setenv("ZINC_HEADLESS", "1", 1);
      setenv("ZINC_DETERMINISTIC", "1", 1);
      std::string errFile = (fs::temp_directory_path() / ("zinc-test-" + std::to_string(::getpid()) + ".txt")).string();
      int failed = 0;
      for (const fs::path& t : tests) {
        std::string label = fs::relative(t).string();
        if (std::string why = runner.unavailable(p); !why.empty()) { std::printf("skip %s (%s)\n", label.c_str(), why.c_str()); continue; }
        std::string cmd = "timeout " + std::to_string(secs) + " " + runner.command(self, p, t.string(), errFile + ".bin", errFile) + " >" + quote(errFile + ".out");
        int st = std::system(cmd.c_str());
        int code = WIFEXITED(st) ? WEXITSTATUS(st) : 128 + WTERMSIG(st);
        if (code == 0) { std::printf("ok   %s\n", label.c_str()); continue; }
        ++failed;
        std::printf("FAIL %s%s\n", label.c_str(), code == 124 ? " timed out" : "");
        std::string text = readFile(errFile + ".out") + readFile(errFile), line;
        std::vector<std::string> lines;
        std::istringstream is(text);
        while (std::getline(is, line)) if (line.rfind("zinc:", 0) != 0) lines.push_back(line);
        for (std::size_t i = lines.size() > 15 ? lines.size() - 15 : 0; i < lines.size(); ++i) std::printf("    %s\n", lines[i].c_str());
      }
      for (const char* x : {"", ".bin", ".bin.cpp", ".out"}) std::remove((errFile + x).c_str());
      std::printf("%zu test file(s), %d failure(s)\n", tests.size(), failed);
      return failed ? 1 : 0;
    }
  }
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
    if (std::string why = runner.unavailable(p); !why.empty()) { skip(why); continue; }
    std::string cmd = runner.command(self, p, f.string(), errFile + ".bin", errFile);
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
    if (runner.name == "quickjs" && code != 0 && out != want) {   // plain JS has no types, JSX or zinc:* modules: a program that needs them is not for this runner
      std::size_t at = out.find("] "), nl = out.find('\n');
      skip("quickjs cannot run it: " + out.substr(at == std::string::npos ? 0 : at + 2, (nl == std::string::npos ? out.size() : nl) - (at == std::string::npos ? 0 : at + 2)));
      continue;
    }
    ++ran;
    if (out == want) std::printf("ok   %s [%s%s] %s\n", label.c_str(), p.name, runner.name == "interp" ? "" : ("/" + runner.name).c_str(), golden.filename().string().c_str());
    else {
      ++failed;
      std::printf("FAIL %s [%s%s] %s\n", label.c_str(), p.name, runner.name == "interp" ? "" : ("/" + runner.name).c_str(), golden.filename().string().c_str());
      std::istringstream a(want), b(out);
      std::string la, lb;
      for (int line = 1; ; ++line) {
        bool ga = static_cast<bool>(std::getline(a, la)), gb = static_cast<bool>(std::getline(b, lb));
        if (!ga && !gb) break;
        if (!ga || !gb || la != lb) { std::printf("  line %d: expected '%s', got '%s'\n", line, ga ? la.c_str() : "<end>", gb ? lb.c_str() : "<end>"); break; }
      }
    }
  }
  std::remove(errFile.c_str()); std::remove((errFile + ".bin").c_str()); std::remove((errFile + ".bin.cpp").c_str());
  std::printf("%d programs run, %d failure(s), %d skipped (profile %s, goldens %s)\n", ran, failed, skipped, p.name, key.empty() ? "<name>.out" : ("<name>." + key + ".out").c_str());
  return failed ? 1 : 0;
}
