// src/platform (tests/t0/platform.sh): the portable wrapper of the command line's OS calls. Runs on the host; the same file cross-built for Windows
// runs under Wine or on a Windows machine (docs/targets/windows.md), with cmd.exe in place of sh.
#include "platform/platform.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#ifndef _WIN32
#include <fnmatch.h>
#endif

namespace fs = std::filesystem;
using namespace zn::plat;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); std::fprintf(stderr, __VA_ARGS__); std::fputc('\n', stderr); ++failures; } } while (0)

// a command line for the host's shell: sh on POSIX, cmd.exe on Windows
static std::vector<std::string> shell(const std::string& posix, const std::string& windows) {
#ifdef _WIN32
  (void)posix;
  return {"cmd.exe", "/c", windows};
#else
  (void)windows;
  return {"/bin/sh", "-c", posix};
#endif
}

int main() {
  // quoting for CommandLineToArgvW: pure, the same answer on every host
  const std::pair<const char*, const char*> quotes[] = {
      {"abc", "abc"}, {"", "\"\""}, {"a b", "\"a b\""}, {"a\"b", "\"a\\\"b\""}, {"a\\b", "a\\b"}, {"a b\\", "\"a b\\\\\""},
      {"a\\\"b", "\"a\\\\\\\"b\""}, {"C:\\Program Files\\zinc\\", "\"C:\\Program Files\\zinc\\\\\""}, {"tab\there", "\"tab\there\""}};
  for (const auto& [in, want] : quotes) CHECK(quoteWindowsArg(in) == want, "quoteWindowsArg(%s) = %s, want %s", in, quoteWindowsArg(in).c_str(), want);

  // fnmatch(FNM_PATHNAME): ours against the expectation, and against the C library's where there is one
  struct Glob { const char* pat; const char* path; bool want; };
  const Glob globs[] = {
      {"*", "a", true}, {"*", "a/b", false}, {"*/*", "a/b", true}, {"targets/*.json", "targets/x.json", true}, {"targets/*.json", "targets/a/x.json", false},
      {"a?c", "abc", true}, {"a?c", "a/c", false}, {"[abc]x", "bx", true}, {"[!abc]x", "bx", false}, {"[!abc]x", "dx", true}, {"[a-c]", "b", true},
      {"[a-c]", "d", false}, {"[]a]", "]", true}, {"\\*", "*", true}, {"\\*", "a", false}, {"x[/]y", "x/y", false}, {"", "", true},
      {"", "a", false}, {"**", "ab", true}, {"a*b*c", "aXXbYYc", true}, {"a*b*c", "aXXbYY", false}, {"plugins/*/plugin.json", "plugins/sqlite/plugin.json", true}};
  for (const Glob& g : globs) {
    CHECK(globMatch(g.pat, g.path) == g.want, "globMatch(%s, %s) = %d", g.pat, g.path, globMatch(g.pat, g.path));
#ifndef _WIN32
    CHECK((fnmatch(g.pat, g.path, FNM_PATHNAME) == 0) == g.want, "the expectation of (%s, %s) is not fnmatch's", g.pat, g.path);
#endif
  }

  // processes: exit status, start failure, stdout capture, the child's own environment, a non-blocking wait, stop
  CHECK(run(shell("exit 3", "exit 3")) == 3, "run: exit status 3 not seen");
  CHECK(run({"zinc-platform-test-no-such-program"}) != 0, "run: a missing program reports success");
  std::string out;
  CHECK(capture(shell("printf hello", "echo hello"), out) == 0, "capture: status");
  while (!out.empty() && (out.back() == '\n' || out.back() == '\r' || out.back() == ' ')) out.pop_back();
  CHECK(out == "hello", "capture: got '%s'", out.c_str());
  setenv("ZN_PLAT_U", "1", 1);
  SpawnOptions envOpts;
  envOpts.env = {{"ZN_PLAT_T", "x"}};
  envOpts.unset = {"ZN_PLAT_U"};
  const int envCode = run(shell("[ \"$ZN_PLAT_T\" = x ] && [ -z \"$ZN_PLAT_U\" ]", "if \"%ZN_PLAT_T%\"==\"x\" (if not defined ZN_PLAT_U (exit 0) else (exit 2)) else (exit 1)"),
                          envOpts);
  CHECK(envCode == 0, "spawn: the child's env and unset not applied (%d)", envCode);
  CHECK(std::getenv("ZN_PLAT_T") == nullptr && std::getenv("ZN_PLAT_U") != nullptr, "spawn: the child's environment leaked into ours");
  unsetenv("ZN_PLAT_U");
  CHECK(std::getenv("ZN_PLAT_U") == nullptr || !*std::getenv("ZN_PLAT_U"), "unsetenv");
  const auto t0 = std::chrono::steady_clock::now();
  SpawnOptions group;
  group.newGroup = true;
  const Pid slow = spawn(shell("sleep 5", "ping -n 6 127.0.0.1 > NUL"), group);
  CHECK(slow != -1, "spawn: cannot start");
  int code = 0;
  if (slow != -1) {
    CHECK(!wait(slow, code, false), "wait(block = false): a running child counted as ended");
    stop(slow);
  }
  CHECK(std::chrono::steady_clock::now() - t0 < std::chrono::seconds(3), "stop: the child outlived it");

  // files, libraries, the machine
  const fs::path tmp = fs::temp_directory_path() / "zinc-platform-test.txt";
  { std::ofstream(tmp, std::ios::binary) << "12345"; }
  long long size = 0, mtime = 0;
  CHECK(fileStamp(tmp.string(), size, mtime) && size == 5, "fileStamp: size %lld", size);
  const long long now = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
  CHECK(mtime > now - 86400LL * 1000000000LL && mtime < now + 86400LL * 1000000000LL, "fileStamp: time %lld is not today", mtime);
  fs::remove(tmp);
  CHECK(!fileStamp(tmp.string(), size, mtime), "fileStamp: a missing file");
  CHECK(libOpen((fs::temp_directory_path() / (std::string("zinc-no-such-lib") + libSuffix())).string(), false) == nullptr, "libOpen: a missing library");
  CHECK(!libError().empty(), "libError: empty");
  CHECK(*osName() && !machine().empty(), "osName, machine");
  CHECK(maxRssBytes() > 0, "maxRssBytes");
  CHECK(!homeDir().empty(), "homeDir");
  if (!failures) std::printf("platform: ok (%s %s)\n", osName(), machine().c_str());
  return failures ? 1 : 0;
}
