// Force each optional cwd-action lookup while exercising the production spawn/cleanup path.
#include <dlfcn.h>
#include <cstring>
enum class Lookup { Native, Standard, Nonstandard, Missing };
static Lookup lookup = Lookup::Native;
static int standardLookups = 0, nonstandardLookups = 0;
static void* availableAction = nullptr;
static void* cwdAction(void* handle, const char* name) {
  bool standard = std::strcmp(name, "posix_spawn_file_actions_addchdir") == 0;
  bool nonstandard = std::strcmp(name, "posix_spawn_file_actions_addchdir_np") == 0;
  if (!standard && !nonstandard) return dlsym(handle, name);
  if (standard) ++standardLookups; else ++nonstandardLookups;
  if (lookup == Lookup::Missing || (lookup == Lookup::Nonstandard && standard)) return nullptr;
  if (lookup == Lookup::Standard || lookup == Lookup::Nonstandard) return availableAction;
  return dlsym(handle, name);
}
#define dlsym cwdAction
#include "zn/process_family.h"
#undef dlsym
#include <cstdio>
#include <cstdlib>
#include <stdexcept>

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static std::string readAll(int fd) {
  std::string result;
  char buffer[256];
  ssize_t n;
  while ((n = read(fd, buffer, sizeof buffer)) > 0) result.append(buffer, static_cast<size_t>(n));
  return result;
}
static int finish(pid_t pid) {
  siginfo_t info{};
  int rc;
  do { rc = waitid(P_PID, static_cast<id_t>(pid), &info, WEXITED | WNOWAIT); } while (rc < 0 && errno == EINTR);
  require(rc == 0, "child wait failed");
  return zn::plat::reapFamily(pid);
}
int main() {
  alarm(8);
  signal(SIGPIPE, SIG_IGN);
  try {
    availableAction = dlsym(RTLD_DEFAULT, "posix_spawn_file_actions_addchdir");
    if (!availableAction) availableAction = dlsym(RTLD_DEFAULT, "posix_spawn_file_actions_addchdir_np");
    int first = open("/dev/null", O_RDONLY);
    require(first >= 0, "descriptor baseline failed");
    close(first);
    char command[] = "sh", option[] = "-c";
    char script[] = "IFS= read -r line; printf '%s\\n' \"$FAMILY_TEST\" \"$PWD\" \"$line\"; printf error >&2; exit 7";
    char path[] = "PATH=/bin", value[] = "FAMILY_TEST=override";
    char* args[] = {command, option, script, nullptr};
    char* env[] = {path, value, nullptr};
    char cwd[1024];
    require(realpath("/tmp", cwd) != nullptr, "cwd baseline failed");
    for (Lookup mode : {Lookup::Native, Lookup::Standard, Lookup::Nonstandard, Lookup::Missing}) {
      if (!availableAction && (mode == Lookup::Standard || mode == Lookup::Nonstandard)) continue;
      lookup = mode;
      for (int failure = 0; failure < 4; ++failure) {
        char missing[] = "/no-such-zinc-spawn-1121", denied[] = "/";
        args[0] = failure == 2 ? missing : failure == 3 ? denied : command;
        int fds[3] = {-1, -1, -1};
        pid_t pid = -1;
        int rc = zn::plat::spawnFamily(args, env, failure == 1 ? missing : "/tmp", pid, fds);
        int expected = failure == 3 ? EACCES : failure ? ENOENT : 0;
#ifdef ZN_APP_LIBRARY
        if (mode == Lookup::Missing || !availableAction) expected = ENOSYS;
#endif
        require(rc == expected, "spawn result changed");
        if (!rc) {
          require(getpgid(pid) == pid, "process group missing");
          require(write(fds[0], "input\n", 6) == 6, "stdin write failed");
          close(fds[0]);
          require(readAll(fds[1]) == std::string("override\n") + cwd + "\ninput\n", "stdout/PATH/env/cwd changed or duplicate spawn");
          require(readAll(fds[2]) == "error", "stderr changed");
          close(fds[1]); close(fds[2]);
          require(finish(pid) == 7, "exit code changed");
        } else {
          for (int fd : fds) require(fd == -1, "failure retained parent descriptor");
        }
        int status;
        if (pid > 0) require(waitpid(pid, &status, WNOHANG) == -1 && errno == ECHILD, "child not reaped");
        int next = open("/dev/null", O_RDONLY);
        require(next == first, "spawn leaked descriptor");
        close(next);
      }
    }
    require(standardLookups >= nonstandardLookups && nonstandardLookups > 0, "optional lookup order changed");
    if (availableAction) require(standardLookups > nonstandardLookups, "standard action did not stop lookup");
    standardLookups = nonstandardLookups = 0;
    args[0] = command;
    args[2] = const_cast<char*>("exit 0");
    pid_t pid;
    int fds[3];
    require(zn::plat::spawnFamily(args, env, "", pid, fds) == 0, "no-cwd spawn needs optional action");
    for (int fd : fds) close(fd);
    require(finish(pid) == 0, "no-cwd exit changed");
    require(!standardLookups && !nonstandardLookups, "no-cwd spawn looked up optional action");
    std::puts("optional cwd action: PASS");
  } catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
  }
}
