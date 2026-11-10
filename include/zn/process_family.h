#pragma once
// Owned POSIX children keep their PID reserved until their process group has received its final signal.
#ifndef _WIN32
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#ifdef __APPLE__
#include <dlfcn.h>
#include <libproc.h>
#include <sys/proc.h>
#include <chrono>
#endif

namespace zn::plat {
inline int familyPipe(int (&p)[2]) {
  if (pipe(p) != 0) return errno;
  for (int& fd : p) {
    if (fd < 3) { int moved = fcntl(fd, F_DUPFD_CLOEXEC, 3); if (moved < 0) return errno; close(fd); fd = moved; }
    if (fcntl(fd, F_SETFD, FD_CLOEXEC) != 0) return errno;
  }
  return 0;
}
inline std::vector<std::string> familyPaths(const char* cmd, char* const env[]) {
  std::vector<std::string> paths;
  if (std::strchr(cmd, '/')) paths.emplace_back(cmd);
  else {
    const char* raw = nullptr;
    for (size_t k = 0; env[k]; ++k) if (std::strncmp(env[k], "PATH=", 5) == 0) { raw = env[k] + 5; break; }
    std::string path = raw ? raw : "/usr/bin:/bin";
    size_t begin = 0;
    for (;;) {
      size_t end = path.find(':', begin);
      std::string part = path.substr(begin, end - begin);
      paths.push_back(part.empty() ? cmd : part + "/" + cmd);
      if (end == std::string::npos) break;
      begin = end + 1;
    }
  }
  return paths;
}
#if defined(__APPLE__) && !defined(ZN_APP_LIBRARY)
// Mojave lacks spawn's chdir action. Prepare PATH and descriptors before fork, as libuv's fallback does.
inline int forkFamily(char* const argv[], char* const env[], const char* cwd, int pipes[3][2], pid_t& pid) {
  const auto paths = familyPaths(argv[0], env);
  std::vector<const char*> candidates;
  for (const auto& path : paths) candidates.push_back(path.c_str());
  const char* const* names = candidates.data();
  size_t count = candidates.size();
  int errors[2] = {-1, -1};
  int rc = familyPipe(errors);
  if (rc) { for (int fd : errors) if (fd >= 0) close(fd); return rc; }
  int maxfd = getdtablesize();
  struct sigaction defaults{};
  defaults.sa_handler = SIG_DFL;
  sigemptyset(&defaults.sa_mask);
  pid = fork();
  if (pid == 0) {
    close(errors[0]);
    int failure = 0;
    if (setpgid(0, 0) != 0 || chdir(cwd) != 0 || sigaction(SIGPIPE, &defaults, nullptr) != 0) failure = errno;
    for (int k = 0; k < 3 && !failure; ++k) if (dup2(pipes[k][k == 0 ? 0 : 1], k) < 0) failure = errno;
    for (int fd = 3; fd < maxfd; ++fd) if (fd != errors[1]) close(fd);
    if (!failure) {
      int denied = 0;
      for (size_t k = 0; k < count; ++k) {
        execve(names[k], argv, env);
        failure = errno;
        if (failure == EACCES) denied = EACCES;
        else if (failure != ENOENT && failure != ENOTDIR) break;
      }
      if ((failure == ENOENT || failure == ENOTDIR) && denied) failure = denied;
    }
    while (write(errors[1], &failure, sizeof failure) < 0 && errno == EINTR) {}
    _exit(127);
  }
  rc = pid < 0 ? errno : 0;
  close(errors[1]);
  if (!rc) {
    ssize_t n;
    do { n = read(errors[0], &rc, sizeof rc); } while (n < 0 && errno == EINTR);
    if (n < 0) rc = errno;
    if (rc) {
      ::kill(-pid, SIGKILL); ::kill(pid, SIGKILL);
      while (waitpid(pid, nullptr, 0) < 0 && errno == EINTR) {}
    }
  }
  close(errors[0]);
  return rc;
}
#endif
inline int spawnFamily(char* const argv[], char* const env[], const char* cwd, pid_t& pid, int parent[3]) {
  int pipes[3][2] = {{-1, -1}, {-1, -1}, {-1, -1}};
  int rc = 0;
  for (auto& p : pipes) if ((rc = familyPipe(p)) != 0) break;
#ifdef __APPLE__
  using AddChdir = int (*)(posix_spawn_file_actions_t*, const char*);
  static const auto addChdir = reinterpret_cast<AddChdir>(dlsym(RTLD_DEFAULT, "posix_spawn_file_actions_addchdir_np"));
#ifndef ZN_APP_LIBRARY
  if (!rc && *cwd && !addChdir) rc = forkFamily(argv, env, cwd, pipes, pid);
  else
#endif
#endif
  if (!rc) {
    posix_spawn_file_actions_t files;
    rc = posix_spawn_file_actions_init(&files);
    if (!rc) {
      for (int k = 0; k < 3 && !rc; ++k) rc = posix_spawn_file_actions_adddup2(&files, pipes[k][k == 0 ? 0 : 1], k);
#ifdef __APPLE__
      if (!rc && *cwd) rc = addChdir(&files, cwd);
#else
      if (!rc && *cwd) rc = posix_spawn_file_actions_addchdir_np(&files, cwd);
#endif
#if defined(__GLIBC__) && (__GLIBC__ > 2 || __GLIBC_MINOR__ >= 34)
      if (!rc) rc = posix_spawn_file_actions_addclosefrom_np(&files, 3);
#endif
      posix_spawnattr_t attr;
      int ar = posix_spawnattr_init(&attr);
      if (!ar) {
        sigset_t defaults; sigemptyset(&defaults); sigaddset(&defaults, SIGPIPE);
        if (!rc) rc = posix_spawnattr_setsigdefault(&attr, &defaults);
        if (!rc) rc = posix_spawnattr_setpgroup(&attr, 0);
        short flags = POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETPGROUP;
#ifdef POSIX_SPAWN_CLOEXEC_DEFAULT
        flags |= POSIX_SPAWN_CLOEXEC_DEFAULT;
#endif
        if (!rc) rc = posix_spawnattr_setflags(&attr, flags);
        if (!rc) {
          int denied = 0;
          for (const auto& path : familyPaths(argv[0], env)) {
            do { rc = posix_spawn(&pid, path.c_str(), &files, &attr, argv, env); } while (rc == EINTR);
            if (rc == EACCES) denied = EACCES;
            else if (rc != ENOENT && rc != ENOTDIR) break;
          }
          if ((rc == ENOENT || rc == ENOTDIR) && denied) rc = denied;
        }
        posix_spawnattr_destroy(&attr);
      } else if (!rc) rc = ar;
      posix_spawn_file_actions_destroy(&files);
    }
  }
  for (int k = 0; k < 3; ++k) {
    int ours = k == 0 ? 1 : 0;
    if (pipes[k][1 - ours] >= 0) close(pipes[k][1 - ours]);
    if (rc && pipes[k][ours] >= 0) close(pipes[k][ours]);
    parent[k] = rc ? -1 : pipes[k][ours];
  }
  return rc;
}
// These libproc identity records have a fixed ABI in Apple's proc_info_private.h.
#ifdef __APPLE__
struct FamilyIdentity {
  unsigned char uuid[16];
  uint64_t unique, parent;
  int32_t version, parentVersion;
  uint64_t reserved[2];
};
static_assert(sizeof(FamilyIdentity) == 56);
struct FamilyInfo { proc_bsdinfo bsd; FamilyIdentity identity; };
using FamilySignal = int (*)(audit_token_t*, int);
inline FamilySignal familySignal() {
  static const auto signal = reinterpret_cast<FamilySignal>(dlsym(RTLD_DEFAULT, "proc_signal_with_audittoken"));
  return signal;
}
inline bool familyInfo(pid_t pid, FamilyInfo& info) {
  return proc_pidinfo(pid, 18 /* PROC_PIDT_BSDINFOWITHUNIQID */, 1, &info, sizeof info) == sizeof info;
}
struct FamilyMember {
  audit_token_t token{};
  uint64_t unique;
  bool resume;
  explicit FamilyMember(const FamilyInfo& info) : unique(info.identity.unique), resume(info.bsd.pbi_status != SSTOP) {
    token.val[5] = info.bsd.pbi_pid;
    token.val[7] = static_cast<uint32_t>(info.identity.version);
  }
  int signal(int value) {
    FamilyInfo current{};
    if (!familyInfo(static_cast<pid_t>(token.val[5]), current) || current.identity.unique != unique) return ESRCH;
    token.val[7] = static_cast<uint32_t>(current.identity.version);
    return familySignal()(&token, value);
  }
};
#endif
struct FamilyTree {
#ifdef __APPLE__
  std::vector<FamilyMember> members;
#endif
};
#ifdef __APPLE__
// Stop before discovering children: ordinary forks cannot race the walk. Always undo our temporary stops.
struct FrozenFamily {
  std::vector<FamilyMember> members;
  ~FrozenFamily() { for (auto& member : members) if (member.resume) member.signal(SIGCONT); }
  bool stop(const FamilyInfo& info, std::chrono::steady_clock::time_point deadline) {
    members.emplace_back(info);
    auto& member = members.back();
    if (member.signal(SIGSTOP)) { members.pop_back(); return false; }
    for (;;) {
      FamilyInfo current{};
      if (!familyInfo(info.bsd.pbi_pid, current) || current.identity.unique != member.unique) return false;
      if (current.bsd.pbi_status == SSTOP) return true;
      if (std::chrono::steady_clock::now() >= deadline) return false;
      usleep(1000);
    }
  }
  // shortcut: a vanished intermediate identity breaks ancestry; track ownership at spawn to bridge it.
  void capture(pid_t pid, FamilyTree& tree) {
    if (!familySignal()) return;   // shortcut: group-only on older hosts; add a stable native identity backend there
    constexpr size_t limit = 4096;
    tree.members.erase(std::remove_if(tree.members.begin(), tree.members.end(), [](const FamilyMember& member) {
      FamilyInfo current{};
      return !familyInfo(static_cast<pid_t>(member.token.val[5]), current) || current.identity.unique != member.unique;
    }), tree.members.end());
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
    FamilyInfo root{};
    if (!familyInfo(pid, root) || (root.bsd.pbi_status != SZOMB && !stop(root, deadline))) return;
    std::vector<FamilyInfo> parents{root};
    for (size_t index = 0; index < parents.size() && parents.size() < limit; ++index) {
      const auto parent = parents[index];
      int count = proc_listallpids(nullptr, 0);
      if (count <= 0 || count > static_cast<int>(limit)) continue;
      std::vector<pid_t> children(static_cast<size_t>(count) + 16);
      count = proc_listallpids(children.data(), static_cast<int>(children.size() * sizeof(pid_t)));
      for (int n = 0; n < count && parents.size() < limit && std::chrono::steady_clock::now() < deadline; ++n) {
        FamilyInfo child{};
        // p_puniqueid is the original parent identity, retained even after reparenting to init.
        if (!familyInfo(children[n], child) || child.identity.parent != parent.identity.unique) continue;
        if (child.bsd.pbi_status != SZOMB && !stop(child, deadline)) continue;
        parents.push_back(child);
        bool known = false;
        for (const auto& old : tree.members) if (old.unique == child.identity.unique) { known = true; break; }
        if (!known && tree.members.size() < limit) tree.members.emplace_back(child);
      }
      if (std::chrono::steady_clock::now() >= deadline) break;
    }
  }
};
#endif
inline bool signalFamily(pid_t pid, int signal, FamilyTree* tree = nullptr) {
  if (pid <= 0) return false;
  siginfo_t info{};
  int rc;
  do { rc = waitid(P_PID, static_cast<id_t>(pid), &info, WEXITED | WNOHANG | WNOWAIT); } while (rc < 0 && errno == EINTR);
  if (rc != 0) return false;
#ifdef __APPLE__
  FamilyTree local;
  if (!tree) tree = &local;
  FrozenFamily frozen;
  if (signal == SIGTERM || signal == SIGKILL || signal == SIGINT || signal == SIGHUP || signal == SIGQUIT) {
    frozen.capture(pid, *tree);
    for (auto& member : tree->members) member.signal(signal);
  }
#else
  (void)tree;
#endif
  int group = ::kill(-pid, signal);
  // A leader can leave its group; its reserved PID is still owned, its new group is not.
  if (getpgid(pid) != pid) return ::kill(pid, signal) == 0 || group == 0;
  return group == 0;
}
inline int reapFamily(pid_t pid, FamilyTree* tree = nullptr) {
  // waitid verifies the child still reserves this PID, including when it already exited.
  siginfo_t info{};
  int rc;
  do { rc = waitid(P_PID, static_cast<id_t>(pid), &info, WEXITED | WNOHANG | WNOWAIT); } while (rc < 0 && errno == EINTR);
  if (rc < 0) return -1;
  signalFamily(pid, SIGKILL, tree);
  int status = 0;
  pid_t got;
  do { got = waitpid(pid, &status, 0); } while (got < 0 && errno == EINTR);
  if (tree) *tree = FamilyTree{};
  return got < 0 ? -1 : WIFEXITED(status) ? WEXITSTATUS(status) : WIFSIGNALED(status) ? 128 + WTERMSIG(status) : -1;
}
inline bool pollFamily(pid_t pid, int& code, FamilyTree* tree = nullptr) {
  siginfo_t info{};
  int rc;
  do { rc = waitid(P_PID, static_cast<id_t>(pid), &info, WEXITED | WNOHANG | WNOWAIT); } while (rc < 0 && errno == EINTR);
  if (!rc && !info.si_pid) return false;
  // A stolen/reaped PID is no longer ours: never signal it or its possible replacement group.
  if (rc < 0) { if (errno != ECHILD) return false; code = -1; return true; }
  code = reapFamily(pid, tree);
  return true;
}
}  // namespace zn::plat
#endif
