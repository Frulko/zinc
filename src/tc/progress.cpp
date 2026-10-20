#include "tc/tc.h"
#include "zn/log.h"
#include <algorithm>
#include <cerrno>
#include <thread>
#ifdef _WIN32
#include <io.h>
#include "platform/platform.h"
#else
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

extern char** environ;
#endif

namespace zn::tc {
bool runCommands(const std::vector<std::string>& commands, unsigned limit, const char* stage) {
#ifdef _WIN32
  using pid_t = zn::plat::Pid;
#endif
  std::vector<pid_t> live;
  std::size_t next = 0, completed = 0;
  bool ok = true, painted = false;
  const auto start = std::chrono::steady_clock::now();
  double last = -2000;
  unsigned tick = 0;
  limit = std::max(1u, limit);
  while ((ok && next < commands.size()) || !live.empty()) {
    while (ok && live.size() < limit && next < commands.size()) {
#ifdef _WIN32
      // ponytail: the commands are POSIX shell lines (quoted for sh); the sh of Git for Windows runs them until they become argument lists
      const pid_t pid = zn::plat::spawn({"sh", "-c", commands[next++]});
      if (pid == -1) { ok = false; break; }
#else
      const char* argv[] = {"/bin/sh", "-c", commands[next++].c_str(), nullptr};
      pid_t pid;
      if (posix_spawn(&pid, "/bin/sh", nullptr, nullptr, const_cast<char**>(argv), environ) != 0) { ok = false; break; }
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
        ++completed;
      } else ++it;
    }
    const double elapsed = log::since(start);
    if (log::steps() && (completed != before || elapsed - last >= (isatty(2) ? 200 : 2000))) {
      const std::string detail = std::to_string(completed) + "/" + std::to_string(commands.size()) + " completed, " + std::to_string(live.size()) + " running";
      if (isatty(2)) {
        std::fprintf(stderr, "\r\033[2K  %-10s %c %s  %s", stage, "|/-\\"[tick++ % 4], detail.c_str(), log::duration(elapsed).c_str());
        std::fflush(stderr);
        painted = true;
      } else log::step(stage, detail, elapsed);
      last = elapsed;
    }
    if (completed == before && !live.empty()) std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  if (painted) std::fprintf(stderr, "\r\033[2K");
  return ok;
}
}  // namespace zn::tc
