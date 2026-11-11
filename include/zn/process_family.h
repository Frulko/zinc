#pragma once
// A private fresh-image guardian reserves each executable PID until its final group signal.
#if !defined(_WIN32) && !defined(ZN_APP_LIBRARY)
#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <chrono>
#include <algorithm>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <pthread.h>
#include <spawn.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#include <crt_externs.h>
#else
extern char** environ;
#endif

namespace zn::plat {
inline char** familyEnvironment() {
#ifdef __APPLE__
  return *_NSGetEnviron();
#else
  return environ;
#endif
}
inline std::string familyExecutablePath() {
  char b[PATH_MAX];
#ifdef __APPLE__
  uint32_t n = sizeof b;
  if (_NSGetExecutablePath(b, &n)) return {};
  char resolved[PATH_MAX];
  return realpath(b, resolved) ? resolved : b;
#else
  ssize_t n = readlink("/proc/self/exe", b, sizeof b);
  return n > 0 && static_cast<size_t>(n) < sizeof b ? std::string(b, static_cast<size_t>(n)) : "";
#endif
}
namespace family {
inline constexpr char flag[] = "--zinc-private-process-guard-v1";
inline constexpr char marker[] = "ZINC_PRIVATE_PROCESS_GUARD";
inline constexpr uint32_t version = 0x5a504701;
inline constexpr int startupMs = 2000;
using Clock = std::chrono::steady_clock;
struct Fds {
  std::vector<int> values;
  ~Fds() { for (int fd : values) if (fd >= 0) close(fd); }
  void add(int fd) { values.push_back(fd); }
  int release(int fd) { for (int& old : values) if (old == fd) { old = -1; return fd; } return -1; }
  void drop(int fd) { if (release(fd) >= 0) close(fd); }
};
inline int prepareFd(int& fd) {
  if (fd < 4) { int moved = fcntl(fd, F_DUPFD_CLOEXEC, 4); if (moved < 0) return errno; close(fd); fd = moved; }
  return fcntl(fd, F_SETFD, FD_CLOEXEC) ? errno : 0;
}
inline int pipe(Fds& fds, int (&p)[2]) {
  if (::pipe(p)) return errno;
  int rc = 0;
  for (int& fd : p) { if (!rc) rc = prepareFd(fd); fds.add(fd); }
  return rc;
}
inline bool noSigpipe(int fd) {
#ifdef __APPLE__
  int one = 1;
  return setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one) == 0;
#else
  (void)fd; return true;
#endif
}
inline ssize_t send(int fd, const void* data, size_t n) {
#ifdef MSG_NOSIGNAL
  return ::send(fd, data, n, MSG_NOSIGNAL);
#else
  return ::send(fd, data, n, 0);
#endif
}
// Both directions use the same absolute deadline; a stalled or old executable never blocks launch indefinitely.
inline bool transfer(int fd, void* data, size_t n, bool writing, Clock::time_point end) {
  size_t done = 0;
  while (done < n) {
    auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(end - Clock::now()).count();
    if (remaining <= 0) { errno = ETIMEDOUT; return false; }
    pollfd p{fd, static_cast<short>(writing ? POLLOUT : POLLIN), 0};
    int ready = poll(&p, 1, static_cast<int>(remaining));
    if (ready < 0 && errno == EINTR) continue;
    if (ready <= 0) { if (!ready) errno = ETIMEDOUT; return false; }
    ssize_t count = writing ? send(fd, static_cast<char*>(data) + done, n - done) : read(fd, static_cast<char*>(data) + done, n - done);
    if (count < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)) continue;
    if (count <= 0) { if (!count) errno = EPROTO; return false; }
    done += static_cast<size_t>(count);
  }
  return true;
}
struct Config { uint32_t args, envs, bytes; sigset_t mask, ignored; };
struct Reply { pid_t child; int error; };
inline volatile sig_atomic_t dead = 0, watched = 0;
inline void childDeath(int, siginfo_t* info, void*) {
  if (info->si_pid == watched && (info->si_code == CLD_EXITED || info->si_code == CLD_KILLED || info->si_code == CLD_DUMPED)) dead = 1;
}
enum class Phase { Monitoring, Cleanup, Done };
inline void transition(Phase& state, Phase next) {
  if (!((state == Phase::Monitoring && next == Phase::Cleanup) || (state == Phase::Cleanup && next == Phase::Done))) _exit(125);
  state = next;
}
inline int wait(pid_t pid) {
  int status = 0; pid_t got;
  do { got = waitpid(pid, &status, 0); } while (got < 0 && errno == EINTR);
  return got < 0 ? -1 : WIFEXITED(status) ? WEXITSTATUS(status) : WIFSIGNALED(status) ? 128 + WTERMSIG(status) : -1;
}
inline void killTarget(pid_t pid) { ::kill(-pid, SIGKILL); ::kill(pid, SIGKILL); }
inline int guardMain() {
  // FD 3 is a private socket capability, never a caller-supplied process ID.
  struct stat st{}; int type = 0; socklen_t size = sizeof type;
  sockaddr_storage address{}; socklen_t addressSize = sizeof address;
  if (fstat(3, &st) || !S_ISSOCK(st.st_mode) || getsockopt(3, SOL_SOCKET, SO_TYPE, &type, &size) || type != SOCK_STREAM ||
      getsockname(3, reinterpret_cast<sockaddr*>(&address), &addressSize) || address.ss_family != AF_UNIX) return 125;
  for (int fd = 4, max = getdtablesize(); fd < max; ++fd) close(fd);
  if (fcntl(3, F_SETFD, FD_CLOEXEC) || fcntl(3, F_SETFL, O_NONBLOCK) || !noSigpipe(3)) return 125;
  auto deadline = Clock::now() + std::chrono::milliseconds(startupMs);
  uint32_t ready = version;
  if (!transfer(3, &ready, sizeof ready, true, deadline)) return 125;
  Config config{};
  long argmax = sysconf(_SC_ARG_MAX);
  if (!transfer(3, &config, sizeof config, false, deadline) || argmax <= 0 || !config.args ||
      config.bytes > static_cast<size_t>(argmax) + 2 * PATH_MAX || config.args > static_cast<size_t>(argmax) / sizeof(char*) ||
      config.envs > static_cast<size_t>(argmax) / sizeof(char*) - config.args) return 125;
  std::vector<char> bytes(config.bytes);
  if (!transfer(3, bytes.data(), bytes.size(), false, deadline)) return 125;
  std::vector<char*> fields;
  size_t offset = 0;
  for (size_t k = 0; k < static_cast<size_t>(config.args) + config.envs + 1; ++k) {
    if (offset >= bytes.size()) return 125;
    char* end = static_cast<char*>(memchr(bytes.data() + offset, 0, bytes.size() - offset));
    if (!end) return 125;
    fields.push_back(bytes.data() + offset); offset = static_cast<size_t>(end - bytes.data()) + 1;
  }
  if (offset != bytes.size()) return 125;
  const char* cwd = fields[0];
  std::vector<char*> args(fields.begin() + 1, fields.begin() + 1 + config.args), env(fields.begin() + 1 + config.args, fields.end());
  args.push_back(nullptr); env.push_back(nullptr);
  std::vector<std::string> paths;
  if (strchr(args[0], '/')) paths.emplace_back(args[0]);
  else {
    const char* raw = nullptr;
    for (size_t k = 0; env[k]; ++k) if (!strncmp(env[k], "PATH=", 5)) { raw = env[k] + 5; break; }
    std::string path = raw ? raw : "/usr/bin:/bin";
    size_t begin = 0;
    for (;;) {
      size_t end = path.find(':', begin); std::string part = path.substr(begin, end - begin);
      paths.push_back(part.empty() ? args[0] : part + "/" + args[0]);
      if (end == std::string::npos) break;
      begin = end + 1;
    }
  }
  std::vector<const char*> names;
  for (const auto& path : paths) names.push_back(path.c_str());
  Fds fds; int errors[2]; int rc = pipe(fds, errors);
  if (rc) { Reply reply{0, rc}; transfer(3, &reply, sizeof reply, true, deadline); return 125; }
  sigset_t blocked, empty; sigemptyset(&blocked); sigaddset(&blocked, SIGCHLD); sigemptyset(&empty);
  struct sigaction death{}; death.sa_sigaction = childDeath; death.sa_flags = SA_SIGINFO | SA_NOCLDSTOP; sigemptyset(&death.sa_mask);
  if (sigprocmask(SIG_SETMASK, &blocked, nullptr) || sigaction(SIGCHLD, &death, nullptr)) return 125;
  // Self-exec discarded application heaps, threads and atfork handlers before this single-threaded fork.
  pid_t child = fork();
  if (!child) {
    int failure = 0;
    if (setpgid(0, 0) || (*cwd && chdir(cwd))) failure = errno;
    close(3); close(errors[0]);
    for (int signal = 1; signal < NSIG; ++signal) {
      if (signal == SIGKILL || signal == SIGSTOP) continue;
      struct sigaction action{}; action.sa_handler = sigismember(&config.ignored, signal) == 1 ? SIG_IGN : SIG_DFL; sigemptyset(&action.sa_mask);
      if (sigaction(signal, &action, nullptr) && errno != EINVAL && !failure) failure = errno;
    }
    if (sigprocmask(SIG_SETMASK, &config.mask, nullptr) && !failure) failure = errno;
    if (!failure) {
      int denied = 0;
      for (const char* name : names) {
        execve(name, args.data(), env.data()); failure = errno;
        if (failure == EACCES) denied = EACCES;
        else if (failure != ENOENT && failure != ENOTDIR) break;
      }
      if ((failure == ENOENT || failure == ENOTDIR) && denied) failure = denied;
    }
    ssize_t n; do { n = write(errors[1], &failure, sizeof failure); } while (n < 0 && errno == EINTR);
    _exit(127);
  }
  if (child < 0) { Reply reply{0, errno}; transfer(3, &reply, sizeof reply, true, deadline); return 125; }
  watched = child; dead = 0; fds.drop(errors[1]); setpgid(child, child);
  // EOF during exec setup is also ownership loss. Keep the PID reserved throughout every cleanup path.
  int failure = 0;
  for (;;) {
    pollfd readers[] = {{3, POLLIN, 0}, {errors[0], POLLIN, 0}};
    auto left = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
    int n = left > 0 ? poll(readers, 2, static_cast<int>(left)) : 0;
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0 || readers[0].revents) { killTarget(child); wait(child); return 125; }
    if (readers[1].revents) {
      ssize_t count; do { count = read(errors[0], &failure, sizeof failure); } while (count < 0 && errno == EINTR);
      if (count < 0) failure = errno;
      else if (count && count != sizeof failure) failure = EIO;
      break;
    }
  }
  fds.drop(errors[0]);
  Reply reply{child, failure};
  bool delivered = transfer(3, &reply, sizeof reply, true, deadline);
  if (failure || !delivered) {
    killTarget(child); wait(child); return 125;
  }
  close(0); close(1); close(2);
  Phase phase = Phase::Monitoring;
  while (phase == Phase::Monitoring) {
    if (dead) { transition(phase, Phase::Cleanup); break; }
    fd_set readers; FD_ZERO(&readers); FD_SET(3, &readers);
    int n = pselect(4, &readers, nullptr, nullptr, nullptr, &empty);
    if (n < 0) { if (errno == EINTR) continue; transition(phase, Phase::Cleanup); break; }
    unsigned char value = 0; ssize_t count = read(3, &value, 1);
    if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
    if (count != 1) { transition(phase, Phase::Cleanup); break; }
    if (value < NSIG) {
      ::kill(-child, value);
      if (getpgid(child) != child) ::kill(child, value);  // a moved leader still belongs to this guardian
    }
  }
  killTarget(child); int code = wait(child); transition(phase, Phase::Done); return code < 0 ? 255 : code;
}
} // namespace family

// Must be the first main statement, including in generated/fused executables.
inline void dispatchProcessGuard(int argc, char** argv) {
  if (argc == 2 && !std::strcmp(argv[1], family::flag)) {
#ifdef __cpp_exceptions
    try { _exit(family::guardMain()); } catch (...) { _exit(125); }
#else
    _exit(family::guardMain());
#endif
  }
}
struct FamilyTree {
  enum class State { Empty, Running, Reaped };
  State state = State::Empty;
  pid_t guardian = 0, child = 0;
  int control = -1;
  FamilyTree() = default;
  FamilyTree(const FamilyTree&) = delete;
  FamilyTree& operator=(const FamilyTree&) = delete;
  void transition(State next) {
    if (!(((state == State::Empty || state == State::Reaped) && next == State::Running) || (state == State::Running && next == State::Reaped))) std::abort();
    state = next;
  }
  ~FamilyTree() { if (control >= 0) close(control); if (state == State::Running) family::wait(guardian); }
};
inline bool signalFamily(pid_t pid, int signal, FamilyTree* tree = nullptr) {
  if (!tree || tree->state != FamilyTree::State::Running || tree->child != pid || signal < 0 || signal >= NSIG) return false;
  unsigned char value = static_cast<unsigned char>(signal); ssize_t n;
  do { n = family::send(tree->control, &value, 1); } while (n < 0 && errno == EINTR);
  return n == 1;
}
inline int reapFamily(pid_t pid, FamilyTree* tree = nullptr) {
  if (!tree || tree->state != FamilyTree::State::Running || tree->child != pid) return -1;
  close(tree->control); tree->control = -1;
  int code = family::wait(tree->guardian); tree->transition(FamilyTree::State::Reaped); return code;
}
inline bool pollFamily(pid_t pid, int& code, FamilyTree* tree = nullptr) {
  if (!tree || tree->state != FamilyTree::State::Running || tree->child != pid) return false;
  siginfo_t info{}; int rc;
  do { rc = waitid(P_PID, static_cast<id_t>(tree->guardian), &info, WEXITED | WNOHANG | WNOWAIT); } while (rc < 0 && errno == EINTR);
  if (!rc && !info.si_pid) return false;
  if (rc && errno != ECHILD) return false;
  code = reapFamily(pid, tree); return true;
}
inline int spawnFamily(char* const argv[], char* const env[], const char* cwd, pid_t& pid, int parent[3], FamilyTree& tree) {
  std::fill(parent, parent + 3, -1);
  // Old/custom mains cannot recurse through their own process API while we wait for readiness.
  if (std::getenv(family::marker)) return ENOSYS;
  if (tree.state == FamilyTree::State::Running || !argv || !argv[0] || !*argv[0]) return EINVAL;
  family::Config config{}; sigemptyset(&config.ignored);
  int maskError = pthread_sigmask(SIG_SETMASK, nullptr, &config.mask);
  if (maskError) return maskError;
  for (int signal = 1; signal < NSIG; ++signal) {
    struct sigaction action{};
    if (!sigaction(signal, nullptr, &action) && action.sa_handler == SIG_IGN) sigaddset(&config.ignored, signal);
  }
  std::string bytes(cwd); bytes.push_back(0);
  for (size_t k = 0; argv[k]; ++k) { bytes.append(argv[k]); bytes.push_back(0); ++config.args; }
  for (size_t k = 0; env[k]; ++k) { bytes.append(env[k]); bytes.push_back(0); ++config.envs; }
  long argmax = sysconf(_SC_ARG_MAX);
  if (argmax <= 0 || bytes.size() > static_cast<size_t>(argmax) + 2 * PATH_MAX || config.args > static_cast<size_t>(argmax) / sizeof(char*) || config.envs > static_cast<size_t>(argmax) / sizeof(char*) - config.args) return E2BIG;
  config.bytes = static_cast<uint32_t>(bytes.size());
  family::Fds fds; int ctl[2], pipes[3][2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, ctl)) return errno;
  int rc = 0;
  for (int& fd : ctl) { if (!rc) rc = family::prepareFd(fd); fds.add(fd); }
  if (!rc && (!family::noSigpipe(ctl[0]) || fcntl(ctl[0], F_SETFL, O_NONBLOCK))) rc = errno;
  for (auto& p : pipes) if (!rc) rc = family::pipe(fds, p);
  if (rc) return rc;
  std::string self = familyExecutablePath();
  if (self.empty()) return ENOENT;
  char* launch[] = {self.data(), const_cast<char*>(family::flag), nullptr};
  std::vector<char*> guardEnv;
  for (char** e = familyEnvironment(); e && *e; ++e) guardEnv.push_back(*e);
  char mark[] = "ZINC_PRIVATE_PROCESS_GUARD=1"; guardEnv.push_back(mark); guardEnv.push_back(nullptr);
  posix_spawn_file_actions_t files;
  rc = posix_spawn_file_actions_init(&files);
  if (rc) return rc;
  for (int k = 0; k < 3 && !rc; ++k) rc = posix_spawn_file_actions_adddup2(&files, pipes[k][k == 0 ? 0 : 1], k);
  if (!rc) rc = posix_spawn_file_actions_adddup2(&files, ctl[1], 3);
#if defined(__GLIBC__) && (__GLIBC__ > 2 || __GLIBC_MINOR__ >= 34)
  if (!rc) rc = posix_spawn_file_actions_addclosefrom_np(&files, 4);
#endif
  posix_spawnattr_t attr;
  int ar = posix_spawnattr_init(&attr);
  pid_t guardian = 0;
  if (!ar) {
    sigset_t empty, defaults; sigemptyset(&empty); sigfillset(&defaults);
    if (!rc) rc = posix_spawnattr_setsigmask(&attr, &empty);
    if (!rc) rc = posix_spawnattr_setsigdefault(&attr, &defaults);
    if (!rc) rc = posix_spawnattr_setpgroup(&attr, 0);
    short flags = POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETPGROUP;
#ifdef POSIX_SPAWN_CLOEXEC_DEFAULT
    flags |= POSIX_SPAWN_CLOEXEC_DEFAULT;
#endif
    if (!rc) rc = posix_spawnattr_setflags(&attr, flags);
    if (!rc) rc = posix_spawn(&guardian, self.c_str(), &files, &attr, launch, guardEnv.data());
    posix_spawnattr_destroy(&attr);
  } else if (!rc) rc = ar;
  posix_spawn_file_actions_destroy(&files);
  if (rc) return rc;
  fds.drop(ctl[1]);
  for (int k = 0; k < 3; ++k) fds.drop(pipes[k][k == 0 ? 0 : 1]);
  auto deadline = family::Clock::now() + std::chrono::milliseconds(family::startupMs);
  uint32_t ready = 0; family::Reply reply{};
  if (!family::transfer(ctl[0], &ready, sizeof ready, false, deadline)) rc = errno;
  else if (ready != family::version) rc = EPROTO;
  else if (!family::transfer(ctl[0], &config, sizeof config, true, deadline) || !family::transfer(ctl[0], bytes.data(), bytes.size(), true, deadline) || !family::transfer(ctl[0], &reply, sizeof reply, false, deadline)) rc = errno;
  else rc = reply.error;
  if (rc || reply.child <= 0) {
    if (!rc) rc = EPROTO;
    fds.drop(ctl[0]);
    // Before a valid readiness response no target was requested; an old main may ignore EOF.
    if (ready != family::version) { ::kill(-guardian, SIGKILL); ::kill(guardian, SIGKILL); }
    family::wait(guardian); return rc;
  }
  tree.guardian = guardian; tree.child = pid = reply.child;
  tree.control = fds.release(ctl[0]); tree.transition(FamilyTree::State::Running);
  for (int k = 0; k < 3; ++k) parent[k] = fds.release(pipes[k][k == 0 ? 1 : 0]);
  return 0;
}
} // namespace zn::plat
#else
#include <cerrno>
#include <sys/types.h>
namespace zn::plat {
inline void dispatchProcessGuard(int, char**) {}
struct FamilyTree {};
#ifndef _WIN32
inline bool signalFamily(pid_t, int, FamilyTree* = nullptr) { return false; }
inline int reapFamily(pid_t, FamilyTree* = nullptr) { return -1; }
inline bool pollFamily(pid_t, int&, FamilyTree* = nullptr) { return false; }
inline int spawnFamily(char* const[], char* const[], const char*, pid_t&, int[], FamilyTree&) { return ENOSYS; }
#endif
}
#endif
