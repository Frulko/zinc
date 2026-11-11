// Exact private launch protocol, target compatibility and bounded old-executable rejection.
#include "zn/process_family.h"
#include <cstdio>
#include <stdexcept>

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static std::string output(int fd) {
  std::string result; char b[256]; ssize_t n;
  while ((n = read(fd, b, sizeof b)) != 0) {
    if (n < 0 && errno == EINTR) continue;
    require(n > 0, "stream read"); result.append(b, static_cast<size_t>(n));
  }
  return result;
}
int main(int argc, char** argv) {
  // Model an old/custom main that ignores the private bootstrap argument.
  if (getenv("ZINC_TEST_OLD_MAIN") && argc == 2) {
    zn::plat::FamilyTree tree; int pipes[3]; pid_t pid;
    char* args[] = {argv[0], nullptr};
    require(zn::plat::spawnFamily(args, zn::plat::familyEnvironment(), "", pid, pipes, tree) == ENOSYS, "old main recursively launched");
    if (!strcmp(getenv("ZINC_TEST_OLD_MAIN"), "version")) {
      uint32_t bad = 1; write(3, &bad, sizeof bad);
    }
    for (;;) pause();
  }
  zn::plat::dispatchProcessGuard(argc, argv);
  if (argc == 2 && !strcmp(argv[1], "signals")) {
    sigset_t mask; sigprocmask(SIG_SETMASK, nullptr, &mask);
    struct sigaction ignored{}, caught{}; sigaction(SIGUSR1, nullptr, &ignored); sigaction(SIGUSR2, nullptr, &caught);
    return sigismember(&mask, SIGUSR2) == 1 && ignored.sa_handler == SIG_IGN && caught.sa_handler == SIG_DFL ? 23 : 7;
  }
  alarm(9);
  try {
    int baseline = open("/dev/null", O_RDONLY); require(baseline >= 0, "baseline fd"); close(baseline);
    char command[] = "sh", option[] = "-c";
    char script[] = "IFS= read -r line; printf '%s\\n' \"$FAMILY_TEST\" \"$PWD\" \"$line\"; printf error >&2; exit 7";
    char path[] = "PATH=/bin", value[] = "FAMILY_TEST=override";
    char* args[] = {command, option, script, nullptr}; char* env[] = {path, value, nullptr};
    char cwd[PATH_MAX]; require(realpath("/tmp", cwd), "cwd baseline");
    for (int failure = 0; failure < 4; ++failure) {
      char missing[] = "/no-such-zinc-process-1118", denied[] = "/";
      args[0] = failure == 2 ? missing : failure == 3 ? denied : command;
      zn::plat::FamilyTree tree; pid_t pid = 0; int pipes[3];
      int rc = zn::plat::spawnFamily(args, env, failure == 1 ? missing : "/tmp", pid, pipes, tree);
      require(rc == (failure == 3 ? EACCES : failure ? ENOENT : 0), "startup error changed");
      if (!rc) {
        require(tree.guardian != pid && getpgid(tree.guardian) != getpgrp(), "guardian not isolated");
        require(write(pipes[0], "input\n", 6) == 6, "stdin"); close(pipes[0]);
        require(output(pipes[1]) == std::string("override\n") + cwd + "\ninput\n", "PATH/env/cwd/stdin");
        require(output(pipes[2]) == "error", "stderr"); close(pipes[1]); close(pipes[2]);
        int code = -1;
        for (int k = 0; k < 200 && !zn::plat::pollFamily(pid, code, &tree); ++k) usleep(1000);
        require(code == 7, "exit code");
        require(!zn::plat::signalFamily(pid, SIGKILL, &tree), "stale handle");
        int status; require(waitpid(tree.guardian, &status, WNOHANG) < 0 && errno == ECHILD, "guardian not reaped");
      } else for (int fd : pipes) require(fd == -1, "error leaked stream");
      int next = open("/dev/null", O_RDONLY); require(next == baseline, "fd leak"); close(next);
    }
    sigset_t mask, previous; sigemptyset(&mask); sigaddset(&mask, SIGUSR2);
    require(pthread_sigmask(SIG_BLOCK, &mask, &previous) == 0, "block target signal");
    struct sigaction ignore{}, catchSignal{}, oldIgnore{}, oldCatch{};
    ignore.sa_handler = SIG_IGN; sigemptyset(&ignore.sa_mask);
    catchSignal.sa_handler = +[](int) {}; sigemptyset(&catchSignal.sa_mask);
    sigaction(SIGUSR1, &ignore, &oldIgnore); sigaction(SIGUSR2, &catchSignal, &oldCatch);
    char* signals[] = {argv[0], const_cast<char*>("signals"), nullptr};
    zn::plat::FamilyTree tree; pid_t pid; int pipes[3];
    require(zn::plat::spawnFamily(signals, zn::plat::familyEnvironment(), "", pid, pipes, tree) == 0, "signal spawn");
    // Wait for natural exit: closing ownership immediately would deliberately kill the target.
    siginfo_t exited{}; require(waitid(P_PID, tree.guardian, &exited, WEXITED | WNOWAIT) == 0, "signal wait");
    require(zn::plat::reapFamily(pid, &tree) == 23, "target signal mask/dispositions changed");
    for (int fd : pipes) close(fd);
    pthread_sigmask(SIG_SETMASK, &previous, nullptr); sigaction(SIGUSR1, &oldIgnore, nullptr); sigaction(SIGUSR2, &oldCatch, nullptr);
    for (const char* mode : {"version", "timeout"}) {
      setenv("ZINC_TEST_OLD_MAIN", mode, 1);
      zn::plat::FamilyTree old; int fds[3]; pid_t oldPid;
      auto begin = zn::plat::family::Clock::now();
      int rc = zn::plat::spawnFamily(signals, zn::plat::familyEnvironment(), "", oldPid, fds, old);
      unsetenv("ZINC_TEST_OLD_MAIN");
      require(rc == (!strcmp(mode, "version") ? EPROTO : ETIMEDOUT), "old executable not refused");
      require(zn::plat::family::Clock::now() - begin < std::chrono::seconds(3), "old executable blocked launch");
      for (int fd : fds) require(fd == -1, "old executable retained streams");
    }
    int status; require(waitpid(-1, &status, WNOHANG) < 0 && errno == ECHILD, "launch retained child");
    std::puts("guardian startup, streams, errors, signals and old main: PASS");
  } catch (const std::exception& error) { std::fprintf(stderr, "%s\n", error.what()); return 1; }
}
