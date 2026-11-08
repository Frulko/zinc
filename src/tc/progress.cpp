#include "tc/tc.h"
#include "zn/log.h"
#include <algorithm>
#include <atomic>
#include <mutex>
#include <cerrno>
#include <cstdlib>
#include <thread>
#ifdef _WIN32
#include <io.h>
#include "platform/platform.h"
#else
#include <spawn.h>
#include <stdlib.h>
#ifdef __APPLE__
#include <sys/sysctl.h>
#endif
#include <sys/wait.h>
#include <unistd.h>

extern char** environ;
#endif

namespace zn::tc {
namespace {
// The compiler processes this process runs, all runCommands calls together (ZN-1026: plugins build on several threads at once): at most
// compileJobs(), and no new one while the load average is above the physical cores, as tools/build's make -l; a call with none running
// always starts one, so each makes progress.
std::mutex gSlotMu;
unsigned gSlots = 0;
std::atomic<int> gRunners{0};   // runCommands calls under way: a terminal gets the spinner of one only
unsigned physicalCores() {
#ifdef __APPLE__
  int n = 0;
  std::size_t len = sizeof n;
  if (sysctlbyname("hw.physicalcpu", &n, &len, nullptr, 0) == 0 && n > 0) return static_cast<unsigned>(n);
#endif
  return std::max(1u, std::thread::hardware_concurrency());
}
bool loadHigh() {
#ifdef _WIN32
  return false;
#else
  static const unsigned cores = physicalCores();
  double l = 0;
  return getloadavg(&l, 1) == 1 && l > cores;
#endif
}
bool takeSlot(bool none) {
  std::lock_guard<std::mutex> g(gSlotMu);
  if (!none && (gSlots >= compileJobs() || loadHigh())) return false;
  ++gSlots;
  return true;
}
void giveSlot() { std::lock_guard<std::mutex> g(gSlotMu); --gSlots; }
}  // namespace

unsigned compileJobs() {
  if (const char* j = std::getenv("ZINC_JOBS")) return static_cast<unsigned>(std::max(1, std::atoi(j)));
  return std::clamp(std::thread::hardware_concurrency() / 2, 1u, 8u);
}
bool runCommands(const std::vector<std::string>& commands, unsigned limit, const char* stage) {
#ifdef _WIN32
  using pid_t = zn::plat::Pid;
#endif
  std::vector<pid_t> live;
  std::size_t next = 0, completed = 0;
  bool ok = true, painted = false;
  const auto start = std::chrono::steady_clock::now();
  const bool tty = isatty(2);
  double last = tty ? -2000 : 0;   // a log (not a terminal): the first line after 2 s, not an empty "0/1" at once
  unsigned tick = 0;
  limit = std::max(1u, limit);
  struct Runner { Runner() { ++gRunners; } ~Runner() { --gRunners; } } runner;
  while ((ok && next < commands.size()) || !live.empty()) {
    while (ok && live.size() < limit && next < commands.size() && takeSlot(live.empty())) {
#ifdef _WIN32
      // ponytail: the commands are POSIX shell lines (quoted for sh); the sh of Git for Windows runs them until they become argument lists
      const pid_t pid = zn::plat::spawn({"sh", "-c", commands[next++]});
      if (pid == -1) { giveSlot(); ok = false; break; }
#else
      const char* argv[] = {"/bin/sh", "-c", commands[next++].c_str(), nullptr};
      pid_t pid;
      if (posix_spawn(&pid, "/bin/sh", nullptr, nullptr, const_cast<char**>(argv), environ) != 0) { giveSlot(); ok = false; break; }
#endif
      live.push_back(pid);
    }
    const auto before = completed;
    for (auto it = live.begin(); it != live.end();) {
#ifdef _WIN32
      int code = -1;
      if (zn::plat::wait(*it, code, false)) {
        ok = ok && code == 0;
#else
      int status = 0;
      const pid_t done = waitpid(*it, &status, WNOHANG);
      if (done > 0 || (done < 0 && errno != EINTR)) {
        ok = ok && done > 0 && WIFEXITED(status) && WEXITSTATUS(status) == 0;
#endif
        it = live.erase(it);
        giveSlot();
        ++completed;
      } else ++it;
    }
    const double elapsed = log::since(start);
    // a log gets a line per finished command when there are several (one command: the caller's step says when it ends), and one every 2 s
    if (log::steps() && ((completed != before && (tty || commands.size() > 1)) || elapsed - last >= (tty ? 200 : 2000))) {
      const std::string detail = std::to_string(completed) + "/" + std::to_string(commands.size()) + " completed, " + std::to_string(live.size()) + " running";
      if (tty && gRunners.load() == 1) {
        std::fprintf(stderr, "\r\033[2K  %-10s %c %s  %s", stage, "|/-\\"[tick++ % 4], detail.c_str(), log::duration(elapsed).c_str());
        std::fflush(stderr);
        painted = true;
      } else if (!tty) log::step(stage, detail, elapsed);
      last = elapsed;
    }
    if (completed == before && !live.empty()) std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  if (painted) std::fprintf(stderr, "\r\033[2K");
  return ok;
}
}  // namespace zn::tc
