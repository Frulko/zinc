// zinc:process for macos, linux and rpi1 (process.rpi1.cpp includes this file). See docs/plugins/process.md.
// posix_spawnp + three pipes; the parent ends of stdout/stderr are non-blocking and read by a zrt::Poller on every
// event loop iteration (no thread). Exit is reported once the child is reaped and its pipes are drained.
#include "zinc_native_process.h"
#include <spawn.h>
#include <signal.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <sys/wait.h>
#ifdef __APPLE__
#include <crt_externs.h>
static char** env_now() { return *_NSGetEnviron(); }  // `environ` is not linkable from the dev-mode library
#else
extern char** environ;
static char** env_now() { return environ; }
#endif

static const int MAXP = 32;
struct Stream { int fd; char tail[4]; int ntail; };  // tail: bytes of a UTF-8 sequence split across reads
struct Proc { bool used, reaped; pid_t pid; int in; Stream out[2]; int code; };
static Proc procs[MAXP];
static char err_msg[160];

static char* cstr(const zrt::String& s) { char* p = (char*)malloc(s.bytes() + 1); memcpy(p, s.ptr(), s.bytes()); p[s.bytes()] = 0; return p; }
/** Splits a \u001f-joined list in place into a null-terminated array (after `first` leading slots). */
static char** split(char* s, int first) {
  int n = *s ? 1 : 0;
  for (char* p = s; *p; p++) n += *p == '\x1f';
  char** v = (char**)calloc((size_t)(first + n + 1), sizeof(char*));
  int i = first;
  if (*s) { v[i++] = s; for (char* p = s; *p; p++) if (*p == '\x1f') { *p = 0; v[i++] = p + 1; } }
  return v;
}
/** Length of the prefix of `b` that ends on a complete UTF-8 sequence. */
static int utf8_cut(const char* b, int n) {
  for (int k = 1; k <= 3 && k <= n; k++) {
    unsigned char c = (unsigned char)b[n - k];
    if ((c & 0xC0) != 0x80) {  // lead byte: its sequence needs `len` bytes
      int len = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
      return len > k ? n - k : n;
    }
  }
  return n;
}

struct HostProcess : NativeProcess, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, zrt::String)> cb;
  bool polling = false;

  int32_t spawn(zrt::String cmd, zrt::String args, zrt::String cwd, zrt::String env) override {
    int h = 0;
    while (h < MAXP && procs[h].used) h++;
    if (h == MAXP) { strcpy(err_msg, "too many processes"); return -1; }
    char *c = cstr(cmd), *a = cstr(args), *d = cstr(cwd), *e = cstr(env);
    char** argv = split(a, 1);
    argv[0] = c;
    // environment: the parent's, with KEY=VALUE overrides
    char** over = split(e, 0);
    int nover = 0; while (over[nover]) nover++;
    int nenv = 0; char** cur = env_now(); while (cur[nenv]) nenv++;
    char** envp = (char**)calloc((size_t)(nenv + nover + 1), sizeof(char*));
    int k = 0;
    for (int i = 0; i < nenv; i++) {
      const char* eq = strchr(cur[i], '=');
      size_t kl = eq ? (size_t)(eq - cur[i]) + 1 : strlen(cur[i]);
      bool replaced = false;
      for (int j = 0; j < nover && !replaced; j++) replaced = !strncmp(over[j], cur[i], kl);
      if (!replaced) envp[k++] = cur[i];
    }
    for (int j = 0; j < nover; j++) envp[k++] = over[j];

    int pin[2], pout[2], perr[2];
    int rc = -1;
    if (pipe(pin) == 0) { if (pipe(pout) == 0) { if (pipe(perr) == 0) rc = 0; else { close(pout[0]); close(pout[1]); close(pin[0]); close(pin[1]); } } else { close(pin[0]); close(pin[1]); } }
    pid_t pid = -1;
    if (rc == 0) {
      int all[6] = {pin[0], pin[1], pout[0], pout[1], perr[0], perr[1]};
      for (int fd : all) fcntl(fd, F_SETFD, FD_CLOEXEC);  // never leak into other children; dup2 below clears it
      posix_spawn_file_actions_t fa;
      posix_spawn_file_actions_init(&fa);
      posix_spawn_file_actions_adddup2(&fa, pin[0], 0);
      posix_spawn_file_actions_adddup2(&fa, pout[1], 1);
      posix_spawn_file_actions_adddup2(&fa, perr[1], 2);
      if (*d) posix_spawn_file_actions_addchdir_np(&fa, d);
      // the child gets stdin/stdout/stderr only: the program's sockets and files must not leak into it
#if defined(__GLIBC__) && (__GLIBC__ > 2 || __GLIBC_MINOR__ >= 34)
      posix_spawn_file_actions_addclosefrom_np(&fa, 3);
#endif
      posix_spawnattr_t at;
      posix_spawnattr_init(&at);
      sigset_t def; sigemptyset(&def); sigaddset(&def, SIGPIPE);  // the parent ignores SIGPIPE, the child must not
      posix_spawnattr_setsigdefault(&at, &def);
#ifdef POSIX_SPAWN_CLOEXEC_DEFAULT
      posix_spawnattr_setflags(&at, POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_CLOEXEC_DEFAULT);  // macOS: close the rest
#else
      posix_spawnattr_setflags(&at, POSIX_SPAWN_SETSIGDEF);
#endif
      rc = posix_spawnp(&pid, c, &fa, &at, argv, envp);
      posix_spawn_file_actions_destroy(&fa);
      posix_spawnattr_destroy(&at);
      close(pin[0]); close(pout[1]); close(perr[1]);
      if (rc != 0) { close(pin[1]); close(pout[0]); close(perr[0]); }
    } else rc = errno;
    if (rc != 0) snprintf(err_msg, sizeof err_msg, "%s: %s", c, strerror(rc));
    free(argv); free(over); free(envp); free(c); free(a); free(d); free(e);
    if (rc != 0) return -1;
    fcntl(pout[0], F_SETFL, O_NONBLOCK);
    fcntl(perr[0], F_SETFL, O_NONBLOCK);
    Proc& p = procs[h];
    p = Proc{};
    p.used = true; p.pid = pid; p.in = pin[1]; p.out[0].fd = pout[0]; p.out[1].fd = perr[0];
    if (!polling) { polling = true; zrt::add_poller(this); }
    return h;
  }
  zrt::String error() override { return zrt::String::from(err_msg, (uint32_t)strlen(err_msg)); }
  static Proc* at(int32_t h) { return h >= 0 && h < MAXP && procs[h].used ? &procs[h] : nullptr; }
  int32_t pid(int32_t h) override { Proc* p = at(h); return p ? (int32_t)p->pid : -1; }
  // ponytail: blocking write; a child that never reads stdin stalls the loop once the pipe buffer (64 KiB) is full
  bool write(int32_t h, zrt::String data) override {
    Proc* p = at(h);
    if (!p || p->in < 0) return false;
    const char* s = data.ptr(); size_t n = data.bytes();
    while (n) {
      ssize_t w = ::write(p->in, s, n);
      if (w < 0) { if (errno == EINTR) continue; return false; }
      s += w; n -= (size_t)w;
    }
    return true;
  }
  void closeStdin(int32_t h) override { Proc* p = at(h); if (p && p->in >= 0) { close(p->in); p->in = -1; } }
  void kill(int32_t h, int32_t sig) override { Proc* p = at(h); if (p && !p->reaped) ::kill(p->pid, sig); }
  void onEvent(zrt::Fn<void(int32_t, int32_t, zrt::String)> f) override { cb = f; }

  void emit(int32_t h, int32_t kind, const char* s, int n) {
    if (!cb) return;
    zrt::Fn<void(int32_t, int32_t, zrt::String)> f = cb;
    f(h, kind, zrt::String::from(s, (uint32_t)n));
    zrt::check_uncaught();
  }
  /** Reads what is available; closes the stream at EOF. */
  void drain(int32_t h, int kind) {
    Stream& st = procs[h].out[kind];
    char buf[8192];
    while (st.fd >= 0) {
      memcpy(buf, st.tail, (size_t)st.ntail);
      ssize_t n = read(st.fd, buf + st.ntail, sizeof buf - (size_t)st.ntail);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) {
        if (n == 0 || errno != EAGAIN) { close(st.fd); st.fd = -1; if (st.ntail) emit(h, kind, st.tail, st.ntail); st.ntail = 0; }
        return;
      }
      int total = st.ntail + (int)n, keep = utf8_cut(buf, total);
      st.ntail = total - keep;
      memcpy(st.tail, buf + keep, (size_t)st.ntail);
      if (keep) emit(h, kind, buf, keep);
      if (!procs[h].used) return;  // ponytail: a callback cannot free a handle, but stay defensive
    }
  }
  bool poll() override {
    bool alive = false;
    for (int32_t h = 0; h < MAXP; h++) {
      Proc& p = procs[h];
      if (!p.used) continue;
      alive = true;
      drain(h, 0); drain(h, 1);
      int st;
      if (!p.reaped && waitpid(p.pid, &st, WNOHANG) == p.pid) {
        p.reaped = true;
        p.code = WIFEXITED(st) ? WEXITSTATUS(st) : WIFSIGNALED(st) ? 128 + WTERMSIG(st) : -1;
      }
      if (!p.reaped) continue;
      // ponytail: output written by a grandchild after the child exited (`cmd &`) is dropped with the pipes
      drain(h, 0); drain(h, 1);
      for (Stream& s : p.out) if (s.fd >= 0) { close(s.fd); s.fd = -1; }
      if (p.in >= 0) { close(p.in); p.in = -1; }
      p.used = false;
      char code[16]; int n = snprintf(code, sizeof code, "%d", p.code);
      emit(h, 2, code, n);
    }
    return alive;
  }
  void shutdown() override {
    cb = nullptr;
    for (Proc& p : procs) {
      if (!p.used) continue;
      if (!p.reaped) { ::kill(p.pid, SIGKILL); waitpid(p.pid, nullptr, 0); }
      for (Stream& s : p.out) if (s.fd >= 0) close(s.fd);
      if (p.in >= 0) close(p.in);
      p.used = false;
    }
  }
};

NativeProcess* zinc_create_Process() {
  static HostProcess inst;
  inst.rc = zrt::IMMORTAL;
  signal(SIGPIPE, SIG_IGN);  // writing to a child that closed stdin returns EPIPE instead of killing the program
  return &inst;
}
