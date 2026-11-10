// Exercises the real host provider without a window, VM, network or busy child.
#include "zn/loop.h"
#include "zn/process_family.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
namespace zrt { bool idle_frame = false; void at_finish(void (*f)()); void finish_run(); }
namespace zn::netlog { void tick(double) {} }   // unrelated HAR logging is off

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static int helper(const std::string& mode, const char* exe) {
  alarm(8);
  if (mode == "nested" || mode == "nested-exit") {
    int h = zn::loop::spawnProcess({exe, "--helper", "wait"}, "", {});
    if (h <= 0) return 2;
    std::string out;
    for (;;) {
      zn::loop::wait(5);
      zn::loop::Event event;
      while (zn::loop::nextEvent(event)) if (event.kind == 0) out += event.data;
      if (!out.empty()) break;
    }
    std::printf("%d %d\n", zn::loop::pidOf(h), std::atoi(out.c_str()));
    std::fflush(stdout);
    if (mode == "nested-exit") _exit(23);   // bypass local shutdown: the ancestor must discover the orphaned group
    for (;;) zn::loop::wait(50);
  }
  if (mode == "moved") {
    if (setpgid(0, getpgid(getppid())) != 0) return 2;
    std::printf("%d\n", static_cast<int>(getpid()));
    std::fflush(stdout);
    for (;;) pause();
  }
  int ready[2];
  if (pipe(ready) != 0) return 1;
  pid_t child = fork();
  if (child < 0) return 1;
  if (!child) {
    close(ready[0]);
    signal(SIGTERM, SIG_IGN);
    alarm(8);
    if (write(ready[1], "r", 1) != 1) _exit(1);
    close(ready[1]);
    for (;;) pause();
  }
  close(ready[1]);
  char c;
  if (read(ready[0], &c, 1) != 1) return 1;
  close(ready[0]);
  std::printf("%d\n", static_cast<int>(child));
  std::fflush(stdout);
  if (mode == "exit") return 23;
  for (;;) pause();
}
struct Family {
  int h, leader, child = 0, code = -1;
  int nested = 0;
  std::string output;
};
static std::vector<Family> families;
static void events() {
  zn::loop::Event e;
  while (zn::loop::nextEvent(e)) for (auto& f : families) if (e.handle == f.h) {
    if (e.kind == 0) f.output += e.data;
    if (e.kind == 2) f.code = std::stoi(e.data);
    if (!f.output.empty()) std::sscanf(f.output.c_str(), "%d %d", &f.child, &f.nested);
  }
}
template<class F> static void until(F condition, const char* message) {
  auto end = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  while (!condition() && std::chrono::steady_clock::now() < end) { zn::loop::wait(5); events(); }
  require(condition(), message);
}
static bool gone(int pid) { return ::kill(pid, 0) != 0 && errno == ESRCH; }
static void ended(size_t i, int code) {
  until([&] { return families[i].code >= 0; }, "exit event missing");
  auto f = families[i];
  require(f.code == code, "exit code changed");
  int status;
  require(waitpid(f.leader, &status, WNOHANG) == -1 && errno == ECHILD, "leader not reaped");
  until([&] { return gone(f.child); }, "grandchild survived");
}
static size_t start(const char* exe, bool exits = false) {
  int h = zn::loop::spawnProcess({exe, "--helper", exits ? "exit" : "wait"}, "", {});
  require(h > 0, "spawn failed");
  int pid = zn::loop::pidOf(h);
  int group = getpgid(pid);
  require(group == pid || (exits && group < 0 && errno == ESRCH), "child did not get its own group");
  families.push_back({h, pid});
  size_t i = families.size() - 1;
  until([&] { return families[i].child > 0; }, "helper not ready");
  return i;
}
int main(int argc, char** argv) {
  if (argc > 1 && std::string(argv[1]) == "--helper") return helper(argv[2], argv[0]);
  signal(SIGPIPE, SIG_IGN);
  try {
#ifdef __APPLE__
    require(zn::plat::familySignal() != nullptr, "native identity signal API missing");
    zn::plat::FamilyInfo self{};
    require(zn::plat::familyInfo(getpid(), self), "native identity lookup failed");
    zn::plat::FamilyMember identity(self);
    require(identity.signal(SIGCONT) == 0, "current audit token refused");
    ++identity.token.val[7];
    require(zn::plat::familySignal()(&identity.token, SIGCONT) == ESRCH, "stale audit token accepted");
    auto resumed = start(argv[0]);
    zn::plat::FamilyInfo original{};
    require(zn::plat::familyInfo(families[resumed].leader, original), "freeze identity missing");
    try {
      zn::plat::FrozenFamily frozen;
      require(frozen.stop(original, std::chrono::steady_clock::now() + std::chrono::milliseconds(250)), "freeze failed");
      throw 1;
    } catch (int) {}
    until([&] {
      zn::plat::FamilyInfo current{};
      return zn::plat::familyInfo(families[resumed].leader, current) && current.bsd.pbi_status != SSTOP;
    }, "exception left owned child stopped");
    zn::loop::signalProcess(families[resumed].h, SIGKILL);
    ended(resumed, 137);
    auto stopped = start(argv[0]);
    zn::loop::signalProcess(families[stopped].h, SIGSTOP);
    until([&] { return zn::plat::familyInfo(families[stopped].leader, original) && original.bsd.pbi_status == SSTOP; }, "external stop failed");
    {
      zn::plat::FrozenFamily frozen;
      require(frozen.stop(original, std::chrono::steady_clock::now() + std::chrono::milliseconds(250)), "pre-stopped capture failed");
    }
    require(zn::plat::familyInfo(families[stopped].leader, original) && original.bsd.pbi_status == SSTOP, "capture resumed an external stop");
    zn::loop::signalProcess(families[stopped].h, SIGKILL);
    ended(stopped, 137);
    for (int mode = 0; mode < 3; ++mode) {
      int h = zn::loop::spawnProcess({argv[0], "--helper", mode == 2 ? "nested-exit" : "nested"}, "", {});
      require(h > 0, "nested owner spawn failed");
      families.push_back({h, zn::loop::pidOf(h)});
      size_t index = families.size() - 1;
      until([&] { return families[index].nested > 0; }, "nested family not ready");
      auto nested = families[index];
      if (mode != 2) require(getpgid(nested.child) == nested.child && getpgid(nested.child) != nested.leader, "nested group was not isolated");
      if (mode == 1) zn::loop::shutdownProcesses();
      else if (!mode) zn::loop::signalProcess(h, SIGTERM);
      if (mode != 1) ended(index, mode == 2 ? 23 : 143);
      until([&] { return gone(nested.child) && gone(nested.nested); }, "nested groups survived owner cleanup");
      int status;
      require(waitpid(nested.leader, &status, WNOHANG) == -1 && errno == ECHILD, "nested leader not reaped");
    }
#endif
    auto a = start(argv[0]), b = start(argv[0]);
    zn::loop::signalProcess(families[a].h, SIGTERM);
    ended(a, 143);   // grandchild ignores TERM; final cleanup must still stop it
    require(!gone(families[b].leader) && !gone(families[b].child), "independent group was signalled");
    zn::loop::signalProcess(families[a].h, SIGKILL);   // stale handle
    zn::loop::signalProcess(-1, SIGKILL);
    zn::loop::signalProcess(999999, SIGKILL);
    require(!gone(families[b].leader), "invalid handle reached another process");
    zn::loop::signalProcess(families[b].h, SIGKILL);
    ended(b, 137);
    std::string tool = std::string(argv[0]) + ".tool";
    require(symlink("/bin/sh", tool.c_str()) == 0, "PATH test symlink failed");
    size_t slash = tool.find_last_of('/');
    std::string commandName = tool.substr(slash + 1), pathEnv = "PATH=" + tool.substr(0, slash);
    int lookup = zn::loop::spawnProcess({commandName, "-c", "printf '%s' \"$FAMILY_TEST\"; exit 7"}, "/tmp", {pathEnv, "FAMILY_TEST=override"});
    require(lookup > 0, "overridden PATH lookup failed");
    families.push_back({lookup, zn::loop::pidOf(lookup)});
    size_t lookupIndex = families.size() - 1;
    until([&] { return families[lookupIndex].code >= 0; }, "PATH child exit missing");
    require(families[lookupIndex].code == 7 && families[lookupIndex].output == "override", "PATH or environment override changed");
#ifdef __APPLE__
    // Exercise the Mojave path directly even though this SDK has spawn's chdir action.
    for (int which = 0; which < 3; ++which) {
      int pipes[3][2] = {{-1, -1}, {-1, -1}, {-1, -1}};
      for (auto& pipe : pipes) require(zn::plat::familyPipe(pipe) == 0, "fallback pipe failed");
      char missing[] = "/no-such-zinc-fork-family-1118";
      char option[] = "-c", script[] = "printf '%s\\n' \"$FAMILY_TEST\"; pwd; exit 7";
      char* args[] = {which == 2 ? missing : commandName.data(), option, script, nullptr};
      char env[] = "FAMILY_TEST=override";
      char* environment[] = {env, pathEnv.data(), nullptr};
      pid_t pid;
      int rc = zn::plat::forkFamily(args, environment, which == 1 ? "/no-such-zinc-cwd-1118" : "/tmp", pipes, pid);
      for (int k = 0; k < 3; ++k) close(pipes[k][k == 0 ? 0 : 1]);
      close(pipes[0][1]);
      if (!which) {
        require(rc == 0, "fallback spawn failed");
        require(getpgid(pid) == pid, "fallback group missing");
        std::string out; char chunk[256]; ssize_t n;
        while ((n = read(pipes[1][0], chunk, sizeof chunk)) > 0) out.append(chunk, static_cast<size_t>(n));
        char cwd[1024];
        require(realpath("/tmp", cwd) != nullptr && out == std::string("override\n") + cwd + "\n", "fallback argv/env/cwd changed");
        int code = -1;
        for (int i = 0; i < 200; ++i) { if (zn::plat::pollFamily(pid, code)) break; usleep(5000); }
        require(code == 7, "fallback exit code changed");
      } else require(rc == ENOENT, "fallback spawn error lost");
      close(pipes[1][0]); close(pipes[2][0]);
      int status;
      require(waitpid(pid, &status, WNOHANG) == -1 && errno == ECHILD, "fallback child not reaped");
    }
#endif
    require(unlink(tool.c_str()) == 0, "PATH test symlink cleanup failed");
    // The legacy POSIX provider owns a group without a new session; its leader can leave that group.
    char* movedArgs[] = {argv[0], const_cast<char*>("--helper"), const_cast<char*>("moved"), nullptr};
    extern char** environ;
    pid_t moved;
    int pipes[3];
    require(zn::plat::spawnFamily(movedArgs, environ, "", moved, pipes) == 0, "moved leader spawn failed");
    char ready[32];
    require(read(pipes[1], ready, sizeof ready) > 0, "moved leader not ready");
    require(getpgid(moved) == getpgrp(), "leader did not leave group");
    require(zn::plat::signalFamily(moved, SIGKILL), "moved leader signal failed");
    require(zn::plat::reapFamily(moved) == 137, "moved leader not reaped");
    for (int fd : pipes) close(fd);
    auto c = start(argv[0], true);
    ended(c, 23);   // leader already exited, grandchild still held stdout/stderr
    auto d = start(argv[0]);
    auto old = families[d];
    zn::loop::shutdownProcesses();   // manual shutdown inside a run must not remove its finish hook
    int status;
    require(waitpid(old.leader, &status, WNOHANG) == -1 && errno == ECHILD, "shutdown did not reap leader");
    until([&] { return gone(old.child); }, "shutdown left grandchild alive");
    require(!zn::loop::active(), "shutdown left activity");
    zn::loop::Event e;
    require(!zn::loop::nextEvent(e), "shutdown left queued process events");
    zn::loop::shutdownProcesses();   // idempotent close
    auto r = start(argv[0]);
    require(families[r].h > old.h, "handle reused across restart");
    zn::loop::signalProcess(old.h, SIGKILL);
    require(!gone(families[r].leader), "old handle killed restarted child");
    zrt::finish_run();   // the persistent run hook must also stop the second run's family
    require(waitpid(families[r].leader, &status, WNOHANG) == -1 && errno == ECHILD, "first finish did not reap leader");
    until([&] { return gone(families[r].child); }, "first finish left grandchild alive");
    require(!zn::loop::active(), "first finish left activity");
    auto next = start(argv[0]);
    zrt::finish_run();
    require(waitpid(families[next].leader, &status, WNOHANG) == -1 && errno == ECHILD, "second finish did not reap leader");
    until([&] { return gone(families[next].child); }, "second finish left grandchild alive");
    require(!zn::loop::active(), "second finish left activity");
    require(zn::loop::spawnProcess({"/no-such-zinc-process-1118"}, "", {}) == -1 && !zn::loop::lastError().empty(), "spawn error lost");
    // PID ownership is checked before group signals, even if someone else stole the reap.
    pid_t stolen = fork();
    if (!stolen) _exit(0);
    require(stolen > 0, "fork failed");
    require(waitpid(stolen, &status, 0) == stolen, "test reap failed");
    require(!zn::plat::signalFamily(stolen, SIGKILL), "reaped PID accepted as owned");
    require(!zn::plat::signalFamily(getpid(), SIGKILL), "unrelated PID accepted as owned");
    require(zn::loop::sendSignal(getpid(), "0") == 1, "direct PID existence signal changed");
    pid_t direct = fork();
    if (!direct) { alarm(8); for (;;) pause(); }
    require(direct > 0, "direct child fork failed");
    require(zn::loop::sendSignal(direct, "SIGTERM") == 1, "direct PID signal changed");
    require(waitpid(direct, &status, 0) == direct && WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM, "direct child not signalled");
    zn::loop::shutdownProcesses();
    Family worker{};
    std::thread thread([&] {
      worker.h = zn::loop::spawnProcess({argv[0], "--helper", "wait"}, "", {});
      worker.leader = zn::loop::pidOf(worker.h);
      for (int i = 0; i < 200 && !worker.child; ++i) {
        zn::loop::wait(5);
        zn::loop::Event event;
        while (zn::loop::nextEvent(event)) if (event.kind == 0) worker.child = std::atoi(event.data.c_str());
      }
    });   // thread-local owner must close and reap before this thread has finished
    thread.join();
    require(worker.leader > 0 && worker.child > 0, "worker helper not ready");
    require(waitpid(worker.leader, &status, WNOHANG) == -1 && errno == ECHILD, "worker did not reap leader");
    until([&] { return gone(worker.child); }, "worker exit left grandchild alive");
    std::puts("owned process families: PASS");
    return 0;
  } catch (const std::exception& e) {
    std::fprintf(stderr, "%s\n", e.what());
    zn::loop::shutdownProcesses();
    return 1;   // helpers have an eight-second alarm even if the provider itself failed
  }
}
